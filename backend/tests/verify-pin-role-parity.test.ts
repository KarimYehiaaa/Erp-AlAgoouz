import type { NextFunction, Request, Response } from 'express';
import { expect, it, vi } from 'vitest';
import { WAREHOUSE_GLOBAL_ROLES } from '../../shared/permissions.js';

const databaseQuery = vi.hoisted(() => vi.fn());

vi.mock('../src/database/pool.ts', () => ({
  query: databaseQuery,
  getClient: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../src/middleware/managerOverride.ts', () => ({
  issueManagerOverrideToken: vi
    .fn()
    .mockResolvedValue({ token: 'override-token', expires_in: 600 }),
}));

it('uses the same active administrator roles that can consume overrides and ignores manager_id', async () => {
  databaseQuery.mockReset();
  databaseQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM pos_pin_lockouts')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM users u')) {
      return {
        rows: [
          {
            id: 9,
            username: 'owner',
            full_name: 'Owner',
            pos_pin_hash: 'hashed-pin',
            password_hash: null,
            role_name: 'owner',
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });

  const { posShiftController } = await import('../src/controllers/posShiftController.ts');
  const request = {
    body: { pin: '4826', action: 'approve return', manager_id: 999 },
    user: { id: 42, role_name: 'cashier' },
    ip: '127.0.0.1',
  } as unknown as Request;
  const response = { json: vi.fn() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  await posShiftController.verifyPin(request, response, next);

  expect(next).not.toHaveBeenCalled();
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      manager: expect.objectContaining({ id: 9, role: 'owner' }),
      override_token: expect.objectContaining({ token: 'override-token' }),
    }),
  );
  const [managerSql, managerParams] = databaseQuery.mock.calls[1]!;
  expect(managerSql).toContain('u.deleted_at IS NULL');
  expect(managerSql).toContain('r.name = ANY($1::text[])');
  expect(managerSql).not.toContain('AND u.id');
  expect(managerParams[0]).toEqual(WAREHOUSE_GLOBAL_ROLES);
});
