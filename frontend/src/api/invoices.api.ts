import api, { getBlob } from './client';

export const invoices = {
  list: (params?: any) => api.get('/invoices', { params }),
  get: (id: number | string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: number | string, data: any) => api.put(`/invoices/${id}`, data),

  delete: (id: number | string) => api.delete(`/invoices/${id}`),
  downloadPdf: (id: number | string) => getBlob(`/invoices/${encodeURIComponent(String(id))}/pdf`),
};
