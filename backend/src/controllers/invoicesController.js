import * as invoiceService from "../services/invoiceService.js";
import * as invoicePdfService from "../services/invoicePdfService.js";
import { ok } from "./helper.js";
const invoices = {
  list: async (req, res, next) => {
    try {
      ok(res, await invoiceService.getInvoices(req.query));
    } catch (e) {
      next(e);
    }
  },
  create: async (req, res, next) => {
    try {
      ok(res, await invoiceService.createInvoice(req.body, req.user.id), "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  get: async (req, res, next) => {
    try {
      ok(res, await invoiceService.getInvoiceById(req.params.id));
    } catch (e) {
      next(e);
    }
  },
  update: async (req, res, next) => {
    try {
      ok(res, await invoiceService.updateInvoice(req.params.id, req.body, req.user.id), "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  pdf: async (req, res, next) => {
    try {
      const { buffer, invoiceNumber } = await invoicePdfService.generateInvoicePdf(req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoiceNumber}.pdf"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
  delete: async (req, res, next) => {
    try {
      await invoiceService.deleteInvoice(req.params.id, req.user.id);
      ok(res, null, "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629");
    } catch (e) {
      next(e);
    }
  }
};
export {
  invoices
};
