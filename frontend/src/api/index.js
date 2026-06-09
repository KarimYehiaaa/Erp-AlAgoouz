import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
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
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject({ message, status: err.response?.status });
  }
);

export default api;

export const auth = {
  login: (data) => api.post('/auth/login', data),
  profile: () => api.get('/auth/profile'),
};

export const dashboard = (params) => api.get('/dashboard', { params });
export const sales = {
  list: (params) => api.get('/sales', { params }),
  summary: (params) => api.get('/sales/summary', { params }),
  openingBalance: (params) => api.get('/sales/opening-balance', { params }),
  saveOpeningBalance: (data) => api.put('/sales/opening-balance', data),
  get: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  update: (id, data) => api.put(`/sales/${id}`, data),
  return: (id, data) => api.post(`/sales/${id}/return`, data),
  deleteAll: () => api.delete('/sales', { data: { confirm: 'CONFIRM_DELETE_ALL_SALES' } }),
  deleteByDate: (saleDate) => api.delete(`/sales/date/${saleDate}`, { data: { confirm: 'CONFIRM_DELETE_SALES_DATE' } }),
  deleteByType: (saleType) => api.delete(`/sales/type/${saleType}`, { data: { confirm: 'CONFIRM_DELETE_SALES_TYPE' } }),
  downloadTemplate: async () => {
    const res = await api.get('/sales/template', { responseType: 'blob' });
    return res instanceof Blob ? res : res;
  },
  downloadBranchTemplate: async () => {
    const res = await api.get('/sales/branch/template', { responseType: 'blob' });
    return res instanceof Blob ? res : res;
  },
  importExcel: (file, options = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (options.confirm) form.append('confirm', options.confirm);
    return api.post('/sales/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  validateExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/sales/import/validate', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  branchImportExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/sales/branch/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  branchValidateExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/sales/branch/validate', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
export const products = {
  list: (params) => api.get('/products', { params }),
  branchProducts: (params) => api.get('/products/branch', { params }),
  costsReport: (params) => api.get('/products/costs-report', { params }),
  get: (id) => api.get(`/products/${id}`),
  nextSku: () => api.get('/products/next-sku'),
  create: (data) => api.post('/products', data),
  deleteAll: () => api.delete('/products'),
  deleteAllSafe: () => api.post('/products/delete-all', { confirm: 'CONFIRM_DELETE_ALL_PRODUCTS' }),
  update: (id, data) => api.put(`/products/${id}`, data),
  setWarehouse: (id, warehouse_id) => api.put(`/products/${id}/warehouse`, { warehouse_id }),
  delete: (id) => api.delete(`/products/${id}`),
  categories: () => api.get('/products/categories'),
  createCategory: (data) => api.post('/products/categories', data),
  updateCategory: (id, data) => api.put(`/products/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/products/categories/${id}`),
  units: () => api.get('/products/units'),
  createUnit: (data) => api.post('/products/units', data),
  updateUnit: (id, data) => api.put(`/products/units/${id}`, data),
  deleteUnit: (id) => api.delete(`/products/units/${id}`),
  returnStock: (data) => api.post('/products/return', data),
  returns: (params) => api.get('/products/returns/list', { params }),
  downloadTemplate: async () => api.get('/products/template', { responseType: 'blob' }),
  exportProducts: async () => api.get('/products/export', { responseType: 'blob' }),
  importExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/products/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
export const warehouses = () => api.get('/warehouses');
export const inventory = {
  list: (params) => api.get('/inventory', { params }),
  movements: (params) => api.get('/inventory/movements', { params }),
  transfer: (data) => api.post('/inventory/transfer', data),
  adjust: (data) => api.post('/inventory/adjust', data),
  clearAll: () => api.delete('/inventory', { data: { confirm: 'CONFIRM_CLEAR_INVENTORY' } }),
  warehouses: () => api.get('/warehouses'),
  downloadReturnTemplate: (warehouse_id) =>
    api.get('/inventory/return-template', { params: warehouse_id ? { warehouse_id } : {}, responseType: 'blob' }),
  validateReturnExcel: (file) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/inventory/return-validate', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importReturnExcel: (file, warehouse_id) => {
    const fd = new FormData(); fd.append('file', file);
    if (warehouse_id) fd.append('warehouse_id', warehouse_id);
    return api.post('/inventory/return-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
export const purchases = {
  list: (params) => api.get('/purchases', { params }),
  create: (data) => api.post('/purchases', data),
  update: (id, data) => api.put(`/purchases/${id}`, data),
  delete: (id) => api.delete(`/purchases/${id}`),
};
const recipeApi = {
  listRecipes: () => api.get('/costs/recipes'),
  getRecipe: (id) => api.get(`/costs/recipes/${id}`),
  createRecipe: (data) => api.post('/costs/recipes', data),
  updateRecipe: (id, data) => api.put(`/costs/recipes/${id}`, data),
  deleteRecipe: (id) => api.delete(`/costs/recipes/${id}`),
  produceRecipe: (id, data) => api.post(`/costs/recipes/${id}/produce`, data),
  // عمليات الإنتاج
  listProductions: (params) => api.get('/costs/productions', { params }),
  reverseProduction: (movementId, data) => api.post(`/costs/productions/${movementId}/reverse`, data || {}),
};

export const recipes = recipeApi;
export const costs = recipeApi;
export const customers = {
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  statement: (id) => api.get(`/customers/${id}/statement`),
  recordPayment: (id, data) => api.post(`/customers/${id}/payment`, data),
  recordSalePayment: (saleId, data) => api.post(`/customers/sales/${saleId}/payment`, data),
};
export const expenses = {
  list: (params) => api.get('/expenses', { params }),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  categories: () => api.get('/expenses/categories'),
  report: (params) => api.get('/expenses/report', { params }),
};
export const suppliers = {
  list: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
};
export const invoices = {
  list: (params) => api.get('/invoices', { params }),
  get: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  updatePayment: (id, status) => api.patch(`/invoices/${id}/payment`, { status }),
  delete: (id) => api.delete(`/invoices/${id}`),
  downloadPdf: async (id) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/v1/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { message: err.message || 'فشل تحميل PDF' };
    }
    return res.blob();
  },
};
export const quotes = {
  template: (params) => api.get('/quotes/template', { params }),
  saveTemplate: (data) => api.put('/quotes/template', data),
  downloadPdf: (data) => api.post('/quotes/pdf', data, { responseType: 'blob' }),
};
export const users = {
  list: () => api.get('/users'),
  roles: () => api.get('/roles'),
  update: (id, data) => api.put(`/users/${id}`, data),
  settings: () => api.get('/settings'),
  updateSetting: (key, value) => api.put(`/settings/${key}`, { value }),
};
export const reports = (type, params) => api.get(`/reports/${type}`, { params });

export const pl = {
  monthly: (params) => api.get('/reports/pl/monthly', { params }),
  trend:   (months) => api.get('/reports/pl/trend', { params: { months } }),
};

export const backup = {
  create: () => api.get('/backup/create'),
  list: () => api.get('/backup/list'),
  download: (name) => api.get(`/backup/download/${name}`, { responseType: 'blob' }),
  restore: (name) => api.post('/backup/restore', { name, confirm: 'CONFIRM_RESTORE_BACKUP' }),
  restoreFile: (file) => {
    const fd = new FormData(); fd.append('file', file); fd.append('confirm', 'CONFIRM_RESTORE_BACKUP');
    return api.post('/backup/restore-file', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  clear: (body) => api.post('/backup/clear', body),
};


