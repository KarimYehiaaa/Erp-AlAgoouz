import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { csrfProtection } from '../src/middleware/csrf.ts';
import { calculatePaymentTotal } from '../src/services/salesCalculations.ts';

// Fixtures model only the Express members exercised by these middleware paths.
const asRequest = (fixture: unknown): Request => fixture as Request;
const asResponse = (fixture: unknown): Response => fixture as Response;
const makeCapturedResponse = () => {
  const captured: { status: number; body: Record<string, unknown> | null } = {
    status: 0,
    body: null,
  };
  const response = {
    status: (status: number) => {
      captured.status = status;
      return response;
    },
    json: (body: Record<string, unknown>) => {
      captured.body = body;
      return response;
    },
  };
  return { res: asResponse(response), captured };
};

const makeRequest = (origin: string | undefined) => ({
  method: 'POST',
  cookies: { access_token: 'cookie-token' },
  headers: {},
  get: (name: string) => (name.toLowerCase() === 'origin' ? origin : undefined),
});

describe('Security regressions', () => {
  it('rejects cookie-authenticated state changes from an untrusted origin', () => {
    const next = vi.fn();
    csrfProtection(makeRequest('https://evil.example'), {}, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      code: 'CSRF_ORIGIN_REJECTED',
    });
  });

  it('allows cookie-authenticated state changes from the official web origin', () => {
    const next = vi.fn();
    csrfProtection(makeRequest('https://agoouz.vercel.app'), {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects payment totals above the invoice total', () => {
    expect(() => calculatePaymentTotal([{ amount: 60 }, { amount: 41 }], 100)).toThrow(
      'إجمالي المدفوعات لا يمكن أن يتجاوز إجمالي الفاتورة',
    );
  });

  it('keeps decimal payment totals exact to cents', () => {
    expect(calculatePaymentTotal([{ amount: 0.1 }, { amount: 0.2 }], 0.3)).toBe(0.3);
  });

  it('does not accept new loyalty redemption on an existing sale', async () => {
    const { updateSale } = await import('../src/services/salesService.ts');
    await expect(updateSale(1, { loyalty_points_redeemed: 10 }, 1)).rejects.toThrow(
      'لا يمكن استبدال نقاط الولاء عند تعديل فاتورة محفوظة',
    );
  });

  it('rejects manager override token when used by a different cashier (H-02)', async () => {
    const { issueManagerOverrideToken, requireManagerOverride } =
      await import('../src/middleware/managerOverride.ts');
    const { token } = await issueManagerOverrideToken(1, 100); // Issued for cashier 100

    const req = {
      headers: { 'x-manager-override': token },
      user: { id: 200, role_name: 'cashier' }, // Attempted by cashier 200
    };
    const next = vi.fn();

    await requireManagerOverride(asRequest(req), asResponse({}), next);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('MANAGER_OVERRIDE_FORBIDDEN');
  });

  it('rejects batch sync sales when payload exceeds maximum batch size of 50 (H-09)', async () => {
    const { posShiftController } = await import('../src/controllers/posShiftController.ts');

    const fakeSales = Array.from({ length: 51 }, (_, i) => ({
      sync_id: `sync-${i}`,
      items: [{ product_id: 1, quantity: 1 }],
    }));

    const req = {
      body: { sales: fakeSales },
      user: { id: 1, role_name: 'cashier' },
    };
    const { res, captured } = makeCapturedResponse();
    const next = vi.fn();

    await posShiftController.batchSyncSales(asRequest(req), res, next);

    expect(captured.status).toBe(400);
    expect(captured.body?.success).toBe(false);
    expect(captured.body?.message).toContain('حجم الدفعة كبير جداً');
  });

  it('rejects batch sync sales when sales array is empty (H-09)', async () => {
    const { posShiftController } = await import('../src/controllers/posShiftController.ts');

    const req = {
      body: { sales: [] },
      user: { id: 1, role_name: 'cashier' },
    };
    const { res, captured } = makeCapturedResponse();
    const next = vi.fn();

    await posShiftController.batchSyncSales(asRequest(req), res, next);

    expect(captured.status).toBe(400);
    expect(captured.body?.success).toBe(false);
    expect(captured.body?.message).toContain('مطلوب مصفوفة فواتير صالحة');
  });

  it('rejects manager override token on reuse (replay attack prevention via DB atomic consumption)', async () => {
    const { issueManagerOverrideToken, requireManagerOverride } =
      await import('../src/middleware/managerOverride.ts');
    const { token } = await issueManagerOverrideToken(1, 100);

    const req = {
      headers: { 'x-manager-override': token },
      user: { id: 100, role_name: 'cashier' },
    };
    const next1 = vi.fn();
    await requireManagerOverride(asRequest(req), asResponse({}), next1);
    expect(next1).toHaveBeenCalledOnce();
    expect(next1).toHaveBeenCalledWith(); // First use succeeded

    // Second use with the same token must fail
    const next2 = vi.fn();
    await requireManagerOverride(asRequest(req), asResponse({}), next2);
    expect(next2).toHaveBeenCalledOnce();
    const err = next2.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('MANAGER_OVERRIDE_ALREADY_USED');
  });

  it('rejects unauthenticated requests trying to use idempotency key with authorization header (fail-closed)', async () => {
    const { requireIdempotency } = await import('../src/middleware/idempotency.ts');
    const req = {
      method: 'POST',
      headers: {
        'idempotency-key': 'test-idem-unauth',
        authorization: 'Bearer expired-or-invalid-token',
      },
      originalUrl: '/api/v1/sales',
      // user is undefined
    };
    const { res, captured } = makeCapturedResponse();
    const next = vi.fn();

    await requireIdempotency(asRequest(req), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(captured.status).toBe(401);
    expect(captured.body?.code).toBe('UNAUTHORIZED');
  });

  it('isolates idempotency keys across different users', async () => {
    const { requireIdempotency } = await import('../src/middleware/idempotency.ts');
    const { query } = await import('../src/database/pool.ts');
    const uniqueKey = `isolation-test-${Date.now()}`;
    const users = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id) VALUES ($1, 'test', 'Isolation A', 1), ($2, 'test', 'Isolation B', 1) RETURNING id`,
      [`${uniqueKey}-a`, `${uniqueKey}-b`],
    );

    const makeMockRes = () => {
      const res = {
        statusCode: 200,
        headersSent: false,
        once: vi.fn(),
        on: vi.fn(),
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      return res;
    };

    // User 1 claims the key
    const req1 = {
      method: 'POST',
      headers: { 'idempotency-key': uniqueKey },
      originalUrl: '/api/v1/sales',
      user: { id: users.rows[0].id, role_name: 'cashier' },
    };
    const next1 = vi.fn();
    await requireIdempotency(asRequest(req1), asResponse(makeMockRes()), next1);
    expect(next1).toHaveBeenCalledOnce();

    // User 2 claims the SAME idempotency key - because keys are user-scoped, User 2 gets their own lock
    const req2 = {
      method: 'POST',
      headers: { 'idempotency-key': uniqueKey },
      originalUrl: '/api/v1/sales',
      user: { id: users.rows[1].id, role_name: 'cashier' },
    };
    const next2 = vi.fn();
    await requireIdempotency(asRequest(req2), asResponse(makeMockRes()), next2);
    expect(next2).toHaveBeenCalledOnce();

    // Completed cached responses must remain separate too, not only the initial locks.
    const cachedResponses = [
      { ownerId: users.rows[0].id, invoice: 'private-owner-a' },
      { ownerId: users.rows[1].id, invoice: 'private-owner-b' },
    ];
    for (const [index, user] of users.rows.entries()) {
      await query(
        `UPDATE idempotency_records SET status = 'COMPLETED', status_code = 201,
         response_body = $2::jsonb WHERE user_id = $1 AND key LIKE $3`,
        [user.id, JSON.stringify(cachedResponses[index]), `%${uniqueKey}`],
      );
    }
    for (const [index, request] of [req1, req2].entries()) {
      const replayResponse = makeMockRes();
      const replayNext = vi.fn();
      await requireIdempotency(asRequest(request), asResponse(replayResponse), replayNext);
      expect(replayNext).not.toHaveBeenCalled();
      expect(replayResponse.status).toHaveBeenCalledWith(201);
      expect(replayResponse.json).toHaveBeenCalledExactlyOnceWith({
        ...cachedResponses[index],
        _idempotentReplay: true,
      });
    }

    // Clean up
    await query(`DELETE FROM idempotency_records WHERE key LIKE $1`, [`%${uniqueKey}`]);
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [users.rows.map((row) => row.id)]);
  });

  it('rejects batch sync sales when single invoice exceeds 100 items', async () => {
    const { posShiftController } = await import('../src/controllers/posShiftController.ts');

    const fakeSale = {
      sync_id: 'sync-big-single',
      items: Array.from({ length: 101 }, (_, i) => ({ product_id: i + 1, quantity: 1 })),
    };

    const req = {
      body: { sales: [fakeSale] },
      user: { id: 1, role_name: 'cashier' },
    };
    const { res, captured } = makeCapturedResponse();
    const next = vi.fn();

    await posShiftController.batchSyncSales(asRequest(req), res, next);

    expect(captured.status).toBe(400);
    expect(captured.body?.success).toBe(false);
    expect(captured.body?.message).toContain('100 صنف لكل فاتورة');
  });

  it('rejects batch sync sales when total items across all invoices exceed 500', async () => {
    const { posShiftController } = await import('../src/controllers/posShiftController.ts');

    const fakeSales = Array.from({ length: 6 }, (_, i) => ({
      sync_id: `sync-batch-${i}`,
      items: Array.from({ length: 90 }, (_, j) => ({ product_id: j + 1, quantity: 1 })),
    }));

    const req = {
      body: { sales: fakeSales },
      user: { id: 1, role_name: 'cashier' },
    };
    const { res, captured } = makeCapturedResponse();
    const next = vi.fn();

    await posShiftController.batchSyncSales(asRequest(req), res, next);

    expect(captured.status).toBe(400);
    expect(captured.body?.success).toBe(false);
    expect(captured.body?.message).toContain('500 صنف');
  });

  it('enforces user ownership on notification read and rejects when userId is missing', async () => {
    const { markNotificationRead, markAllNotificationsRead } =
      await import('../src/services/userService.ts');

    await expect(markNotificationRead(1, undefined)).rejects.toMatchObject({
      statusCode: 400,
      code: 'USER_REQUIRED',
    });

    await expect(markAllNotificationsRead(undefined)).rejects.toMatchObject({
      statusCode: 400,
      code: 'USER_REQUIRED',
    });
  });
});
