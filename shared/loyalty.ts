/** Keep at least one cent payable: zero-value sales are not posted by accounting. */
export const maxRedeemableLoyaltyPoints = (
  subtotal: number,
  manualDiscount: number,
  availablePoints: number,
): number => {
  const remainingCents =
    Math.round((Number(subtotal) || 0) * 100) -
    Math.round(Math.max(0, Number(manualDiscount) || 0) * 100);
  const pointsAllowedBySale = Math.max(0, Math.floor((remainingCents - 1) / 100)) * 10;
  const pointsAvailable = Math.max(0, Math.floor((Number(availablePoints) || 0) / 10)) * 10;
  return Math.min(pointsAllowedBySale, pointsAvailable);
};
