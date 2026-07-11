import * as customerService from '../services/customerService.js';
import { ok } from './helper.js';

export const customers = {
  list: async (req, res, next) => { try { ok(res, await customerService.getCustomers(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { ok(res, await customerService.getCustomerById(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await customerService.createCustomer(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await customerService.updateCustomer(req.params.id, req.body)); } catch (e) { next(e); } },
  delete: async (req, res, next) => { try { await customerService.deleteCustomer(req.params.id); ok(res, null); } catch (e) { next(e); } },
  statement: async (req, res, next) => { try { ok(res, await customerService.getCustomerStatement(req.params.id)); } catch (e) { next(e); } },
  recordPayment: async (req, res, next) => {
    try {
      ok(res, await customerService.recordPayment(req.params.id, { ...req.body, user_id: req.user.id }), 'تم تسجيل الدفعة بنجاح');
    } catch (e) { next(e); }
  },
  recordSalePayment: async (req, res, next) => {
    try {
      ok(res, await customerService.recordSalePayment(req.params.saleId, { ...req.body, user_id: req.user.id }), 'تم تسجيل الدفعة بنجاح');
    } catch (e) { next(e); }
  },
};
