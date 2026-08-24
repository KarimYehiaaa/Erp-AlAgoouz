/**
 * middleware/idempotency.ts — حماية تكرار العمليات المالية والحرجة
 * ═════════════════════════════════════════════════════════════
 * يتحقق من وجود رأس Idempotency-Key أو X-Idempotency-Key لمنع تكرار
 * العمليات المالية (مثل إنشاء الفواتير أو تسديد الدفعات) في حال انقطاع الاتصال
 * أو إعادة إرسال الطلب من العميل.
 *
 * يدعم التخزين المركزي في قاعدة البيانات (PostgreSQL) لتوافق تام مع بيئة Vercel Serverless،
 * مع وجود ذاكرة محلية (Memory Fallback) في حال تعذر الاتصال اللحظي.
 */
import type { Request, Response, NextFunction } from 'express';
import { query } from '../database/pool.ts';

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  createdAt: number;
}

// تخزين محلي احتياطي (Memory Fallback)
const memoryStore = new Map<string, CachedResponse | 'PROCESSING'>();
const TTL_MS = 24 * 60 * 60 * 1000;

// تنظيف دوري للذاكرة المحلية
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of memoryStore.entries()) {
      if (value !== 'PROCESSING' && now - value.createdAt > TTL_MS) {
        memoryStore.delete(key);
      }
    }
  },
  60 * 60 * 1000,
).unref?.();

/**
 * Middleware لتطبيق مبدأ Idempotency عبر قاعدة البيانات المركزية
 */
export const requireIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // تطبيق فقط على طلبات التعديل والإنشاء
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    return next();
  }

  const cleanKey = idempotencyKey.trim();
  // نطاق المفتاح: مستخدم:مسار:مفتاح
  // - المسار يمنع إعادة استخدام مفتاح نقطة نهاية في أخرى (يعمل فوراً حتى قبل المصادقة)
  // - المستخدم يحمي من التصادم بين الحسابات متى توفر req.user (بعد المصادقة)
  const basePath = (req.originalUrl || req.url || '').split('?')[0];
  const scopedKey = `${(req as any).user?.id || 'anon'}:${basePath}:${cleanKey}`;

  // 1. فحص الذاكرة المحلية أولاً
  const memCached = memoryStore.get(scopedKey);
  if (memCached === 'PROCESSING') {
    res.status(409).json({
      success: false,
      message: 'الطلب قيد المعالجة حالياً. يرجى الانتظار.',
      code: 'REQUEST_IN_PROGRESS',
    });
    return;
  }

  if (memCached) {
    res.status(memCached.statusCode).json({
      ...memCached.body,
      _idempotentReplay: true,
    });
    return;
  }

  // 2. فحص قاعدة البيانات المركزية
  try {
    const dbResult = await query(
      `SELECT status_code, response_body 
       FROM idempotency_records 
       WHERE key = $1 AND expires_at > NOW() 
       LIMIT 1`,
      [scopedKey],
    );

    if (dbResult.rows && dbResult.rows.length > 0) {
      const record = dbResult.rows[0];
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
  } catch (err: any) {
    // في حال عدم وجود الجدول بعد أو تعذر الاتصال، نستمر بالذاكرة المحلية دون كسر الطلب
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Idempotency] DB lookup bypassed:', err.message);
    }
  }

  // 3. تسجيل المفتاح كقيد المعالجة في الذاكرة
  memoryStore.set(scopedKey, 'PROCESSING');

  // 4. اعتراض الرد لحفظه
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode < 500) {
      // حفظ في الذاكرة المحلية
      memoryStore.set(scopedKey, {
        statusCode: res.statusCode,
        headers: {},
        body,
        createdAt: Date.now(),
      });

      // حفظ غير متزامن في قاعدة البيانات المركزية
      const userId = (req as any).user?.id || null;
      const requestPath = req.originalUrl || req.url || '';

      query(
        `INSERT INTO idempotency_records (key, user_id, request_path, status_code, response_body)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO UPDATE 
         SET status_code = EXCLUDED.status_code, 
             response_body = EXCLUDED.response_body`,
        [scopedKey, userId, requestPath, res.statusCode, JSON.stringify(body)],
      ).catch((err: any) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Idempotency] Failed to persist key to DB:', err.message);
        }
      });
    } else {
      // في حال خطأ الخادم، نحذف المفتاح للسماح بالمحاولة مجدداً
      memoryStore.delete(scopedKey);
    }

    return originalJson(body);
  };

  next();
};
