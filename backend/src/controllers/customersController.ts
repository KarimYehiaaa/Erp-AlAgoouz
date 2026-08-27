import * as customerService from '../services/customerService.ts';
import { ok, wrap } from './helper.ts';

export const customers = {
  /**
   * قائمة العملاء مع التصفية والبحث.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await customerService.getCustomers(req.query));
  }),
  /**
   * جلب عميل حسب معرفه مع رصيده.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: wrap(async (req, res) => {
    ok(res, await customerService.getCustomerById(req.params.id));
  }),
  /**
   * إنشاء عميل جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await customerService.createCustomer(req.body));
  }),
  /**
   * تحديث بيانات عميل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(res, await customerService.updateCustomer(req.params.id, req.body));
  }),
  /**
   * حذف عميل (حذف ناعم).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    await customerService.deleteCustomer(req.params.id);
    ok(res, null);
  }),
  /**
   * كشف حساب حركات عميل خلال فترة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  statement: wrap(async (req, res) => {
    ok(res, await customerService.getCustomerStatement(req.params.id));
  }),
  /**
   * تسجيل دفعة على حساب عميل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recordPayment: wrap(async (req, res) => {
    ok(
      res,
      await customerService.recordPayment(req.params.id, { ...req.body, user_id: req.user.id }),
      'تم تسجيل الدفعة بنجاح',
    );
  }),
  /**
   * تسجيل دفعة مرتبطة بفاتورة مبيعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recordSalePayment: wrap(async (req, res) => {
    ok(
      res,
      await customerService.recordSalePayment(req.params.saleId, {
        ...req.body,
        user_id: req.user.id,
      }),
      'تم تسجيل الدفعة بنجاح',
    );
  }),
};
