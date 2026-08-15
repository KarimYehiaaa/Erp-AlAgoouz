import * as supplierService from '../services/supplierService.ts';
import { ok } from './helper.ts';

export const suppliers = {
  /**
   * قائمة الموردين مع البحث.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSuppliers());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب مورد حسب معرفه.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSupplierById(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء مورد جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(res, await supplierService.createSupplier(req.body, req.user.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث بيانات مورد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(res, await supplierService.updateSupplier(req.params.id, req.body, req.user.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف مورد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      ok(res, await supplierService.deleteSupplier(req.params.id, req.user.id), 'تم الحذف');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * فواتير الشراء الخاصة بمورد مع المبالغ المدفوعة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  invoices: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSupplierInvoices(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * مدفوعات مورد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  payments: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSupplierPayments(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تسجيل دفعة لمورد وتحديث رصيده.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recordPayment: async (req, res, next) => {
    try {
      ok(
        res,
        await supplierService.recordSupplierPayment(req.params.id, req.body, req.user.id),
        'تم تسجيل سداد المورد بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
};
