import { AppError } from '../types/errors.ts';

// Keep the UUID versions supported by the existing sales replay contract.
const SUPPORTED_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseSaleSyncId = (value: unknown, required = false): string | null => {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw new AppError('معرّف مزامنة الفاتورة مطلوب', 400, 'INVALID_SYNC_ID');
  }
  if (typeof value !== 'string' || !SUPPORTED_UUID.test(value.trim())) {
    throw new AppError('معرّف مزامنة الفاتورة غير صالح', 400, 'INVALID_SYNC_ID');
  }
  return value.trim();
};
