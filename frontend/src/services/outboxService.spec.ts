import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  localDb: {
    getOfflineSales: vi.fn(),
    updateOfflineSale: vi.fn(),
    deleteOfflineSale: vi.fn(),
  },
  createSale: vi.fn(),
}));

vi.mock('./localDb', () => ({ localDb: mocks.localDb }));
vi.mock('../api/sales.api', () => ({ sales: { create: mocks.createSale } }));

import { OutboxService } from './outboxService';
import { getApiCacheScope } from '../api/client';

const sale = {
  offline_id: 'offline-1',
  sync_id: '11111111-1111-4111-8111-111111111111',
  sale_number: 'PENDING-1',
  created_at: '2026-09-22T00:00:00.000Z',
  sync_status: 'PENDING' as const,
  retry_count: 0,
  origin_context: `${window.location.origin}::1`,
  sale_type: 'pos',
  warehouse_id: 2,
  items: [{ product_id: 10, quantity: 1, unit_price: 25 }],
};

describe('OutboxService offline/online synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    expect(getApiCacheScope()).toBe(sale.origin_context);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.localDb.updateOfflineSale.mockResolvedValue(true);
    mocks.localDb.deleteOfflineSale.mockResolvedValue(true);
  });

  it('does not send anything while the device is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.localDb.getOfflineSales.mockResolvedValue([sale]);

    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 0,
      failedCount: 0,
      remainingCount: 1,
      quarantinedCount: 0,
    });
    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it('replays a pending sale once with the stable idempotency key when online', async () => {
    mocks.localDb.getOfflineSales
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([]);
    mocks.createSale.mockResolvedValue({ data: { success: true } });

    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 1,
      failedCount: 0,
      remainingCount: 0,
      quarantinedCount: 0,
    });

    expect(mocks.createSale).toHaveBeenCalledTimes(1);
    const call = mocks.createSale.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    const [, requestConfig] = call;
    expect(requestConfig.headers['Idempotency-Key']).toBe(sale.sync_id);
    expect(requestConfig.headers['X-Idempotency-Key']).toBe(sale.sync_id);
    expect(mocks.localDb.deleteOfflineSale).toHaveBeenCalledWith(sale.offline_id);
  });

  it('quarantines invalid sales instead of retrying them forever', async () => {
    const invalidError = Object.assign(new Error('invalid sale'), { status: 400 });
    mocks.localDb.getOfflineSales
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([{ ...sale, sync_status: 'QUARANTINED' }]);
    mocks.createSale.mockRejectedValue(invalidError);

    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 0,
      quarantinedCount: 1,
    });
    expect(mocks.localDb.updateOfflineSale).toHaveBeenLastCalledWith(sale.offline_id, {
      sync_status: 'QUARANTINED',
      retry_count: 1,
      last_error: 'invalid sale',
    });
  });

  it('does NOT quarantine on 401 Unauthorized and pauses sync for re-auth', async () => {
    const authError = Object.assign(new Error('Session expired'), { status: 401 });
    mocks.localDb.getOfflineSales
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([{ ...sale, sync_status: 'FAILED' }]);
    mocks.createSale.mockRejectedValue(authError);

    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 1,
      quarantinedCount: 0,
    });
    expect(mocks.localDb.updateOfflineSale).toHaveBeenLastCalledWith(sale.offline_id, {
      sync_status: 'FAILED',
      retry_count: 1,
      last_error: 'انتهت صلاحية الجلسة (يرجى تسجيل الدخول مجدداً)',
    });
  });

  it('does NOT quarantine on 409 Conflict', async () => {
    const conflictError = Object.assign(new Error('Duplicate transaction'), { status: 409 });
    mocks.localDb.getOfflineSales
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([sale])
      .mockResolvedValueOnce([{ ...sale, sync_status: 'FAILED' }]);
    mocks.createSale.mockRejectedValue(conflictError);

    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 1,
      quarantinedCount: 0,
    });
    expect(mocks.localDb.updateOfflineSale).toHaveBeenLastCalledWith(sale.offline_id, {
      sync_status: 'FAILED',
      retry_count: 1,
      last_error: 'Duplicate transaction',
    });
  });

  it('preserves the whole queue on 403 and replays both sales with stable keys after permission recovery', async () => {
    let pending: Array<Omit<typeof sale, 'sync_status'> & { sync_status: string }> = [
      { ...sale },
      {
        ...sale,
        offline_id: 'offline-2',
        sync_id: '22222222-2222-4222-8222-222222222222',
        sale_number: 'PENDING-2',
      },
    ];
    mocks.localDb.getOfflineSales.mockImplementation(async () =>
      pending.map((row) => ({ ...row })),
    );
    mocks.localDb.updateOfflineSale.mockImplementation(async (id, changes) => {
      pending = pending.map((row) => (row.offline_id === id ? { ...row, ...changes } : row));
      return true;
    });
    mocks.localDb.deleteOfflineSale.mockImplementation(async (id) => {
      pending = pending.filter((row) => row.offline_id !== id);
      return true;
    });
    mocks.createSale.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), {
        response: { status: 403, data: { message: 'Permission temporarily unavailable' } },
      }),
    );

    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 2,
      quarantinedCount: 0,
    });
    expect(mocks.createSale).toHaveBeenCalledTimes(1);
    expect(mocks.localDb.deleteOfflineSale).not.toHaveBeenCalled();
    expect(pending.map((row) => row.sync_status)).toEqual(['FAILED', 'PENDING']);

    mocks.createSale.mockResolvedValue({ data: { success: true } });
    await expect(OutboxService.processOutbox()).resolves.toEqual({
      syncedCount: 2,
      failedCount: 0,
      remainingCount: 0,
      quarantinedCount: 0,
    });
    expect(
      mocks.createSale.mock.calls.map(([, request]) => request.headers['Idempotency-Key']),
    ).toEqual([sale.sync_id, sale.sync_id, '22222222-2222-4222-8222-222222222222']);
    expect(pending).toEqual([]);
  });

  it.each([
    { ...sale, origin_context: undefined },
    { ...sale, origin_context: `${window.location.origin}::2` },
    { ...sale, origin_context: 'https://other.example::1' },
  ])(
    'preserves foreign or unknown ownership without sending or consuming retries',
    async (record) => {
      mocks.localDb.getOfflineSales.mockResolvedValue([record]);
      const result = await OutboxService.processOutbox();
      expect(result.remainingCount).toBe(1);
      expect(mocks.createSale).not.toHaveBeenCalled();
      expect(mocks.localDb.updateOfflineSale).not.toHaveBeenCalled();
      expect(mocks.localDb.deleteOfflineSale).not.toHaveBeenCalled();
    },
  );

  it('stops before sending if the account changes during the local write', async () => {
    mocks.localDb.getOfflineSales.mockResolvedValue([sale]);
    mocks.localDb.updateOfflineSale.mockImplementationOnce(async () => {
      localStorage.setItem('user', JSON.stringify({ id: 2 }));
      return true;
    });
    await OutboxService.processOutbox();
    expect(mocks.createSale).not.toHaveBeenCalled();
    expect(mocks.localDb.deleteOfflineSale).not.toHaveBeenCalled();
  });
});
