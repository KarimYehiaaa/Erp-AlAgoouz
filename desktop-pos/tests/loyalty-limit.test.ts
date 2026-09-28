import { describe, expect, it } from 'vitest';
import { maxRedeemableLoyaltyPoints } from '../../shared/loyalty.ts';

describe('loyalty redemption limit', () => {
  it('uses the amount before loyalty redemption and leaves a payable balance', () => {
    expect(maxRedeemableLoyaltyPoints(10, 0, 100)).toBe(90);
    expect(maxRedeemableLoyaltyPoints(10.5, 0, 100)).toBe(100);
    expect(maxRedeemableLoyaltyPoints(10, 2, 100)).toBe(70);
  });

  it('respects available points and the ten-point input step', () => {
    expect(maxRedeemableLoyaltyPoints(100, 0, 55)).toBe(50);
    expect(maxRedeemableLoyaltyPoints(0.5, 0, 100)).toBe(0);
  });
});
