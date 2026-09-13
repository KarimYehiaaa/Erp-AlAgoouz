import * as salesService from '../services/salesService.ts';
import * as openingBalanceService from '../services/openingBalanceService.ts';
import * as salesExcelService from '../services/salesExcelService.ts';
import * as branchSalesExcelService from '../services/branchSalesExcelService.ts';
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
    const result = await salesService.getSales(req.query);
    ok(res, result.data, void 0, result.meta);
  }),
  /**
   * ملخص إجمالي المبيعات (عدد الفواتير، الإجمالي، الأرباح...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  summary: wrap(async (req, res) => {
    ok(res, await salesService.getSalesSummary(req.query));
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
    ok(res, await salesService.getSaleById(req.params.id));
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
    const data = await salesService.deleteAllSales(req.user.id);
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
    const data = await salesService.deleteSalesByDate(saleDate, req.user.id);
    ok(res, data, `تم حذف ${data.deletedCount} سجلات من تاريخ ${saleDate} بنجاح`);
  }),
  /**
   * حذف مبيعات حسب النوع (فرع/جملة).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteByType: wrap(async (req, res) => {
    const data = await salesService.deleteSalesByType(req.params.saleType, req.user.id);
    const label = data.saleType === 'branch' ? 'الفرع' : 'الجملة';
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
   * تنزيل قالب استيراد مبيعات الفرع (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchTemplate: wrap(async (_req, res) => {
    const buf = await branchSalesExcelService.buildBranchTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="branch-sales-template.xlsx"');
    res.send(buf);
  }),
  /**
   * التحقق من صحة ملف مبيعات الفرع المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchValidateExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    ok(res, await branchSalesExcelService.validateBranchExcel(req.file.buffer), 'تم فحص الملف');
  }),
  /**
   * استيراد مبيعات الفرع من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchImportExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    ok(
      res,
      await branchSalesExcelService.importBranchExcel(req.file.buffer, req.user.id),
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
