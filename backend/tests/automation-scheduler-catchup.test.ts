import { beforeEach, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
let claimAllowed = true;
let taskLastRunAt: string | null = null;
let taskLastStatus: string | null = null;
let scheduledTasks: Array<Record<string, unknown>> = [];
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

import { tickDueAutomations } from '../src/services/automationSchedulerService.ts';

beforeEach(() => {
  claimAllowed = true;
  taskLastRunAt = null;
  taskLastStatus = null;
  scheduledTasks = [{ key: 'daily_backup_reminder', cron_expression: '0 3 * * *' }];
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT key, cron_expression, last_run_at')) {
      return {
        rows: scheduledTasks.map((task) => ({
          ...task,
          last_run_at: taskLastRunAt,
          last_status: taskLastStatus,
        })),
      };
    }
    if (sql.includes('SELECT id, key, is_enabled, config FROM automations')) {
      return { rows: [{ id: 1, key: scheduledTasks[0].key, is_enabled: true }] };
    }
    if (sql.includes("last_status = 'running'")) {
      return { rows: claimAllowed ? [{ key: 'daily_backup_reminder' }] : [] };
    }
    if (sql.includes('INSERT INTO automation_logs')) return { rows: [{ id: 1 }] };
    if (sql.includes('FROM sales') && sql.includes('invoice_count')) {
      return { rows: [{ invoice_count: 0, net_revenue: 0, total_profit: 0 }] };
    }
    if (sql.includes('FROM expenses')) return { rows: [{ total_expenses: 0 }] };
    return { rows: [] };
  });
});

it('runs a scheduled task after its Cairo minute was missed by the external trigger', async () => {
  // 03:35 Cairo: the 03:00 backup check was missed but is still due.
  const result = await tickDueAutomations(new Date('2026-09-23T00:35:00.000Z'));
  expect(result).toEqual({ skipped: false, executed: 1, failed: 0 });
});

it('does not rerun a due task when another scheduler already claimed it', async () => {
  claimAllowed = false;
  const result = await tickDueAutomations(new Date('2026-09-23T00:35:00.000Z'));
  expect(result).toEqual({ skipped: false, executed: 0, failed: 0 });
});

it('retries a stale running claim after the serverless execution window has passed', async () => {
  taskLastRunAt = '2026-09-23T00:05:00.000Z';
  taskLastStatus = 'running';
  const result = await tickDueAutomations(new Date('2026-09-23T00:35:00.000Z'));
  expect(result).toEqual({ skipped: false, executed: 1, failed: 0 });
});

it('sends only one daily report when the old summary key and canonical key are both enabled', async () => {
  scheduledTasks = [
    { key: 'daily_sales_report', cron_expression: '30 23 * * *' },
    { key: 'daily_summary_report', cron_expression: '30 23 * * *' },
  ];
  const result = await tickDueAutomations(new Date('2026-09-22T20:35:00.000Z'));
  expect(result).toEqual({ skipped: false, executed: 1, failed: 0 });
});
