import { get, post } from './client';

export interface PosShift {
  id: number;
  shift_number: string;
  terminal_id: number | null;
  warehouse_id: number;
  cashier_user_id: number;
  cashier_name?: string;
  warehouse_name?: string;
  terminal_name?: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  expected_cash: number;
  actual_cash: number | null;
  cash_difference: number | null;
  total_sales_amount: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_credit_sales: number;
  total_refunds_amount: number;
  total_invoices_count: number;
  total_deposits: number;
  total_withdrawals: number;
  live_total_sales: number;
  live_cash_sales: number;
  live_total_discounts: number;
  status: 'open' | 'closed' | 'audited';
  notes: string | null;
}

export interface CashMovement {
  movement_type: 'drop' | 'deposit' | 'expense';
  amount: number;
  reason: string;
}

export const posApi = {
  /** فتح وردية جديدة */
  openShift: (data: { opening_cash: number; warehouse_id?: number }) =>
    post<PosShift>('/pos/shifts/open', data),

  /** جلب بيانات الوردية الحالية مع إحصائيات حية */
  getCurrentShift: () => get<PosShift>('/pos/shifts/current'),

  /** إغلاق وردية وحساب الفرق */
  closeShift: (shiftId: number, data: { actual_cash: number; notes?: string }) =>
    post<PosShift>(`/pos/shifts/${shiftId}/close`, data),

  /** تسجيل حركة نقدية (توريد / إيداع فكة / مصروف) */
  recordCashMovement: (data: CashMovement) => post('/pos/shifts/cash-movement', data),

  /** استعراض سجل الورديات */
  listShifts: (params?: Record<string, unknown>) => get<PosShift[]>('/pos/shifts', { params }),

  /** تحقق من تسجيل الجهاز */
  verifyTerminal: (data: { terminal_code: string; device_fingerprint: string }) =>
    post('/pos/terminals/verify', data),

  /** التحقق من رمز PIN للمدير للمصادقة على العمليات الحساسة */
  verifyPin: (data: { pin: string; action?: string }) =>
    post<{
      success: boolean;
      verified: boolean;
      manager: { id: number; name: string; role: string };
    }>('/pos/verify-pin', data),
};
