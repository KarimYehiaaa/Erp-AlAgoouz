/**
 * middleware/idempotency.ts — حماية تكرار العمليات المالية والحرجة
 * ═════════════════════════════════════════════════════════════════════
 * يعتمد معمارية القفل الذري (Atomic Lock Claim) على مستوى قاعدة البيانات المركزية
 * لمنع حدوث أي Race Condition عند وصول طلبات متزامنة تحمل نفس المفتاح.
 *
 * سير العمل:
 *  1. محاولة حجز المفتاح ذرياً (Atomic Claim: INSERT ... ON CONFLICT DO NOTHING)
 *  2. إذا نجح الحجز: ينفّذ الطلب ويُحدّث السجل بالنتيجة عند الاكتمال (status: COMPLETED)
 *  3. إذا فشل الحجز (مفتاح موجود مسبقاً):
 *     - إذا كان مكتملاً (COMPLETED): يُعاد الرد المخزن فوراً دون إعادة التنفيذ
 *     - إذا كان قيد التنفيذ (PROCESSING) ضمن مهلة القفل (30s): يُرجع 409 Conflict
 *     - إذا كان معلقاً وتجاوز 30 ثانية (Stale Lock): يُعاد استملاكه ذرياً والمتابعة
 *  4. إذا انتهى الطلب بخطأ خادم (5xx) أو انقطع الاتصال: يُحذف حجز المفتاح للسماح بإعادة المحاولة فوراً
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/index.ts';
import { query } from '../database/pool.ts';
import { logger } from '../services/loggerService.ts';

interface CachedResponse {
  status: 'COMPLETED';
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  createdAt: number;
}

interface InFlightRequest {
  status: 'PROCESSING';
  startedAt: number;
}

type MemoryEntry = CachedResponse | InFlightRequest;

// ذاكرة محلية احتياطية (Memory Store Fallback للبيئات المحلية أو عند تعذر قاعدة البيانات)
const memoryStore = new Map<string, MemoryEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;
const LOCK_TIMEOUT_MS = 30_000;

// تنظيف دوري للذاكرة المحلية
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (value.status === 'COMPLETED' && now - value.createdAt > TTL_MS) {
        memoryStore.delete(key);
      } else if (value.status === 'PROCESSING' && now - value.startedAt > LOCK_TIMEOUT_MS) {
        memoryStore.delete(key);
      }
    }
  },
  60 * 60 * 1000,
).unref?.();

/** مساعدة في تنظيف السجل المحلي */
export const clearIdempotencyMemory = () => {
  memoryStore.clear();
};

/**
 * Middleware لتطبيق مبدأ Idempotency عبر القفل الذري المركزي
 */
export const requireIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // تطبيق فقط على عمليات التعديل والإنشاء
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    return next();
  }

  const cleanKey = idempotencyKey.trim();
  const basePath = (req.originalUrl || req.url || '').split('?')[0];

  let userId: number | null = (req as any).user?.id || (req as any).user?.userId || null;
  if (!userId) {
    const authHeader = req.headers.authorization;
    const token =
      (req as any).cookies?.access_token ||
      (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    if (token && typeof token === 'string') {
      try {
        const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }) as any;
        if (decoded?.userId) {
          userId = Number(decoded.userId);
        }
      } catch {
        // Invalid/expired token - auth middleware will handle rejection
      }
    }
  }

  const userScope = userId ? `user:${userId}` : `anon:${req.ip || 'noip'}`;
  const scopedKey = `${userScope}:${req.method}:${basePath}:${cleanKey}`;

  let dbAvailable = true;

  // 1. محاولة حجز المفتاح ذرياً في قاعدة البيانات المركزية
  try {
    const claimRes = await query(
      `INSERT INTO idempotency_records (key, user_id, request_path, status, locked_at, expires_at)
       VALUES ($1, $2, $3, 'PROCESSING', NOW(), NOW() + INTERVAL '24 hours')
       ON CONFLICT (key) DO NOTHING
       RETURNING key, status`,
      [scopedKey, userId, basePath],
    );

    if (claimRes.rowCount && claimRes.rowCount > 0) {
      // The request owns the idempotency key and may continue.
    } else {
      // المفتاح موجود مسبقاً في قاعدة البيانات — فحص حالته
      const existingRes = await query(
        `SELECT status, status_code, response_body, locked_at, expires_at
         FROM idempotency_records
         WHERE key = $1 AND expires_at > NOW()`,
        [scopedKey],
      );

      if (existingRes.rows.length > 0) {
        const record = existingRes.rows[0];

        if (record.status === 'COMPLETED' && record.status_code) {
          const parsedBody =
            typeof record.response_body === 'string'
              ? JSON.parse(record.response_body)
              : record.response_body;

          res.status(record.status_code).json({
            ...parsedBody,
            _idempotentReplay: true,
          });
          return;
        }

        // قيد المعالجة (PROCESSING)
        const lockedAt = record.locked_at ? new Date(record.locked_at).getTime() : 0;
        const elapsed = Date.now() - lockedAt;

        if (elapsed < LOCK_TIMEOUT_MS) {
          res.status(409).json({
            success: false,
            message: 'الطلب قيد المعالجة حالياً. يرجى الانتظار.',
            code: 'REQUEST_IN_PROGRESS',
          });
          return;
        }

        // قفل عالق (Stale Lock تجاوز 30 ثانية) — محاولة إعادة الاستملاك الذرية
        const reclaimRes = await query(
          `UPDATE idempotency_records
           SET status = 'PROCESSING', locked_at = NOW(), user_id = $2, request_path = $3
           WHERE key = $1 AND status = 'PROCESSING' AND locked_at <= NOW() - INTERVAL '30 seconds'
           RETURNING key`,
          [scopedKey, userId, basePath],
        );

        if (reclaimRes.rowCount && reclaimRes.rowCount > 0) {
          // The stale lock was reclaimed successfully.
        } else {
          // استملكه طلب آخر بالتزامن
          res.status(409).json({
            success: false,
            message: 'الطلب قيد المعالجة حالياً. يرجى الانتظار.',
            code: 'REQUEST_IN_PROGRESS',
          });
          return;
        }
      }
    }
  } catch (err: any) {
    dbAvailable = false;
    if (process.env.NODE_ENV === 'development') {
      logger.warn('[Idempotency] Central DB bypassed, using atomic memory store:', err.message);
    }
  }

  // 2. الحماية الذرية في الذاكرة المحلية (في حال تعذر قاعدة البيانات أو كحزام أمان إضافي)
  if (!dbAvailable) {
    const memEntry = memoryStore.get(scopedKey);
    if (memEntry) {
      if (memEntry.status === 'PROCESSING') {
        const elapsed = Date.now() - memEntry.startedAt;
        if (elapsed < LOCK_TIMEOUT_MS) {
          res.status(409).json({
            success: false,
            message: 'الطلب قيد المعالجة حالياً. يرجى الانتظار.',
            code: 'REQUEST_IN_PROGRESS',
          });
          return;
        }
        // تجاوز المهلة في الذاكرة — إعادة ضبط
        memoryStore.set(scopedKey, { status: 'PROCESSING', startedAt: Date.now() });
      } else if (memEntry.status === 'COMPLETED') {
        res.status(memEntry.statusCode).json({
          ...memEntry.body,
          _idempotentReplay: true,
        });
        return;
      }
    } else {
      memoryStore.set(scopedKey, { status: 'PROCESSING', startedAt: Date.now() });
    }
  } else {
    // تحديث حالة الذاكرة المتزامنة مع الـ DB
    memoryStore.set(scopedKey, { status: 'PROCESSING', startedAt: Date.now() });
  }

  // 3. تنظيف القفل في حال حدوث خطأ أو إغلاق الاتصال المبكر
  const cleanupLock = () => {
    memoryStore.delete(scopedKey);
    if (dbAvailable) {
      query(`DELETE FROM idempotency_records WHERE key = $1 AND status = 'PROCESSING'`, [
        scopedKey,
      ]).catch(() => {});
    }
  };

  res.once('error', cleanupLock);
  res.on('close', () => {
    if (!res.writableEnded && res.statusCode < 200) {
      cleanupLock();
    }
  });

  // 4. اعتراض الرد لتخزين النتيجة عند النجاح أو تحرير المفتاح عند أخطاء الخادم
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode < 500) {
      // العملية اكتملت بنجاح أو بخطأ عميل معتمد (4xx) -> تسجيل النتيجة الدائمة
      memoryStore.set(scopedKey, {
        status: 'COMPLETED',
        statusCode: res.statusCode,
        headers: {},
        body,
        createdAt: Date.now(),
      });

      if (dbAvailable) {
        query(
          `UPDATE idempotency_records
           SET status = 'COMPLETED',
               status_code = $2,
               response_body = $3,
               locked_at = NULL
           WHERE key = $1`,
          [scopedKey, res.statusCode, JSON.stringify(body)],
        ).catch((err: any) => {
          if (process.env.NODE_ENV === 'development') {
            logger.warn('[Idempotency] Failed to mark key COMPLETED in DB:', err.message);
          }
        });
      }
    } else {
      // خطأ خادم (5xx) -> تحرير المفتاح فوراً للسماح بإعادة المحاولة
      cleanupLock();
    }

    return originalJson(body);
  };

  next();
};
