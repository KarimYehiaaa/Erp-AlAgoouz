import { afterEach, describe, expect, it, vi } from 'vitest';
import { PosSyncWorker } from '../electron/sync/syncWorker';

const server = 'http://localhost:3000/api/v1';
const token = (userId = 1) =>
  `test.${Buffer.from(JSON.stringify({ userId })).toString('base64url')}.signature`;
const record = (id: number, itemCount = 1) => ({
  sync_id: `invoice-${id}`,
  origin_server: server,
  origin_user_id: 1,
  status: 'PENDING',
  retry_count: 0,
  items: Array.from({ length: itemCount }, () => ({ product_id: 1, quantity: 1, unit_price: 5 })),
});
const setup = (queue: ReturnType<typeof record>[]) => {
  const update = vi.fn((id: string, status: string) => {
    const item = queue.find((item) => item.sync_id === id);
    if (!item) return false;
    item.status = status;
    if (status === 'FAILED') item.retry_count++;
    return true;
  });
  const worker = new PosSyncWorker(
    () => queue,
    update,
    () => null,
  );
  worker.setSession(token(), server);
  const ping = vi.spyOn(worker as any, 'pingServer').mockResolvedValue(true);
  const post = vi
    .spyOn(worker as any, 'postJson')
    .mockImplementation(async (_url: any, payload: any) => ({
      success: true,
      results: payload.sales.map((sale: any, i: number) => ({
        sync_id: sale.sync_id,
        status: 'SYNCED',
        sale_id: i + 1,
      })),
    }));
  return { worker, update, ping, post };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('queue ownership, limits and sync lifecycle', () => {
  it.each(['legacy', 'other-user', 'other-server'])(
    'retains %s invoices without outbound requests or retries',
    async (kind) => {
      const sale = record(1);
      if (kind === 'legacy') delete (sale as any).origin_user_id;
      if (kind === 'other-user') sale.origin_user_id = 2;
      if (kind === 'other-server') sale.origin_server = 'https://other.example/api/v1';
      const { worker, update, post, ping } = setup([sale]);
      expect(await worker.runSyncCycle()).toMatchObject({ success: false, remaining: 1 });
      expect(update).not.toHaveBeenCalled();
      expect(ping).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    },
  );

  it.each([
    [60, 1, 50],
    [8, 100, 5],
  ])('bounds %i invoices with %i lines each to %i per cycle', async (count, lines, sent) => {
    const queue = Array.from({ length: count }, (_, i) => record(i, lines));
    const { worker, post } = setup(queue);
    expect(await worker.runSyncCycle()).toMatchObject({ synced: sent, remaining: count - sent });
    const payload = post.mock.calls[0]?.[1] as any;
    expect(payload.sales).toHaveLength(sent);
    expect(payload.sales[0]).not.toHaveProperty('origin_server');
    expect(
      queue.slice(sent).every((item) => item.retry_count === 0 && item.status === 'PENDING'),
    ).toBe(true);
  });

  it('rejects oversized invoices while sending healthy ones', async () => {
    const queue = [record(1, 101), record(2)];
    const { worker, post } = setup(queue);
    expect(await worker.runSyncCycle()).toMatchObject({ synced: 1, remaining: 1 });
    expect((post.mock.calls[0]?.[1] as any).sales[0].sync_id).toBe('invoice-2');
    expect(queue[0]).toMatchObject({ status: 'FAILED', retry_count: 1 });
  });

  it('rejects duplicate and foreign result identifiers', async () => {
    const { worker, update, post } = setup([record(1)]);
    post.mockResolvedValue({
      success: true,
      results: [
        { sync_id: 'foreign', status: 'SYNCED', sale_id: 99 },
        { sync_id: 'invoice-1', status: 'SYNCED', sale_id: 1 },
        { sync_id: 'invoice-1', status: 'SYNCED', sale_id: 2 },
      ],
    });
    expect(await worker.runSyncCycle()).toMatchObject({ synced: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('invoice-1', 'SYNCED', 1);
  });

  it('stops if the session changes while checking connectivity', async () => {
    const { worker, ping, post } = setup([record(1)]);
    ping.mockImplementation(async () => {
      worker.setAuthToken(token(2));
      return true;
    });
    expect(await worker.runSyncCycle()).toMatchObject({ message: 'SESSION_CHANGED_DURING_SYNC' });
    expect(post).not.toHaveBeenCalled();
  });

  it('cancels the scheduled startup when stopped immediately', async () => {
    vi.useFakeTimers();
    const { worker } = setup([]);
    const cycle = vi.spyOn(worker, 'runSyncCycle');
    worker.start();
    worker.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(cycle).not.toHaveBeenCalled();
  });

  it('keeps the active cycle lock through stop until the request completes', async () => {
    const { worker, post } = setup([record(1)]);
    let finish!: (value: any) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          entered();
        }),
    );
    const running = worker.runSyncCycle();
    await started;
    worker.stop();
    expect(await worker.runSyncCycle()).toMatchObject({ success: false, synced: 0 });
    expect(post).toHaveBeenCalledTimes(1);
    finish({ success: true, results: [{ sync_id: 'invoice-1', status: 'SYNCED', sale_id: 1 }] });
    expect(await running).toMatchObject({ synced: 1 });
  });
});
