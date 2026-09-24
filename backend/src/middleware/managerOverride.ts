/**
 * middleware/managerOverride.ts — فرض موافقة المدير على الخادم (Server-Side Manager Override)
 *
 * المشكلة التي يعالجها: كان التحقق من PIN المدير وجدانيًا (client-side فقط) —
 * عميل مخالف بصلاحية كاشير يستطيع تجاوز قيود الخصم والإرجاع بمخاطبة الـ API مباشرة.
 *
 * الآلية:
 *  - عند نجاح POST /pos/verify-pin يُصدر الخادم توكن تجاوز قصير الأجل (10 دقائق) موقّع بسر JWT.
 *  - الكاشير يرفقه في ترويسة X-Manager-Override للطلب الحساس التالي.
 *  - requireManagerOverride : يفرض وجود توكن صالح دائمًا (للمديرين/الإداريين تجاوز تلقائي).
 *  - enforceCashierDiscountOverride : يفرضه فقط عندما يتجاوز خصم الفاتورة الحد المسموح للكاشير
 *    (نفس قاعدة الواجهة: أكثر من 50 ج.م أو 15% من الإجمالي).
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../config/index.ts';
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';
import { roundMoney, parseAmount } from '../utils/money.ts';
import { logger } from '../services/loggerService.ts';
import type { Request, Response, NextFunction } from 'express';

export const OVERRIDE_TTL_SECONDS = 10 * 60;
const OVERRIDE_HEADER = 'x-manager-override';

/** حد الخصم الحر للكاشير (يجب أن يطابق قاعدة الواجهة في usePosSales.ts) */
const CASHIER_MAX_FLAT_DISCOUNT = 50;
const CASHIER_MAX_DISCOUNT_RATIO = 0.15;

interface OverridePayload {
  typ: 'pos_override';
  mgr: number;
  csr: number;
  jti?: string;
}

// ذاكرة محلية احتياطية لحالات الطوارئ أو بيئات الاختبار المنعزلة
const consumedOverrideTokens = new Map<string, number>();

export const clearConsumedOverrideTokens = async () => {
  consumedOverrideTokens.clear();
  try {
    await query(`DELETE FROM manager_override_tokens`);
  } catch {
    // ignore if table not present
  }
};

setInterval(
  () => {
    const now = Date.now();
    for (const [id, expiresAt] of consumedOverrideTokens.entries()) {
      if (now > expiresAt) consumedOverrideTokens.delete(id);
    }
  },
  10 * 60 * 1000,
).unref?.();

/**
 * إصدار توكن تجاوز قصير الأجل بعد نجاح التحقق من PIN المدير.
 * يُسجّل في قاعدة البيانات المركزية لضمان الاستخدام لمرة واحدة وتنسيق العمليات عبر العناقيد.
 * @param {number} managerId معرف المدير الموثَّق
 * @param {number} cashierUserId معرف الكاشير الطالب
 * @returns {Promise<{ token: string, expires_in: number }>}
 */
export const issueManagerOverrideToken = async (managerId: number, cashierUserId: number) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { typ: 'pos_override', mgr: managerId, csr: cashierUserId, jti } satisfies OverridePayload,
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: OVERRIDE_TTL_SECONDS },
  );
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + OVERRIDE_TTL_SECONDS * 1000);

  try {
    await query(
      `INSERT INTO manager_override_tokens (jti, token_hash, manager_user_id, cashier_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [jti, tokenHash, managerId, cashierUserId, expiresAt],
    );
  } catch (err: any) {
    logger.warn(`Failed to persist manager override token: ${err?.message}`);
  }

  return { token, expires_in: OVERRIDE_TTL_SECONDS };
};

/**
 * التحقق من توكن التجاوز وتحميل المدير على req.managerOverride.
 * الأدوار الإدارية (admin/sys_admin/owner) تتجاوز الفحص دائمًا.
 */
const readOverride = async (req: Request): Promise<{ id: number; name: string } | null> => {
  const userRole = req.user?.role_name || req.user?.role;
  if (userRole && (ADMIN_ROLES as readonly string[]).includes(userRole)) return null;

  const raw = req.headers[OVERRIDE_HEADER];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token || typeof token !== 'string') {
    throw new AppError(
      'هذه العملية تتطلب مصادقة المدير — أدخل رمز PIN أو كلمة مرور المدير أولاً',
      403,
      'MANAGER_OVERRIDE_REQUIRED',
    );
  }

  let payload: OverridePayload;
  try {
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }) as any;
    if (decoded?.typ !== 'pos_override' || !decoded.mgr) {
      throw new Error('wrong token type');
    }
    payload = decoded as OverridePayload;
  } catch {
    throw new AppError(
      'توكن مصادقة المدير غير صالح أو منتهي — أعد التحقق من رمز PIN',
      403,
      'MANAGER_OVERRIDE_INVALID',
    );
  }

  // 1. التحقق الصارم من ربط التوكن بنفس الكاشير الطالب
  const currentUserId = (req as any).user?.id || (req as any).user?.userId;
  if (payload.csr && currentUserId && Number(payload.csr) !== Number(currentUserId)) {
    throw new AppError(
      'توكن مصادقة المدير غير مصرح به لهذا الكاشير — تم إصداره لكاشير آخر',
      403,
      'MANAGER_OVERRIDE_FORBIDDEN',
    );
  }

  // 2. التحقق الذري من الاستخدام لمرة واحدة (Atomic Single-Use Consumption)
  const jti = payload.jti || crypto.createHash('sha256').update(token).digest('hex');
  let consumedInDb = false;

  try {
    const consumeRes = await query(
      `UPDATE manager_override_tokens
       SET used_at = NOW()
       WHERE jti = $1
         AND used_at IS NULL
         AND expires_at > NOW()
         AND cashier_user_id = $2
       RETURNING id, manager_user_id`,
      [jti, currentUserId || payload.csr],
    );

    if (consumeRes.rowCount && consumeRes.rowCount > 0) {
      consumedInDb = true;
    } else {
      // فحص تفصيلي لسبب الفشل لإرجاع كود الخطأ المناسب
      const checkRes = await query(
        `SELECT used_at, expires_at, cashier_user_id FROM manager_override_tokens WHERE jti = $1`,
        [jti],
      );

      if (checkRes.rows.length > 0) {
        const row = checkRes.rows[0];
        if (row.used_at) {
          throw new AppError(
            'تم استخدام توكن مصادقة المدير مسبقاً — يلزم الحصول على مصادقة جديدة لكل عملية',
            403,
            'MANAGER_OVERRIDE_ALREADY_USED',
          );
        }
        if (new Date(row.expires_at).getTime() <= Date.now()) {
          throw new AppError(
            'انتهت صلاحية توكن مصادقة المدير — أعد التحقق من رمز PIN',
            403,
            'MANAGER_OVERRIDE_INVALID',
          );
        }
        if (currentUserId && Number(row.cashier_user_id) !== Number(currentUserId)) {
          throw new AppError(
            'توكن مصادقة المدير غير مصرح به لهذا الكاشير — تم إصداره لكاشير آخر',
            403,
            'MANAGER_OVERRIDE_FORBIDDEN',
          );
        }
        throw new AppError(
          'توكن مصادقة المدير غير صالح أو مستخدم — أعد التحقق من رمز PIN',
          403,
          'MANAGER_OVERRIDE_INVALID',
        );
      }
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    // استكمال في حال تعذر قاعدة البيانات واستخدام الذاكرة الاحتياطية
  }

  if (!consumedInDb) {
    if (consumedOverrideTokens.has(jti)) {
      throw new AppError(
        'تم استخدام توكن مصادقة المدير مسبقاً — يلزم الحصول على مصادقة جديدة لكل عملية',
        403,
        'MANAGER_OVERRIDE_ALREADY_USED',
      );
    }
    consumedOverrideTokens.set(jti, Date.now() + OVERRIDE_TTL_SECONDS * 1000);
  }

  // المدير يجب أن يبقى نشطًا وقت الاستخدام (إبطال فوري عند تعطيل الحساب)
  try {
    const mgrRes = await query(
      `SELECT u.id, u.full_name FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL AND r.name = ANY($2::text[])`,
      [payload.mgr, ADMIN_ROLES],
    );
    const manager = mgrRes.rows[0];
    if (!manager) {
      throw new AppError(
        'حساب المدير الموثَّق غير نشط — أعد التحقق من رمز PIN',
        403,
        'MANAGER_OVERRIDE_INVALID',
      );
    }

    return { id: manager.id, name: manager.full_name || String(manager.id) };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    return { id: payload.mgr, name: String(payload.mgr) };
  }
};

/**
 * وسيط يفرض توكن تجاوز المدير لكل من ليس له دور إداري (مثل إرجاع الفواتير بواسطة كاشير).
 */
export const requireManagerOverride = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const manager = await readOverride(req);
    if (manager) (req as any).managerOverride = manager;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * وسيط يفرض توكن تجاوز المدير فقط عند تجاوز خصم الفاتورة حده المسموح للكاشير.
 * يُطبَّق بعد validateBody(saleSchema) ليقرأ body المُحلَّل.
 */
export const enforceCashierDiscountOverride = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const itemsTotal = roundMoney(items.reduce((sum: number, it: any) => sumMoneyLine(sum, it), 0));
    const fallbackTotal = roundMoney(parseAmount(body.total_amount));
    const base = items.length ? itemsTotal : fallbackTotal;

    // خصم نقاط الولاء تُمنح للعميل تلقائيًا ولا تُحتسب ضمن "الخصم اليدوي" الخاضع للحد
    const loyaltyDiscount = roundMoney((parseAmount(body.loyalty_points_redeemed) || 0) / 10);
    const manualDiscount = Math.max(
      0,
      roundMoney(parseAmount(body.discount_amount)) - loyaltyDiscount,
    );

    const excessive =
      manualDiscount > CASHIER_MAX_FLAT_DISCOUNT ||
      (base > 0 && manualDiscount / base > CASHIER_MAX_DISCOUNT_RATIO);
    if (!excessive) return next();

    const manager = await readOverride(req);
    if (manager) (req as any).managerOverride = manager;
    next();
  } catch (err) {
    next(err);
  }
};

// جمع بخطوات قروش صحيحة لتحصين الفاصلة العائمة (نفس نهج utils/money.ts)
const sumMoneyLine = (sum: number, it: any) =>
  (Math.round(sum * 100) +
    Math.round((Number(it?.quantity) || 0) * (Number(it?.unit_price) || 0) * 100)) /
  100;
