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
});
