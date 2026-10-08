import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const databaseQuery = vi.hoisted(() => vi.fn());

vi.mock('../src/database/pool.ts', () => ({
  query: databaseQuery,
}));

describe('manager override availability checks', () => {
  it('fails closed when central single-use consumption cannot reach the database', async () => {
    databaseQuery.mockReset();
    databaseQuery
      .mockRejectedValueOnce(new Error('database unavailable'))
      // If code incorrectly falls back to local consumption, this would make
      // the subsequent manager-state lookup succeed and expose the replay path.
      .mockResolvedValueOnce({ rows: [{ id: 81, full_name: 'Manager' }], rowCount: 1 });

    const { issueManagerOverrideToken, requireManagerOverride } =
      await import('../src/middleware/managerOverride.ts');
    const { token } = await issueManagerOverrideToken(81, 42, {
      query: async () => ({ rows: [], rowCount: 1 }),
    });
    const req = {
      headers: { 'x-manager-override': token },
      user: { id: 42, role_name: 'cashier' },
    } as unknown as Request;
    const next = vi.fn();

    await requireManagerOverride(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 503,
      code: 'MANAGER_OVERRIDE_CONSUMPTION_UNAVAILABLE',
    });
    expect(databaseQuery).toHaveBeenCalledOnce();
  });
});
