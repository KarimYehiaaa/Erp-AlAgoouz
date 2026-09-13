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
import jwt from 'jsonwebtoken';
import config from '../config/index.ts';
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';
import { roundMoney, parseAmount } from '../utils/money.ts';
import type { Request, Response, NextFunction } from 'express';

export const OVERRIDE_TTL_SECONDS = 10 * 60;
const OVERRIDE_HEADER = 'x-manager-override';

/** حد الخصم الحر للكاشير (يجب أن يطابق قاعدة الواجهة في useBranchSales.ts) */
const CASHIER_MAX_FLAT_DISCOUNT = 50;
const CASHIER_MAX_DISCOUNT_RATIO = 0.15;

interface OverridePayload {
  typ: 'pos_override';
  mgr: number;
  csr: number;
}

/**
 * إصدار توكن تجاوز قصير الأجل بعد نجاح التحقق من PIN المدير.
 * @param {number} managerId معرف المدير الموثَّق
 * @param {number} cashierUserId معرف الكاشير الطالب
 * @returns {{ token: string, expires_in: number }}
 */
export const issueManagerOverrideToken = (managerId: number, cashierUserId: number) => {
  const token = jwt.sign(
    { typ: 'pos_override', mgr: managerId, csr: cashierUserId } satisfies OverridePayload,
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: OVERRIDE_TTL_SECONDS },
  );
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

  // المدير يجب أن يبقى نشطًا وقت الاستخدام (إبطال فوري عند تعطيل الحساب)
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
