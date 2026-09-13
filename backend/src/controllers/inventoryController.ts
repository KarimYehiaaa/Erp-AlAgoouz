import * as inventoryService from '../services/inventoryService.ts';
import * as inventoryExcelService from '../services/inventoryExcelService.ts';
import { AppError } from '../types/errors.ts';
import { ok, wrap } from './helper.ts';
const inventory = {
  /**
   * قائمة أرصدة المخزون مع التصفية حسب المخزن والمنتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await inventoryService.getInventory(req.query.warehouse_id));
  }),
  /**
   * حركات المخزون (داخل/خارج) مع التصفية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  movements: wrap(async (req, res) => {
    ok(res, await inventoryService.getStockMovements(req.query));
  }),
  /**
   * نقل كمية بين مخازن.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  transfer: wrap(async (req, res) => {
    ok(res, await inventoryService.transferStock(req.body, req.user.id));
  }),
  /**
   * تسوية رصيد مخزون (إضافة أو خصم).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  adjust: wrap(async (req, res) => {
    ok(res, await inventoryService.adjustStock(req.body, req.user.id));
  }),
  /**
   * مسح جميع أرصدة المخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  clearAll: wrap(async (req, res) => {
    const data = await inventoryService.clearAllInventoryData(req.user.id);
    ok(res, data, 'تم حذف بيانات المخزون بالكامل');
  }),
  /**
   * قائمة المخازن النشطة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  warehouses: wrap(async (req, res) => {
    ok(res, await inventoryService.getWarehouses());
  }),
  /**
   * تنزيل قالب استيراد مرتجعات المخزون (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  returnTemplate: wrap(async (req, res) => {
    const buf = await inventoryExcelService.buildReturnTemplate(req.query.warehouse_id || null);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-return-template.xlsx"');
    res.send(buf);
  }),
  /**
   * التحقق من صحة ملف مرتجعات المخزون المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  validateReturnExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    ok(res, await inventoryExcelService.validateReturnExcel(req.file.buffer), 'تم فحص الملف');
  }),
  /**
   * استيراد مرتجعات المخزون من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  importReturnExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id || null;
    const result = await inventoryExcelService.importReturnFromExcel(
      req.file.buffer,
      req.user.id,
      warehouseId,
    );
    if (!result.success) {
      throw new AppError(
        result.failed?.[0]?.message || 'لم يتم تطبيق أي صف صالح من ملف الاسترداد',
        400,
      );
    }
    ok(res, result, `تم استرداد ${result.success} منتج بنجاح`);
  }),
};
export { inventory };
