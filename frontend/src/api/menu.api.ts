import api from './client';

export const menu = {
  list: () => api.get('/menus'),
  get: (id: number | string) => api.get(`/menus/${id}`),
  getActive: () => api.get('/menus/active'),
  getPublicActive: () => api.get('/menus/public/active'),
  getPublic: (id: number | string) => api.get(`/menus/public/${id}`),
  create: (data: any) => api.post('/menus', data),
  update: (id: number | string, data: any) => api.put(`/menus/${id}`, data),
  save: (data: any) => (data.id ? api.put(`/menus/${data.id}`, data) : api.post('/menus', data)),
  delete: (id: number | string) => api.delete(`/menus/${id}`),
  getAvailableProducts: () => api.get('/menus/products'),
};
