import { beforeEach, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query }));
vi.mock('../src/services/telegramBotService.ts', () => ({
  default: { getBotCredentials: vi.fn().mockResolvedValue({ token: '', defaultChatId: '' }) },
}));
vi.mock('../src/services/telegramService.ts', () => ({
  default: { sendMessage: vi.fn() },
}));

import { WorkflowGraphService } from '../src/services/workflowGraphService.ts';

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('SELECT id, key, is_enabled FROM automations')) {
      return { rows: [{ id: 1, key: 'daily_sales_report', is_enabled: true }] };
    }
    if (sql.includes('INSERT INTO automation_logs')) return { rows: [{ id: 1 }] };
    if (sql.includes('FROM sales') && sql.includes('invoice_count')) {
      return {
        rows: [
          params?.[0] === '2026-09-22'
            ? { invoice_count: 2, net_revenue: 100, total_profit: 40 }
            : { invoice_count: 0, net_revenue: 0, total_profit: 0 },
        ],
      };
    }
    if (sql.includes('FROM expenses')) return { rows: [{ total_expenses: 20 }] };
    if (sql.includes('FROM sale_items')) return { rows: [] };
    return { rows: [] };
  });
});

it('reports the scheduled Cairo business day and recorded gross profit after a late tick', async () => {
  const result = await WorkflowGraphService.runAutomationNow('daily_sales_report', {
    scheduledFor: new Date('2026-09-22T20:30:00.000Z'),
  });
  expect(result.success).toBe(true);
  expect(result.payload?.notificationText).toContain('2026-09-22');
  expect(result.payload?.notificationText).toContain('١٠٠');
  expect(result.payload?.notificationText).toContain('٤٠');
  expect(result.payload?.notificationText).not.toContain('صافي الربح التقديري');
});
