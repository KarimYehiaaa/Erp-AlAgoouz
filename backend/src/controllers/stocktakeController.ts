import * as stocktakeService from '../services/stocktakeService.ts';
import { ok } from './helper.ts';

export const stocktake = {
  /**
   * قائمة عمليات الجرد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (_req, res, next) => {
    try {
      ok(res, await stocktakeService.getStocktakeList());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب جرد مع بنوده.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: async (req, res, next) => {
    try {
      ok(res, await stocktakeService.getStocktakeDetails(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء جرد جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      const { warehouse_id, notes } = req.body;
      ok(
        res,
        await stocktakeService.createStocktake(warehouse_id, req.user.id, notes),
        'تم بدء مسودة جرد جديدة',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث الكميات الفعلية لبنود جرد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateItems: async (req, res, next) => {
    try {
      ok(
        res,
        await stocktakeService.updateStocktakeItems(req.params.id, req.body),
        'تم حفظ مسودة الجرد',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * اعتماد الجرد وتطبيق الفروقات على المخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  complete: async (req, res, next) => {
    try {
      ok(
        res,
        await stocktakeService.completeStocktake(req.params.id, req.user.id),
        'تم اعتماد الجرد وتسوية الفروقات',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف جرد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      ok(res, await stocktakeService.deleteStocktake(req.params.id), 'تم حذف مسودة الجرد بنجاح');
    } catch (e: any) {
      next(e);
    }
  },
};
