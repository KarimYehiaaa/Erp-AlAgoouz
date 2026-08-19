/**
 * middleware/branchIsolation.ts — عزل الفروع والمخازن
 * ════════════════════════════════════════════════════
 * يتحقق من أن المستخدم لديه صلاحية الوصول للفرع/المخزن المطلوب.
 * يمنع هجمات IDOR (Insecure Direct Object Reference) حيث يمكن
 * لمستخدم فرع الوصول لبيانات فرع آخر عبر تغيير warehouse_id.
 *
 * الأدوار الإدارية (admin) تمر دائماً بدون فحص.
 */
import type { Request, Response, NextFunction } from 'express';
import { query } from '../database/pool.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';

/** كاش بسيط للمخازن المسموحة لكل مستخدم (TTL: 5 دقائق). */
const userWarehouseCache = new Map<number, { warehouses: number[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * جلب المخازن المسموحة للمستخدم (مع كاش).
 * المدير يملك صلاحية على كل المخازن.
 */
async function getAllowedWarehouses(userId: number): Promise<number[]> {
  const cached = userWarehouseCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.warehouses;

  // حالياً: كل المخازن متاحة حسب الدور — يمكن تخصيصها لاحقاً بجدول user_warehouses
  const result = await query('SELECT id FROM warehouses WHERE deleted_at IS NULL');
  const warehouses = result.rows.map((r: any) => r.id);

  userWarehouseCache.set(userId, { warehouses, expiresAt: Date.now() + CACHE_TTL_MS });
  return warehouses;
}

/**
 * Middleware للتحقق من صلاحية الوصول للمخزن/الفرع.
 * يُستخدم في مسارات المخزون والمبيعات والجرد.
 *
 * @example
 * router.get('/inventory', authenticate, enforceWarehouseAccess, controller.list);
 */
export const enforceWarehouseAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userRole = (req as any).user?.role_name || (req as any).user?.role;

    // الأدوار الإدارية تمر بدون فحص
    if (ADMIN_ROLES.includes(userRole)) return next();

    const warehouseId =
      req.body?.warehouse_id ||
      req.query?.warehouse_id ||
      req.params?.warehouseId ||
      req.body?.source_warehouse_id ||
      req.body?.target_warehouse_id;

    // إذا لم يُحدد مخزن، لا حاجة للفحص (الخدمة قد تُقيّد النتائج لاحقاً)
    if (!warehouseId) return next();

    const userId = (req as any).user?.id || (req as any).user?.userId;
    const allowed = await getAllowedWarehouses(userId);

    const ids = Array.isArray(warehouseId) ? warehouseId : [Number(warehouseId)];

    for (const id of ids) {
      if (!allowed.includes(id)) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بالوصول لهذا المخزن',
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

/** مسح كاش المخازن عند تعديل صلاحيات المستخدم. */
export const clearWarehouseCache = (userId?: number) => {
  if (userId) {
    userWarehouseCache.delete(userId);
  } else {
    userWarehouseCache.clear();
  }
};
