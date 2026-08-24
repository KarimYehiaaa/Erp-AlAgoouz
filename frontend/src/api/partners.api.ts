import api from './client';

export const partnersApi = {
  // الشركاء
  list: () => api.get('/partners'),
  get: (id: number | string) => api.get(`/partners/${id}`),
  create: (data: any) => api.post('/partners', data),
  update: (id: number | string, data: any) => api.put(`/partners/${id}`, data),
  delete: (id: number | string) => api.delete(`/partners/${id}`),

  // مسحوبات الشركاء
  listDrawings: (params?: any) => api.get('/partners/drawings', { params }),
  createDrawing: (data: any) => api.post('/partners/drawings', data),
  deleteDrawing: (id: number | string) => api.delete(`/partners/drawings/${id}`),

  // تسوية وتوزيع الأرباح
  getSettlement: (params: { from_date: string; to_date: string }) =>
    api.get('/partners/settlement', { params }),
};
