import * as salesService from '../services/salesService.ts';
import * as openingBalanceService from '../services/openingBalanceService.ts';
import * as salesExcelService from '../services/salesExcelService.ts';
import * as branchSalesExcelService from '../services/branchSalesExcelService.ts';
import { AppError } from '../types/errors.ts';
import { ok } from './helper.ts';
const sales = {
  /**
   * قائمة المبيعات مع التصفية حسب الفترة والمخزن والنوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      const result = await salesService.getSales(req.query);
      ok(res, result.data, void 0, result.meta);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * ملخص إجمالي المبيعات (عدد الفواتير، الإجمالي، الأرباح...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  summary: async (req, res, next) => {
    try {
      ok(res, await salesService.getSalesSummary(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب الرصيد الافتتاحي لمخزن في تاريخ محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  openingBalance: async (req, res, next) => {
    try {
      ok(
        res,
        await openingBalanceService.getOpeningBalance(req.query.from_date, req.query.to_date),
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حفظ الرصيد الافتتاحي لمخزن.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  saveOpeningBalance: async (req, res, next) => {
    try {
      ok(
        res,
        await openingBalanceService.saveOpeningBalance(req.body, req.user.id),
        '\u062A\u0645 \u062D\u0641\u0638 \u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0645\u062F\u0629 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب فاتورة مبيعة مع بنودها ومدفوعاتها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: async (req, res, next) => {
    try {
      ok(res, await salesService.getSaleById(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء فاتورة مبيعة جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(
        res,
        await salesService.createDailySale(req.body, req.user.id),
        '\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث فاتورة مبيعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(
        res,
        await salesService.updateSale(req.params.id, req.body, req.user.id),
        '\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إرجاع أصناف من فاتورة مبيعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  return: async (req, res, next) => {
    try {
      ok(
        res,
        await salesService.returnSale(req.params.id, req.user.id, req.body.notes),
        '\u062A\u0645\u062A \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0645\u0631\u062A\u062C\u0639 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * مسح جميع المبيعات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAll: async (req, res, next) => {
    try {
      const data = await salesService.deleteAllSales(req.user.id);
      ok(
        res,
        data,
        `\u062A\u0645 \u062D\u0630\u0641 ${data.deletedCount} \u0633\u062C\u0644\u0627\u062A \u0628\u0646\u062C\u0627\u062D`,
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف مبيعات تاريخ محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteByDate: async (req, res, next) => {
    try {
      const saleDate = req.params.saleDate;
      const data = await salesService.deleteSalesByDate(saleDate, req.user.id);
      ok(
        res,
        data,
        `\u062A\u0645 \u062D\u0630\u0641 ${data.deletedCount} \u0633\u062C\u0644\u0627\u062A \u0645\u0646 \u062A\u0627\u0631\u064A\u062E ${saleDate} \u0628\u0646\u062C\u0627\u062D`,
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف مبيعات حسب النوع (سريع/آجل).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteByType: async (req, res, next) => {
    try {
      const data = await salesService.deleteSalesByType(req.params.saleType, req.user.id);
      const label =
        data.saleType === 'branch'
          ? '\u0627\u0644\u0641\u0631\u0639'
          : '\u0627\u0644\u062C\u0645\u0644\u0629';
      ok(
        res,
        data,
        `\u062A\u0645 \u062D\u0630\u0641 ${data.deletedCount} \u0633\u062C\u0644 \u0645\u0646 \u0645\u0628\u064A\u0639\u0627\u062A ${label} \u0628\u0646\u062C\u0627\u062D`,
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تنزيل قالب استيراد المبيعات (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  template: async (_req, res, next) => {
    try {
      const buf = salesExcelService.buildImportTemplate();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="bin-al-ajouz-sales-template.xlsx"',
      );
      res.send(buf);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تنزيل قالب استيراد مبيعات الفرع (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchTemplate: async (_req, res, next) => {
    try {
      const buf = await branchSalesExcelService.buildBranchTemplate();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="branch-sales-template.xlsx"');
      res.send(buf);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * التحقق من صحة ملف مبيعات الفرع المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchValidateExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer)
        throw new AppError('\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel', 400);
      ok(
        res,
        await branchSalesExcelService.validateBranchExcel(req.file.buffer),
        '\u062A\u0645 \u0641\u062D\u0635 \u0627\u0644\u0645\u0644\u0641',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * استيراد مبيعات الفرع من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchImportExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer)
        throw new AppError('\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel', 400);
      ok(
        res,
        await branchSalesExcelService.importBranchExcel(req.file.buffer, req.user.id),
        '\u062A\u0645 \u0627\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * استيراد المبيعات من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  importExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer)
        throw new AppError('\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel', 400);
      const result = await salesExcelService.importFromExcel(req.file.buffer, req.user.id, {
        confirm: req.body?.confirm,
      });
      ok(
        res,
        result,
        `\u062A\u0645 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0628\u0646\u062C\u0627\u062D`,
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * التحقق من صحة ملف المبيعات المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  validateExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer)
        throw new AppError('\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel', 400);
      ok(
        res,
        salesExcelService.validateSalesExcel(req.file.buffer),
        '\u062A\u0645 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0645\u0644\u0641 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
};
export { sales };
