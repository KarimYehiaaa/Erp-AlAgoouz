import * as purchaseService from '../services/purchaseService.ts';
import { ok } from './helper.ts';

export const purchases = {
  /**
   * قائمة فواتير الشراء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await purchaseService.listPurchaseInvoices(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء فاتورة شراء جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(
        res,
        await purchaseService.createPurchaseInvoice(req.body, req.user.id),
        'تم إنشاء فاتورة المشتريات',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث فاتورة شراء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(
        res,
        await purchaseService.updatePurchaseInvoice(req.params.id, req.body, req.user.id),
        'تم تعديل فاتورة المشتريات بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف فاتورة شراء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      const data = await purchaseService.deletePurchaseInvoice(req.params.id, req.user.id);
      ok(res, data, 'تم حذف فاتورة المشتريات بنجاح');
    } catch (e: any) {
      next(e);
    }
  },
};
