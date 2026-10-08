import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, error } = vi.hoisted(() => ({ query: vi.fn(), error: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query }));
vi.mock('../src/services/loggerService.ts', () => ({ logger: { error } }));
import { requireIdempotency } from '../src/middleware/idempotency.ts';

const request = () => ({
  method: 'POST',
  headers: { 'idempotency-key': 'financial-key' },
  originalUrl: '/sales',
  user: { id: 1 },
});
const response = () => {
  const res: any = { statusCode: 200, headersSent: false, destroyed: false };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn(() => res);
  return res;
};

describe('Central idempotency failure safety', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not run financial work when PostgreSQL cannot establish ownership', async () => {
    query.mockRejectedValue(new Error('Database unavailable'));
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = response();
      const next = vi.fn();
      await requireIdempotency(request() as any, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'IDEMPOTENCY_UNAVAILABLE' }),
      );
    }
  });

  it('never executes after a conflicting claim whose row disappeared', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = response();
    const next = vi.fn();
    await requireIdempotency(request() as any, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
  });

  it('withholds success and preserves the lock when the business result cannot be persisted', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ claim_token: '2026-10-01 00:00:00+00' }] })
      .mockRejectedValueOnce(new Error('Connection lost'));
    const res = response();
    const delivered = res.json;
    const next = vi.fn();
    await requireIdempotency(request() as any, res, next);
    res.status(201).json({ success: true, sale_id: 9 });
    await vi.waitFor(() => expect(delivered).toHaveBeenCalled());
    expect(res.statusCode).toBe(503);
    expect(delivered).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IDEMPOTENCY_RESULT_UNCONFIRMED' }),
    );
    expect(query.mock.calls.every(([sql]) => !sql.includes('DELETE'))).toBe(true);
    expect(query.mock.calls[1][0]).toContain('EXTRACT(EPOCH FROM locked_at)::text = $4');
  });
});
