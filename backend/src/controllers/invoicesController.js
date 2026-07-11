import * as invoiceService from '../services/invoiceService.js';
import * as invoicePdfService from '../services/invoicePdfService.js';
import { ok } from './helper.js';

export const invoices = {
  list: async (req, res, next) => { try { ok(res, await invoiceService.getInvoices(req.query)); } catch (e) { next(e); } },
  create: async (req, res, next) => {
    try { ok(res, await invoiceService.createInvoice(req.body, req.user.id), 'تم إنشاء الفاتورة بنجاح'); } catch (e) { next(e); }
  },
  get: async (req, res, next) => { try { ok(res, await invoiceService.getInvoiceById(req.params.id)); } catch (e) { next(e); } },
  update: async (req, res, next) => {
    try { ok(res, await invoiceService.updateInvoice(req.params.id, req.body, req.user.id), 'تم تحديث الفاتورة بنجاح'); } catch (e) { next(e); }
  },
  pdf: async (req, res, next) => {
    try {
      const { buffer, invoiceNumber } = await invoicePdfService.generateInvoicePdf(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceNumber}.pdf"`);
      res.send(buffer);
    } catch (e) { next(e); }
  },
  delete: async (req, res, next) => { try { await invoiceService.deleteInvoice(req.params.id, req.user.id); ok(res, null, 'تم حذف الفاتورة'); } catch (e) { next(e); } },
};
