/** Treasury routing shared by posting and receipt matching. */
export function receiptAccountCode(method?: string, context = 'receipt'): string {
  const value = (method || 'cash').trim().toLowerCase();
  if (value === 'credit') return '110201';
  if (['bank', 'card', 'visa'].includes(value)) return '110103';
  if (['transfer', 'bank_transfer', 'instapay', 'wallet', 'vodafone_cash'].includes(value))
    return '110104';
  if (value === 'drawer') return '110102';
  // Older offline clients use branch for a retail sale.
  return ['retail', 'pos', 'branch'].includes(context) ? '110102' : '110101';
}
