import * as stocktakeService from '../services/stocktakeService.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';
import { ok, wrap } from './helper.ts';

const resolveAllowedWarehouses = async (req: any): Promise<number[] | undefined> => {
  const userRole = req.user?.role_name || req.user?.role;
  const userId = req.user?.id || req.user?.userId;
  const isAdmin = userRole && (ADMIN_ROLES as readonly string[]).includes(userRole);
  return isAdmin ? undefined : await getAllowedWarehouses(userId);
};

export const stocktake = {
  /**
   * قائمة عمليات الجرد مع تصفية المخازن المسموحة للمستخدم.
   */
  list: wrap(async (req, res) => {
    const allowedWarehouses = await resolveAllowedWarehouses(req);
    ok(res, await stocktakeService.getStocktakeList(allowedWarehouses));
  }),
  /**
   * جلب جرد مع بنوده بعد التحقق من صلاحية المخزن.
   */
  get: wrap(async (req, res) => {
    const allowedWarehouses = await resolveAllowedWarehouses(req);
    ok(res, await stocktakeService.getStocktakeDetails(req.params.id, allowedWarehouses));
  }),
  /**
   * إنشاء جرد جديد.
   */
  create: wrap(async (req, res) => {
    const { warehouse_id, notes } = req.body;
    ok(
      res,
      await stocktakeService.createStocktake(warehouse_id, req.user.id, notes),
      'تم بدء مسودة جرد جديدة',
    );
  }),
  /**
   * تحديث الكميات الفعلية لبنود جرد مع التحقق من صلاحية المخزن.
   */
  updateItems: wrap(async (req, res) => {
    const allowedWarehouses = await resolveAllowedWarehouses(req);
    ok(
      res,
      await stocktakeService.updateStocktakeItems(req.params.id, req.body, allowedWarehouses),
      'تم حفظ مسودة الجرد',
    );
  }),
  /**
   * اعتماد الجرد وتطبيق الفروقات على المخزون مع التحقق من صلاحية المخزن.
   */
  complete: wrap(async (req, res) => {
    const allowedWarehouses = await resolveAllowedWarehouses(req);
    ok(
      res,
      await stocktakeService.completeStocktake(req.params.id, req.user.id, allowedWarehouses),
      'تم اعتماد الجرد وتسوية الفروقات',
    );
  }),
  /**
   * حذف جرد مع التحقق من صلاحية المخزن.
   */
  delete: wrap(async (req, res) => {
    const allowedWarehouses = await resolveAllowedWarehouses(req);
    ok(
      res,
      await stocktakeService.deleteStocktake(req.params.id, allowedWarehouses),
      'تم حذف مسودة الجرد بنجاح',
    );
  }),
};
