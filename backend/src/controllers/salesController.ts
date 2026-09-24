import * as salesService from '../services/salesService.ts';
import * as openingBalanceService from '../services/openingBalanceService.ts';
import * as salesExcelService from '../services/salesExcelService.ts';
import * as posSalesExcelService from '../services/posSalesExcelService.ts';
import { getAllowedWarehouses } from '../middleware/warehouseAccess.ts';
import { ADMIN_ROLES } from '../../../shared/permissions.js';
import { AppError } from '../types/errors.ts';
import { ok, wrap } from './helper.ts';
const sales = {
  /**
   * قائمة المبيعات مع التصفية حسب الفترة والمخزن والنوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const allowedWarehouses = await getAllowedWarehouses(userId);
    const result = await salesService.getSales(req.query, allowedWarehouses);
    ok(res, result.data, void 0, result.meta);
  }),
  /**
   * ملخص إجمالي المبيعات (عدد الفواتير، الإجمالي، الأرباح...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  summary: wrap(async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const allowedWarehouses = await getAllowedWarehouses(userId);
    ok(res, await salesService.getSalesSummary(req.query, allowedWarehouses));
  }),
  /**
   * جلب الرصيد الافتتاحي لمخزن في تاريخ محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  openingBalance: wrap(async (req, res) => {
    ok(res, await openingBalanceService.getOpeningBalance(req.query.from_date, req.query.to_date));
  }),
  /**
   * حفظ الرصيد الافتتاحي لمخزن.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  saveOpeningBalance: wrap(async (req, res) => {
    ok(
      res,
      await openingBalanceService.saveOpeningBalance(req.body, req.user.id),
      'تم حفظ بداية المدة بنجاح',
    );
  }),
  /**
   * جلب فاتورة مبيعة مع بنودها ومدفوعاتها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: wrap(async (req, res) => {
    const userRole = (req as any).user?.role_name || (req as any).user?.role;
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const isAdmin = userRole && (ADMIN_ROLES as readonly string[]).includes(userRole);
    const allowedWarehouses = isAdmin ? undefined : await getAllowedWarehouses(userId);
    ok(res, await salesService.getSaleById(Number(req.params.id), allowedWarehouses));
  }),
  /**
   * إنشاء فاتورة مبيعة جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(
      res,
      await salesService.createDailySale(req.body, req.user.id),
      'تم إنشاء عملية البيع بنجاح',
    );
  }),
  /**
   * تحديث فاتورة مبيعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(
      res,
      await salesService.updateSale(req.params.id, req.body, req.user.id),
      'تم تحديث الفاتورة بنجاح',
    );
  }),
  /**
   * إرجاع أصناف من فاتورة مبيعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  return: wrap(async (req, res) => {
    ok(
      res,
      await salesService.returnSale(req.params.id, req.user.id, req.body.notes),
      'تمت عملية المرتجع بنجاح',
    );
  }),
  /**
   * مسح جميع المبيعات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAll: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    const allowedWarehouses = await getAllowedWarehouses(userId);
    const data = await salesService.deleteAllSales(userId, allowedWarehouses);
    ok(res, data, `تم حذف ${data.deletedCount} سجلات بنجاح`);
  }),
  /**
   * حذف مبيعات تاريخ محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteByDate: wrap(async (req, res) => {
    const saleDate = req.params.saleDate;
    const userId = req.user?.id || req.user?.userId;
    const allowedWarehouses = await getAllowedWarehouses(userId);
    const data = await salesService.deleteSalesByDate(saleDate, userId, allowedWarehouses);
    ok(res, data, `تم حذف ${data.deletedCount} سجلات من تاريخ ${saleDate} بنجاح`);
  }),
  /**
   * حذف مبيعات حسب النوع (محل/جملة).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteByType: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    const allowedWarehouses = await getAllowedWarehouses(userId);
    const data = await salesService.deleteSalesByType(
      req.params.saleType,
      userId,
      allowedWarehouses,
    );
    const label = data.saleType === 'retail' ? 'المحل' : 'الجملة';
    ok(res, data, `تم حذف ${data.deletedCount} سجل من مبيعات ${label} بنجاح`);
  }),
  /**
   * تنزيل قالب استيراد المبيعات (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  template: wrap(async (_req, res) => {
    const buf = salesExcelService.buildImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="bin-al-ajouz-sales-template.xlsx"');
    res.send(buf);
  }),
  /**
   * تنزيل قالب استيراد مبيعات نقطة البيع (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  posTemplate: wrap(async (_req, res) => {
    const buf = await posSalesExcelService.buildPosTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="pos-template.xlsx"');
    res.send(buf);
  }),
  /**
   * التحقق من صحة ملف مبيعات نقطة البيع المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  posValidateExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    ok(res, await posSalesExcelService.validatePosExcel(req.file.buffer), 'تم فحص الملف');
  }),
  /**
   * استيراد مبيعات نقطة البيع من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  posImportExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    ok(
      res,
      await posSalesExcelService.importPosExcel(req.file.buffer, req.user.id),
      'تم الاستيراد',
    );
  }),
  /**
   * استيراد المبيعات من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  importExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    const result = await salesExcelService.importFromExcel(req.file.buffer, req.user.id, {
      confirm: req.body?.confirm,
    });
    ok(res, result, 'تم استيراد المبيعات بنجاح');
  }),
  /**
   * التحقق من صحة ملف المبيعات المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  validateExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    ok(
      res,
      await salesExcelService.validateSalesExcel(req.file.buffer),
      'تم التحقق من ملف المبيعات بنجاح',
    );
  }),
};
export { sales };
