/**
 * schemas.js — مخططات التحقق المركزية باستخدام Zod
 * ═══════════════════════════════════════════════════
 * تحتوي على جميع schemas المستخدمة في routes/index.js
 * مفصولة هنا لتسهيل الصيانة والإعادة الاستخدام
 */
import { z } from 'zod';
import { parseLocalizedNumber } from '../utils/numberParsing.js';

// ─── Primitive Helpers ────────────────────────────────────────────────────────
export const positiveId = z.coerce.number().int().positive();

export const nonNegativeNumber = z.preprocess(
  (val) => parseLocalizedNumber(val),
  z.number().min(0)
);

export const positiveNumber = z.preprocess(
  (val) => parseLocalizedNumber(val),
  z.number().positive()
);

export const optionalPositiveId = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  positiveId.optional()
);

export const optionalNonNegativeNumber = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  nonNegativeNumber.optional()
);

export const nullableText = (max = 1000) => z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().max(max).nullable().optional()
);

export const optionalDateText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
);

export const optionalDateTimeText = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.string().max(40).optional()
);

export const optionalBool = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean().optional()
);

export const shortText = (max = 255) => z.string().trim().min(1).max(max);

// ─── Common Query Schema ──────────────────────────────────────────────────────
export const commonQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  page: z.coerce.number().int().min(1).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
}).passthrough();

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const copilotSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'model', 'assistant']).optional(),
    content: z.string().max(8000).optional(),
    text: z.string().max(8000).optional(),
  })).max(20).optional().default([]),
});

// ─── Products ─────────────────────────────────────────────────────────────────
export const productCreateSchema = z.object({
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

export const productUpdateSchema = productCreateSchema.partial().passthrough();

export const categoryCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(255),
  slug: nullableText(255),
  parent_id: optionalPositiveId,
  sort_order: z.coerce.number().int().min(0).optional(),
}).passthrough();

export const categoryUpdateSchema = categoryCreateSchema.partial().passthrough();

export const unitCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(100),
  sort_order: z.coerce.number().int().min(0).optional(),
}).passthrough();

export const unitUpdateSchema = unitCreateSchema.partial().passthrough();

export const bulkPriceAdjustSchema = z.object({
  category_id: optionalPositiveId,
  type: z.enum(['sale', 'purchase']),
  adjust_type: z.enum(['percent', 'fixed']),
  value: z.coerce.number().finite(),
}).passthrough();

export const productWarehouseSchema = z.object({
  warehouse_id: positiveId,
}).passthrough();

export const productReturnSchema = z.object({
  product_id: positiveId,
  warehouse_id: positiveId,
  quantity: positiveNumber,
  sale_id: optionalPositiveId,
  notes: z.string().max(1000).optional().nullable(),
}).passthrough();

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryTransferSchema = z.object({
  product_id: positiveId,
  from_warehouse_id: positiveId,
  to_warehouse_id: positiveId,
  to_product_id: optionalPositiveId,
  quantity: positiveNumber,
  notes: z.string().max(1000).optional().nullable(),
}).passthrough();

export const inventoryAdjustSchema = z.object({
  product_id: positiveId,
  warehouse_id: positiveId,
  quantity: nonNegativeNumber,
  min_stock: optionalNonNegativeNumber,
  movement_type: z.literal('adjustment').optional(),
  notes: z.string().max(1000).optional().nullable(),
}).passthrough();

// ─── Stocktake ────────────────────────────────────────────────────────────────
export const stocktakeCreateSchema = z.object({
  warehouse_id: positiveId,
  notes: nullableText(2000),
}).passthrough();

export const stocktakeItemSchema = z.object({
  product_id: positiveId,
  actual_quantity: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.coerce.number().min(0).nullable()
  ),
}).passthrough();

export const stocktakeUpdateSchema = z.object({
  notes: nullableText(2000),
  items: z.array(stocktakeItemSchema).max(1000).optional().default([]),
}).passthrough();

// ─── Purchases ────────────────────────────────────────────────────────────────
export const purchaseItemSchema = z.object({
  product_id: positiveId,
  unit: z.string().trim().min(1).max(50).optional(),
  quantity: positiveNumber,
  unit_price: nonNegativeNumber,
}).passthrough();

export const purchaseInvoiceSchema = z.object({
  invoice_date: optionalDateText,
  supplier_id: optionalPositiveId,
  notes: nullableText(2000),
  items: z.array(purchaseItemSchema).min(1).max(500),
}).passthrough();

// ─── Sales ───────────────────────────────────────────────────────────────────
export const saleItemSchema = z.object({
  product_id: positiveId,
  quantity: positiveNumber,
  unit_price: nonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
}).passthrough();

export const saleSchema = z.object({
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

export const saleReturnSchema = z.object({
  notes: nullableText(2000),
}).passthrough();

export const openingBalanceSchema = z.object({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: nonNegativeNumber,
}).passthrough();

// ─── Customers ───────────────────────────────────────────────────────────────
export const customerCreateSchema = z.object({
  code: nullableText(50),
  name_ar: shortText(255),
  phone: nullableText(50),
  email: nullableText(255),
  address: nullableText(1000),
  customer_type: z.enum(['retail', 'wholesale']).optional(),
  credit_limit: optionalNonNegativeNumber,
  notes: nullableText(2000),
}).passthrough();

export const customerUpdateSchema = customerCreateSchema.partial().extend({
  loyalty_points: optionalNonNegativeNumber,
  is_active: optionalBool,
}).passthrough();

// ─── Suppliers ───────────────────────────────────────────────────────────────
export const supplierCreateSchema = z.object({
  code: nullableText(50),
  name_ar: shortText(255),
  phone: nullableText(50),
  email: nullableText(255),
  address: nullableText(1000),
  notes: nullableText(2000),
}).passthrough();

export const supplierUpdateSchema = supplierCreateSchema.partial().passthrough();

// ─── Payments ────────────────────────────────────────────────────────────────
export const paymentSchema = z.object({
  amount: positiveNumber,
  payment_method: shortText(50).optional(),
  notes: nullableText(1000),
}).passthrough();

// ─── Expenses ────────────────────────────────────────────────────────────────
export const expenseSchema = z.object({
  category_id: positiveId,
  title: shortText(255),
  amount: positiveNumber,
  expense_date: optionalDateText,
  payment_method: shortText(50).optional(),
  recurring: optionalBool,
  notes: nullableText(2000),
}).passthrough();

export const expenseUpdateSchema = expenseSchema.partial().passthrough();

// ─── Invoices ────────────────────────────────────────────────────────────────
export const invoiceItemSchema = z.object({
  product_id: z.number({ required_error: 'يجب اختيار منتج من القائمة لكل بند' }).int().positive('يجب اختيار منتج صحيح'),
  description: nullableText(1000),
  quantity: positiveNumber,
  unit_price: nonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
}).passthrough();

export const invoiceSchema = z.object({
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

// ─── Quotes ──────────────────────────────────────────────────────────────────
export const quoteItemSchema = z.object({
  name: nullableText(255),
  product_name: nullableText(255),
  description: nullableText(1000),
  unit: nullableText(50),
  price: optionalNonNegativeNumber,
  unit_price: optionalNonNegativeNumber,
}).passthrough();

export const quoteTemplateSchema = z.object({
  items: z.array(quoteItemSchema).max(200).optional().default([]),
}).passthrough();

export const quotePdfSchema = z.object({
  customer_name: shortText(255),
  notes: nullableText(2000),
  items: z.array(quoteItemSchema.extend({
    product_name: shortText(255).optional(),
    description: shortText(1000).optional(),
    unit_price: nonNegativeNumber,
  })).min(1).max(200),
}).passthrough();

// ─── Users & Roles ───────────────────────────────────────────────────────────
export const userCreateSchema = z.object({
  username: shortText(100),
  email: nullableText(255),
  password: z.string().min(8).max(200),
  full_name: shortText(255),
  phone: nullableText(50),
  role_id: positiveId,
}).passthrough();

export const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().min(8).max(200).optional(),
  is_active: optionalBool,
}).passthrough();

export const settingUpdateSchema = z.object({
  value: z.unknown(),
}).passthrough();

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.number().int().positive()).default([]),
}).passthrough();

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(50).regex(
    /^[a-zA-Z0-9_]+$/,
    'الاسم الإنجليزي يجب أن يحتوي على حروف وأرقام وشرطة سفلية فقط'
  ),
  name_ar: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
}).passthrough();

export const updateRoleSchema = z.object({
  name_ar: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
}).passthrough();

// ─── HR / Payroll ─────────────────────────────────────────────────────────────
export const shiftSchema = z.object({
  name_ar: shortText(255),
  start_time: shortText(20).optional(),
  end_time: shortText(20).optional(),
  required_hours: positiveNumber.optional(),
  grace_minutes: z.coerce.number().int().min(0).optional(),
  overtime_enabled: optionalBool,
  is_active: optionalBool,
}).passthrough();

export const employeeSchema = z.object({
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

export const employeeUpdateSchema = employeeSchema.partial().passthrough();

export const attendanceSchema = z.object({
  employee_id: positiveId,
  work_date: optionalDateText,
  from_date: optionalDateText,
  to_date: optionalDateText,
  check_in: optionalDateTimeText,
  check_out: optionalDateTimeText,
  status: z.enum(['present', 'absent', 'paid_leave', 'unpaid_leave', 'weekly_off', 'half_day']).optional(),
  notes: nullableText(2000),
}).passthrough();

export const advanceSchema = z.object({
  employee_id: positiveId,
  advance_date: optionalDateText,
  amount: positiveNumber,
  installment_amount: optionalNonNegativeNumber,
  installments_count: z.coerce.number().int().min(1).max(120).optional(),
  payment_method: shortText(50).optional(),
  notes: nullableText(2000),
}).passthrough();

export const payrollSchema = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}$/),
}).passthrough();

export const payrollPaySchema = z.object({
  payment_method: shortText(50).optional(),
}).passthrough();

// ─── Costs / Recipes ──────────────────────────────────────────────────────────
export const recipeItemSchema = z.object({
  ingredient_product_id: positiveId,
  quantity: positiveNumber,
  unit_code: shortText(50),
  notes: nullableText(1000),
}).passthrough();

export const recipeSchema = z.object({
  product_id: positiveId,
  name_ar: nullableText(255),
  is_active: optionalBool,
  notes: nullableText(2000),
  items: z.array(recipeItemSchema).min(1).max(500),
}).passthrough();

export const recipeProductionSchema = z.object({
  quantity: positiveNumber,
  warehouse_id: positiveId,
  mode: z.enum(['production', 'manual']).optional(),
  notes: nullableText(2000),
}).passthrough();

export const reverseProductionSchema = z.object({
  reverse_qty: optionalNonNegativeNumber,
}).passthrough();
