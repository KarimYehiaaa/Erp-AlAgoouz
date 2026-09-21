/**
 * api/automation.api.ts — طبقة استدعاءات محرك الأتمتة والرسم البياني التفاعلي
 */

import { get, post, put, del } from './client';

export interface GraphNode {
  id: number;
  type: 'agent' | 'trigger' | 'action';
  label: string;
  label_ar: string | null;
  group: string;
  group_name?: string;
  position_x?: number;
  position_y?: number;
  settings: Record<string, any>;
  x: number;
  y: number;
  is_active: boolean;
}

export interface GraphEdge {
  id: number;
  source: number;
  target: number;
  condition: string | null;
  label: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PhysicsSettings {
  repelForce: number;
  linkDistance: number;
  collisionRadius: number;
  centerForceX: number;
  centerForceY: number;
}

export interface TelegramLogEntry {
  id: number;
  chat_id: string;
  direction: 'in' | 'out';
  message: string;
  ai_response: string | null;
  automation_key: string | null;
  created_at: string;
}

export interface AutomationTask {
  id: number;
  key: string;
  name_ar: string;
  description_ar: string;
  category: string;
  trigger_type: string;
  cron_expression: string | null;
  is_enabled: boolean;
  channels: Record<string, any>;
  config: Record<string, any>;
  last_run_at: string | null;
  last_status: 'success' | 'failed' | 'warning' | null;
}

export interface AutomationExecutionLog {
  id: number;
  execution_id: string | null;
  key: string | null;
  name_ar: string | null;
  event_name: string;
  status: 'running' | 'success' | 'failed' | 'warning';
  title: string;
  message: string;
  trigger_source: string;
  attempt: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export const automation = {
  // ─── الرسم البياني ──────────────────────────
  getGraph: () => get<GraphData>('/automation/graph'),

  // ─── العقد ──────────────────────────────────
  getNodes: () => get('/automation/nodes'),
  createNode: (data: Partial<GraphNode>) => post('/automation/nodes', data),
  updateNode: (id: number, data: Partial<GraphNode>) => put(`/automation/nodes/${id}`, data),
  deleteNode: (id: number) => del(`/automation/nodes/${id}`),
  updateNodePositions: (positions: Array<{ id: number; x: number; y: number }>) =>
    put('/automation/nodes/positions', { positions }),

  // ─── الروابط ────────────────────────────────
  createEdge: (data: {
    source_node_id: number;
    target_node_id: number;
    condition?: string;
    label?: string;
  }) => post('/automation/edges', data),
  deleteEdge: (id: number) => del(`/automation/edges/${id}`),

  // ─── الفيزياء ───────────────────────────────
  getPhysics: () => get<PhysicsSettings>('/automation/physics'),
  updatePhysics: (data: Partial<PhysicsSettings>) =>
    put<PhysicsSettings>('/automation/physics', data),

  // ─── تليجرام ────────────────────────────────
  getTelegramLogs: (params?: { limit?: number; offset?: number }) =>
    get<{ logs: TelegramLogEntry[]; total: number }>('/automation/telegram-logs', { params }),
  toggleTelegramBot: (enabled: boolean) =>
    post<{ active: boolean }>('/automation/telegram/toggle', { enabled }),
  getTelegramBotStatus: () =>
    get<{ isPolling: boolean; hasToken: boolean; hasDefaultChatId: boolean }>(
      '/automation/telegram/status',
    ),
  sendTestMessage: (message?: string) => post('/automation/telegram/test-send', { message }),
  resetGraphDefaults: () => post<GraphData>('/automation/graph/reset-defaults'),
  testAiPrompt: (prompt: string) => post<{ reply: string }>('/automation/ai/test', { prompt }),

  // ─── مهام الأتمتة الحية ──────────────────────
  getTasks: () => get<AutomationTask[]>('/automation/tasks'),
  getExecutionLogs: (params?: { limit?: number; offset?: number }) =>
    get<{ logs: AutomationExecutionLog[]; total: number }>('/automation/execution-logs', {
      params,
    }),
  toggleTask: (key: string, is_enabled: boolean) =>
    post(`/automation/tasks/${key}/toggle`, { is_enabled }),
  runTaskNow: (key: string) =>
    post<{ success: boolean; message: string; payload?: any }>(`/automation/tasks/${key}/run`),
};
