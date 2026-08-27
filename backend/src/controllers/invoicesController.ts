import * as invoiceService from '../services/invoiceService.ts';
import * as invoicePdfService from '../services/invoicePdfService.ts';
import { ok, wrap } from './helper.ts';
const invoices = {
  /**
   * قائمة فواتير العملاء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await invoiceService.getInvoices(req.query));
  }),
  /**
     ok(res, await invoiceService.getInvoices(req.query));
  }),
  /**
   * إنشاء فاتورة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await invoiceService.createInvoice(req.body, req.user.id), 'تم إنشاء الفاتورة بنجاح');
  }),
  /**
   * جلب فاتورة مع بنودها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: wrap(async (req, res) => {
    ok(res, await invoiceService.getInvoiceById(req.params.id));
  }),
  /**
   * تحديث فاتورة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(
      res,
      await invoiceService.updateInvoice(req.params.id, req.body, req.user.id),
      'تم تحديث الفاتورة بنجاح',
    );
  }),
  /**
   * توليد وتنزيل PDF للفاتورة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  pdf: wrap(async (req, res) => {
    const { buffer, invoiceNumber } = await invoicePdfService.generateInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceNumber}.pdf"`);
    res.send(buffer);
  }),
  /**
   * حذف فاتورة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    await invoiceService.deleteInvoice(req.params.id, req.user.id);
    ok(res, null, 'تم حذف الفاتورة بنجاح');
  }),
};
export { invoices };
