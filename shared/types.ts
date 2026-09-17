/**
 * shared/types.ts — الأنماط المشتركة بين الباكند والواجهة
 * المصدر الموحد للأنماط التي يستهلكها الطرفان (المستخدم، الصلاحية...)
 * لتجنب تكرار التعريفات في backend/src وfrontend/src.
 *
 * ملاحظة: هذه ملفات أنواع فقط (بدون منطق تشغيل) — آمنة للاستيراد
 * من كلا الطرفين دون آثار جانبية.
 */

/** المستخدم المعرّف من قاعدة البيانات (users + roles). */
export interface User {
  id: number;
  uuid?: string;
  username: string;
  full_name?: string;
  email?: string;
  role_id?: number;
  role_name?: string;
  role_name_ar?: string;
  [key: string]: any;
}

/** صلاحية داخل النظام (permissions). */
export interface Permission {
  id?: number;
  code: string;
  name_ar?: string;
  module?: string;
}

/** دور مستخدم مع صلاحياته (لشاشات إدارة الأدوار). */
export interface Role {
  id: number;
  name: string;
  name_ar?: string;
  description?: string;
}

// استجابة الـ API الموحدة

/** الغلاف القياسي لكل استجابات الـ Backend ({ success, message, data }). */
export interface ApiEnvelope<T = unknown> {
  success: boolean;
  message?: string;
  data: T;
  code?: string;
  requestId?: string;
}

/** عنصر مع صفحات (نتائج قوائم مقسّمة) — للاستخدام المستقبلي. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

// كيانات النظام الأساسية

/** مخزن / فرع. */
export interface Warehouse {
  id: number;
  name: string;
  name_ar?: string;
  is_main?: boolean;
  is_active?: boolean;
}

/** تصنيف منتج. */
export interface Category {
  id: number;
  name: string;
  name_ar?: string;
}

/** وحدة قياس. */
export interface Unit {
  id: number;
  name: string;
  conversion_factor?: number;
  name_ar?: string;
  base_unit_id?: number | null;
}

/** منتج. */
export interface Product {
  id?: number | null;
  sku?: string;
  barcode?: string;
  name: string;
  name_ar?: string;
  category_id?: number | null;
  unit_id?: number | null;
  warehouse_id?: number | null;
  cost_price?: number | string;
  sale_price?: number | string;
  quantity?: number | string;
  min_quantity?: number | string;
  is_active?: boolean;
  image_url?: string | null;
  category_name?: string | null;
  warehouse_name?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
}

/** عميل. */
export interface Customer {
  id?: number | null;
  name: string;
  phone?: string;
  address?: string;
  balance?: number | string;
  credit_limit?: number | string;
  is_wholesale?: boolean;
  deleted_at?: string | null;
  [key: string]: unknown;
}

/** مورد. */
export interface Supplier {
  id?: number | null;
  name: string;
  phone?: string;
  balance?: number | string;
  deleted_at?: string | null;
  [key: string]: unknown;
}

/** مصروف. */
export interface Expense {
  id?: number | null;
  title: string;
  amount: number | string;
  category_id?: number | null;
  expense_date?: string;
  notes?: string;
  deleted_at?: string | null;
  [key: string]: unknown;
}

/** فاتورة شراء. */
export interface Purchase {
  id: number;
  supplier_id?: number | null;
  invoice_number?: string;
  total?: number | string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

/** حركة جرد (Stocktake). */
export interface Stocktake {
  id: number;
  warehouse_id?: number | null;
  status?: string;
  created_at?: string;
  completed_at?: string | null;
  /** بنود الجرد (شكل مرن من الـ Backend) */
  items?: any[];
  [key: string]: unknown;
}

/** موظف (HR). */
export interface Employee {
  id: number;
  full_name: string;
  phone?: string;
  job_title?: string;
  salary?: number | string;
  hired_at?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

/** وردية عمل. */
export interface Shift {
  id: number;
  name: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

/** تشغيلة رواتب. */
export interface PayrollRun {
  id: number;
  period_start?: string;
  period_end?: string;
  status?: string;
  paid_at?: string | null;
  /** بنود الرواتب (شكل مرن من الـ Backend) */
  items?: any[];
  total_gross?: any;
  total_deductions?: any;
  total_advances?: any;
  total_net?: any;
  [key: string]: unknown;
}

/** وصفة تكلفة. */
export interface Recipe {
  id: number;
  name: string;
  output_product_id?: number | null;
  output_quantity?: number | string;
  total_cost?: number | string;
  [key: string]: unknown;
}

/** إشعار داخل النظام. */
export interface Notification {
  id: number;
  title: string;
  body?: string;
  is_read?: boolean;
  created_at?: string;
}

/** سجل تدقيق. */
export interface AuditLogEntry {
  id: number;
  user_id?: number | null;
  username?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | string | null;
  ip_address?: string | null;
  created_at?: string;
  new_data?: Record<string, unknown> | null;
}

/** بيانات لوحة التحكم. */
export interface DashboardData {
  todaySales?: number | string;
  monthSales?: number | string;
  totalProducts?: number;
  lowStockCount?: number;
  salesChart?: Array<{ label: string; value: number }>;
  topProducts?: Array<{ name: string; quantity: number; revenue?: number }>;
  recentSales?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** تنبيه أمني / احتيال مالي من محرك المخاطر (Anti-Fraud / Risk Engine). */
export interface RiskAlert {
  id: string;
  fingerprint?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  user?: {
    id?: number | null;
    name?: string | null;
  };
  branch?: {
    id?: number | null;
    name?: string | null;
  };
  timestamp: string;
  event: string;
  reference: {
    type: string;
    id: number | string;
  };
  explanation: string;
}

/** ملخص إحصائي لدرجات الخطورة. */
export interface RiskSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

/** حالة تنفيذ كاشف مخاطر مستقل. */
export interface DetectorExecutionResult {
  detector: string;
  status: 'success' | 'failed';
  durationMs: number;
  alertsCount: number;
  errorCode?: string;
  errorMessage?: string;
}

/** الإعدادات والحدود الرقابية القابلة للضبط لمحرك المخاطر. */
export interface RiskRuleConfig {
  discountPctThreshold: number; // النسبة المئوية لبدء التنبيه (مثلاً 20%)
  discountAmtThreshold: number; // القيمة النقدية للخصم بالجنيه (مثلاً 150)
  discountCriticalPct: number; // النسبة المئوية للخطورة الحرجة (مثلاً 40%)
  discountCriticalAmt: number; // القيمة النقدية للخطورة الحرجة (مثلاً 300)
  voidCountThreshold: number; // عدد الإلغاءات لبدء التنبيه (مثلاً 2)
  voidCountCritical: number; // عدد الإلغاءات للخطورة الحرجة (مثلاً 5)
  cashDiffThreshold: number; // فرق نقدية الوردية بالجنيه (مثلاً 20)
  cashDiffCritical: number; // فرق نقدية الوردية الحرج (مثلاً 100)
  stockAdjThreshold: number; // كمية تسوية المخزون للتنبيه (مثلاً 5)
  stockAdjCritical: number; // كمية تسوية المخزون الحرجة (مثلاً 20)
  longShiftHours: number; // الساعات المفتوحة بدون إغلاق وردية (مثلاً 16)
  pinOverrideCount: number; // طلبات موافقة PIN للتنبيه (مثلاً 3)
  pinOverrideCritical: number; // طلبات موافقة PIN للخطورة العالية (مثلاً 6)
  dedupWindowMinutes: number; // نافذة منع التكرار بالدقائق (مثلاً 60)
}

/** النتيجة الشاملة لفحص محرك المخاطر. */
export interface RiskScanResult {
  status: 'success' | 'degraded' | 'failed';
  alerts: RiskAlert[];
  summary: RiskSummary;
  detectorResults: DetectorExecutionResult[];
  scannedAt: string;
}
