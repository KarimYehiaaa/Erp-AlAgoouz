import * as customerService from '../services/customerService.ts';
import { ok } from './helper.ts';

export const customers = {
  /**
   * قائمة العملاء مع التصفية والبحث.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await customerService.getCustomers(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب عميل حسب معرفه مع رصيده.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: async (req, res, next) => {
    try {
      ok(res, await customerService.getCustomerById(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء عميل جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(res, await customerService.createCustomer(req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث بيانات عميل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(res, await customerService.updateCustomer(req.params.id, req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف عميل (حذف ناعم).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      await customerService.deleteCustomer(req.params.id);
      ok(res, null);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * كشف حساب حركات عميل خلال فترة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  statement: async (req, res, next) => {
    try {
      ok(res, await customerService.getCustomerStatement(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تسجيل دفعة على حساب عميل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recordPayment: async (req, res, next) => {
    try {
      ok(
        res,
        await customerService.recordPayment(req.params.id, { ...req.body, user_id: req.user.id }),
        'تم تسجيل الدفعة بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تسجيل دفعة مرتبطة بفاتورة مبيعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recordSalePayment: async (req, res, next) => {
    try {
      ok(
        res,
        await customerService.recordSalePayment(req.params.saleId, {
          ...req.body,
          user_id: req.user.id,
        }),
        'تم تسجيل الدفعة بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
};
