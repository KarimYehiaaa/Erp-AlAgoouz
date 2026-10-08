import { api } from './api';

export type CashMovementType = 'WITHDRAWAL' | 'DEPOSIT';

export interface CashMovementPayload {
  shift_id: number;
  movement_type: CashMovementType;
  amount: number;
  reason: string;
}

export function recordCashMovement(payload: CashMovementPayload) {
  return api.post('/pos/shifts/cash-movement', payload);
}
