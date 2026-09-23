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
  query.mockImplementation(async (sql: string, params?: string[]) => {
    if (sql.includes('SELECT id, key, is_enabled, config FROM automations')) {
      return {
        rows: [
          {
            id: 7,
            key: params?.[0],
            is_enabled: true,
            config: { days_before_due: 3, min_target_margin_pct: 28 },
          },
        ],
      };
    }
    if (sql.includes('INSERT INTO automation_logs')) return { rows: [{ id: 1 }] };
    if (sql.includes('FROM supplier_invoices')) {
      return {
        rows: [
          {
            invoice_number: 'PUR-100',
            supplier_name: 'مورد الاختبار',
            due_date: '2026-09-24',
            outstanding: '1200.00',
            days_until_due: 2,
          },
        ],
      };
    }
    if (sql.includes('FROM sales') && sql.includes('margin_pct')) {
      return {
        rows: [
          {
            invoice_count: 3,
            total_sales: '1000.00',
            gross_profit: '210.00',
            margin_pct: '21.00',
          },
        ],
      };
    }
    return { rows: [] };
  });
});

it('alerts on unpaid supplier invoices due within the configured window', async () => {
  const result = await WorkflowGraphService.runAutomationNow('supplier_payment_due_alert', {
    scheduledFor: new Date('2026-09-22T21:00:00.000Z'),
  });
  expect(result.success, result.message).toBe(true);
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('PUR-100');
  expect(result.payload?.notificationText).toContain('١٬٢٠٠');
});

it('flags a daily gross margin below the configured target', async () => {
  const result = await WorkflowGraphService.runAutomationNow('daily_profit_margin_anomaly', {
    scheduledFor: new Date('2026-09-22T20:30:00.000Z'),
  });
  expect(result.success, result.message).toBe(true);
  expect(result.payload?.status).toBe('warning');
  expect(result.payload?.notificationText).toContain('2026-09-22');
  expect(result.payload?.notificationText).toContain('٢١٫٠%');
});
