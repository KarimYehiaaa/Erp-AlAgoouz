import { AppError } from '../types/errors.ts';

/** A standalone receipt must specify an actual collection method, not a debt or a distribution. */
export function requireReceiptMethod(value?: string): string {
  const method = (value || 'cash').trim().toLowerCase();
  if (method === 'credit' || method === 'split')
    throw new AppError('حدد طريقة تحصيل فعلية؛ الآجل والمختلط ليسا دفعة مستقلة', 400);
  return method;
}
