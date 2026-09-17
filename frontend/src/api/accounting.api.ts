/**
 * api/accounting.api.ts — واجهة الاتصال البرمجية للنظام المحاسبي ودفتر الأستاذ ومرتجعات المشتريات
 */

import { get, post, put } from './client';

export interface AccountItem {
  id: number;
  code: string;
  name_ar: string;
  name_en?: string | null;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normal_balance: 'debit' | 'credit';
  parent_id?: number | null;
  is_active: boolean;
  is_system?: boolean;
  description?: string | null;
}

export interface JournalLine {
  account_id?: number;
  account_code?: string;
  debit: number;
  credit: number;
  description?: string;
  warehouse_id?: number;
}

export interface CreateJournalEntryPayload {
  entry_date: string;
  description: string;
  reference_type?: string;
  reference_id?: number;
  lines: JournalLine[];
}

export interface LedgerEntry {
  entry_id: number;
  entry_number: string;
  entry_date: string;
  reference_type: string;
  reference_id?: number | null;
  entry_description: string;
  line_id: number;
  debit: number;
  credit: number;
  line_description?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  running_balance: number;
}

export interface GeneralLedgerResponse {
  account: AccountItem;
  period: { from_date: string; to_date: string };
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
  entries: LedgerEntry[];
}

export interface TrialBalanceRow {
  id: number;
  code: string;
  name_ar: string;
  name_en?: string;
  account_type: string;
  normal_balance: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface TrialBalanceResponse {
  period: { from_date: string; to_date: string };
  totals: {
    opening_debit: number;
    opening_credit: number;
    period_debit: number;
    period_credit: number;
    closing_debit: number;
    closing_credit: number;
    is_balanced: boolean;
    variance: number;
  };
  accounts: TrialBalanceRow[];
}

export interface BalanceSheetSection {
  items: Array<TrialBalanceRow & { balance: number }>;
  total: number;
}

export interface BalanceSheetResponse {
  as_of_date: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection & { current_period_net_income: number };
  total_liabilities_and_equity: number;
  is_balanced: boolean;
  variance: number;
}

export interface PurchaseReturnItem {
  id?: number;
  purchase_invoice_item_id?: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total_amount?: number;
  notes?: string;
}

export interface PurchaseReturn {
  id: number;
  return_number: string;
  purchase_invoice_id: number;
  invoice_number?: string;
  supplier_id?: number;
  supplier_name?: string;
  return_date: string;
  total_amount: number;
  reason?: string;
  notes?: string;
  created_at: string;
  items?: PurchaseReturnItem[];
}

export interface CreatePurchaseReturnPayload {
  purchase_invoice_id: number;
  return_date: string;
  reason?: string;
  notes?: string;
  items: Array<{
    product_id: number;
    warehouse_id?: number;
    quantity: number;
    unit_price: number;
    notes?: string;
  }>;
}

export const accountingApi = {
  // دليل الحسابات
  getAccounts: (params?: { account_type?: string; is_active?: boolean; parent_id?: number }) =>
    get<AccountItem[]>('/accounting/accounts', { params }),

  getAccountById: (id: number) => get<AccountItem>(`/accounting/accounts/${id}`),

  createAccount: (data: Partial<AccountItem>) => post<AccountItem>('/accounting/accounts', data),

  updateAccount: (id: number, data: Partial<AccountItem>) =>
    put<AccountItem>(`/accounting/accounts/${id}`, data),

  // قيود اليومية
  createJournalEntry: (data: CreateJournalEntryPayload) =>
    post<any>('/accounting/journal-entries', data),

  // القوائم والدفاتر
  getGeneralLedger: (params: {
    account_id?: number;
    account_code?: string;
    from_date?: string;
    to_date?: string;
  }) => get<GeneralLedgerResponse>('/accounting/general-ledger', { params }),

  getTrialBalance: (params?: { from_date?: string; to_date?: string }) =>
    get<TrialBalanceResponse>('/accounting/trial-balance', { params }),

  getBalanceSheet: (asOfDate?: string) =>
    get<BalanceSheetResponse>('/accounting/balance-sheet', { params: { as_of_date: asOfDate } }),

  // مرتجعات المشتريات
  getPurchaseReturns: (params?: {
    supplier_id?: number;
    purchase_invoice_id?: number;
    from_date?: string;
    to_date?: string;
    limit?: number;
  }) => get<PurchaseReturn[]>('/purchases/returns', { params }),

  getPurchaseReturnById: (id: number) => get<PurchaseReturn>(`/purchases/returns/${id}`),

  createPurchaseReturn: (data: CreatePurchaseReturnPayload) =>
    post<PurchaseReturn>('/purchases/returns', data),
};
