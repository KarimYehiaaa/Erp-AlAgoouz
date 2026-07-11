import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, authorize, auditLog } from '../middleware/auth.js';
import { requireConfirmation } from '../middleware/confirmAction.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import * as authCtrl from '../controllers/authController.js';
import * as api from '../controllers/apiController.js';
import * as backupService from '../services/backupService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const salesAuth = authorize('sales.branch', 'sales.wholesale', 'sales.pos', 'reports.view');

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

const copilotSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'model', 'assistant']).optional(),
    content: z.string().max(8000).optional(),
    text: z.string().max(8000).optional(),
  })).max(20).optional().default([]),
});

const positiveId = z.coerce.number().int().positive();
const nonNegativeNumber = z.coerce.number().min(0);
const positiveNumber = z.coerce.number().positive();
const optionalPositiveId = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  positiveId.optional()
);
const optionalNonNegativeNumber = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  nonNegativeNumber.optional()
);
const nullableText = (max = 1000) => z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().max(max).nullable().optional()
);
const optionalDateText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
);
const optionalDateTimeText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().max(40).optional()
);
const optionalBool = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean().optional()
);
const shortText = (max = 255) => z.string().trim().min(1).max(max);

const commonQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  page: z.coerce.number().int().min(1).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
}).passthrough();

const productCreateSchema = z.object({
  sku: nullableText(100),
  barcode: nullableText(100),
  name_ar: z.string().trim().min(1).max(255),
  description: nullableText(2000),
  category_id: optionalPositiveId,
  unit: z.string().trim().min(1).max(50).optional(),
  purchase_price: nonNegativeNumber.optional(),
  sale_price: nonNegativeNumber,
  wholesale_price: optionalNonNegativeNumber,
  min_stock: optionalNonNegativeNumber,
  image_url: nullableText(1000),
  is_active: z.boolean().optional(),
  track_expiry: z.boolean().optional(),
  primary_warehouse_id: optionalPositiveId,
  initial_stock: z.record(z.string(), nonNegativeNumber).optional(),
}).passthrough();

const productUpdateSchema = productCreateSchema.partial().passthrough();

const categoryCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(255),
  slug: nullableText(255),
  parent_id: optionalPositiveId,
  sort_order: z.coerce.number().int().min(0).optional(),
}).passthrough();

const categoryUpdateSchema = categoryCreateSchema.partial().passthrough();

const unitCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(100),
  sort_order: z.coerce.number().int().min(0).optional(),
}).passthrough();

const unitUpdateSchema = unitCreateSchema.partial().passthrough();

const inventoryTransferSchema = z.object({
  product_id: positiveId,
  from_warehouse_id: positiveId,
  to_warehouse_id: positiveId,
  to_product_id: optionalPositiveId,
  quantity: positiveNumber,
  notes: z.string().max(1000).optional().nullable(),
}).passthrough();

const inventoryAdjustSchema = z.object({
  product_id: positiveId,
  warehouse_id: positiveId,
  quantity: nonNegativeNumber,
  min_stock: optionalNonNegativeNumber,
  movement_type: z.literal('adjustment').optional(),
  notes: z.string().max(1000).optional().nullable(),
}).passthrough();

const productReturnSchema = z.object({
  product_id: positiveId,
  warehouse_id: positiveId,
  quantity: positiveNumber,
  sale_id: optionalPositiveId,
  notes: z.string().max(1000).optional().nullable(),
}).passthrough();

const bulkPriceAdjustSchema = z.object({
  category_id: optionalPositiveId,
  type: z.enum(['sale', 'purchase']),
  adjust_type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().finite(),
}).passthrough();

const purchaseItemSchema = z.object({
  product_id: positiveId,
  unit: z.string().trim().min(1).max(50).optional(),
  quantity: positiveNumber,
  unit_price: nonNegativeNumber,
}).passthrough();

const purchaseInvoiceSchema = z.object({
  invoice_date: optionalDateText,
  supplier_id: optionalPositiveId,
  notes: nullableText(2000),
  items: z.array(purchaseItemSchema).min(1).max(500),
}).passthrough();

const paymentSchema = z.object({
  amount: positiveNumber,
  payment_method: shortText(50).optional(),
  notes: nullableText(1000),
}).passthrough();

const customerCreateSchema = z.object({
  code: nullableText(50),
  name_ar: shortText(255),
  phone: nullableText(50),
  email: nullableText(255),
  address: nullableText(1000),
  customer_type: z.enum(['retail', 'wholesale']).optional(),
  credit_limit: optionalNonNegativeNumber,
  notes: nullableText(2000),
}).passthrough();

const customerUpdateSchema = customerCreateSchema.partial().extend({
  loyalty_points: optionalNonNegativeNumber,
  is_active: optionalBool,
}).passthrough();

const supplierCreateSchema = z.object({
  code: nullableText(50),
  name_ar: shortText(255),
  phone: nullableText(50),
  email: nullableText(255),
  address: nullableText(1000),
  notes: nullableText(2000),
}).passthrough();

const supplierUpdateSchema = supplierCreateSchema.partial().passthrough();

const expenseSchema = z.object({
  category_id: positiveId,
  title: shortText(255),
  amount: positiveNumber,
  expense_date: optionalDateText,
  payment_method: shortText(50).optional(),
  recurring: optionalBool,
  notes: nullableText(2000),
}).passthrough();

const expenseUpdateSchema = expenseSchema.partial().passthrough();

const invoiceItemSchema = z.object({
  product_id: optionalPositiveId,
  product_name: nullableText(255),
  description: nullableText(1000),
  quantity: positiveNumber,
  unit_price: nonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
}).passthrough();

const invoiceSchema = z.object({
  customer_id: optionalPositiveId,
  issued_at: optionalDateTimeText,
  due_date: optionalDateText,
  discount_percent: optionalNonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
  tax_percent: optionalNonNegativeNumber,
  tax_enabled: optionalBool,
  payment_status: z.enum(['paid', 'partial', 'unpaid']).optional(),
  notes: nullableText(2000),
  items: z.array(invoiceItemSchema).min(1).max(500),
}).passthrough();

const userCreateSchema = z.object({
  username: shortText(100),
  email: nullableText(255),
  password: z.string().min(8).max(200),
  full_name: shortText(255),
  phone: nullableText(50),
  role_id: positiveId,
}).passthrough();

const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().min(8).max(200).optional(),
  is_active: optionalBool,
}).passthrough();

const settingUpdateSchema = z.object({
  value: z.unknown(),
}).passthrough();

const shiftSchema = z.object({
  name_ar: shortText(255),
  start_time: shortText(20).optional(),
  end_time: shortText(20).optional(),
  required_hours: positiveNumber.optional(),
  grace_minutes: z.coerce.number().int().min(0).optional(),
  overtime_enabled: optionalBool,
  is_active: optionalBool,
}).passthrough();

const employeeSchema = z.object({
  code: nullableText(50),
  full_name: shortText(255),
  job_title: nullableText(255),
  phone: nullableText(50),
  salary_type: z.enum(['monthly', 'daily', 'hourly']).optional(),
  base_salary: optionalNonNegativeNumber,
  hourly_rate: optionalNonNegativeNumber,
  overtime_rate: optionalNonNegativeNumber,
  daily_required_hours: positiveNumber.optional(),
  work_days_per_month: z.coerce.number().int().min(1).max(31).optional(),
  absence_deduction_type: z.enum(['daily', 'hourly']).optional(),
  shift_id: optionalPositiveId,
  start_date: optionalDateText,
  notes: nullableText(2000),
  is_active: optionalBool,
}).passthrough();

const employeeUpdateSchema = employeeSchema.partial().passthrough();

const attendanceSchema = z.object({
  employee_id: positiveId,
  work_date: optionalDateText,
  from_date: optionalDateText,
  to_date: optionalDateText,
  check_in: optionalDateTimeText,
  check_out: optionalDateTimeText,
  status: z.enum(['present', 'absent', 'paid_leave', 'unpaid_leave', 'weekly_off', 'half_day']).optional(),
  notes: nullableText(2000),
}).passthrough();

const advanceSchema = z.object({
  employee_id: positiveId,
  advance_date: optionalDateText,
  amount: positiveNumber,
  installment_amount: optionalNonNegativeNumber,
  installments_count: z.coerce.number().int().min(1).max(120).optional(),
  payment_method: shortText(50).optional(),
  notes: nullableText(2000),
}).passthrough();

const payrollSchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}$/),
}).passthrough();

const payrollPaySchema = z.object({
  payment_method: shortText(50).optional(),
}).passthrough();

const openingBalanceSchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: nonNegativeNumber,
}).passthrough();

const saleItemSchema = z.object({
  product_id: positiveId,
  quantity: positiveNumber,
  unit_price: nonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
}).passthrough();

const saleSchema = z.object({
  sale_type: z.enum(['branch', 'wholesale', 'pos']),
  sale_date: optionalDateText,
  customer_id: optionalPositiveId,
  customer_code: nullableText(100),
  warehouse_id: optionalPositiveId,
  total_amount: optionalNonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
  profit_amount: optionalNonNegativeNumber,
  payment_method: shortText(50).optional(),
  payment_status: z.enum(['paid', 'partial', 'unpaid']).optional(),
  paid_amount: optionalNonNegativeNumber,
  notes: nullableText(2000),
  items: z.array(saleItemSchema).max(500).optional(),
}).passthrough();

const saleReturnSchema = z.object({
  notes: nullableText(2000),
}).passthrough();

const productWarehouseSchema = z.object({
  warehouse_id: positiveId,
}).passthrough();

const stocktakeCreateSchema = z.object({
  warehouse_id: positiveId,
  notes: nullableText(2000),
}).passthrough();

const stocktakeItemSchema = z.object({
  product_id: positiveId,
  actual_quantity: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.coerce.number().min(0).nullable()
  ),
}).passthrough();

const stocktakeUpdateSchema = z.object({
  notes: nullableText(2000),
  items: z.array(stocktakeItemSchema).max(1000).optional().default([]),
}).passthrough();

const recipeItemSchema = z.object({
  ingredient_product_id: positiveId,
  quantity: positiveNumber,
  unit_code: shortText(50),
  notes: nullableText(1000),
}).passthrough();

const recipeSchema = z.object({
  product_id: positiveId,
  name_ar: nullableText(255),
  is_active: optionalBool,
  notes: nullableText(2000),
  items: z.array(recipeItemSchema).min(1).max(500),
}).passthrough();

const recipeProductionSchema = z.object({
  quantity: positiveNumber,
  warehouse_id: positiveId,
  mode: z.enum(['production', 'manual']).optional(),
  notes: nullableText(2000),
}).passthrough();

const reverseProductionSchema = z.object({
  reverse_qty: optionalNonNegativeNumber,
}).passthrough();

const quoteItemSchema = z.object({
  name: nullableText(255),
  product_name: nullableText(255),
  description: nullableText(1000),
  unit: nullableText(50),
  price: optionalNonNegativeNumber,
  unit_price: optionalNonNegativeNumber,
}).passthrough();

const quoteTemplateSchema = z.object({
  items: z.array(quoteItemSchema).max(200).optional().default([]),
}).passthrough();

const quotePdfSchema = z.object({
  customer_name: shortText(255),
  notes: nullableText(2000),
  items: z.array(quoteItemSchema.extend({
    product_name: shortText(255).optional(),
    description: shortText(1000).optional(),
    unit_price: nonNegativeNumber,
  })).min(1).max(200),
}).passthrough();

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
router.post('/auth/login', loginLimiter, validateBody(loginSchema), authCtrl.login);
router.get('/auth/profile', authenticate, authCtrl.profile);

// Dashboard
router.get('/dashboard', authenticate, authorize('dashboard.view'), api.dashboard);
router.get('/operations/alerts', authenticate, authorize('dashboard.view'), api.operations.alerts);
router.get('/operations/audit-logs', authenticate, authorize('users.manage', 'reports.view'), api.operations.auditLogs);

// HR / Payroll
router.get('/hr/summary', authenticate, authorize('hr.manage'), api.hr.summary);
router.get('/hr/shifts', authenticate, authorize('hr.manage'), api.hr.shifts);
router.post('/hr/shifts', authenticate, authorize('hr.manage'), validateBody(shiftSchema), api.hr.createShift);
router.get('/hr/employees', authenticate, authorize('hr.manage'), api.hr.employees);
router.post('/hr/employees', authenticate, authorize('hr.manage'), validateBody(employeeSchema), api.hr.createEmployee);
router.put('/hr/employees/:id', authenticate, authorize('hr.manage'), validateBody(employeeUpdateSchema), api.hr.updateEmployee);
router.delete('/hr/employees/:id', authenticate, authorize('hr.manage'), api.hr.deleteEmployee);
router.get('/hr/attendance', authenticate, authorize('hr.manage'), api.hr.attendance);
router.post('/hr/attendance', authenticate, authorize('hr.manage'), validateBody(attendanceSchema), api.hr.saveAttendance);
router.get('/hr/advances', authenticate, authorize('hr.manage'), api.hr.advances);
router.post('/hr/advances', authenticate, authorize('hr.manage'), validateBody(advanceSchema), api.hr.createAdvance);
router.get('/hr/payroll/preview', authenticate, authorize('hr.manage'), api.hr.previewPayroll);
router.get('/hr/payroll', authenticate, authorize('hr.manage'), api.hr.payrollRuns);
router.post('/hr/payroll', authenticate, authorize('hr.manage'), validateBody(payrollSchema), api.hr.createPayroll);
router.get('/hr/payroll/:id', authenticate, authorize('hr.manage'), api.hr.getPayroll);
router.post('/hr/payroll/:id/pay', authenticate, authorize('hr.manage'), validateBody(payrollPaySchema), api.hr.payPayroll);

// Branch Sales Excel
router.get('/sales/branch/template', authenticate, authorize('sales.branch'), api.sales.branchTemplate);
router.post('/sales/branch/validate', authenticate, authorize('sales.branch'), upload.single('file'), api.sales.branchValidateExcel);
router.post('/sales/branch/import', authenticate, authorize('sales.branch'), upload.single('file'), api.sales.branchImportExcel);

// Sales — مبيعات يومية (فرع / جملة)
router.get('/sales/summary', authenticate, salesAuth, validateQuery(commonQuerySchema), api.sales.summary);
router.get('/sales/opening-balance', authenticate, salesAuth, api.sales.openingBalance);
router.put('/sales/opening-balance', authenticate, salesAuth, validateBody(openingBalanceSchema), api.sales.saveOpeningBalance);
router.get('/sales/template', authenticate, salesAuth, api.sales.template);
router.post('/sales/import/validate', authenticate, salesAuth, upload.single('file'), api.sales.validateExcel);
router.post('/sales/import', authenticate, salesAuth, upload.single('file'), api.sales.importExcel);
router.get('/sales', authenticate, salesAuth, validateQuery(commonQuerySchema), api.sales.list);
router.get('/sales/:id', authenticate, salesAuth, api.sales.get);
router.post('/sales', authenticate, salesAuth, validateBody(saleSchema), auditLog('sale_create', 'sales'), api.sales.create);
router.put('/sales/:id', authenticate, salesAuth, validateBody(saleSchema), auditLog('sale_update', 'sales'), api.sales.update);
router.post('/sales/:id/return', authenticate, authorize('sales.return'), validateBody(saleReturnSchema), api.sales.return);
router.delete('/sales', authenticate, salesAuth, requireConfirmation('CONFIRM_DELETE_ALL_SALES'), auditLog('sales_delete_all', 'sales'), api.sales.deleteAll);
router.delete('/sales/date/:saleDate', authenticate, salesAuth, requireConfirmation('CONFIRM_DELETE_SALES_DATE'), auditLog('sales_delete_date', 'sales'), api.sales.deleteByDate);
router.delete('/sales/type/:saleType', authenticate, authorize('settings.manage'), requireConfirmation('CONFIRM_DELETE_SALES_TYPE'), auditLog('sales_delete_type', 'sales'), api.sales.deleteByType);

// Products
router.get('/products/branch', authenticate, authorize('products.manage', 'sales.branch'), api.products.branchProducts);
router.get('/products/costs-report', authenticate, authorize('products.manage', 'reports.view'), api.products.costsReport);
router.get('/products/categories', authenticate, api.products.categories);
router.post('/products/categories', authenticate, authorize('products.manage'), validateBody(categoryCreateSchema), auditLog('category_create', 'products'), api.products.createCategory);
router.put('/products/categories/:id', authenticate, authorize('products.manage'), validateBody(categoryUpdateSchema), auditLog('category_update', 'products'), api.products.updateCategory);
router.delete('/products/categories/:id', authenticate, authorize('products.manage'), auditLog('category_delete', 'products'), api.products.deleteCategory);
router.get('/products/units', authenticate, api.products.units);
router.post('/products/units', authenticate, authorize('products.manage'), validateBody(unitCreateSchema), auditLog('unit_create', 'products'), api.products.createUnit);
router.put('/products/units/:id', authenticate, authorize('products.manage'), validateBody(unitUpdateSchema), auditLog('unit_update', 'products'), api.products.updateUnit);
router.delete('/products/units/:id', authenticate, authorize('products.manage'), auditLog('unit_delete', 'products'), api.products.deleteUnit);
router.get('/products/template', authenticate, authorize('products.manage'), api.products.template);
router.get('/products/export', authenticate, authorize('products.manage'), api.products.export);
router.post('/products/import', authenticate, authorize('products.manage'), upload.single('file'), api.products.importExcel);
router.post('/products/return', authenticate, authorize('products.manage', 'sales.return'), validateBody(productReturnSchema), api.products.returnStock);
router.get('/products/returns/list', authenticate, authorize('products.manage'), api.products.returns);
router.post('/products/delete-all', authenticate, authorize('products.manage'), requireConfirmation('CONFIRM_DELETE_ALL_PRODUCTS'), auditLog('products_delete_all', 'products'), api.products.deleteAll);
router.get('/products', authenticate, authorize('products.manage', 'sales.branch', 'sales.wholesale', 'sales.pos'), validateQuery(commonQuerySchema), api.products.list);
router.get('/products/next-sku', authenticate, authorize('products.manage'), api.products.nextSku);
router.post('/products', authenticate, authorize('products.manage'), validateBody(productCreateSchema), api.products.create);
// BUG-14 FIX: حذف DELETE /products المكررة — الحذف الكلي متاح عبر POST /products/delete-all
router.put('/products/bulk-price', authenticate, authorize('products.manage'), validateBody(bulkPriceAdjustSchema), api.products.bulkPriceAdjust);
router.get('/products/:id', authenticate, authorize('products.manage', 'sales.branch'), api.products.get);
router.put('/products/:id/warehouse', authenticate, authorize('products.manage'), validateBody(productWarehouseSchema), api.products.setWarehouse);
router.put('/products/:id', authenticate, authorize('products.manage'), validateBody(productUpdateSchema), api.products.update);
router.delete('/products/:id', authenticate, authorize('products.manage'), api.products.delete);


// Inventory
router.get('/inventory', authenticate, authorize('inventory.manage'), api.inventory.list);
router.get('/inventory/movements', authenticate, authorize('inventory.manage'), api.inventory.movements);
router.get('/inventory/return-template', authenticate, authorize('inventory.manage'), api.inventory.returnTemplate);
router.post('/inventory/return-validate', authenticate, authorize('inventory.manage'), upload.single('file'), api.inventory.validateReturnExcel);
router.post('/inventory/return-import', authenticate, authorize('inventory.manage'), upload.single('file'), api.inventory.importReturnExcel);
router.get('/warehouses', authenticate, api.inventory.warehouses);
router.post('/inventory/transfer', authenticate, authorize('inventory.manage'), validateBody(inventoryTransferSchema), api.inventory.transfer);
router.post('/inventory/adjust', authenticate, authorize('inventory.manage'), validateBody(inventoryAdjustSchema), auditLog('inventory_adjust', 'inventory'), api.inventory.adjust);
router.delete('/inventory', authenticate, authorize('inventory.manage'), requireConfirmation('CONFIRM_CLEAR_INVENTORY'), auditLog('inventory_clear_all', 'inventory'), api.inventory.clearAll);

// Stocktake & Reconciliation
router.get('/stocktakes', authenticate, authorize('inventory.manage'), api.stocktake.list);
router.post('/stocktakes', authenticate, authorize('inventory.manage'), validateBody(stocktakeCreateSchema), auditLog('stocktake_create', 'inventory'), api.stocktake.create);
router.get('/stocktakes/:id', authenticate, authorize('inventory.manage'), api.stocktake.get);
router.put('/stocktakes/:id/items', authenticate, authorize('inventory.manage'), validateBody(stocktakeUpdateSchema), api.stocktake.updateItems);
router.post('/stocktakes/:id/complete', authenticate, authorize('inventory.manage'), auditLog('stocktake_complete', 'inventory'), api.stocktake.complete);
router.delete('/stocktakes/:id', authenticate, authorize('inventory.manage'), auditLog('stocktake_delete', 'inventory'), api.stocktake.delete);

/**
 * Purchases
 * - create
 * - list
 * - delete invoice (soft delete + reverse inventory movement)
 */
router.get('/purchases', authenticate, authorize('inventory.manage', 'products.manage'), validateQuery(commonQuerySchema), api.purchases.list);
router.post('/purchases', authenticate, authorize('inventory.manage', 'products.manage'), validateBody(purchaseInvoiceSchema), auditLog('purchase_create', 'purchases'), api.purchases.create);
router.put('/purchases/:id', authenticate, authorize('inventory.manage', 'products.manage'), validateBody(purchaseInvoiceSchema), auditLog('purchase_update', 'purchases'), api.purchases.update);
router.delete('/purchases/:id', authenticate, authorize('inventory.manage', 'products.manage'), api.purchases.delete);

// Costs / Recipes
router.get('/costs/recipes', authenticate, authorize('products.manage'), api.costs.listRecipes);
router.get('/costs/recipes/:id', authenticate, authorize('products.manage'), api.costs.getRecipe);
router.post('/costs/recipes', authenticate, authorize('products.manage'), validateBody(recipeSchema), api.costs.createRecipe);
router.put('/costs/recipes/:id', authenticate, authorize('products.manage'), validateBody(recipeSchema), api.costs.updateRecipe);
router.delete('/costs/recipes/:id', authenticate, authorize('products.manage'), api.costs.deleteRecipe);
router.post('/costs/recipes/:id/produce', authenticate, authorize('products.manage'), validateBody(recipeProductionSchema), api.costs.produceRecipe);
// عمليات الإنتاج
router.get('/costs/productions', authenticate, authorize('products.manage'), api.costs.listProductions);
router.post('/costs/productions/:movementId/reverse', authenticate, authorize('products.manage'), validateBody(reverseProductionSchema), api.costs.reverseProduction);

// Customers
router.get('/customers', authenticate, authorize('customers.manage', 'sales.branch', 'sales.wholesale'), validateQuery(commonQuerySchema), api.customers.list);
router.get('/customers/:id', authenticate, authorize('customers.manage'), api.customers.get);
router.get('/customers/:id/statement', authenticate, authorize('customers.manage'), api.customers.statement);
router.post('/customers/:id/payment', authenticate, authorize('customers.manage'), validateBody(paymentSchema), api.customers.recordPayment);
router.post('/customers/sales/:saleId/payment', authenticate, authorize('customers.manage'), validateBody(paymentSchema), api.customers.recordSalePayment);
router.post('/customers', authenticate, authorize('customers.manage'), validateBody(customerCreateSchema), api.customers.create);
router.put('/customers/:id', authenticate, authorize('customers.manage'), validateBody(customerUpdateSchema), api.customers.update);
router.delete('/customers/:id', authenticate, authorize('customers.manage'), api.customers.delete);

// Expenses
router.get('/expenses', authenticate, authorize('expenses.manage', 'reports.view'), validateQuery(commonQuerySchema), api.expenses.list);
router.get('/expenses/categories', authenticate, authorize('expenses.manage'), api.expenses.categories);
router.get('/expenses/report', authenticate, authorize('expenses.manage', 'reports.view'), api.expenses.report);
router.post('/expenses', authenticate, authorize('expenses.manage'), validateBody(expenseSchema), auditLog('expense_create', 'expenses'), api.expenses.create);
router.put('/expenses/:id', authenticate, authorize('expenses.manage'), validateBody(expenseUpdateSchema), auditLog('expense_update', 'expenses'), api.expenses.update);
router.delete('/expenses/:id', authenticate, authorize('expenses.manage'), auditLog('expense_delete', 'expenses'), api.expenses.delete);

// Suppliers
router.get('/suppliers', authenticate, authorize('suppliers.manage'), validateQuery(commonQuerySchema), api.suppliers.list);
router.get('/suppliers/:id', authenticate, authorize('suppliers.manage'), api.suppliers.get);
router.post('/suppliers', authenticate, authorize('suppliers.manage'), validateBody(supplierCreateSchema), api.suppliers.create);
router.put('/suppliers/:id', authenticate, authorize('suppliers.manage'), validateBody(supplierUpdateSchema), api.suppliers.update);
router.delete('/suppliers/:id', authenticate, authorize('suppliers.manage'), api.suppliers.delete);
router.get('/suppliers/:id/invoices', authenticate, authorize('suppliers.manage'), api.suppliers.invoices);
router.get('/suppliers/:id/payments', authenticate, authorize('suppliers.manage'), api.suppliers.payments);
router.post('/suppliers/:id/payments', authenticate, authorize('suppliers.manage'), validateBody(paymentSchema), api.suppliers.recordPayment);

// Invoices
router.get('/invoices', authenticate, authorize('invoices.manage', 'sales.branch'), validateQuery(commonQuerySchema), api.invoices.list);
router.post('/invoices', authenticate, authorize('invoices.manage'), validateBody(invoiceSchema), api.invoices.create);
router.get('/invoices/:id/pdf', authenticate, authorize('invoices.manage', 'sales.branch'), api.invoices.pdf);
router.get('/invoices/:id', authenticate, authorize('invoices.manage', 'sales.branch'), api.invoices.get);
router.put('/invoices/:id', authenticate, authorize('invoices.manage'), validateBody(invoiceSchema), api.invoices.update);
router.delete('/invoices/:id', authenticate, authorize('invoices.manage'), api.invoices.delete);

// Quotes
router.get('/quotes/template', authenticate, authorize('invoices.manage', 'sales.branch'), api.quotes.template);
router.put('/quotes/template', authenticate, authorize('invoices.manage', 'sales.branch'), validateBody(quoteTemplateSchema), api.quotes.template);
router.post('/quotes/pdf', authenticate, authorize('invoices.manage', 'sales.branch'), validateBody(quotePdfSchema), api.quotes.pdf);

// Users & Settings
router.get('/users', authenticate, authorize('users.manage'), api.users.list);
router.post('/users', authenticate, authorize('users.manage'), validateBody(userCreateSchema), auditLog('user_create', 'users'), api.users.create);
router.put('/users/:id', authenticate, authorize('users.manage'), validateBody(userUpdateSchema), auditLog('user_update', 'users'), api.users.update);
router.delete('/users/:id', authenticate, authorize('users.manage'), auditLog('user_delete', 'users'), api.users.delete);
router.get('/roles', authenticate, authorize('users.manage'), api.users.roles);
router.get('/notifications', authenticate, api.users.notifications);
router.get('/settings', authenticate, authorize('settings.manage'), api.users.settings);
router.put('/settings/:key', authenticate, authorize('settings.manage'), validateBody(settingUpdateSchema), api.users.updateSetting);

// Reports & AI Forecasting
router.get('/forecasting', authenticate, authorize('reports.view'), api.forecasting.getDemandForecast);
router.get('/forecasting/basket-associations', authenticate, authorize('sales.branch', 'sales.wholesale', 'sales.pos'), api.forecasting.getBasketAssociations);
router.post('/forecasting/copilot', authenticate, authorize('dashboard.view'), validateBody(copilotSchema), api.forecasting.askCopilot);
router.get('/forecasting/staffing', authenticate, authorize('reports.view'), api.forecasting.getStaffingForecast);
router.get('/forecasting/pricing-alerts', authenticate, authorize('reports.view', 'products.manage'), api.forecasting.getSmartPricingAlerts);
router.get('/forecasting/cashflow-projection', authenticate, authorize('reports.view'), api.forecasting.getCashFlowProjection);
router.get('/expenses/suggest-category', authenticate, authorize('expenses.manage'), api.forecasting.suggestExpenseCategory);
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
router.post('/backup/clear',       authenticate, authorize('settings.manage'), requireAdmin, requireConfirmation('CONFIRM_CLEAR'), auditLog('data_clear',    'backup'), api.backup.clear);
router.post('/backup/cloud-test',  authenticate, authorize('settings.manage'), requireAdmin, api.backup.cloudTest);
router.get('/backup/logs',          authenticate, authorize('settings.manage'), requireAdmin, api.backup.getLogs);

// BUG-15 FIX: حذف debug backup route المكررة — يكفي المسار الرسمي /backup/create

export default router;
