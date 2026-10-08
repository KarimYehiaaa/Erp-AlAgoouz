/**
 * middleware/warehouseAccess.ts — عزل المخازن داخل المحل الواحد
 * يتحقق من أن المستخدم لديه صلاحية الوصول للمخزن المطلوب داخل المحل.
 * يمنع هجمات IDOR (Insecure Direct Object Reference) حيث يمكن
 * لمستخدم الوصول لمخزن غير المخصص له عبر تغيير warehouse_id.
 *
 * الأدوار الإدارية (admin) تمر دائماً بدون فحص.
 */
import type { Request, Response, NextFunction } from 'express';
import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { WAREHOUSE_GLOBAL_ROLES } from '../../../shared/permissions.js';

/** مدير المحل يتعامل مع كل مواقع التخزين، بينما الكاشير وأمين المخزن يحتاجان ربطاً صريحاً. */
const FULL_WAREHOUSE_ROLES = new Set(WAREHOUSE_GLOBAL_ROLES);

/** Protects balances that aggregate financial activity across every warehouse in the shop. */
export const requireGlobalWarehouseRole = (req: Request, _res: Response, next: NextFunction) => {
  const userRole = (req as any).user?.role_name || (req as any).user?.role;
  if (typeof userRole === 'string' && WAREHOUSE_GLOBAL_ROLES.includes(userRole)) return next();
  return next(new AppError('هذه البيانات المالية متاحة للإدارة ومدير المحل فقط', 403, 'FORBIDDEN'));
};

/**
 * جلب المخازن المسموحة من حالة المستخدم الحالية دون كاش تفويض محلي.
 * المدير يملك صلاحية على كل المخازن.
 */
export async function getAllowedWarehouses(
  userId: number,
  db: typeof query | { query: typeof query } = query,
): Promise<number[]> {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return [];
  const run =
    typeof db === 'function' ? db : (text: string, params?: any[]) => db.query(text, params);
  const result = await run(
    `SELECT w.id FROM users u
    JOIN roles r ON r.id = u.role_id
    JOIN warehouses w ON w.deleted_at IS NULL AND (
      r.name = ANY($2::text[])
      OR (u.warehouse_id IS NOT NULL AND w.id = u.warehouse_id)
      OR (u.warehouse_id IS NULL AND w.id = (
        SELECT id FROM warehouses WHERE deleted_at IS NULL
        ORDER BY CASE WHEN type = 'store' THEN 0 ELSE 1 END, id ASC LIMIT 1)))
    WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL ORDER BY w.id`,
    [userId, WAREHOUSE_GLOBAL_ROLES],
  );
  return result.rows.map((row) => Number(row.id));
}

/**
 * Middleware للتحقق من صلاحية الوصول للمخزن داخل المحل.
 * يُستخدم في مسارات المخزون والمبيعات والجرد.
 *
 * @example
 * router.get('/inventory', authenticate, enforceWarehouseAccess, controller.list);
 */
export const enforceWarehouseAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userRole = (req as any).user?.role_name || (req as any).user?.role;

    // الأدوار الإدارية تمر بدون فحص
    if (FULL_WAREHOUSE_ROLES.has(userRole)) return next();

    const requestedWarehouses = [
      req.body?.warehouse_id,
      req.query?.warehouse_id,
      req.params?.warehouseId,
      req.body?.source_warehouse_id,
      req.body?.target_warehouse_id,
      req.body?.from_warehouse_id,
      req.body?.to_warehouse_id,
    ]
      .filter((value) => value !== undefined && value !== null && value !== '')
      .flat();

    const userId = (req as any).user?.id || (req as any).user?.userId;
    const allowed = await getAllowedWarehouses(userId);
    if (!allowed.length)
      return res.status(403).json({ success: false, message: 'لا يوجد مخزن مصرح به للمستخدم' });

    // في المحل الواحد: لا نحقن مخزناً عند وجود أكثر من مخزن في طلب قراءة؛
    // أما العمليات الكتابية فتستخدم المخزن الافتراضي عند غياب التحديد.
    if (!requestedWarehouses.length) {
      if (allowed.length === 1) {
        if (req.method === 'GET') {
          req.query.warehouse_id = String(allowed[0]);
        } else if (req.body) {
          req.body.warehouse_id = allowed[0];
        }
      } else if (req.method !== 'GET' && allowed.length > 0 && req.body) {
        req.body.warehouse_id = allowed[0];
      }
      return next();
    }

    const ids = requestedWarehouses.map(Number);

    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0 || !allowed.includes(id)) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بالوصول لهذا المخزن',
        });
      }
    }

    return next();
  } catch (err) {
    next(err);
  }
};
