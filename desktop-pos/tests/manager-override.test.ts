import { afterEach, describe, expect, it, vi } from 'vitest';
import { requiresCashierDiscountOverride } from '../../shared/managerOverridePolicy';
import {
  clearManagerOverrideToken,
  consumeManagerOverrideToken,
  setManagerOverrideToken,
} from '../src/services/managerOverride';

afterEach(() => {
  clearManagerOverrideToken();
  vi.useRealTimers();
});

describe('shared cashier manager-override policy', () => {
  it('uses the shared flat and percentage thresholds and excludes loyalty discount', () => {
    expect(requiresCashierDiscountOverride({ totalAmount: 500, discountAmount: 50 })).toBe(false);
    expect(requiresCashierDiscountOverride({ totalAmount: 500, discountAmount: 50.01 })).toBe(true);
    expect(requiresCashierDiscountOverride({ totalAmount: 100, discountAmount: 15 })).toBe(false);
    expect(requiresCashierDiscountOverride({ totalAmount: 100, discountAmount: 15.01 })).toBe(true);
    expect(
      requiresCashierDiscountOverride({
        totalAmount: 100,
        discountAmount: 20,
        loyaltyPointsRedeemed: 50,
      }),
    ).toBe(false);
  });

  it('binds a short-lived override token to one expected method and route', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T00:00:00Z'));
    setManagerOverrideToken('one-time-token', { method: 'POST', path: '/sales/12/return' });

    expect(consumeManagerOverrideToken('POST', '/sales/13/return')).toBeNull();
    expect(consumeManagerOverrideToken('POST', '/sales/12/return?source=pos')).toBe(
      'one-time-token',
    );
    expect(consumeManagerOverrideToken('POST', '/sales/12/return')).toBeNull();

    setManagerOverrideToken('expired-token', { method: 'POST', path: '/sales' });
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(consumeManagerOverrideToken('POST', '/sales')).toBeNull();
  });
});
