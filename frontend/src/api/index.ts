import axios from 'axios';
import * as Sentry from '@sentry/vue';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api/v1`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

api.interceptors.request.use((config: any) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // إصلاح التجمّد: مهلة لكل طلب — الطلب العالق كان يجمّد الـ router guard للأبد
  config.timeout = config.timeout || 20_000;
  config.timeoutErrorMessage = 'انتهت مهلة الاتصال بالخادم. حاول مرة أخرى';
  return config;
});

// Track refresh state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (_value: unknown) => void;
  reject: (_reason?: unknown) => void;
}> = [];

const processQueue = (error: any, token: any = null) => {
  failedQueue.forEach((prom: any) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

import type { AxiosError } from 'axios';

api.interceptors.response.use(
  (res: any) => res.data,
  async (err: AxiosError<any>) => {
    const originalRequest: any = err.config;

    // Try to refresh token on 401 (except for login/refresh requests)
    if (
      err.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve: any, reject: any) => {
          failedQueue.push({ resolve, reject });
        }).then((token: any) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api.request(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          {
            withCredentials: true,
            headers: { 'Content-Type': 'application/json' },
          },
        );
        const { token: newToken } = res.data?.data || res.data || {};
        if (newToken) {
          localStorage.setItem('token', newToken);
          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api.request(originalRequest);
        }
      } catch (refreshErr: any) {
        processQueue(refreshErr, null);
        // Refresh failed — clear tokens and redirect (replace بدل href لتجنّب تلويث التاريخ)
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (!window.location.pathname.includes('/login')) {
          window.location.replace('/login');
        }
        return Promise.reject({ message: 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى', status: 401 });
      } finally {
        isRefreshing = false;
      }
    }

    // Standard error message handling
    let message = err.response?.data?.message;
    if (!message && err.response?.data instanceof Blob) {
      const text = await err.response.data.text().catch(() => '');
      if (text) {
        try {
          message = JSON.parse(text)?.message;
        } catch {
          message = text;
        }
      }
    }
    if (!message) {
      if (err.code === 'ERR_NETWORK' || !err.response) {
        message = 'لا يمكن الاتصال بالخادم. تأكد من تشغيل Backend: cd backend && npm run dev';
      } else {
        message = 'حدث خطأ في الاتصال';
      }
    }
    if (message?.includes('قاعدة البيانات') || err.response?.status === 503) {
      message = 'قاعدة البيانات غير متصلة. شغّل PostgreSQL أو نفّذ: docker compose up -d';
    }

    // Report unhandled backend errors to Sentry
    if (!err.response || err.response.status >= 500) {
      Sentry.captureException(err);
    }

    return Promise.reject({ message, status: err.response?.status });
  },
);

export default api;

export const auth = {
  login: (data: any) => api.post('/auth/login', data),
  profile: () => api.get('/auth/profile'),
  logout: () => api.post('/auth/logout'),
};

export const dashboard = (params: any) => api.get('/dashboard', { params });
export const operations = {
  alerts: () => api.get('/operations/alerts'),
  auditLogs: (params: any) => api.get('/operations/audit-logs', { params }),
};
export const hr = {
  summary: (params?: any) => api.get('/hr/summary', { params }),
  shifts: () => api.get('/hr/shifts'),
  createShift: (data: any) => api.post('/hr/shifts', data),
  employees: (params?: any) => api.get('/hr/employees', { params }),
  createEmployee: (data: any) => api.post('/hr/employees', data),
  updateEmployee: (id: any, data: any) => api.put(`/hr/employees/${id}`, data),
  deleteEmployee: (id: any) => api.delete(`/hr/employees/${id}`),
  attendance: (params?: any) => api.get('/hr/attendance', { params }),
  saveAttendance: (data: any) => api.post('/hr/attendance', data),
  deleteAttendance: (id: any) => api.delete(`/hr/attendance/${id}`),
  advances: (params?: any) => api.get('/hr/advances', { params }),
  createAdvance: (data: any) => api.post('/hr/advances', data),
  deleteAdvance: (id: any) => api.delete(`/hr/advances/${id}`),
  payrollRuns: () => api.get('/hr/payroll'),
  previewPayroll: (params?: any) => api.get('/hr/payroll/preview', { params }),
  createPayroll: (data: any) => api.post('/hr/payroll', data),
  getPayroll: (id: any) => api.get(`/hr/payroll/${id}`),
  payPayroll: (id: any, data: any) => api.post(`/hr/payroll/${id}/pay`, data),
};

export { sales } from './sales.api';

export const products = {
  list: (params: any = {}) => api.get('/products', { params }),
  branchProducts: (params: any = {}) => api.get('/products/branch', { params }),
  costsReport: (params: any = {}) => api.get('/products/costs-report', { params }),
  get: (id: any) => api.get(`/products/${id}`),
  nextSku: () => api.get('/products/next-sku'),
  create: (data: any) => api.post('/products', data),
  deleteAll: () => api.post('/products/delete-all', { confirm: 'CONFIRM_DELETE_ALL_PRODUCTS' }),
  update: (id: any, data: any) => api.put(`/products/${id}`, data),
  bulkAdjustPrices: (data: any) => api.put('/products/bulk-price', data),
  setWarehouse: (id: any, warehouse_id: any) =>
    api.put(`/products/${id}/warehouse`, { warehouse_id }),
  delete: (id: any) => api.delete(`/products/${id}`),
  categories: () => api.get('/products/categories'),
  createCategory: (data: any) => api.post('/products/categories', data),
  updateCategory: (id: any, data: any) => api.put(`/products/categories/${id}`, data),
  deleteCategory: (id: any) => api.delete(`/products/categories/${id}`),
  units: () => api.get('/products/units'),
  createUnit: (data: any) => api.post('/products/units', data),
  updateUnit: (id: any, data: any) => api.put(`/products/units/${id}`, data),
  deleteUnit: (id: any) => api.delete(`/products/units/${id}`),
  returnStock: (data: any) => api.post('/products/return', data),
  returns: (params: any) => api.get('/products/returns/list', { params }),
  downloadTemplate: async () => api.get('/products/template', { responseType: 'blob' }),
  exportProducts: async () => api.get('/products/export', { responseType: 'blob' }),
  importExcel: (file: any) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/products/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
export const warehouses = () => api.get('/warehouses');
export { inventory } from './inventory.api';
export const purchases = {
  list: (params: any) => api.get('/purchases', { params }),
  create: (data: any) => api.post('/purchases', data),
  update: (id: any, data: any) => api.put(`/purchases/${id}`, data),
  delete: (id: any) => api.delete(`/purchases/${id}`),
};
const recipeApi = {
  listRecipes: () => api.get('/costs/recipes'),
  getRecipe: (id: any) => api.get(`/costs/recipes/${id}`),
  createRecipe: (data: any) => api.post('/costs/recipes', data),
  updateRecipe: (id: any, data: any) => api.put(`/costs/recipes/${id}`, data),
  deleteRecipe: (id: any) => api.delete(`/costs/recipes/${id}`),
  produceRecipe: (id: any, data: any) => api.post(`/costs/recipes/${id}/produce`, data),
  // عمليات الإنتاج
  listProductions: (params: any = {}) => api.get('/costs/productions', { params }),
  reverseProduction: (movementId: any, data: any) =>
    api.post(`/costs/productions/${movementId}/reverse`, data || {}),
};

export const recipes = recipeApi;
export const costs = recipeApi;
export const customers = {
  list: (params: any) => api.get('/customers', { params }),
  get: (id: any) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: any, data: any) => api.put(`/customers/${id}`, data),
  delete: (id: any) => api.delete(`/customers/${id}`),
  statement: (id: any) => api.get(`/customers/${id}/statement`),
  recordPayment: (id: any, data: any) => api.post(`/customers/${id}/payment`, data),
  recordSalePayment: (saleId: any, data: any) =>
    api.post(`/customers/sales/${saleId}/payment`, data),
};
export const expenses = {
  list: (params: any) => api.get('/expenses', { params }),
  create: (data: any) => api.post('/expenses', data),
  update: (id: any, data: any) => api.put(`/expenses/${id}`, data),
  delete: (id: any) => api.delete(`/expenses/${id}`),
  categories: () => api.get('/expenses/categories'),
  report: (params: any) => api.get('/expenses/report', { params }),
  suggestCategory: (title: any) => api.get('/expenses/suggest-category', { params: { title } }),
};
export const suppliers = {
  list: () => api.get('/suppliers'),
  invoices: (id: any) => api.get(`/suppliers/${id}/invoices`),
  payments: (id: any) => api.get(`/suppliers/${id}/payments`),
  recordPayment: (id: any, data: any) => api.post(`/suppliers/${id}/payments`, data),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: any, data: any) => api.put(`/suppliers/${id}`, data),
  delete: (id: any) => api.delete(`/suppliers/${id}`),
};
export { invoices } from './invoices.api';
export const quotes = {
  template: (params: any = {}) => api.get('/quotes/template', { params }),
  saveTemplate: (data: any) => api.put('/quotes/template', data),
  downloadPdf: (data: any) => api.post('/quotes/pdf', data, { responseType: 'blob' }),
};
export const users = {
  list: () => api.get('/users'),
  roles: () => api.get('/roles'),
  create: (data: any) => api.post('/users', data),
  update: (id: any, data: any) => api.put(`/users/${id}`, data),
  delete: (id: any) => api.delete(`/users/${id}`),
  settings: () => api.get('/settings'),
  updateSetting: (key: any, value: any) => api.put(`/settings/${key}`, { value }),
  permissions: () => api.get('/permissions'),
  rolePermissions: (roleId: any) => api.get(`/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId: any, permissionIds: any) =>
    api.post(`/roles/${roleId}/permissions`, { permissionIds }),
  createRole: (data: any) => api.post('/roles', data),
  updateRole: (id: any, data: any) => api.put(`/roles/${id}`, data),
  deleteRole: (id: any) => api.delete(`/roles/${id}`),
};
export const reports = (type: any, params: any) => api.get(`/reports/${type}`, { params });

export const pl = {
  monthly: (params: any) => api.get('/reports/pl/monthly', { params }),
  trend: (months: any) => api.get('/reports/pl/trend', { params: { months } }),
};

export const backup = {
  create: () => api.get('/backup/create'),
  list: () => api.get('/backup/list'),
  download: (name: any) => api.get(`/backup/download/${name}`, { responseType: 'blob' }),
  restore: (name: any) => api.post('/backup/restore', { name, confirm: 'CONFIRM_RESTORE_BACKUP' }),
  restoreFile: (file: any) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('confirm', 'CONFIRM_RESTORE_BACKUP');
    return api.post('/backup/restore-file', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  clear: (body: any) => api.post('/backup/clear', body),
  cloudTest: (config: any) => api.post('/backup/cloud-test', config),
};

export const stocktakes = {
  list: () => api.get('/stocktakes'),
  get: (id: any) => api.get(`/stocktakes/${id}`),
  create: (data: any) => api.post('/stocktakes', data),
  updateItems: (id: any, data: any) => api.put(`/stocktakes/${id}/items`, data),
  complete: (id: any) => api.post(`/stocktakes/${id}/complete`),
  delete: (id: any) => api.delete(`/stocktakes/${id}`),
};

export const forecasting = {
  get: (params: any) => api.get('/forecasting', { params }),
  getBasketAssociations: (params: any) => api.get('/forecasting/basket-associations', { params }),
  // الكوبايلت يستغرق وقتًا أطول (جلب سياق النظام + استدعاء Gemini) — مهلة أطول صراحة
  askCopilot: (data: any) => api.post('/forecasting/copilot', data, { timeout: 90_000 }),
  getStaffingForecast: (params: any) => api.get('/forecasting/staffing', { params }),
  getSmartPricingAlerts: () => api.get('/forecasting/pricing-alerts'),
  getCashFlowProjection: (params: any) => api.get('/forecasting/cashflow-projection', { params }),
};
