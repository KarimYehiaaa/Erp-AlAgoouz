import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize, auditLog } from '../middleware/auth.js';
import { requireConfirmation } from '../middleware/confirmAction.js';
import * as authCtrl from '../controllers/authController.js';
import * as api from '../controllers/apiController.js';
import * as backupService from '../services/backupService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const salesAuth = authorize('sales.branch', 'sales.wholesale', 'sales.pos');

// BUG-13 FIX: تقليل الحد من 150 محاولة/5د إلى 10 محاولات/15د — حماية من Brute-Force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 دقيقة
  max: 10,                    // 10 محاولات فقط
  message: { success: false, message: 'تم تجاوز محاولات الدخول. حاول مرة أخرى بعد 15 دقيقة.' },
  skipSuccessfulRequests: true,
});

// Middleware للتأكد أن المستخدم admin (role_name = 'admin')
const requireAdmin = (req, res, next) => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ success: false, message: 'هذه العملية متاحة للمدير فقط' });
  }
  next();
};

// Auth
router.post('/auth/login', loginLimiter, authCtrl.login);
router.get('/auth/profile', authenticate, authCtrl.profile);

// Dashboard
router.get('/dashboard', authenticate, authorize('dashboard.view'), api.dashboard);

// Branch Sales Excel
router.get('/sales/branch/template', authenticate, authorize('sales.branch'), api.sales.branchTemplate);
router.post('/sales/branch/validate', authenticate, authorize('sales.branch'), upload.single('file'), api.sales.branchValidateExcel);
router.post('/sales/branch/import', authenticate, authorize('sales.branch'), upload.single('file'), api.sales.branchImportExcel);

// Sales — مبيعات يومية (فرع / جملة)
router.get('/sales/summary', authenticate, salesAuth, api.sales.summary);
router.get('/sales/opening-balance', authenticate, salesAuth, api.sales.openingBalance);
router.put('/sales/opening-balance', authenticate, salesAuth, api.sales.saveOpeningBalance);
router.get('/sales/template', authenticate, salesAuth, api.sales.template);
router.post('/sales/import/validate', authenticate, salesAuth, upload.single('file'), api.sales.validateExcel);
router.post('/sales/import', authenticate, salesAuth, upload.single('file'), api.sales.importExcel);
router.get('/sales', authenticate, salesAuth, api.sales.list);
router.get('/sales/:id', authenticate, salesAuth, api.sales.get);
router.post('/sales', authenticate, salesAuth, api.sales.create);
router.put('/sales/:id', authenticate, salesAuth, api.sales.update);
router.post('/sales/:id/return', authenticate, authorize('sales.return'), api.sales.return);
router.delete('/sales', authenticate, salesAuth, requireConfirmation('CONFIRM_DELETE_ALL_SALES'), auditLog('sales_delete_all', 'sales'), api.sales.deleteAll);
router.delete('/sales/date/:saleDate', authenticate, salesAuth, requireConfirmation('CONFIRM_DELETE_SALES_DATE'), auditLog('sales_delete_date', 'sales'), api.sales.deleteByDate);
router.delete('/sales/type/:saleType', authenticate, authorize('settings.manage'), requireConfirmation('CONFIRM_DELETE_SALES_TYPE'), auditLog('sales_delete_type', 'sales'), api.sales.deleteByType);

// Products
router.get('/products/branch', authenticate, authorize('products.manage', 'sales.branch'), api.products.branchProducts);
router.get('/products/costs-report', authenticate, authorize('products.manage', 'reports.view'), api.products.costsReport);
router.get('/products/categories', authenticate, api.products.categories);
router.post('/products/categories', authenticate, authorize('products.manage'), api.products.createCategory);
router.put('/products/categories/:id', authenticate, authorize('products.manage'), api.products.updateCategory);
router.delete('/products/categories/:id', authenticate, authorize('products.manage'), api.products.deleteCategory);
router.get('/products/units', authenticate, api.products.units);
router.post('/products/units', authenticate, authorize('products.manage'), api.products.createUnit);
router.put('/products/units/:id', authenticate, authorize('products.manage'), api.products.updateUnit);
router.delete('/products/units/:id', authenticate, authorize('products.manage'), api.products.deleteUnit);
router.get('/products/template', authenticate, authorize('products.manage'), api.products.template);
router.get('/products/export', authenticate, authorize('products.manage'), api.products.export);
router.post('/products/import', authenticate, authorize('products.manage'), upload.single('file'), api.products.importExcel);
router.post('/products/return', authenticate, authorize('products.manage', 'sales.return'), api.products.returnStock);
router.get('/products/returns/list', authenticate, authorize('products.manage'), api.products.returns);
router.post('/products/delete-all', authenticate, authorize('products.manage'), requireConfirmation('CONFIRM_DELETE_ALL_PRODUCTS'), auditLog('products_delete_all', 'products'), api.products.deleteAll);
router.get('/products', authenticate, authorize('products.manage', 'sales.branch'), api.products.list);
router.get('/products/next-sku', authenticate, authorize('products.manage'), api.products.nextSku);
router.post('/products', authenticate, authorize('products.manage'), api.products.create);
// BUG-14 FIX: حذف DELETE /products المكررة — الحذف الكلي متاح عبر POST /products/delete-all
router.get('/products/:id', authenticate, api.products.get);
router.put('/products/:id/warehouse', authenticate, authorize('products.manage'), api.products.setWarehouse);
router.put('/products/:id', authenticate, authorize('products.manage'), api.products.update);
router.delete('/products/:id', authenticate, authorize('products.manage'), api.products.delete);


// Inventory
router.get('/inventory', authenticate, authorize('inventory.manage'), api.inventory.list);
router.get('/inventory/movements', authenticate, authorize('inventory.manage'), api.inventory.movements);
router.get('/inventory/return-template', authenticate, authorize('inventory.manage'), api.inventory.returnTemplate);
router.post('/inventory/return-validate', authenticate, authorize('inventory.manage'), upload.single('file'), api.inventory.validateReturnExcel);
router.post('/inventory/return-import', authenticate, authorize('inventory.manage'), upload.single('file'), api.inventory.importReturnExcel);
router.get('/warehouses', authenticate, api.inventory.warehouses);
router.post('/inventory/transfer', authenticate, authorize('inventory.manage'), api.inventory.transfer);
router.post('/inventory/adjust', authenticate, authorize('inventory.manage'), api.inventory.adjust);
router.delete('/inventory', authenticate, authorize('inventory.manage'), requireConfirmation('CONFIRM_CLEAR_INVENTORY'), auditLog('inventory_clear_all', 'inventory'), api.inventory.clearAll);

/**
 * Purchases
 * - create
 * - list
 * - delete invoice (soft delete + reverse inventory movement)
 */
router.get('/purchases', authenticate, authorize('inventory.manage', 'products.manage'), api.purchases.list);
router.post('/purchases', authenticate, authorize('inventory.manage', 'products.manage'), api.purchases.create);
router.put('/purchases/:id', authenticate, authorize('inventory.manage', 'products.manage'), api.purchases.update);
router.delete('/purchases/:id', authenticate, authorize('inventory.manage', 'products.manage'), api.purchases.delete);

// Costs / Recipes
router.get('/costs/recipes', authenticate, authorize('products.manage'), api.costs.listRecipes);
router.get('/costs/recipes/:id', authenticate, authorize('products.manage'), api.costs.getRecipe);
router.post('/costs/recipes', authenticate, authorize('products.manage'), api.costs.createRecipe);
router.put('/costs/recipes/:id', authenticate, authorize('products.manage'), api.costs.updateRecipe);
router.delete('/costs/recipes/:id', authenticate, authorize('products.manage'), api.costs.deleteRecipe);
router.post('/costs/recipes/:id/produce', authenticate, authorize('products.manage'), api.costs.produceRecipe);
// عمليات الإنتاج
router.get('/costs/productions', authenticate, authorize('products.manage'), api.costs.listProductions);
router.post('/costs/productions/:movementId/reverse', authenticate, authorize('products.manage'), api.costs.reverseProduction);

// Customers
router.get('/customers', authenticate, authorize('customers.manage', 'sales.branch', 'sales.wholesale'), api.customers.list);
router.get('/customers/:id', authenticate, authorize('customers.manage'), api.customers.get);
router.get('/customers/:id/statement', authenticate, authorize('customers.manage'), api.customers.statement);
router.post('/customers/:id/payment', authenticate, authorize('customers.manage'), api.customers.recordPayment);
router.post('/customers/sales/:saleId/payment', authenticate, authorize('customers.manage'), api.customers.recordSalePayment);
router.post('/customers', authenticate, authorize('customers.manage'), api.customers.create);
router.put('/customers/:id', authenticate, authorize('customers.manage'), api.customers.update);
router.delete('/customers/:id', authenticate, authorize('customers.manage'), api.customers.delete);

// Expenses
router.get('/expenses', authenticate, authorize('expenses.manage'), api.expenses.list);
router.get('/expenses/categories', authenticate, authorize('expenses.manage'), api.expenses.categories);
router.get('/expenses/report', authenticate, authorize('expenses.manage', 'reports.view'), api.expenses.report);
router.post('/expenses', authenticate, authorize('expenses.manage'), api.expenses.create);
router.put('/expenses/:id', authenticate, authorize('expenses.manage'), api.expenses.update);
router.delete('/expenses/:id', authenticate, authorize('expenses.manage'), api.expenses.delete);

// Suppliers
router.get('/suppliers', authenticate, authorize('suppliers.manage'), api.suppliers.list);
router.get('/suppliers/:id', authenticate, authorize('suppliers.manage'), api.suppliers.get);
router.post('/suppliers', authenticate, authorize('suppliers.manage'), api.suppliers.create);
router.put('/suppliers/:id', authenticate, authorize('suppliers.manage'), api.suppliers.update);
router.delete('/suppliers/:id', authenticate, authorize('suppliers.manage'), api.suppliers.delete);
router.post('/suppliers/:id/delete', authenticate, authorize('suppliers.manage'), api.suppliers.delete);
router.get('/suppliers/:id/invoices', authenticate, authorize('suppliers.manage'), api.suppliers.invoices);

// Invoices
router.get('/invoices', authenticate, authorize('invoices.manage', 'sales.branch'), api.invoices.list);
router.post('/invoices', authenticate, authorize('invoices.manage'), api.invoices.create);
router.get('/invoices/:id/pdf', authenticate, authorize('invoices.manage', 'sales.branch'), api.invoices.pdf);
router.get('/invoices/:id', authenticate, authorize('invoices.manage', 'sales.branch'), api.invoices.get);
router.put('/invoices/:id', authenticate, authorize('invoices.manage'), api.invoices.update);
router.delete('/invoices/:id', authenticate, authorize('invoices.manage'), api.invoices.delete);

// Quotes
router.get('/quotes/template', authenticate, authorize('invoices.manage', 'sales.branch'), api.quotes.template);
router.put('/quotes/template', authenticate, authorize('invoices.manage', 'sales.branch'), api.quotes.template);
router.post('/quotes/pdf', authenticate, authorize('invoices.manage', 'sales.branch'), api.quotes.pdf);

// Users & Settings
router.get('/users', authenticate, authorize('users.manage'), api.users.list);
router.post('/users', authenticate, authorize('users.manage'), api.users.create);
router.put('/users/:id', authenticate, authorize('users.manage'), api.users.update);
router.get('/roles', authenticate, authorize('users.manage'), api.users.roles);
router.get('/notifications', authenticate, api.users.notifications);
router.get('/settings', authenticate, api.users.settings);
router.put('/settings/:key', authenticate, authorize('settings.manage'), api.users.updateSetting);

// Reports
// P&L — يجب أن تكون قبل /:type عشان Express ما يأخذش pl كـ type
router.get('/reports/pl/monthly', authenticate, authorize('reports.view'), api.pl.report);
router.get('/reports/pl/trend',   authenticate, authorize('reports.view'), api.pl.trend);
router.get('/reports/:type',      authenticate, authorize('reports.view'), api.users.reports);

// Backup / Restore — admin only (إصلاح: كانت متاحة لأي settings.manage بدون تمييز)
router.get('/backup/create',       authenticate, authorize('settings.manage'), requireAdmin, auditLog('backup_create',  'backup'), api.backup.create);
router.get('/backup/list',         authenticate, authorize('settings.manage'), requireAdmin, api.backup.list);
router.get('/backup/download/:name', authenticate, authorize('settings.manage'), requireAdmin, api.backup.download);
// BUG-16 FIX: تسجيل audit log لعمليات الاستعادة والحذف الكلي (الأكثر خطورة)
router.post('/backup/restore',     authenticate, authorize('settings.manage'), requireAdmin, requireConfirmation('CONFIRM_RESTORE_BACKUP'), auditLog('backup_restore', 'backup'), api.backup.restore);
router.post('/backup/restore-file',authenticate, authorize('settings.manage'), requireAdmin, upload.single('file'), requireConfirmation('CONFIRM_RESTORE_BACKUP'), auditLog('backup_restore_file', 'backup'), api.backup.restoreFile);
router.post('/backup/clear',       authenticate, authorize('settings.manage'), requireAdmin, auditLog('data_clear',    'backup'), api.backup.clear);

// BUG-15 FIX: حذف debug backup route المكررة — يكفي المسار الرسمي /backup/create

export default router;
