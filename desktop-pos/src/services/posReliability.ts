export function isRetryableNetworkError(error: any): boolean {
  if (!error || error.response) return false;
  const code = String(error.code || '').toUpperCase();
  if (['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'ERR_NETWORK', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return true;
  }
  const message = String(error.message || '').toLowerCase();
  return /network|timeout|timed out|connection|socket|fetch failed|offline/.test(message);
}

export function checkoutPayloadKey(payload: {
  total_amount: number;
  discount_amount: number;
  payment_method: string;
  items: Array<{ product_id: number; quantity: number; unit_price: number; notes?: string }>;
}): string {
  return JSON.stringify({
    total_amount: payload.total_amount,
    discount_amount: payload.discount_amount,
    payment_method: payload.payment_method,
    items: payload.items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      notes: item.notes || undefined,
    })),
  });
}
