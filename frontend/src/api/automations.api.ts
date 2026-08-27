/**
 * api/automations.api.ts — عميل API لمركز الأتمتة والتنبيهات الذكية
 * ═════════════════════════════════════════════════════════════════
 */

import api from './client';

export const automations = {
  list: () => api.get('/automations'),
  /** خريطة شبكة الأتمتة الحية (عقد + روابط + حالة تليجرام) — مصدر اللوحة 3D */
  graph: () => api.get('/automations/graph'),
  get: (id: number | string) => api.get(`/automations/${id}`),
  update: (id: number | string, data: any) => api.put(`/automations/${id}`, data),
  trigger: (id: number | string, data: any = {}) => api.post(`/automations/${id}/trigger`, data),
  testTelegram: (payload: { botToken?: string; chatId?: string }) =>
    api.post('/automations/test-telegram', payload),
  getLogs: (params: { limit?: number; offset?: number; automation_id?: number } = {}) =>
    api.get('/automations/logs', { params }),
};

export default automations;
