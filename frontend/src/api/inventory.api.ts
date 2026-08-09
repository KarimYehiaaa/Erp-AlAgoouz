import api from './index';

export const inventory = {
  list: (params?: any) => api.get('/inventory', { params }),
  movements: (params?: any) => api.get('/inventory/movements', { params }),
  transfer: (data: any) => api.post('/inventory/transfer', data),
  adjust: (data: any) => api.post('/inventory/adjust', data),
  clearAll: () => api.delete('/inventory', { data: { confirm: 'CONFIRM_CLEAR_INVENTORY' } }),
  warehouses: () => api.get('/warehouses'),
  downloadReturnTemplate: (warehouse_id?: number | string) =>
    api.get('/inventory/return-template', {
      params: warehouse_id ? { warehouse_id } : {},
      responseType: 'blob',
    }),
  validateReturnExcel: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/return-validate', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importReturnExcel: (file: File, warehouse_id?: number | string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (warehouse_id) fd.append('warehouse_id', String(warehouse_id));
    return api.post('/inventory/return-import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
