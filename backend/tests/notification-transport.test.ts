import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ close: vi.fn(), credentials: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({
  query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
}));
vi.mock('../src/services/telegramBotService.ts', () => ({
  default: { getBotCredentials: state.credentials },
}));
vi.mock('../src/services/loggerService.ts', () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/utils/urlValidator.ts', () => ({
  createPublicWebhookDispatcher: vi.fn(async () => ({ close: state.close })),
}));
import { sendAlert, NOTIFICATION_TIMEOUT_MS } from '../src/services/notificationService.ts';

const nativeFetch = globalThis.fetch;
const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
const servers: http.Server[] = [];
async function fixture(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.close.mockResolvedValue(undefined);
  state.credentials.mockResolvedValue({ token: '', defaultChatId: '' });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ALERT_DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/123/fixture_only');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});
function routeToFixture(base: string) {
  vi.stubGlobal('fetch', (url: string, options: NonNullable<Parameters<typeof fetch>[1]>) => {
    const parsed = new URL(url);
    expect(['discord.com', 'api.telegram.org']).toContain(parsed.hostname);
    // Fake provider boundary; only dummy content reaches this loopback server.
    return nativeFetch(`${base}/${parsed.hostname === 'discord.com' ? 'discord' : 'telegram'}`, {
      ...options,
      dispatcher: undefined,
    } as Parameters<typeof fetch>[1]);
  });
}

describe('real loopback notification response handling', () => {
  it.each(['headers', 'body'])(
    'reports a Discord stalled at %s as failed and releases its dispatcher',
    async (stage) => {
      let arrived = false;
      const base = await fixture((_request, response) => {
        arrived = true;
        if (stage === 'body') {
          response.writeHead(200);
          response.flushHeaders();
          response.write('{"id":');
        }
      });
      routeToFixture(base);
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
        expect(ms).toBe(NOTIFICATION_TIMEOUT_MS);
        return nativeTimeout(500);
      });
      expect(await sendAlert('fixture', 'private-fixture-message')).toMatchObject({
        persisted: true,
        success: false,
        discord: 'failed',
      });
      expect(arrived).toBe(true);
      expect(timeout).toHaveBeenCalledOnce();
      expect(state.close).toHaveBeenCalledOnce();
    },
  );

  it('refuses a redirect before any payload reaches the redirect destination', async () => {
    let leaked = false;
    const base = await fixture((request, response) => {
      if (request.url === '/discord') {
        response.writeHead(307, { Location: '/leak' });
        response.end();
      } else {
        leaked = true;
        response.end('{"id":"fixture-id"}');
      }
    });
    routeToFixture(base);
    expect(await sendAlert('fixture', 'private-fixture-message')).toMatchObject({
      success: false,
      discord: 'failed',
    });
    expect(leaked).toBe(false);
    expect(state.close).toHaveBeenCalledOnce();
  });

  it('records both confirmed receipts when both provider HTTP calls actually complete', async () => {
    const paths: string[] = [];
    const base = await fixture((request, response) => {
      paths.push(request.url!);
      response.end(
        request.url === '/discord'
          ? '{"id":"fixture-id"}'
          : '{"ok":true,"result":{"message_id":11}}',
      );
    });
    state.credentials.mockResolvedValue({
      token: '123456:fixture_only_token',
      defaultChatId: 'fixture-chat',
    });
    routeToFixture(base);
    expect(await sendAlert('fixture', 'fixture')).toMatchObject({
      success: true,
      discord: 'delivered',
      telegram: 'delivered',
    });
    expect(paths).toEqual(['/discord', '/telegram']);
    expect(state.close).toHaveBeenCalledOnce();
  });
});
