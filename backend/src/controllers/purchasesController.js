import * as purchaseService from '../services/purchaseService.js';
import { ok } from './helper.js';

export const purchases = {
  list: async (req, res, next) => {
    try {
      console.log('Purchases List Query:', req.query);
      ok(res, await purchaseService.listPurchaseInvoices(req.query));
    } catch (e) {
      next(e);
    }
  },
  create: async (req, res, next) => {
    try { ok(res, await purchaseService.createPurchaseInvoice(req.body, req.user.id), 'تم إنشاء فاتورة المشتريات'); } catch (e) { next(e); }
  },
  update: async (req, res, next) => {
    try { ok(res, await purchaseService.updatePurchaseInvoice(req.params.id, req.body, req.user.id), 'تم تعديل فاتورة المشتريات بنجاح'); } catch (e) { next(e); }
  },
  delete: async (req, res, next) => {
    try {
      const data = await purchaseService.deletePurchaseInvoice(req.params.id, req.user.id);
      ok(res, data, 'تم حذف فاتورة المشتريات بنجاح');
    } catch (e) {
      next(e);
    }
  },
};
