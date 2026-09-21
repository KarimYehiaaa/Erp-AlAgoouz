import * as invoiceService from '../services/invoiceService.ts';
import * as invoicePdfService from '../services/invoicePdfService.ts';
import { ok, wrap } from './helper.ts';
import { getAllowedWarehouses } from '../middleware/branchIsolation.ts';
import { WAREHOUSE_GLOBAL_ROLES } from '../../../shared/permissions.js';
import { AppError } from '../types/errors.ts';

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
    const inv = await invoiceService.getInvoiceById(req.params.id);
    const userRole = (req as any).user?.role_name || (req as any).user?.role;
    if (!WAREHOUSE_GLOBAL_ROLES.includes(userRole) && inv?.warehouse_id) {
      const allowed = await getAllowedWarehouses((req as any).user.id);
      if (!allowed.includes(Number(inv.warehouse_id))) {
        throw new AppError('ليس لديك صلاحية للوصول إلى فواتير هذا الفرع', 403);
      }
    }
    ok(res, inv);
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
    const inv = await invoiceService.getInvoiceById(req.params.id);
    const userRole = (req as any).user?.role_name || (req as any).user?.role;
    if (!WAREHOUSE_GLOBAL_ROLES.includes(userRole) && inv?.warehouse_id) {
      const allowed = await getAllowedWarehouses((req as any).user.id);
      if (!allowed.includes(Number(inv.warehouse_id))) {
        throw new AppError('ليس لديك صلاحية للوصول إلى فواتير هذا الفرع', 403);
      }
    }
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
