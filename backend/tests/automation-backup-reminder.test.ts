import { beforeEach, expect, it, vi } from 'vitest';

const { query, listBackups } = vi.hoisted(() => ({ query: vi.fn(), listBackups: vi.fn() }));
vi.mock('../src/services/backupService.ts', () => ({ listBackups }));
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
  listBackups.mockReset();
  listBackups.mockResolvedValue([]);
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, key, is_enabled, config FROM automations')) {
      return { rows: [{ id: 1, key: 'daily_backup_reminder', is_enabled: true }] };
    }
    if (sql.includes('INSERT INTO automation_logs')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
});

it('does not claim a recent file is restorable without a restore verification', async () => {
  listBackups.mockResolvedValue([
    { name: 'isolated-recent.json', mtime: new Date().toISOString(), size: 1024 },
  ]);
  const result = await WorkflowGraphService.runAutomationNow('daily_backup_reminder');
  expect(result.success).toBe(true);
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('isolated-recent.json');
  expect(result.payload?.notificationText).toContain('لم يتم التحقق');
  expect(result.payload?.notificationText).not.toContain('حديثة قابلة للاستعادة');
});

it('warns about a stale backup file', async () => {
  listBackups.mockResolvedValue([
    { name: 'isolated-stale.json', mtime: '2000-01-01T00:00:00Z', size: 1024 },
  ]);
  const result = await WorkflowGraphService.runAutomationNow('daily_backup_reminder');
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('قديمة');
});

it('preserves a warning when backup storage cannot be inspected', async () => {
  listBackups.mockRejectedValue(new Error('Isolated storage unavailable'));
  const result = await WorkflowGraphService.runAutomationNow('daily_backup_reminder');
  expect(result.success).toBe(true);
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('لم يتم التحقق');
});

it('reminds the operator that backup health is unverified rather than reporting success', async () => {
  const result = await WorkflowGraphService.runAutomationNow('daily_backup_reminder');
  expect(result.success).toBe(true);
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('لم يتم التحقق');
  expect(result.payload?.notificationText).not.toContain('مُجدول ونشط');
});
