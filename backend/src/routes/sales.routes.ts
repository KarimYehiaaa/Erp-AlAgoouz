/**
 * routes/sales.routes.ts — المبيعات والعملاء والمصروفات
 *  - مبيعات الفروع (استيراد Excel) والمبيعات اليومية (فرع/جملة)
 *  - الأرصدة الافتتاحية والمرتجعات والحذف الجماعي
 *  - العملاء (بيانات/كشوف/مدفوعات) والمصروفات
 */
import { Router } from 'express';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { requireConfirmation } from '../middleware/confirmAction.ts';
import { validateBody, validateQuery } from '../middleware/validate.ts';
import { enforceWarehouseAccess } from '../middleware/warehouseAccess.ts';
import {
  requireManagerOverride,
  enforceCashierDiscountOverride,
} from '../middleware/managerOverride.ts';
import { upload } from './helpers.ts';
import {
  commonQuerySchema,
  saleSchema,
  saleReturnSchema,
  openingBalanceSchema,
  customerCreateSchema,
  customerUpdateSchema,
  paymentSchema,
  expenseSchema,
  expenseUpdateSchema,
} from './schemas.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

const salesViewAuth = authorize('pos.view', 'sales.view', 'reports.view');
const salesCreateAuth = authorize('pos.add', 'sales.add', 'invoices.add');
const salesEditAuth = authorize('pos.edit', 'sales.edit', 'invoices.edit');
const salesDeleteAuth = authorize('pos.delete', 'sales.delete');

// Existing POS Excel URLs remain stable for already-installed clients.
router.get('/sales/branch/template', authenticate, authorize('pos.view'), api.sales.posTemplate);
router.post(
  '/sales/branch/validate',
  authenticate,
  authorize('pos.add'),
  upload.single('file'),
  api.sales.posValidateExcel,
);
router.post(
  '/sales/branch/import',
  authenticate,
  authorize('pos.add'),
  upload.single('file'),
  api.sales.posImportExcel,
);

// ─── Sales — مبيعات يومية (فرع / جملة) ──────────────────────────────────────
router.get(
  '/sales/summary',
  authenticate,
  salesViewAuth,
  validateQuery(commonQuerySchema),
  api.sales.summary,
);
router.get('/sales/opening-balance', authenticate, salesViewAuth, api.sales.openingBalance);
router.put(
  '/sales/opening-balance',
  authenticate,
  salesEditAuth,
  validateBody(openingBalanceSchema),
  api.sales.saveOpeningBalance,
);
router.get('/sales/template', authenticate, salesViewAuth, api.sales.template);
router.post(
  '/sales/import/validate',
  authenticate,
  salesCreateAuth,
  upload.single('file'),
  api.sales.validateExcel,
);
router.post(
  '/sales/import',
  authenticate,
  salesCreateAuth,
  upload.single('file'),
  api.sales.importExcel,
);
router.get('/sales', authenticate, salesViewAuth, validateQuery(commonQuerySchema), api.sales.list);
router.get('/sales/:id', authenticate, salesViewAuth, api.sales.get);
router.post(
  '/sales',
  authenticate,
  salesCreateAuth,
  enforceWarehouseAccess,
  validateBody(saleSchema),
  // خصم الكاشير الكبير يتطلب توكن تجاوز مدير (يُصدر من /pos/verify-pin) — فرض على الخادم
  enforceCashierDiscountOverride,
  auditLog('sale_create', 'sales'),
  api.sales.create,
);
router.put(
  '/sales/:id',
  authenticate,
  salesEditAuth,
  enforceWarehouseAccess,
  validateBody(saleSchema),
  auditLog('sale_update', 'sales'),
  api.sales.update,
);
router.post(
  '/sales/:id/return',
  authenticate,
  authorize('pos.add', 'pos.edit', 'sales.edit'),
  enforceWarehouseAccess,
  // إرجاع الفاتورة بواسطة كاشير يتطلب مصادقة مدير مفروضة على الخادم (X-Manager-Override)
  requireManagerOverride,
  validateBody(saleReturnSchema),
  api.sales.return,
);
router.delete(
  '/sales',
  authenticate,
  salesDeleteAuth,
  requireConfirmation('CONFIRM_DELETE_ALL_SALES'),
  auditLog('sales_delete_all', 'sales'),
  api.sales.deleteAll,
);
router.delete(
  '/sales/date/:saleDate',
  authenticate,
  salesDeleteAuth,
  requireConfirmation('CONFIRM_DELETE_SALES_DATE'),
  auditLog('sales_delete_date', 'sales'),
  api.sales.deleteByDate,
);
router.delete(
  '/sales/type/:saleType',
  authenticate,
  authorize('settings.delete', 'sales.delete'),
  requireConfirmation('CONFIRM_DELETE_SALES_TYPE'),
  auditLog('sales_delete_type', 'sales'),
  api.sales.deleteByType,
);

// ─── Customers ────────────────────────────────────────────────────────────────
router.get(
  '/customers',
  authenticate,
  authorize('pos.view'),
  validateQuery(commonQuerySchema),
  api.customers.list,
);
router.get('/customers/:id', authenticate, authorize('customers.view'), api.customers.get);
router.get(
  '/customers/:id/statement',
  authenticate,
  authorize('customers.view'),
  api.customers.statement,
);
router.post(
  '/customers/:id/payment',
  authenticate,
  authorize('customers.add'),
  validateBody(paymentSchema),
  api.customers.recordPayment,
);
router.post(
  '/customers/sales/:saleId/payment',
  authenticate,
  authorize('customers.add'),
  validateBody(paymentSchema),
  api.customers.recordSalePayment,
);
router.post(
  '/customers',
  authenticate,
  authorize('customers.add'),
  validateBody(customerCreateSchema),
  api.customers.create,
);
router.put(
  '/customers/:id',
  authenticate,
  authorize('customers.edit'),
  validateBody(customerUpdateSchema),
  api.customers.update,
);
router.delete('/customers/:id', authenticate, authorize('customers.delete'), api.customers.delete);

// ─── Expenses ─────────────────────────────────────────────────────────────────
router.get(
  '/expenses',
  authenticate,
  authorize('expenses.view'),
  validateQuery(commonQuerySchema),
  api.expenses.list,
);
router.get(
  '/expenses/categories',
  authenticate,
  authorize('expenses.view'),
  api.expenses.categories,
);
router.get('/expenses/report', authenticate, authorize('expenses.view'), api.expenses.report);
router.post(
  '/expenses',
  authenticate,
  authorize('expenses.add'),
  validateBody(expenseSchema),
  auditLog('expense_create', 'expenses'),
  api.expenses.create,
);
router.put(
  '/expenses/:id',
  authenticate,
  authorize('expenses.edit'),
  validateBody(expenseUpdateSchema),
  auditLog('expense_update', 'expenses'),
  api.expenses.update,
);
router.delete(
  '/expenses/:id',
  authenticate,
  authorize('expenses.delete'),
  auditLog('expense_delete', 'expenses'),
  api.expenses.delete,
);

/**
 * موجّه المبيعات والعملاء والمصروفات.
 */
export default router;
