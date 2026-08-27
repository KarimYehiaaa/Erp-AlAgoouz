import * as supplierService from '../services/supplierService.ts';
import { ok, wrap } from './helper.ts';

export const suppliers = {
  /**
   * قائمة الموردين مع البحث.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await supplierService.getSuppliers());
  }),
  /**
   * جلب مورد حسب معرفه.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: wrap(async (req, res) => {
    ok(res, await supplierService.getSupplierById(req.params.id));
  }),
  /**
   * إنشاء مورد جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await supplierService.createSupplier(req.body, req.user.id));
  }),
  /**
   * تحديث بيانات مورد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(res, await supplierService.updateSupplier(req.params.id, req.body, req.user.id));
  }),
  /**
   * حذف مورد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    ok(res, await supplierService.deleteSupplier(req.params.id, req.user.id), 'تم الحذف');
  }),
  /**
   * فواتير الشراء الخاصة بمورد مع المبالغ المدفوعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  invoices: wrap(async (req, res) => {
    ok(res, await supplierService.getSupplierInvoices(req.params.id));
  }),
  /**
   * مدفوعات مورد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  payments: wrap(async (req, res) => {
    ok(res, await supplierService.getSupplierPayments(req.params.id));
  }),
  /**
   * تسجيل دفعة لمورد وتحديث رصيده.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recordPayment: wrap(async (req, res) => {
    ok(
      res,
      await supplierService.recordSupplierPayment(req.params.id, req.body, req.user.id),
      'تم تسجيل سداد المورد بنجاح',
    );
  }),
};
