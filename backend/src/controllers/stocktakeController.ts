import * as stocktakeService from '../services/stocktakeService.ts';
import { ok, wrap } from './helper.ts';

export const stocktake = {
  /**
   * قائمة عمليات الجرد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (_req, res) => {
    ok(res, await stocktakeService.getStocktakeList());
  }),
  /**
   * جلب جرد مع بنوده.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: wrap(async (req, res) => {
    ok(res, await stocktakeService.getStocktakeDetails(req.params.id));
  }),
  /**
   * إنشاء جرد جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
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
   * تحديث الكميات الفعلية لبنود جرد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateItems: wrap(async (req, res) => {
    ok(
      res,
      await stocktakeService.updateStocktakeItems(req.params.id, req.body),
      'تم حفظ مسودة الجرد',
    );
  }),
  /**
   * اعتماد الجرد وتطبيق الفروقات على المخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  complete: wrap(async (req, res) => {
    ok(
      res,
      await stocktakeService.completeStocktake(req.params.id, req.user.id),
      'تم اعتماد الجرد وتسوية الفروقات',
    );
  }),
  /**
   * حذف جرد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    ok(res, await stocktakeService.deleteStocktake(req.params.id), 'تم حذف مسودة الجرد بنجاح');
  }),
};
