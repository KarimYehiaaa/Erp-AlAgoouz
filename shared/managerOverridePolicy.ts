export const CASHIER_MAX_FLAT_DISCOUNT = 50;
export const CASHIER_MAX_DISCOUNT_RATIO = 0.15;

type DiscountItem = { quantity?: unknown; unit_price?: unknown };

const cents = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

/** Keep browser, desktop, and API cashier-discount thresholds identical. */
export function requiresCashierDiscountOverride(input: {
  items?: DiscountItem[];
  totalAmount?: unknown;
  discountAmount?: unknown;
  loyaltyPointsRedeemed?: unknown;
}): boolean {
  const items = Array.isArray(input.items) ? input.items : [];
  const baseCents = items.length
    ? items.reduce((sum, item) => sum + cents(Number(item.quantity) * Number(item.unit_price)), 0)
    : cents(input.totalAmount);
  const loyaltyDiscountCents = cents(Number(input.loyaltyPointsRedeemed || 0) / 10);
  const manualDiscountCents = Math.max(0, cents(input.discountAmount) - loyaltyDiscountCents);

  return (
    manualDiscountCents > cents(CASHIER_MAX_FLAT_DISCOUNT) ||
    (baseCents > 0 && manualDiscountCents / baseCents > CASHIER_MAX_DISCOUNT_RATIO)
  );
}
