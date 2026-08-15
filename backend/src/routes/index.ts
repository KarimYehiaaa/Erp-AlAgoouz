/**
 * routes/index.ts — الراوتر الرئيسي
 * ════════════════════════════════════
 * جميع مخططات التحقق (Zod Schemas) مُعرَّفة في: ./schemas.ts
 * هذا الملف مخصص للتوجيه والـ middleware فقط.
 */
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import config from '../config/index.ts';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { requireConfirmation } from '../middleware/confirmAction.ts';
import { validateBody, validateQuery } from '../middleware/validate.ts';
import * as authCtrl from '../controllers/authController.ts';
import * as api from '../controllers/apiController.ts';

// ── استيراد جميع Schemas من الملف المستقل ──
import {
  loginSchema,
  copilotSchema,
  commonQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  unitCreateSchema,
  unitUpdateSchema,
  bulkPriceAdjustSchema,
  productWarehouseSchema,
  productReturnSchema,
  inventoryTransferSchema,
  inventoryAdjustSchema,
  stocktakeCreateSchema,
  stocktakeUpdateSchema,
  purchaseInvoiceSchema,
  saleSchema,
  saleReturnSchema,
  openingBalanceSchema,
  customerCreateSchema,
  customerUpdateSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
  paymentSchema,
  expenseSchema,
  expenseUpdateSchema,
  invoiceSchema,
  quoteTemplateSchema,
  quotePdfSchema,
  userCreateSchema,
  userUpdateSchema,
  settingUpdateSchema,
  createRoleSchema,
  updateRoleSchema,
  updateRolePermissionsSchema,
  shiftSchema,
  employeeSchema,
  employeeUpdateSchema,
  attendanceSchema,
  advanceSchema,
  payrollSchema,
  payrollPaySchema,
  recipeSchema,
  recipeProductionSchema,
  reverseProductionSchema,
} from './schemas.ts';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const salesViewAuth = authorize('pos.view', 'sales.view', 'reports.view');
const salesCreateAuth = authorize('pos.add', 'sales.add', 'invoices.add');
const salesEditAuth = authorize('pos.edit', 'sales.edit', 'invoices.edit');
const salesDeleteAuth = authorize('pos.delete', 'sales.delete');

// BUG-13 FIX: تقليل الحد من 150 محاولة/5د إلى 10 محاولات/15د — حماية من Brute-Force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 10, // 10 محاولات فقط
  message: { success: false, message: 'تم تجاوز محاولات الدخول. حاول مرة أخرى بعد 15 دقيقة.' },
  skipSuccessfulRequests: true,
  skip: (_req) => config.isDevelopment,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'تم تجاوز محاولات تجديد الجلسة. حاول مرة أخرى بعد 15 دقيقة.',
  },
  skipSuccessfulRequests: true,
  skip: (_req) => config.isDevelopment,
});

// Middleware للتأكد أن المستخدم admin (role_name = 'admin')
const requireAdmin = (req, res, next) => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ success: false, message: 'هذه العملية متاحة للمدير فقط' });
  }
  next();
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', loginLimiter, validateBody(loginSchema), authCtrl.login);
router.get('/auth/profile', authenticate, authCtrl.profile);
router.post('/auth/refresh', refreshLimiter, authCtrl.refresh);
router.post('/auth/logout', authenticate, authCtrl.logoutHandler);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', authenticate, authorize('dashboard.view'), api.dashboard);
router.get('/operations/alerts', authenticate, authorize('dashboard.view'), api.operations.alerts);
router.get(
  '/operations/audit-logs',
  authenticate,
  authorize('reports.view'),
  api.operations.auditLogs,
);

// ─── HR / Payroll ─────────────────────────────────────────────────────────────
router.get('/hr/summary', authenticate, authorize('hr.view'), api.hr.summary);
router.get('/hr/shifts', authenticate, authorize('hr.view'), api.hr.shifts);
router.post(
  '/hr/shifts',
  authenticate,
  authorize('hr.add'),
  validateBody(shiftSchema),
  api.hr.createShift,
);
router.get('/hr/employees', authenticate, authorize('hr.view'), api.hr.employees);
router.post(
  '/hr/employees',
  authenticate,
  authorize('hr.add'),
  validateBody(employeeSchema),
  api.hr.createEmployee,
);
router.put(
  '/hr/employees/:id',
  authenticate,
  authorize('hr.edit'),
  validateBody(employeeUpdateSchema),
  api.hr.updateEmployee,
);
router.delete('/hr/employees/:id', authenticate, authorize('hr.delete'), api.hr.deleteEmployee);
router.get('/hr/attendance', authenticate, authorize('hr.view'), api.hr.attendance);
router.post(
  '/hr/attendance',
  authenticate,
  authorize('hr.add'),
  validateBody(attendanceSchema),
  api.hr.saveAttendance,
);
router.delete('/hr/attendance/:id', authenticate, authorize('hr.delete'), api.hr.deleteAttendance);
router.get('/hr/advances', authenticate, authorize('hr.view'), api.hr.advances);
router.post(
  '/hr/advances',
  authenticate,
  authorize('hr.add'),
  validateBody(advanceSchema),
  api.hr.createAdvance,
);
router.delete('/hr/advances/:id', authenticate, authorize('hr.delete'), api.hr.deleteAdvance);
router.get('/hr/payroll/preview', authenticate, authorize('hr.view'), api.hr.previewPayroll);
router.get('/hr/payroll', authenticate, authorize('hr.view'), api.hr.payrollRuns);
router.post(
  '/hr/payroll',
  authenticate,
  authorize('hr.add'),
  validateBody(payrollSchema),
  api.hr.createPayroll,
);
router.get('/hr/payroll/:id', authenticate, authorize('hr.view'), api.hr.getPayroll);
router.post(
  '/hr/payroll/:id/pay',
  authenticate,
  authorize('hr.add'),
  validateBody(payrollPaySchema),
  api.hr.payPayroll,
);

// ─── Branch Sales Excel ───────────────────────────────────────────────────────
router.get('/sales/branch/template', authenticate, authorize('pos.view'), api.sales.branchTemplate);
router.post(
  '/sales/branch/validate',
  authenticate,
  authorize('pos.add'),
  upload.single('file'),
  api.sales.branchValidateExcel,
);
router.post(
  '/sales/branch/import',
  authenticate,
  authorize('pos.add'),
  upload.single('file'),
  api.sales.branchImportExcel,
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
  validateBody(saleSchema),
  auditLog('sale_create', 'sales'),
  api.sales.create,
);
router.put(
  '/sales/:id',
  authenticate,
  salesEditAuth,
  validateBody(saleSchema),
  auditLog('sale_update', 'sales'),
  api.sales.update,
);
router.post(
  '/sales/:id/return',
  authenticate,
  authorize('pos.add', 'pos.edit', 'sales.edit'),
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

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products/branch', authenticate, authorize('pos.view'), api.products.branchProducts);
router.get(
  '/products/costs-report',
  authenticate,
  authorize('products.view'),
  api.products.costsReport,
);
router.get('/products/categories', authenticate, api.products.categories);
router.post(
  '/products/categories',
  authenticate,
  authorize('products.add'),
  validateBody(categoryCreateSchema),
  auditLog('category_create', 'products'),
  api.products.createCategory,
);
router.put(
  '/products/categories/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(categoryUpdateSchema),
  auditLog('category_update', 'products'),
  api.products.updateCategory,
);
router.delete(
  '/products/categories/:id',
  authenticate,
  authorize('products.delete'),
  auditLog('category_delete', 'products'),
  api.products.deleteCategory,
);
router.get('/products/units', authenticate, api.products.units);
router.post(
  '/products/units',
  authenticate,
  authorize('products.add'),
  validateBody(unitCreateSchema),
  auditLog('unit_create', 'products'),
  api.products.createUnit,
);
router.put(
  '/products/units/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(unitUpdateSchema),
  auditLog('unit_update', 'products'),
  api.products.updateUnit,
);
router.delete(
  '/products/units/:id',
  authenticate,
  authorize('products.delete'),
  auditLog('unit_delete', 'products'),
  api.products.deleteUnit,
);
router.get('/products/template', authenticate, authorize('products.view'), api.products.template);
router.get('/products/export', authenticate, authorize('products.view'), api.products.export);
router.post(
  '/products/import',
  authenticate,
  authorize('products.add'),
  upload.single('file'),
  api.products.importExcel,
);
router.post(
  '/products/return',
  authenticate,
  authorize('pos.add'),
  validateBody(productReturnSchema),
  api.products.returnStock,
);
router.get(
  '/products/returns/list',
  authenticate,
  authorize('products.view'),
  api.products.returns,
);
router.post(
  '/products/delete-all',
  authenticate,
  authorize('products.add'),
  requireConfirmation('CONFIRM_DELETE_ALL_PRODUCTS'),
  auditLog('products_delete_all', 'products'),
  api.products.deleteAll,
);
router.get(
  '/products',
  authenticate,
  authorize('pos.view'),
  validateQuery(commonQuerySchema),
  api.products.list,
);
router.get('/products/next-sku', authenticate, authorize('products.view'), api.products.nextSku);
router.post(
  '/products',
  authenticate,
  authorize('products.add'),
  validateBody(productCreateSchema),
  api.products.create,
);
// BUG-14 FIX: حذف DELETE /products المكررة — الحذف الكلي متاح عبر POST /products/delete-all
router.put(
  '/products/bulk-price',
  authenticate,
  authorize('products.edit'),
  validateBody(bulkPriceAdjustSchema),
  api.products.bulkPriceAdjust,
);
router.get('/products/:id', authenticate, authorize('pos.view'), api.products.get);
router.put(
  '/products/:id/warehouse',
  authenticate,
  authorize('products.edit'),
  validateBody(productWarehouseSchema),
  api.products.setWarehouse,
);
router.put(
  '/products/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(productUpdateSchema),
  api.products.update,
);
router.delete('/products/:id', authenticate, authorize('products.delete'), api.products.delete);

// ─── Inventory ────────────────────────────────────────────────────────────────
router.get('/inventory', authenticate, authorize('inventory.view'), api.inventory.list);
router.get(
  '/inventory/movements',
  authenticate,
  authorize('inventory.view'),
  api.inventory.movements,
);
router.get(
  '/inventory/return-template',
  authenticate,
  authorize('inventory.view'),
  api.inventory.returnTemplate,
);
router.post(
  '/inventory/return-validate',
  authenticate,
  authorize('inventory.add'),
  upload.single('file'),
  api.inventory.validateReturnExcel,
);
router.post(
  '/inventory/return-import',
  authenticate,
  authorize('inventory.add'),
  upload.single('file'),
  api.inventory.importReturnExcel,
);
router.get('/warehouses', authenticate, api.inventory.warehouses);
router.post(
  '/inventory/transfer',
  authenticate,
  authorize('inventory.add'),
  validateBody(inventoryTransferSchema),
  api.inventory.transfer,
);
router.post(
  '/inventory/adjust',
  authenticate,
  authorize('inventory.add'),
  validateBody(inventoryAdjustSchema),
  auditLog('inventory_adjust', 'inventory'),
  api.inventory.adjust,
);
router.delete(
  '/inventory',
  authenticate,
  authorize('inventory.delete'),
  requireConfirmation('CONFIRM_CLEAR_INVENTORY'),
  auditLog('inventory_clear_all', 'inventory'),
  api.inventory.clearAll,
);

// ─── Stocktake & Reconciliation ───────────────────────────────────────────────
router.get('/stocktakes', authenticate, authorize('inventory.view'), api.stocktake.list);
router.post(
  '/stocktakes',
  authenticate,
  authorize('inventory.add'),
  validateBody(stocktakeCreateSchema),
  auditLog('stocktake_create', 'inventory'),
  api.stocktake.create,
);
router.get('/stocktakes/:id', authenticate, authorize('inventory.view'), api.stocktake.get);
router.put(
  '/stocktakes/:id/items',
  authenticate,
  authorize('inventory.edit'),
  validateBody(stocktakeUpdateSchema),
  api.stocktake.updateItems,
);
router.post(
  '/stocktakes/:id/complete',
  authenticate,
  authorize('inventory.add'),
  auditLog('stocktake_complete', 'inventory'),
  api.stocktake.complete,
);
router.delete(
  '/stocktakes/:id',
  authenticate,
  authorize('inventory.delete'),
  auditLog('stocktake_delete', 'inventory'),
  api.stocktake.delete,
);

// ─── Purchases ────────────────────────────────────────────────────────────────
router.get(
  '/purchases',
  authenticate,
  authorize('products.view'),
  validateQuery(commonQuerySchema),
  api.purchases.list,
);
router.post(
  '/purchases',
  authenticate,
  authorize('products.add'),
  validateBody(purchaseInvoiceSchema),
  auditLog('purchase_create', 'purchases'),
  api.purchases.create,
);
router.put(
  '/purchases/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(purchaseInvoiceSchema),
  auditLog('purchase_update', 'purchases'),
  api.purchases.update,
);
router.delete('/purchases/:id', authenticate, authorize('products.delete'), api.purchases.delete);

// ─── Costs / Recipes ──────────────────────────────────────────────────────────
router.get('/costs/recipes', authenticate, authorize('products.view'), api.costs.listRecipes);
router.get('/costs/recipes/:id', authenticate, authorize('products.view'), api.costs.getRecipe);
router.post(
  '/costs/recipes',
  authenticate,
  authorize('products.add'),
  validateBody(recipeSchema),
  api.costs.createRecipe,
);
router.put(
  '/costs/recipes/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(recipeSchema),
  api.costs.updateRecipe,
);
router.delete(
  '/costs/recipes/:id',
  authenticate,
  authorize('products.delete'),
  api.costs.deleteRecipe,
);
router.post(
  '/costs/recipes/:id/produce',
  authenticate,
  authorize('products.add'),
  validateBody(recipeProductionSchema),
  api.costs.produceRecipe,
);
router.get(
  '/costs/productions',
  authenticate,
  authorize('products.view'),
  api.costs.listProductions,
);
router.post(
  '/costs/productions/:movementId/reverse',
  authenticate,
  authorize('products.add'),
  validateBody(reverseProductionSchema),
  api.costs.reverseProduction,
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

// ─── Suppliers ────────────────────────────────────────────────────────────────
router.get(
  '/suppliers',
  authenticate,
  authorize('suppliers.view'),
  validateQuery(commonQuerySchema),
  api.suppliers.list,
);
router.get('/suppliers/:id', authenticate, authorize('suppliers.view'), api.suppliers.get);
router.post(
  '/suppliers',
  authenticate,
  authorize('suppliers.add'),
  validateBody(supplierCreateSchema),
  api.suppliers.create,
);
router.put(
  '/suppliers/:id',
  authenticate,
  authorize('suppliers.edit'),
  validateBody(supplierUpdateSchema),
  api.suppliers.update,
);
router.delete('/suppliers/:id', authenticate, authorize('suppliers.delete'), api.suppliers.delete);
router.get(
  '/suppliers/:id/invoices',
  authenticate,
  authorize('suppliers.view'),
  api.suppliers.invoices,
);
router.get(
  '/suppliers/:id/payments',
  authenticate,
  authorize('suppliers.view'),
  api.suppliers.payments,
);
router.post(
  '/suppliers/:id/payments',
  authenticate,
  authorize('suppliers.add'),
  validateBody(paymentSchema),
  api.suppliers.recordPayment,
);

// ─── Invoices ─────────────────────────────────────────────────────────────────
router.get(
  '/invoices',
  authenticate,
  authorize('pos.view'),
  validateQuery(commonQuerySchema),
  api.invoices.list,
);
router.post(
  '/invoices',
  authenticate,
  authorize('invoices.add'),
  validateBody(invoiceSchema),
  api.invoices.create,
);
router.get('/invoices/:id/pdf', authenticate, authorize('pos.view'), api.invoices.pdf);
router.get('/invoices/:id', authenticate, authorize('pos.view'), api.invoices.get);
router.put(
  '/invoices/:id',
  authenticate,
  authorize('invoices.edit'),
  validateBody(invoiceSchema),
  api.invoices.update,
);
router.delete('/invoices/:id', authenticate, authorize('invoices.delete'), api.invoices.delete);

// ─── Quotes ───────────────────────────────────────────────────────────────────
router.get('/quotes/template', authenticate, authorize('pos.view'), api.quotes.template);
router.put(
  '/quotes/template',
  authenticate,
  authorize('pos.edit'),
  validateBody(quoteTemplateSchema),
  api.quotes.template,
);
router.post(
  '/quotes/pdf',
  authenticate,
  authorize('pos.add'),
  validateBody(quotePdfSchema),
  api.quotes.pdf,
);

// ─── Users & Settings ─────────────────────────────────────────────────────────
router.get('/users', authenticate, authorize('users.view'), api.users.list);
router.post(
  '/users',
  authenticate,
  authorize('users.add'),
  validateBody(userCreateSchema),
  auditLog('user_create', 'users'),
  api.users.create,
);
router.put(
  '/users/:id',
  authenticate,
  authorize('users.edit'),
  validateBody(userUpdateSchema),
  auditLog('user_update', 'users'),
  api.users.update,
);
router.delete(
  '/users/:id',
  authenticate,
  authorize('users.delete'),
  auditLog('user_delete', 'users'),
  api.users.delete,
);
router.get('/roles', authenticate, authorize('users.view'), api.users.roles);
router.post(
  '/roles',
  authenticate,
  authorize('users.add'),
  validateBody(createRoleSchema),
  auditLog('role_create', 'users'),
  api.users.createRole,
);
router.put(
  '/roles/:id',
  authenticate,
  authorize('users.edit'),
  validateBody(updateRoleSchema),
  auditLog('role_update', 'users'),
  api.users.updateRole,
);
router.delete(
  '/roles/:id',
  authenticate,
  authorize('users.delete'),
  auditLog('role_delete', 'users'),
  api.users.deleteRole,
);
router.get('/permissions', authenticate, authorize('users.view'), api.users.listPermissions);
router.get(
  '/roles/:id/permissions',
  authenticate,
  authorize('users.view'),
  api.users.getRolePermissions,
);
router.post(
  '/roles/:id/permissions',
  authenticate,
  authorize('users.add'),
  validateBody(updateRolePermissionsSchema),
  auditLog('role_permissions_update', 'users'),
  api.users.updateRolePermissions,
);
router.get('/notifications', authenticate, api.users.notifications);
router.get('/settings', authenticate, authorize('settings.view'), api.users.settings);
router.put(
  '/settings/:key',
  authenticate,
  authorize('settings.edit'),
  validateBody(settingUpdateSchema),
  api.users.updateSetting,
);

// ─── Reports & AI Forecasting ─────────────────────────────────────────────────
router.get(
  '/forecasting',
  authenticate,
  authorize('reports.view'),
  api.forecasting.getDemandForecast,
);
router.get(
  '/forecasting/basket-associations',
  authenticate,
  authorize('pos.view'),
  api.forecasting.getBasketAssociations,
);
router.post(
  '/forecasting/copilot',
  authenticate,
  authorize('dashboard.add'),
  validateBody(copilotSchema),
  api.forecasting.askCopilot,
);
router.get(
  '/forecasting/staffing',
  authenticate,
  authorize('reports.view'),
  api.forecasting.getStaffingForecast,
);
router.get(
  '/forecasting/pricing-alerts',
  authenticate,
  authorize('products.view'),
  api.forecasting.getSmartPricingAlerts,
);
router.get(
  '/forecasting/cashflow-projection',
  authenticate,
  authorize('reports.view'),
  api.forecasting.getCashFlowProjection,
);
router.get(
  '/expenses/suggest-category',
  authenticate,
  authorize('expenses.view'),
  api.forecasting.suggestExpenseCategory,
);
// P&L — يجب أن تكون قبل /:type عشان Express ما يأخذش pl كـ type
router.get('/reports/pl/monthly', authenticate, authorize('reports.view'), api.pl.report);
router.get('/reports/pl/trend', authenticate, authorize('reports.view'), api.pl.trend);
router.get('/reports/:type', authenticate, authorize('reports.view'), api.users.reports);

// ─── Backup / Restore — admin only ───────────────────────────────────────────
// إصلاح: كانت متاحة لأي settings.manage بدون تمييز
router.get(
  '/backup/create',
  authenticate,
  authorize('settings.view'),
  requireAdmin,
  auditLog('backup_create', 'backup'),
  api.backup.create,
);
router.get('/backup/list', authenticate, authorize('settings.view'), requireAdmin, api.backup.list);
router.get(
  '/backup/download/:name',
  authenticate,
  authorize('settings.view'),
  requireAdmin,
  api.backup.download,
);
// BUG-16 FIX: تسجيل audit log لعمليات الاستعادة والحذف الكلي (الأكثر خطورة)
router.post(
  '/backup/restore',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  requireConfirmation('CONFIRM_RESTORE_BACKUP'),
  auditLog('backup_restore', 'backup'),
  api.backup.restore,
);
router.post(
  '/backup/restore-file',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  upload.single('file'),
  requireConfirmation('CONFIRM_RESTORE_BACKUP'),
  auditLog('backup_restore_file', 'backup'),
  api.backup.restoreFile,
);
router.post(
  '/backup/clear',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  requireConfirmation('CONFIRM_CLEAR'),
  auditLog('data_clear', 'backup'),
  api.backup.clear,
);
router.post(
  '/backup/cloud-test',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  api.backup.cloudTest,
);
router.get(
  '/backup/logs',
  authenticate,
  authorize('settings.view'),
  requireAdmin,
  api.backup.getLogs,
);

router.get('/admin/health', authenticate, requireAdmin, api.adminDashboard.health);
router.get('/admin/sessions', authenticate, requireAdmin, api.adminDashboard.sessions);
router.delete(
  '/admin/sessions/:id',
  authenticate,
  requireAdmin,
  auditLog('session_revoke', 'admin'),
  api.adminDashboard.revokeSession,
);
router.delete(
  '/admin/sessions/user/:userId',
  authenticate,
  requireAdmin,
  auditLog('all_sessions_revoke', 'admin'),
  api.adminDashboard.revokeAllSessions,
);
router.get('/admin/failed-logins', authenticate, requireAdmin, api.adminDashboard.failedLogins);
router.get('/admin/activity', authenticate, requireAdmin, api.adminDashboard.recentActivity);
router.get('/admin/counts', authenticate, requireAdmin, api.adminDashboard.counts);
router.get(
  '/admin/backup',
  authenticate,
  requireAdmin,
  auditLog('admin_backup', 'admin'),
  api.adminDashboard.backup,
);
router.post(
  '/admin/repair-sequences',
  authenticate,
  requireAdmin,
  auditLog('admin_repair_sequences', 'admin'),
  api.adminDashboard.repairSequences,
);
router.get('/admin/risk-radar', authenticate, requireAdmin, api.adminDashboard.riskRadar);
router.post(
  '/admin/purge-logs',
  authenticate,
  requireAdmin,
  auditLog('admin_purge_logs', 'admin'),
  api.adminDashboard.purgeLogs,
);
router.post(
  '/admin/broadcast',
  authenticate,
  requireAdmin,
  auditLog('admin_broadcast', 'admin'),
  api.adminDashboard.setBroadcast,
);
router.get('/admin/broadcast', authenticate, api.adminDashboard.getBroadcast);

/**
 * موجّه API الرئيسي — يُسجَّل في التطبيق ويجمع كل مسارات النظام (المصادقة، المبيعات، المخزون، الموارد البشرية...).
 */
export default router;
