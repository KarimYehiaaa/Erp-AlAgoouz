import api, { get, post, put, patch, del, getBlob, uploadFile } from './client';
import type { Api } from './client';
import type {
  ApiEnvelope,
  AuditLogEntry,
  Customer,
  DashboardData,
  Employee,
  Expense,
  Notification,
  PayrollRun,
  Product,
  Purchase,
  Recipe,
  Role,
  Stocktake,
  Supplier,
  Unit,
  User,
  Warehouse,
} from '../../../shared/types';

export default api;
export type { ApiEnvelope };
export type { Api };

// المصادقة

export interface LoginPayload {
  username: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  user: User;
  permissions: Array<{ code: string }>;
}
export interface ProfileResponse {
  user: User;
  permissions: Array<{ code: string }>;
}

export const auth = {
  login: (data: LoginPayload) => post<LoginResponse>('/auth/login', data),
  profile: () => get<ProfileResponse>('/auth/profile'),
  logout: () => post('/auth/logout'),
};

// لوحة التحكم والعمليات

export const dashboard = (params?: Record<string, unknown>) =>
  get<DashboardData>('/dashboard', { params });

export interface AlertItem {
  id: number;
  type: string;
  message: string;
  level?: string;
}

export const operations = {
  alerts: () => get<{ alerts: AlertItem[] }>('/operations/alerts'),
  auditLogs: (params?: Record<string, unknown>) =>
    get<AuditLogEntry[]>('/operations/audit-logs', { params }),
  notifications: () => get<Notification[]>('/notifications'),
  markNotificationRead: (id: number | string) => patch(`/notifications/${id}/read`),
  markAllNotificationsRead: () => patch('/notifications/read-all'),
};

// الموارد البشرية

export const hr = {
  summary: (params?: Record<string, unknown>) => get('/hr/summary', { params }),
  shifts: () => get<Shift[]>('/hr/shifts'),
  createShift: (data: Partial<Shift>) => post<Shift>('/hr/shifts', data),
  employees: (params?: Record<string, unknown>) => get<Employee[]>('/hr/employees', { params }),
  createEmployee: (data: Partial<Employee>) => post<Employee>('/hr/employees', data),
  updateEmployee: (id: number | string, data: Partial<Employee>) =>
    put<Employee>(`/hr/employees/${id}`, data),
  deleteEmployee: (id: number | string) => del(`/hr/employees/${id}`),
  attendance: (params?: Record<string, unknown>) => get('/hr/attendance', { params }),
  saveAttendance: (data: Record<string, unknown>) => post('/hr/attendance', data),
  deleteAttendance: (id: number | string) => del(`/hr/attendance/${id}`),
  advances: (params?: Record<string, unknown>) => get('/hr/advances', { params }),
  createAdvance: (data: Record<string, unknown>) => post('/hr/advances', data),
  deleteAdvance: (id: number | string) => del(`/hr/advances/${id}`),
  payrollRuns: () => get<PayrollRun[]>('/hr/payroll'),
  previewPayroll: (params?: Record<string, unknown>) => get('/hr/payroll/preview', { params }),
  createPayroll: (data: Record<string, unknown>) => post<PayrollRun>('/hr/payroll', data),
  getPayroll: (id: number | string) => get<PayrollRun>(`/hr/payroll/${id}`),
  payPayroll: (id: number | string, data: Record<string, unknown>) =>
    post(`/hr/payroll/${id}/pay`, data),
};

interface Shift {
  id: number;
  name: string;
  start_time?: string;
  end_time?: string;
}

export { sales } from './sales.api';
export { menu } from './menu.api';
export { automation } from './automation.api';

// المنتجات

export const products = {
  list: (params: Record<string, unknown> = {}) => get<Product[]>('/products', { params }),
  branchProducts: (params: Record<string, unknown> = {}) =>
    get<Product[]>('/products/branch', { params }),
  costsReport: (params: Record<string, unknown> = {}) => get('/products/costs-report', { params }),
  get: (id: number | string) => get<Product>(`/products/${id}`),
  nextSku: () => get<{ sku: string }>('/products/next-sku'),
  create: (data: Partial<Product>) => post<Product>('/products', data),
  deleteAll: () => post('/products/delete-all', { confirm: 'CONFIRM_DELETE_ALL_PRODUCTS' }),
  update: (id: number | string, data: Partial<Product>) => put<Product>(`/products/${id}`, data),
  bulkAdjustPrices: (data: Record<string, unknown>) => put('/products/bulk-price', data),
  setWarehouse: (id: number | string, warehouse_id: number | string | null) =>
    put(`/products/${id}/warehouse`, { warehouse_id }),
  delete: (id: number | string) => del(`/products/${id}`),
  categories: () =>
    get<Array<{ id: number; name: string; name_ar?: string; slug?: string }>>(
      '/products/categories',
    ),
  createCategory: (data: Record<string, unknown>) => post('/products/categories', data),
  updateCategory: (id: number | string, data: Record<string, unknown>) =>
    put(`/products/categories/${id}`, data),
  deleteCategory: (id: number | string) => del(`/products/categories/${id}`),
  units: () => get<Unit[]>('/products/units'),
  createUnit: (data: Record<string, unknown>) => post<Unit>('/products/units', data),
  updateUnit: (id: number | string, data: Record<string, unknown>) =>
    put<Unit>(`/products/units/${id}`, data),
  deleteUnit: (id: number | string) => del(`/products/units/${id}`),
  returnStock: (data: Record<string, unknown>) => post('/products/return', data),
  returns: (params?: Record<string, unknown>) => get('/products/returns/list', { params }),
  downloadTemplate: () => getBlob('/products/template'),
  exportProducts: () => getBlob('/products/export'),
  importExcel: (file: File) => uploadFile('/products/import', file),
};

// كاش قصير لقائمة المخازن — بيانات شبه ثابتة تُجلب من 6+ شاشات عند كل تحميل
let _whCache: { data: ApiEnvelope<Warehouse[]>; at: number } | null = null;
const WH_TTL_MS = 60_000;
export const warehouses = async (force = false): Promise<ApiEnvelope<Warehouse[]>> => {
  if (!force && _whCache && Date.now() - _whCache.at < WH_TTL_MS) {
    return _whCache.data;
  }
  const res = await get<Warehouse[]>('/warehouses');
  _whCache = { data: res, at: Date.now() };
  return res;
};
/** إبطال كاش المخازن بعد عمليات إنشاء/تعديل مخزن (نداء اختياري) */
export const invalidateWarehousesCache = () => {
  _whCache = null;
};
export { inventory } from './inventory.api';

// المشتريات والوصفات والتكاليف

export const purchases = {
  list: (params?: Record<string, unknown>) => get<Purchase[]>('/purchases', { params }),
  create: (data: Record<string, unknown>) => post<Purchase>('/purchases', data),
  update: (id: number | string, data: Record<string, unknown>) => put(`/purchases/${id}`, data),
  delete: (id: number | string) => del(`/purchases/${id}`),
};

const recipeApi = {
  listRecipes: () => get<Recipe[]>('/costs/recipes'),
  getRecipe: (id: number | string) => get<Recipe>(`/costs/recipes/${id}`),
  createRecipe: (data: Record<string, unknown>) => post<Recipe>('/costs/recipes', data),
  updateRecipe: (id: number | string, data: Record<string, unknown>) =>
    put(`/costs/recipes/${id}`, data),
  deleteRecipe: (id: number | string) => del(`/costs/recipes/${id}`),
  produceRecipe: (id: number | string, data?: Record<string, unknown>) =>
    post(`/costs/recipes/${id}/produce`, data),
  // عمليات الإنتاج
  listProductions: (params: Record<string, unknown> = {}) => get('/costs/productions', { params }),
  reverseProduction: (movementId: number | string, data?: Record<string, unknown>) =>
    post(`/costs/productions/${movementId}/reverse`, data || {}),
};

export const recipes = recipeApi;
export const costs = recipeApi;

// العملاء والموردين والمصروفات

export const customers = {
  list: (params?: Record<string, unknown>) => get<Customer[]>('/customers', { params }),
  get: (id: number | string) => get<Customer>(`/customers/${id}`),
  create: (data: Partial<Customer>) => post<Customer>('/customers', data),
  update: (id: number | string, data: Partial<Customer>) => put<Customer>(`/customers/${id}`, data),
  delete: (id: number | string) => del(`/customers/${id}`),
  statement: (id: number | string) => get(`/customers/${id}/statement`),
  recordPayment: (id: number | string, data: Record<string, unknown>) =>
    post(`/customers/${id}/payment`, data),
  recordSalePayment: (saleId: number | string, data: Record<string, unknown>) =>
    post(`/customers/sales/${saleId}/payment`, data),
};

export const expenses = {
  list: (params?: Record<string, unknown>) => get<Expense[]>('/expenses', { params }),
  create: (data: Partial<Expense>) => post<Expense>('/expenses', data),
  update: (id: number | string, data: Partial<Expense>) => put<Expense>(`/expenses/${id}`, data),
  delete: (id: number | string) => del(`/expenses/${id}`),
  categories: () => get<Array<{ id: number; name: string }>>('/expenses/categories'),
  report: (params?: Record<string, unknown>) => get('/expenses/report', { params }),
  suggestCategory: (title: string) =>
    get<{ suggestion?: string; category_id?: number | null }>('/expenses/suggest-category', {
      params: { title },
    }),
};

export const suppliers = {
  list: () => get<Supplier[]>('/suppliers'),
  invoices: (id: number | string) => get<Purchase[]>(`/suppliers/${id}/invoices`),
  payments: (id: number | string) => get(`/suppliers/${id}/payments`),
  recordPayment: (id: number | string, data: Record<string, unknown>) =>
    post(`/suppliers/${id}/payments`, data),
  create: (data: Partial<Supplier>) => post<Supplier>('/suppliers', data),
  update: (id: number | string, data: Partial<Supplier>) => put<Supplier>(`/suppliers/${id}`, data),
  delete: (id: number | string) => del(`/suppliers/${id}`),
};

export { invoices } from './invoices.api';

// عروض الأسعار والمستخدمون والإعدادات

export const quotes = {
  template: (params: Record<string, unknown> = {}) => get('/quotes/template', { params }),
  saveTemplate: (data: Record<string, unknown>) => put('/quotes/template', data),
  downloadPdf: (data: Record<string, unknown>) =>
    post<Blob>('/quotes/pdf', data, { responseType: 'blob' }),
};

export const users = {
  list: () => get<User[]>('/users'),
  roles: () => get<Role[]>('/roles'),
  create: (data: Record<string, unknown>) => post<User>('/users', data),
  update: (id: number | string, data: Record<string, unknown>) => put<User>(`/users/${id}`, data),
  delete: (id: number | string) => del(`/users/${id}`),
  settings: () => get<Record<string, any>>('/settings'),
  updateSetting: (key: string, value: unknown) => put(`/settings/${key}`, { value }),
  permissions: () => get<Array<{ id: number; code: string; module?: string }>>('/permissions'),
  rolePermissions: (roleId: number | string) => get(`/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId: number | string, permissionIds: number[]) =>
    post(`/roles/${roleId}/permissions`, { permissionIds }),
  createRole: (data: Partial<Role>) => post<Role>('/roles', data),
  updateRole: (id: number | string, data: Partial<Role>) => put<Role>(`/roles/${id}`, data),
  deleteRole: (id: number | string) => del(`/roles/${id}`),
};

export const reports = (type: string, params?: Record<string, unknown>) =>
  get(`/reports/${type}`, { params });

export const pl = {
  monthly: (params?: Record<string, unknown>) => get('/reports/pl/monthly', { params }),
  trend: (months: number) => get('/reports/pl/trend', { params: { months } }),
};

export const backup = {
  create: () => post('/backup/create'),
  list: () => get('/backup/list'),
  download: (name: string) => getBlob(`/backup/download/${name}`),
  restore: (name: string) => post('/backup/restore', { name, confirm: 'CONFIRM_RESTORE_BACKUP' }),
  restoreFile: (file: File): Api<any> => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('confirm', 'CONFIRM_RESTORE_BACKUP');
    return post('/backup/restore-file', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  clear: (body: Record<string, unknown>) => post('/backup/clear', body),
  cloudTest: (config: Record<string, unknown>) => post('/backup/cloud-test', config),
};

export const stocktakes = {
  list: () => get<Stocktake[]>('/stocktakes'),
  get: (id: number | string) => get<Stocktake>(`/stocktakes/${id}`),
  create: (data: Record<string, unknown>) => post<Stocktake>('/stocktakes', data),
  updateItems: (id: number | string, data: Record<string, unknown>) =>
    put(`/stocktakes/${id}/items`, data),
  complete: (id: number | string) => post<Stocktake>(`/stocktakes/${id}/complete`),
  delete: (id: number | string) => del(`/stocktakes/${id}`),
};

export const forecasting = {
  get: (params?: Record<string, unknown>) => get('/forecasting', { params }),
  getBasketAssociations: (params?: Record<string, unknown>) =>
    get('/forecasting/basket-associations', { params }),
  // الكوبايلت يستغرق وقتًا أطول (جلب سياق النظام + استدعاء Gemini) — مهلة أطول صراحة
  askCopilot: (data: Record<string, unknown>) =>
    post('/forecasting/copilot', data, { timeout: 90_000 }),
  getStaffingForecast: (params?: Record<string, unknown>) =>
    get('/forecasting/staffing', { params }),
  getSmartPricingAlerts: () => get('/forecasting/pricing-alerts'),
  getCashFlowProjection: (params?: Record<string, unknown>) =>
    get('/forecasting/cashflow-projection', { params }),
};

export { partnersApi, partnersApi as partners } from './partners.api';
export { posApi, posApi as pos } from './pos.api';
export type { PosShift, CashMovement } from './pos.api';
export { accountingApi, accountingApi as accounting } from './accounting.api';
export type {
  AccountItem,
  JournalLine,
  CreateJournalEntryPayload,
  LedgerEntry,
  GeneralLedgerResponse,
  TrialBalanceRow,
  TrialBalanceResponse,
  BalanceSheetSection,
  BalanceSheetResponse,
  PurchaseReturn,
  PurchaseReturnItem,
  CreatePurchaseReturnPayload,
} from './accounting.api';
