import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  credentials: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  close: vi.fn(),
  dispatcher: vi.fn(),
}));
vi.mock('../src/database/pool.ts', () => ({ query: state.query }));
vi.mock('../src/services/telegramBotService.ts', () => ({
  default: { getBotCredentials: state.credentials },
}));
vi.mock('../src/services/loggerService.ts', () => ({
  default: { warn: state.loggerWarn, error: state.loggerError },
}));
vi.mock('../src/utils/urlValidator.ts', () => ({
  createPublicWebhookDispatcher: state.dispatcher,
}));
import { sendAlert } from '../src/services/notificationService.ts';
import TelegramService from '../src/services/telegramService.ts';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.clearAllMocks();
  state.query.mockResolvedValue({ rows: [], rowCount: 1 });
  state.credentials.mockResolvedValue({ token: '', defaultChatId: '' });
  state.close.mockResolvedValue(undefined);
  state.dispatcher.mockResolvedValue({ close: state.close });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ALERT_DISCORD_WEBHOOK_URL', '');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  vi.stubEnv('TELEGRAM_CHAT_ID', '');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('notification receipts and transport safety', () => {
  it('reports an internal-only notification as persisted without making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendAlert('fixture', 'private-fixture-message')).toMatchObject({
      success: true,
      persisted: true,
      discord: 'disabled',
      telegram: 'disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports persistence failure without leaking the database error', async () => {
    state.query.mockRejectedValue(new Error('private-fixture-database-secret'));
    expect(await sendAlert('fixture', 'fixture')).toMatchObject({
      success: false,
      persisted: false,
    });
    expect(JSON.stringify(state.loggerWarn.mock.calls)).not.toContain(
      'private-fixture-database-secret',
    );
  });

  it('confirms Discord delivery, preserves thread parameters and closes its pinned dispatcher', async () => {
    vi.stubEnv(
      'ALERT_DISCORD_WEBHOOK_URL',
      'https://discord.com/api/webhooks/123/fixture?thread_id=456',
    );
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'fixture-message-id' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendAlert('fixture', 'fixture')).toMatchObject({
      success: true,
      discord: 'delivered',
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get('wait')).toBe('true');
    expect(new URL(url).searchParams.get('thread_id')).toBe('456');
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.dispatcher).toBeDefined();
    expect(state.close).toHaveBeenCalledOnce();
  });

  it.each([json({}), json({ error: 'private-fixture-provider-secret' }, 403)])(
    'reports an unconfirmed Discord send as failure',
    async (response) => {
      vi.stubEnv('ALERT_DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/123/fixture');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(await sendAlert('fixture', 'fixture')).toMatchObject({
        success: false,
        discord: 'failed',
      });
      expect(state.close).toHaveBeenCalledOnce();
      expect(
        JSON.stringify([...state.loggerWarn.mock.calls, ...state.loggerError.mock.calls]),
      ).not.toContain('private-fixture-provider-secret');
    },
  );

  it('tries Telegram after Discord fails and records each result', async () => {
    vi.stubEnv('ALERT_DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/123/fixture');
    state.credentials.mockResolvedValue({
      token: '123456:fixture_only_token',
      defaultChatId: 'fixture-chat',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({ ok: true, result: { message_id: 10 } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendAlert('fixture', 'fixture')).toMatchObject({
      success: false,
      persisted: true,
      discord: 'failed',
      telegram: 'delivered',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal).toBe(fetchMock.mock.calls[1][1].signal);
  });

  it.each([{ ok: false }, { ok: true }, { ok: true, result: { message_id: 'bad-id' } }])(
    'rejects an unconfirmed Telegram response %j',
    async (data) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(data)));
      expect(
        await TelegramService.sendMessage('fixture', {
          botToken: '123456:fixture_only_token',
          chatId: 'fixture-chat',
        }),
      ).toMatchObject({ success: false });
    },
  );

  it('sanitizes Telegram transport exceptions containing a token or chat data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private-fixture-token-in-request')),
    );
    const result = await TelegramService.sendMessage('fixture', {
      botToken: '123456:fixture_only_token',
      chatId: 'fixture-chat',
    });
    expect(result).toMatchObject({ success: false });
    expect(result.error).not.toContain('private-fixture-token-in-request');
  });

  it('rejects malformed Telegram tokens before constructing a credential-bearing URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await TelegramService.sendMessage('fixture', {
        botToken: 'bad/token?fixture',
        chatId: 'fixture-chat',
      }),
    ).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('test mode preserves internal notifications while refusing configured external sends', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('ALERT_DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/123/fixture');
    state.credentials.mockResolvedValue({
      token: '123456:fixture_only_token',
      defaultChatId: 'fixture-chat',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ ok: true, result: { message_id: 1 }, id: 'fixture-id' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendAlert('fixture', 'fixture')).toMatchObject({
      persisted: true,
      success: false,
      discord: 'skipped',
      telegram: 'skipped',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (
        await TelegramService.sendMessage('fixture', {
          botToken: '123456:fixture_only_token',
          chatId: 'fixture-chat',
        })
      ).success,
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
