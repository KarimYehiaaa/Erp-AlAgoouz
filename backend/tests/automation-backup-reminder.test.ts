import { beforeEach, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({
  query,
  checkHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
}));
vi.mock('../src/services/telegramBotService.ts', () => ({
  default: { getBotCredentials: vi.fn().mockResolvedValue({ token: '', defaultChatId: '' }) },
}));
vi.mock('../src/services/telegramService.ts', () => ({
  default: { sendMessage: vi.fn() },
}));

import { WorkflowGraphService } from '../src/services/workflowGraphService.ts';

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, key, is_enabled FROM automations')) {
      return { rows: [{ id: 1, key: 'daily_backup_reminder', is_enabled: true }] };
    }
    if (sql.includes('INSERT INTO automation_logs')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
});

it('reminds the operator that backup health is unverified rather than reporting success', async () => {
  const result = await WorkflowGraphService.runAutomationNow('daily_backup_reminder');
  expect(result.success).toBe(true);
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('لم يتم التحقق');
  expect(result.payload?.notificationText).not.toContain('مُجدول ونشط');
});
