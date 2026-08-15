import * as inventoryService from '../services/inventoryService.ts';
import * as inventoryExcelService from '../services/inventoryExcelService.ts';
import { AppError } from '../types/errors.ts';
import { ok } from './helper.ts';
const inventory = {
  /**
   * قائمة أرصدة المخزون مع التصفية حسب المخزن والمنتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getInventory(req.query.warehouse_id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حركات المخزون (داخل/خارج) مع التصفية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  movements: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getStockMovements(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * نقل كمية بين مخازن.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  transfer: async (req, res, next) => {
    try {
      ok(res, await inventoryService.transferStock(req.body, req.user.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تسوية رصيد مخزون (إضافة أو خصم).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  adjust: async (req, res, next) => {
    try {
      ok(res, await inventoryService.adjustStock(req.body, req.user.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * مسح جميع أرصدة المخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  clearAll: async (req, res, next) => {
    try {
      const data = await inventoryService.clearAllInventoryData(req.user.id);
      ok(
        res,
        data,
        '\u062A\u0645 \u062D\u0630\u0641 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0628\u0627\u0644\u0643\u0627\u0645\u0644',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة المخازن النشطة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  warehouses: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getWarehouses());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تنزيل قالب استيراد مرتجعات المخزون (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  returnTemplate: async (req, res, next) => {
    try {
      const buf = await inventoryExcelService.buildReturnTemplate(req.query.warehouse_id || null);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-return-template.xlsx"');
      res.send(buf);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * التحقق من صحة ملف مرتجعات المخزون المرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  validateReturnExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer)
        throw new AppError('\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel', 400);
      ok(
        res,
        await inventoryExcelService.validateReturnExcel(req.file.buffer),
        '\u062A\u0645 \u0641\u062D\u0635 \u0627\u0644\u0645\u0644\u0641',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * استيراد مرتجعات المخزون من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  importReturnExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer)
        throw new AppError('\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel', 400);
      const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id || null;
      const result = await inventoryExcelService.importReturnFromExcel(
        req.file.buffer,
        req.user.id,
        warehouseId,
      );
      if (!result.success) {
        throw new AppError(
          result.failed?.[0]?.message ||
            '\u0644\u0645 \u064A\u062A\u0645 \u062A\u0637\u0628\u064A\u0642 \u0623\u064A \u0635\u0641 \u0635\u0627\u0644\u062D \u0645\u0646 \u0645\u0644\u0641 \u0627\u0644\u0627\u0633\u062A\u0631\u062F\u0627\u062F',
          400,
        );
      }
      ok(
        res,
        result,
        `\u062A\u0645 \u0627\u0633\u062A\u0631\u062F\u0627\u062F ${result.success} \u0645\u0646\u062A\u062C \u0628\u0646\u062C\u0627\u062D`,
      );
    } catch (e: any) {
      next(e);
    }
  },
};
export { inventory };
