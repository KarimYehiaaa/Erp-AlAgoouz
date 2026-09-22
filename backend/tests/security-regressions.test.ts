import { describe, expect, it, vi } from 'vitest';
import { csrfProtection } from '../src/middleware/csrf.ts';
import { calculatePaymentTotal } from '../src/services/salesCalculations.ts';

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

  it('rejects manager override token when used by a different cashier (H-02)', async () => {
    const { issueManagerOverrideToken, requireManagerOverride } = await import(
      '../src/middleware/managerOverride.ts'
    );
    const { token } = issueManagerOverrideToken(1, 100); // Issued for cashier 100

    const req: any = {
      headers: { 'x-manager-override': token },
      user: { id: 200, role_name: 'cashier' }, // Attempted by cashier 200
    };
    const next = vi.fn();

    await requireManagerOverride(req, {} as any, next);

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

    const req: any = {
      body: { sales: fakeSales },
      user: { id: 1, role_name: 'cashier' },
    };
    let status = 0;
    let jsonResult: any = null;
    const res: any = {
      status: (s: number) => {
        status = s;
        return res;
      },
      json: (j: any) => {
        jsonResult = j;
        return res;
      },
    };
    const next = vi.fn();

    await posShiftController.batchSyncSales(req, res, next);

    expect(status).toBe(400);
    expect(jsonResult?.success).toBe(false);
    expect(jsonResult?.message).toContain('حجم الدفعة كبير جداً');
  });

  it('rejects batch sync sales when sales array is empty (H-09)', async () => {
    const { posShiftController } = await import('../src/controllers/posShiftController.ts');

    const req: any = {
      body: { sales: [] },
      user: { id: 1, role_name: 'cashier' },
    };
    let status = 0;
    let jsonResult: any = null;
    const res: any = {
      status: (s: number) => {
        status = s;
        return res;
      },
      json: (j: any) => {
        jsonResult = j;
        return res;
      },
    };
    const next = vi.fn();

    await posShiftController.batchSyncSales(req, res, next);

    expect(status).toBe(400);
    expect(jsonResult?.success).toBe(false);
    expect(jsonResult?.message).toContain('مطلوب مصفوفة فواتير صالحة');
  });
});
