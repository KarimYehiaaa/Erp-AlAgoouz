import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import api, { getApiCacheScope, setSessionAccessToken } from '../api/client';
import type { LocalOfflineSale } from './localDb';
import { OutboxService } from './outboxService';

const storage = vi.hoisted(() => ({
  getOfflineSales: vi.fn(),
  updateOfflineSale: vi.fn(),
  deleteOfflineSale: vi.fn(),
}));
vi.mock('./localDb', () => ({ localDb: storage }));

const originalAdapter = api.defaults.adapter;
let rows: LocalOfflineSale[];
let attempts: { authorization: string; key: string; payload: string }[];
const replaceLocation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 1 }));
  setSessionAccessToken('old-token');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  const browserWindow = window;
  const location = {
    origin: browserWindow.location.origin,
    protocol: browserWindow.location.protocol,
    pathname: browserWindow.location.pathname,
    replace: replaceLocation,
  };
  vi.stubGlobal(
    'window',
    new Proxy(browserWindow, {
      get(target, property) {
        return property === 'location' ? location : Reflect.get(target, property, target);
      },
    }),
  );
  rows = [
    {
      offline_id: 'offline-auth-recovery',
      sync_id: '11111111-1111-4111-8111-111111111111',
      sale_number: 'PENDING-AUTH',
      created_at: '2026-10-07T00:00:00.000Z',
      sync_status: 'PENDING',
      origin_context: getApiCacheScope(),
      sale_type: 'pos',
      warehouse_id: 2,
      items: [{ product_id: 10, quantity: 1, unit_price: 25 }],
    },
  ];
  attempts = [];
  storage.getOfflineSales.mockImplementation(async () => structuredClone(rows));
  storage.updateOfflineSale.mockImplementation(async (id, changes) => {
    const row = rows.find((item) => item.offline_id === id);
    if (!row) return false;
    Object.assign(row, changes);
    return true;
  });
  storage.deleteOfflineSale.mockImplementation(async (id) => {
    rows = rows.filter((item) => item.offline_id !== id);
    return true;
  });
  // Execute the real sales module and Axios interceptors, isolating only transport.
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    expect(config.url).toBe('/sales');
    attempts.push({
      authorization: String(config.headers.get('Authorization')),
      key: String(config.headers.get('Idempotency-Key')),
      payload: config.data,
    });
    if (attempts.length === 1) {
      expect(storage.deleteOfflineSale).not.toHaveBeenCalled();
      throw new AxiosError('Expired session', 'ERR_BAD_REQUEST', config, undefined, {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: {},
      });
    }
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { success: true, data: { id: 100 } },
    };
  };
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  setSessionAccessToken(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('refreshes a 401 and acknowledges the queued sale once with the same payload and idempotency key', async () => {
  const refresh = vi.spyOn(axios, 'post').mockImplementation(async () => {
    expect(storage.deleteOfflineSale).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    return { data: { data: { token: 'new-token' } } };
  });
  expect(await OutboxService.processOutbox()).toEqual({
    syncedCount: 1,
    failedCount: 0,
    remainingCount: 0,
    quarantinedCount: 0,
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(attempts.map((attempt) => attempt.authorization)).toEqual([
    'Bearer old-token',
    'Bearer new-token',
  ]);
  expect(attempts.map((attempt) => attempt.key)).toEqual([
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
  ]);
  expect(attempts[0]?.payload).toBe(attempts[1]?.payload);
  expect(storage.deleteOfflineSale).toHaveBeenCalledExactlyOnceWith('offline-auth-recovery');
  expect(rows).toEqual([]);
});

it('preserves a sale when refresh fails and syncs it after the same owner signs in again', async () => {
  const refresh = vi.spyOn(axios, 'post').mockRejectedValue(new Error('Refresh rejected'));
  const before = structuredClone(rows[0]);
  const first = await OutboxService.processOutbox();
  expect(first.syncedCount).toBe(0);
  expect(first.remainingCount).toBe(1);
  expect(first.quarantinedCount).toBe(0);
  expect(storage.deleteOfflineSale).not.toHaveBeenCalled();
  expect(rows[0]).toMatchObject({
    sync_id: before?.sync_id,
    items: before?.items,
    origin_context: before?.origin_context,
  });
  expect(localStorage.getItem('user')).toBeNull();
  expect(replaceLocation).toHaveBeenCalledExactlyOnceWith('/login');
  localStorage.setItem('user', JSON.stringify({ id: 1 }));
  setSessionAccessToken('signed-in-again');
  expect(await OutboxService.processOutbox()).toEqual({
    syncedCount: 1,
    failedCount: 0,
    remainingCount: 0,
    quarantinedCount: 0,
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(attempts[1]).toMatchObject({
    authorization: 'Bearer signed-in-again',
    key: before?.sync_id,
    payload: attempts[0]?.payload,
  });
  expect(storage.deleteOfflineSale).toHaveBeenCalledOnce();
});
