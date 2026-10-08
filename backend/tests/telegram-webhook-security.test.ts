import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

const mocks = vi.hoisted(() => ({ handleIncomingMessage: vi.fn() }));

vi.mock('../src/services/telegramBotService.ts', () => ({
  default: { handleIncomingMessage: mocks.handleIncomingMessage },
}));

import telegramRoutes from '../src/routes/telegram.routes.ts';

describe('Telegram webhook authentication', () => {
  let server: Server;
  let baseUrl: string;
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1', telegramRoutes);
    app.use('/api', telegramRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind TCP');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-test-secret_1234567890abcdef';
    mocks.handleIncomingMessage.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
  });

  it('rejects a webhook when no secret is configured without processing its message', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = await fetch(`${baseUrl}/api/v1/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: 123 }, text: '/sales' } }),
    });

    expect(response.status).toBe(503);
    expect(mocks.handleIncomingMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/v1/telegram/webhook', undefined],
    ['/api/v1/telegram/webhook', 'incorrect-secret'],
    ['/api/telegram/webhook', undefined],
    ['/api/telegram/webhook', 'incorrect-secret'],
  ])('rejects a request with a missing or incorrect token at %s', async (path, token) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['X-Telegram-Bot-Api-Secret-Token'] = token;
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: { chat: { id: 123 }, text: '/sales' } }),
    });

    expect(response.status).toBe(403);
    expect(mocks.handleIncomingMessage).not.toHaveBeenCalled();
  });

  it('fails closed when the configured token is not valid for Telegram webhook secrets', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'not a valid token';

    const response = await fetch(`${baseUrl}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'not a valid token',
      },
      body: JSON.stringify({ message: { chat: { id: 123 }, text: '/sales' } }),
    });

    expect(response.status).toBe(503);
    expect(mocks.handleIncomingMessage).not.toHaveBeenCalled();
  });

  it('processes the message only when Telegram supplies the configured secret header', async () => {
    const message = { chat: { id: 123 }, text: '/sales' };
    const response = await fetch(`${baseUrl}/api/v1/telegram/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-test-secret_1234567890abcdef',
      },
      body: JSON.stringify({ message }),
    });

    expect(response.status).toBe(200);
    expect(mocks.handleIncomingMessage).toHaveBeenCalledExactlyOnceWith(message);
  });
});
