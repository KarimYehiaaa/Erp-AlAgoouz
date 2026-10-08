import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  query: vi.fn(),
  telegram: vi.fn(),
  channels: { in_app: true, telegram: true },
}));
vi.mock('../src/database/pool.ts', () => ({ query: state.query }));
vi.mock('../src/database/maintenanceBarrier.ts', () => ({
  runSharedMaintenanceTask: (task: () => unknown) => task(),
}));
vi.mock('../src/services/telegramBotService.ts', () => ({
  default: {
    getBotCredentials: vi
      .fn()
      .mockResolvedValue({ token: '123456:fixture_only_token', defaultChatId: 'fixture-chat' }),
  },
}));
vi.mock('../src/services/telegramService.ts', () => ({ default: { sendMessage: state.telegram } }));
vi.mock('../src/services/automationHandlers.ts', () => ({
  AUTOMATION_HANDLERS: {
    daily_sales_report: vi
      .fn()
      .mockResolvedValue({ title: 'fixture report', text: 'fixture message', status: 'success' }),
  },
}));
import WorkflowGraphService from '../src/services/workflowGraphService.ts';

beforeEach(() => {
  vi.clearAllMocks();
  state.channels = { in_app: true, telegram: true };
  state.telegram.mockResolvedValue({ success: true, messageId: 1 });
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, key, is_enabled, config FROM automations'))
      return { rows: [{ id: 1, key: 'daily_sales_report', is_enabled: true }] };
    if (sql.includes('SELECT channels FROM automations'))
      return { rows: [{ channels: state.channels }] };
    if (sql.includes('INSERT INTO automation_logs')) return { rows: [{ id: 1 }] };
    return { rows: [], rowCount: 1 };
  });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ALERT_DISCORD_WEBHOOK_URL', '');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{"ok":true,"result":{"message_id":1}}')),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('an in-app report stores one internal notification and sends Telegram only through its selected channel', async () => {
  const result = await WorkflowGraphService.runAutomationNow('daily_sales_report');
  expect(result.success).toBe(true);
  expect(result.payload.inAppNotificationSent).toBe(true);
  expect(
    state.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO notifications')),
  ).toHaveLength(1);
  expect(state.telegram).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

it('a failed in-app write is not recorded as a successfully delivered notification', async () => {
  const original = state.query.getMockImplementation()!;
  state.query.mockImplementation((sql: string) => {
    if (sql.includes('INSERT INTO notifications'))
      throw new Error('private-fixture-database-secret');
    return original(sql);
  });
  const result = await WorkflowGraphService.runAutomationNow('daily_sales_report');
  expect(result.payload.inAppNotificationSent).toBe(false);
  expect(result.payload.status).toBe('warning');
  expect(JSON.stringify(result)).not.toContain('private-fixture-database-secret');
  expect(state.telegram).toHaveBeenCalledOnce();
});

it('does not send or log a Telegram message when the task disables the channel', async () => {
  state.channels.telegram = false;
  const result = await WorkflowGraphService.runAutomationNow('daily_sales_report');
  expect(result.success).toBe(true);
  expect(result.payload.inAppNotificationSent).toBe(true);
  expect(result.payload.notificationSent).toBe(false);
  expect(state.telegram).not.toHaveBeenCalled();
  expect(state.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO telegram_logs'))).toBe(
    false,
  );
});
