/**
 * middleware/branchIsolation.ts — عزل الفروع والمخازن
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
export async function getAllowedWarehouses(userId: number): Promise<number[]> {
  const cached = userWarehouseCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.warehouses;

  const userRes = await query(
    `SELECT u.branch_id, u.warehouse_id, r.name as role_name 
     FROM users u 
     LEFT JOIN roles r ON r.id = u.role_id 
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
  const user = userRes.rows[0];
  if (!user) return [];

  // المديرون والمشرفون العامون يملكون صلاحية كاملة على كل المخازن
  if (ADMIN_ROLES.includes(user.role_name)) {
    const result = await query('SELECT id FROM warehouses WHERE deleted_at IS NULL');
    const warehouses = result.rows.map((r: any) => r.id);
    userWarehouseCache.set(userId, { warehouses, expiresAt: Date.now() + CACHE_TTL_MS });
    return warehouses;
  }

  const assignedWarehouses: number[] = [];
  if (user.warehouse_id) {
    assignedWarehouses.push(Number(user.warehouse_id));
  }
  if (user.branch_id) {
    const whRes = await query(
      `SELECT id FROM warehouses WHERE (branch_id = $1 OR id = $1) AND deleted_at IS NULL`,
      [user.branch_id],
    );
    for (const row of whRes.rows) {
      if (!assignedWarehouses.includes(row.id)) assignedWarehouses.push(row.id);
    }
  }

  // إذا لم يكن معيناً لفرع محدد، نمنحه الوصول للمخزن الافتراضي فقط
  if (assignedWarehouses.length === 0) {
    const defaultWh = await query(
      `SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
    );
    if (defaultWh.rows[0]) assignedWarehouses.push(defaultWh.rows[0].id);
  }

  userWarehouseCache.set(userId, {
    warehouses: assignedWarehouses,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return assignedWarehouses;
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

    const userId = (req as any).user?.id || (req as any).user?.userId;
    const allowed = await getAllowedWarehouses(userId);

    // إذا لم يُحدد مخزن لمستخدم غير مدير، يتم حقن المخزن المسموح به تلقائياً لعزل بيانات الفروع (B-05)
    if (!warehouseId) {
      if (allowed.length > 0) {
        if (req.method === 'GET') {
          req.query.warehouse_id = String(allowed[0]);
        } else if (req.body) {
          req.body.warehouse_id = allowed[0];
        }
      }
      return next();
    }

    const ids = Array.isArray(warehouseId) ? warehouseId : [Number(warehouseId)];

    for (const id of ids) {
      if (!allowed.includes(id)) {
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

/** مسح كاش المخازن عند تعديل صلاحيات المستخدم. */
export const clearWarehouseCache = (userId?: number) => {
  if (userId) {
    userWarehouseCache.delete(userId);
  } else {
    userWarehouseCache.clear();
  }
};
