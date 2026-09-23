import { z } from 'zod';
import { parseLocalizedNumber } from '../utils/numberParsing.ts';

/**
 * مخططات التحقق (Zod) لكل مسارات API — تُستخدم مع middleware التحقق (validateBody/validateQuery).
 * تتضمن دوال مساعدة لتحويل الأرقام المحلية والقيم الاختيارية، ثم مخططات كل كيان (منتجات، مبيعات، عملاء...).
 */

/** معرف موجب صحيح (يُحوَّل من نص تلقائيًا). */
const positiveId = z.coerce.number().int().positive();
/** رقم غير سالب مع دعم الأرقام المحلية (عربية/فارسية). */
const nonNegativeNumber = z.preprocess((val) => parseLocalizedNumber(val), z.number().min(0));
/** رقم موجب مع دعم الأرقام المحلية. */
const positiveNumber = z.preprocess((val) => parseLocalizedNumber(val), z.number().positive());
/** معرف اختياري: يقبل النص الفارغ/null كقيمة غير محددة. */
const optionalPositiveId = z.preprocess(
  (value) => (value === '' || value === null ? void 0 : value),
  positiveId.optional(),
);
/** معرف اختياري يسمح بقيمة null الصريحة لمسح الربط. */
const nullablePositiveId = z.preprocess(
  (value) => (value === '' ? null : value),
  positiveId.nullable().optional(),
);
/** رقم غير سالب اختياري (النص الفارغ/null = غير محدد). */
const optionalNonNegativeNumber = z.preprocess(
  (value) => (value === '' || value === null ? void 0 : value),
  nonNegativeNumber.optional(),
);
/** نص فارغ يتحول إلى null (اختياري). */
const nullableText = (max = 1e3) =>
  z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );
/** تاريخ اختياري بصيغة YYYY-MM-DD (النص الفارغ = غير محدد). */
const optionalDateText = z.preprocess(
  (value) => (value === '' || value === null ? void 0 : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
);
const optionalDateTimeText = z.preprocess(
  (value) => (value === '' || value === null ? void 0 : value),
  z.string().max(40).optional(),
);
const optionalBool = z.preprocess((value) => {
  if (value === '' || value === null || value === void 0) return void 0;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());
const shortText = (max = 255) => z.string().trim().min(1).max(max);
const commonQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(1e3).optional(),
    page: z.coerce.number().int().min(1).optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    search: z.string().optional(),
    sale_type: z.string().optional(),
    entry_mode: z.string().optional(),
    status: z.string().optional(),
    warehouse_id: optionalPositiveId,
  })
  .strip();
const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});
const copilotSchema = z.object({
  prompt: z.string().trim().min(1).max(4e3),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model', 'assistant']).optional(),
        content: z.string().max(8e3).optional(),
        text: z.string().max(8e3).optional(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});
const productCreateSchema = z
  .object({
    sku: nullableText(100),
    barcode: nullableText(100),
    name_ar: z.string().trim().min(1).max(255),
    description: nullableText(2e3),
    category_id: optionalPositiveId,
    unit: z.string().trim().min(1).max(50).optional(),
    purchase_price: nonNegativeNumber.optional(),
    sale_price: nonNegativeNumber,
    wholesale_price: optionalNonNegativeNumber,
    min_stock: optionalNonNegativeNumber,
    image_url: nullableText(1e3),
    is_active: z.boolean().optional(),
    track_expiry: z.boolean().optional(),
    primary_warehouse_id: optionalPositiveId,
    initial_stock: z.record(z.string(), nonNegativeNumber).optional(),
  })
  .strip();
const productUpdateSchema = productCreateSchema.partial().strip();
const categoryCreateSchema = z
  .object({
    name_ar: z.string().trim().min(1).max(255),
    slug: nullableText(255),
    parent_id: optionalPositiveId,
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  .strip();
const categoryUpdateSchema = categoryCreateSchema.partial().strip();
const unitCreateSchema = z
  .object({
    name_ar: z.string().trim().min(1).max(100),
    sort_order: z.coerce.number().int().min(0).optional(),
  })
  .strip();
const unitUpdateSchema = unitCreateSchema.partial().strip();
const bulkPriceAdjustSchema = z
  .object({
    category_id: optionalPositiveId,
    type: z.enum(['sale', 'purchase']),
    adjust_type: z.enum(['percent', 'fixed']),
    value: z.coerce
      .number()
      .finite()
      .min(-100, 'النسبة/القيمة لا يمكن أن تكون أقل من -100')
      .max(10_000_000, 'القيمة أكبر من الحد المسموح'),
  })
  .strip();
const productWarehouseSchema = z
  .object({
    warehouse_id: positiveId,
  })
  .strip();
const productReturnSchema = z
  .object({
    product_id: positiveId,
    warehouse_id: positiveId,
    quantity: positiveNumber,
    sale_id: optionalPositiveId,
    notes: z.string().max(1e3).optional().nullable(),
  })
  .strip();
const inventoryTransferItemSchema = z
  .object({
    product_id: positiveId,
    to_product_id: optionalPositiveId,
    quantity: positiveNumber,
    notes: z.string().max(1e3).optional().nullable(),
  })
  .strip();
const inventoryTransferSchema = z
  .object({
    from_warehouse_id: positiveId,
    to_warehouse_id: positiveId,
    product_id: optionalPositiveId,
    to_product_id: optionalPositiveId,
    quantity: z.preprocess(
      (val) => (val === '' || val === undefined ? undefined : val),
      z.coerce.number().positive().optional(),
    ),
    notes: z.string().max(1e3).optional().nullable(),
    items: z.array(inventoryTransferItemSchema).optional(),
  })
  .strip();
const inventoryAdjustSchema = z
  .object({
    product_id: positiveId,
    warehouse_id: positiveId,
    quantity: nonNegativeNumber,
    min_stock: optionalNonNegativeNumber,
    movement_type: z.literal('adjustment').optional(),
    notes: z.string().max(1e3).optional().nullable(),
  })
  .strip();
const stocktakeCreateSchema = z
  .object({
    warehouse_id: positiveId,
    notes: nullableText(2e3),
  })
  .strip();
const stocktakeItemSchema = z
  .object({
    product_id: positiveId,
    actual_quantity: z.preprocess(
      (value) => (value === '' || value === void 0 ? null : value),
      z.coerce.number().min(0).nullable(),
    ),
  })
  .strip();
const stocktakeUpdateSchema = z
  .object({
    notes: nullableText(2e3),
    items: z.array(stocktakeItemSchema).max(1e3).optional().default([]),
  })
  .strip();
const purchaseItemSchema = z
  .object({
    product_id: positiveId,
    unit: z.string().trim().min(1).max(50).optional(),
    quantity: positiveNumber,
    unit_price: nonNegativeNumber,
  })
  .strip();
const purchaseInvoiceSchema = z
  .object({
    invoice_date: optionalDateText,
    supplier_id: optionalPositiveId,
    notes: nullableText(2e3),
    items: z.array(purchaseItemSchema).min(1).max(500),
  })
  .strip();
const salePaymentItemSchema = z
  .object({
    payment_method: shortText(50),
    amount: positiveNumber,
  })
  .strip();

const saleItemSchema = z
  .object({
    product_id: positiveId,
    quantity: positiveNumber,
    unit_price: nonNegativeNumber,
    discount_amount: optionalNonNegativeNumber,
  })
  .strip();

const saleSchema = z
  .object({
    sync_id: z.string().uuid().optional(),
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
    payments: z.array(salePaymentItemSchema).max(10).optional(),
    loyalty_points_redeemed: optionalNonNegativeNumber,
    notes: nullableText(2e3),
    pos_shift_id: optionalPositiveId,
    terminal_id: optionalPositiveId,
    items: z.array(saleItemSchema).max(500).optional(),
  })
  .strip();

const verifyPinSchema = z
  .object({
    pin: z.string().min(4).max(8),
    action: z.string().max(100).optional(),
  })
  .strip();
const saleReturnSchema = z
  .object({
    notes: nullableText(2e3),
  })
  .strip();
const openingBalanceSchema = z
  .object({
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: nonNegativeNumber,
  })
  .strip();
const customerCreateSchema = z
  .object({
    code: nullableText(50),
    name_ar: shortText(255),
    phone: nullableText(50),
    email: nullableText(255),
    address: nullableText(1e3),
    customer_type: z.enum(['retail', 'wholesale']).optional(),
    credit_limit: optionalNonNegativeNumber,
    opening_balance: optionalNonNegativeNumber,
    current_balance: optionalNonNegativeNumber,
    notes: nullableText(2e3),
  })
  .strip();
const customerUpdateSchema = customerCreateSchema
  .partial()
  .extend({
    loyalty_points: optionalNonNegativeNumber,
    is_active: optionalBool,
  })
  .strip();
const supplierCreateSchema = z
  .object({
    code: nullableText(50),
    name_ar: shortText(255),
    phone: nullableText(50),
    email: nullableText(255),
    address: nullableText(1e3),
    notes: nullableText(2e3),
  })
  .strip();
const supplierUpdateSchema = supplierCreateSchema.partial().strip();
const paymentSchema = z
  .object({
    amount: positiveNumber,
    payment_method: shortText(50).optional(),
    notes: nullableText(1e3),
  })
  .strip();
const expenseSchema = z
  .object({
    category_id: positiveId,
    title: shortText(255),
    amount: positiveNumber,
    expense_date: optionalDateText,
    payment_method: shortText(50).optional(),
    recurring: optionalBool,
    notes: nullableText(2e3),
  })
  .strip();
const expenseUpdateSchema = expenseSchema.partial().strip();
const invoiceItemSchema = z
  .object({
    product_id: z
      .number({
        required_error:
          '\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646\u062A\u062C \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0644\u0643\u0644 \u0628\u0646\u062F',
      })
      .int()
      .positive(
        '\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646\u062A\u062C \u0635\u062D\u064A\u062D',
      ),
    description: nullableText(1e3),
    quantity: positiveNumber,
    unit_price: nonNegativeNumber,
    discount_amount: optionalNonNegativeNumber,
  })
  .strip();
const invoiceSchema = z
  .object({
    customer_id: optionalPositiveId,
    issued_at: optionalDateTimeText,
    due_date: optionalDateText,
    discount_percent: optionalNonNegativeNumber,
    discount_amount: optionalNonNegativeNumber,
    tax_percent: optionalNonNegativeNumber,
    tax_enabled: optionalBool,
    payment_status: z.enum(['paid', 'partial', 'unpaid']).optional(),
    notes: nullableText(2e3),
    items: z.array(invoiceItemSchema).min(1).max(500),
  })
  .strip();
const quoteItemSchema = z
  .object({
    name: nullableText(255),
    product_name: nullableText(255),
    description: nullableText(1e3),
    unit: nullableText(50),
    price: optionalNonNegativeNumber,
    unit_price: optionalNonNegativeNumber,
  })
  .strip();
const quoteTemplateSchema = z
  .object({
    items: z.array(quoteItemSchema).max(200).optional().default([]),
  })
  .strip();
const quotePdfSchema = z
  .object({
    customer_name: shortText(255),
    notes: nullableText(2e3),
    items: z
      .array(
        quoteItemSchema.extend({
          product_name: shortText(255).optional(),
          description: shortText(1e3).optional(),
          unit_price: nonNegativeNumber,
        }),
      )
      .min(1)
      .max(200),
  })
  .strip();
const userCreateSchema = z
  .object({
    username: shortText(100),
    email: nullableText(255),
    password: z.string().min(8).max(200),
    full_name: shortText(255),
    phone: nullableText(50),
    role_id: positiveId,
    warehouse_id: nullablePositiveId,
  })
  .strip();
const userUpdateSchema = userCreateSchema
  .partial()
  .extend({
    password: z.string().min(8).max(200).optional(),
    is_active: optionalBool,
    warehouse_id: nullablePositiveId,
  })
  .strip();
const settingUpdateSchema = z
  .object({
    value: z.unknown(),
  })
  .strip();
const updateRolePermissionsSchema = z
  .object({
    permissionIds: z.array(z.number().int().positive()).default([]),
  })
  .strip();
const createRoleSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(
        /^[a-zA-Z0-9_]+$/,
        '\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u062D\u0631\u0648\u0641 \u0648\u0623\u0631\u0642\u0627\u0645 \u0648\u0634\u0631\u0637\u0629 \u0633\u0641\u0644\u064A\u0629 \u0641\u0642\u0637',
      ),
    name_ar: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
  })
  .strip();
const updateRoleSchema = z
  .object({
    name_ar: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strip();
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:MM');
const shiftSchema = z
  .object({
    name_ar: shortText(255),
    start_time: timeText.optional(),
    end_time: timeText.optional(),
    required_hours: positiveNumber.optional(),
    grace_minutes: z.coerce.number().int().min(0).optional(),
    overtime_enabled: optionalBool,
    is_active: optionalBool,
  })
  .strip();
const employeeSchema = z
  .object({
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
    notes: nullableText(2e3),
    is_active: optionalBool,
  })
  .strip();
const employeeUpdateSchema = employeeSchema.partial().strip();
const attendanceSchema = z
  .object({
    employee_id: positiveId,
    work_date: optionalDateText,
    from_date: optionalDateText,
    to_date: optionalDateText,
    check_in: optionalDateTimeText,
    check_out: optionalDateTimeText,
    status: z
      .enum(['present', 'absent', 'paid_leave', 'unpaid_leave', 'weekly_off', 'half_day'])
      .optional(),
    notes: nullableText(2e3),
  })
  .strip();
const advanceSchema = z
  .object({
    employee_id: positiveId,
    advance_date: optionalDateText,
    amount: positiveNumber,
    installment_amount: optionalNonNegativeNumber,
    installments_count: z.coerce.number().int().min(1).max(120).optional(),
    payment_method: shortText(50).optional(),
    notes: nullableText(2e3),
  })
  .strip();
const payrollSchema = z
  .object({
    period_month: z.string().regex(/^\d{4}-\d{2}$/),
  })
  .strip();
const payrollPaySchema = z
  .object({
    payment_method: shortText(50).optional(),
  })
  .strip();
const recipeItemSchema = z
  .object({
    ingredient_product_id: positiveId,
    quantity: positiveNumber,
    unit_code: shortText(50),
    notes: nullableText(1e3),
  })
  .strip();
const recipeSchema = z
  .object({
    product_id: positiveId,
    name_ar: nullableText(255),
    is_active: optionalBool,
    notes: nullableText(2e3),
    items: z.array(recipeItemSchema).min(1).max(500),
  })
  .strip();
const recipeProductionSchema = z
  .object({
    quantity: positiveNumber,
    warehouse_id: positiveId,
    mode: z.enum(['production', 'manual', 'opening_production']).optional(),
    notes: nullableText(2e3),
  })
  .strip();
const reverseProductionSchema = z
  .object({
    reverse_qty: optionalNonNegativeNumber,
  })
  .strip();
const createAccountSchema = z
  .object({
    code: shortText(50),
    name_ar: shortText(200),
    name_en: nullableText(200),
    account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
    nature: z.enum(['debit', 'credit']),
    parent_id: optionalPositiveId,
    description: nullableText(500),
    is_active: optionalBool,
  })
  .strip();
const updateAccountSchema = z
  .object({
    name_ar: shortText(200).optional(),
    name_en: nullableText(200),
    description: nullableText(500),
    is_active: optionalBool,
  })
  .strip();
const createJournalEntrySchema = z
  .object({
    entry_date: optionalDateText,
    reference_type: z.string().trim().max(50).optional(),
    reference_id: z.coerce.number().int().positive().optional(),
    idempotency_key: z.string().trim().max(150).optional(),
    description: shortText(500),
    lines: z
      .array(
        z.object({
          account_id: optionalPositiveId,
          account_code: z.string().trim().max(50).optional(),
          debit: z.coerce.number().min(0).default(0),
          credit: z.coerce.number().min(0).default(0),
          description: z.string().trim().max(500).optional(),
          warehouse_id: optionalPositiveId,
        }),
      )
      .min(2, 'يجب أن يحتوي القيد على سطرين على الأقل'),
  })
  .strip();
export {
  advanceSchema,
  attendanceSchema,
  bulkPriceAdjustSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  createAccountSchema,
  createJournalEntrySchema,
  commonQuerySchema,
  copilotSchema,
  createRoleSchema,
  customerCreateSchema,
  customerUpdateSchema,
  employeeSchema,
  employeeUpdateSchema,
  expenseSchema,
  expenseUpdateSchema,
  inventoryAdjustSchema,
  inventoryTransferSchema,
  invoiceItemSchema,
  invoiceSchema,
  loginSchema,
  nonNegativeNumber,
  nullableText,
  openingBalanceSchema,
  optionalBool,
  optionalDateText,
  optionalDateTimeText,
  optionalNonNegativeNumber,
  optionalPositiveId,
  paymentSchema,
  payrollPaySchema,
  payrollSchema,
  positiveId,
  positiveNumber,
  productCreateSchema,
  productReturnSchema,
  productUpdateSchema,
  productWarehouseSchema,
  purchaseInvoiceSchema,
  purchaseItemSchema,
  quoteItemSchema,
  quotePdfSchema,
  quoteTemplateSchema,
  recipeItemSchema,
  recipeProductionSchema,
  recipeSchema,
  reverseProductionSchema,
  saleItemSchema,
  salePaymentItemSchema,
  saleReturnSchema,
  saleSchema,
  settingUpdateSchema,
  shiftSchema,
  shortText,
  stocktakeCreateSchema,
  stocktakeItemSchema,
  stocktakeUpdateSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
  unitCreateSchema,
  unitUpdateSchema,
  updateAccountSchema,
  updateRolePermissionsSchema,
  updateRoleSchema,
  userCreateSchema,
  userUpdateSchema,
  verifyPinSchema,
};
