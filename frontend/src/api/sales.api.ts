import api from './client';

export const sales = {
  list: (params?: any) => api.get('/sales', { params }),
  summary: (params?: any) => api.get('/sales/summary', { params }),
  openingBalance: (params?: any) => api.get('/sales/opening-balance', { params }),
  saveOpeningBalance: (data: any) => api.put('/sales/opening-balance', data),
  get: (id: number | string) => api.get(`/sales/${id}`),
  create: (data: any, config?: any) => api.post('/sales', data, config),
  update: (id: number | string, data: any) => api.put(`/sales/${id}`, data),
  return: (id: number | string, data: any) => api.post(`/sales/${id}/return`, data),
  deleteAll: () => api.delete('/sales', { data: { confirm: 'CONFIRM_DELETE_ALL_SALES' } }),
  deleteByDate: (saleDate: string) =>
    api.delete(`/sales/date/${saleDate}`, { data: { confirm: 'CONFIRM_DELETE_SALES_DATE' } }),
  deleteByType: (saleType: string) =>
    api.delete(`/sales/type/${saleType}`, { data: { confirm: 'CONFIRM_DELETE_SALES_TYPE' } }),
  downloadTemplate: async () => {
    const res = await api.get('/sales/template', { responseType: 'blob' });
    return res instanceof Blob ? res : res.data;
  },
  downloadPosTemplate: async () => {
    const res = await api.get('/sales/retail/template', { responseType: 'blob' });
    return res instanceof Blob ? res : res.data;
  },
  importExcel: (file: File, options: any = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (options.confirm) form.append('confirm', options.confirm);
    return api.post('/sales/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  validateExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/sales/import/validate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  posImportExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/sales/retail/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  posValidateExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/sales/retail/validate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
