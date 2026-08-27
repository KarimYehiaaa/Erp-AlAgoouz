import * as purchaseService from '../services/purchaseService.ts';
import { ok, wrap } from './helper.ts';

export const purchases = {
  /**
   * قائمة فواتير الشراء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await purchaseService.listPurchaseInvoices(req.query));
  }),
  /**
   * إنشاء فاتورة شراء جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(
      res,
      await purchaseService.createPurchaseInvoice(req.body, req.user.id),
      'تم إنشاء فاتورة المشتريات',
    );
  }),
  /**
   * تحديث فاتورة شراء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(
      res,
      await purchaseService.updatePurchaseInvoice(req.params.id, req.body, req.user.id),
      'تم تعديل فاتورة المشتريات بنجاح',
    );
  }),
  /**
   * حذف فاتورة شراء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    const data = await purchaseService.deletePurchaseInvoice(req.params.id, req.user.id);
    ok(res, data, 'تم حذف فاتورة المشتريات بنجاح');
  }),
};
