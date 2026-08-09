import * as supplierService from '../services/supplierService.js';
import { ok } from './helper.js';

export const suppliers = {
  list: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSuppliers());
    } catch (e) {
      next(e);
    }
  },
  get: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSupplierById(req.params.id));
    } catch (e) {
      next(e);
    }
  },
  create: async (req, res, next) => {
    try {
      ok(res, await supplierService.createSupplier(req.body, req.user.id));
    } catch (e) {
      next(e);
    }
  },
  update: async (req, res, next) => {
    try {
      ok(res, await supplierService.updateSupplier(req.params.id, req.body, req.user.id));
    } catch (e) {
      next(e);
    }
  },
  delete: async (req, res, next) => {
    try {
      ok(res, await supplierService.deleteSupplier(req.params.id, req.user.id), 'تم الحذف');
    } catch (e) {
      next(e);
    }
  },
  invoices: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSupplierInvoices(req.params.id));
    } catch (e) {
      next(e);
    }
  },
  payments: async (req, res, next) => {
    try {
      ok(res, await supplierService.getSupplierPayments(req.params.id));
    } catch (e) {
      next(e);
    }
  },
  recordPayment: async (req, res, next) => {
    try {
      ok(
        res,
        await supplierService.recordSupplierPayment(req.params.id, req.body, req.user.id),
        'تم تسجيل سداد المورد بنجاح',
      );
    } catch (e) {
      next(e);
    }
  },
};
