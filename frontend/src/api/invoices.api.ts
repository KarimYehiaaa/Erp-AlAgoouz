import api from './index';

export const invoices = {
  list: (params?: any) => api.get('/invoices', { params }),
  get: (id: number | string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: number | string, data: any) => api.put(`/invoices/${id}`, data),

  delete: (id: number | string) => api.delete(`/invoices/${id}`),
  downloadPdf: async (id: number | string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw { message: err.message || 'فشل تحميل PDF' };
    }
    return res.blob();
  },
};
