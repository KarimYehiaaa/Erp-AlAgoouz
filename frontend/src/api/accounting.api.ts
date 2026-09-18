/**
 * api/accounting.api.ts — واجهة الاتصال البرمجية للنظام المحاسبي ودفتر الأستاذ ومرتجعات المشتريات
 */

import { get, post, put, uploadFile } from './client';

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

export interface AgingCustomerRow {
  customer_id: number;
  customer_name: string;
  customer_phone?: string;
  invoices_count: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  total_due: number;
}

export interface CustomerAgingResponse {
  as_of_date: string;
  totals: {
    current_0_30: number;
    days_31_60: number;
    days_61_90: number;
    over_90: number;
    total_due: number;
  };
  customers: AgingCustomerRow[];
}

export interface AgingSupplierRow {
  supplier_id: number;
  supplier_name: string;
  supplier_phone?: string;
  invoices_count: number;
  current_0_30: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
  total_due: number;
}

export interface SupplierAgingResponse {
  as_of_date: string;
  totals: {
    current_0_30: number;
    days_31_60: number;
    days_61_90: number;
    over_90: number;
    total_due: number;
  };
  suppliers: AgingSupplierRow[];
}

export interface LedgerReconciliationSummary {
  period: { from_date: string; to_date: string };
  general_ledger: {
    revenue: number;
    cogs: number;
    expenses: number;
    net_profit: number;
  };
  operational: {
    revenue: number;
    cogs: number;
    expenses: number;
    net_profit: number;
  };
  variances: {
    revenue: number;
    cogs: number;
    expenses: number;
    net_profit: number;
    is_fully_reconciled: boolean;
  };
}

export interface BankReconciliation {
  id: number;
  reconciliation_number: string;
  account_id: number;
  account_code?: string;
  account_name?: string;
  statement_date: string;
  statement_balance: number;
  ledger_balance: number;
  reconciled_balance: number;
  difference: number;
  status: 'draft' | 'completed' | 'cancelled';
  notes?: string;
  reconciled_by?: number;
  reconciled_by_name?: string;
  created_at: string;
}

export interface CreateBankReconciliationPayload {
  account_id: number;
  statement_date: string;
  statement_balance: number;
  notes?: string;
  status?: 'draft' | 'completed' | 'cancelled';
}

export interface PurchaseOrderItem {
  id?: number;
  product_id: number;
  product_name?: string;
  unit?: string;
  quantity: number;
  received_quantity?: number;
  remaining_quantity?: number;
  unit_price: number;
  total_amount: number;
  notes?: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id?: number;
  supplier_name?: string;
  warehouse_id?: number;
  warehouse_name?: string;
  order_date: string;
  expected_date?: string;
  status: 'draft' | 'approved' | 'partially_received' | 'received' | 'cancelled';
  total_amount: number;
  notes?: string;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  items: PurchaseOrderItem[];
}

export interface CreatePurchaseOrderPayload {
  supplier_id?: number;
  warehouse_id?: number;
  order_date?: string;
  expected_date?: string;
  notes?: string;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    notes?: string;
  }>;
}

export interface ReceiveGoodsPayload {
  items: Array<{
    item_id: number;
    quantity_to_receive: number;
  }>;
  convertToInvoice?: boolean;
  notes?: string;
}

export interface BankStatementTransaction {
  id: number;
  reconciliation_id: number;
  transaction_date: string;
  description: string;
  reference_number?: string;
  debit: number;
  credit: number;
  status: 'unmatched' | 'matched' | 'excluded';
  matched_journal_entry_line_id?: number;
  match_confidence?: number;
  match_rule?: string;
  notes?: string;
}

export interface AgingReconciliationSide {
  subledger_total: number;
  control_account_balance: number;
  variance: number;
  is_reconciled: boolean;
}

export interface AgingReconciliationResponse {
  as_of_date: string;
  customers: AgingReconciliationSide;
  suppliers: AgingReconciliationSide;
  is_all_reconciled: boolean;
}

export interface IncomeStatementResponse {
  period: { from_date: string; to_date: string };
  revenues: {
    items: Array<{ account_id: number; code: string; name_ar: string; balance: number }>;
    total: number;
  };
  cogs: {
    items: Array<{ account_id: number; code: string; name_ar: string; balance: number }>;
    total: number;
  };
  gross_profit: number;
  expenses: {
    items: Array<{ account_id: number; code: string; name_ar: string; balance: number }>;
    total: number;
  };
  net_operating_income: number;
}

export interface FinancialPeriod {
  id: number;
  period_name: string;
  period_code: string;
  start_date: string;
  end_date: string;
  fiscal_year: number;
  status: 'open' | 'closed' | 'locked';
  closed_at?: string;
  closed_by?: number;
  reopened_at?: string;
  reopened_by?: number;
  checklist?: any;
  notes?: string;
}

export interface PeriodChecklistResponse {
  period: FinancialPeriod;
  is_ready_to_close: boolean;
  blockers: string[];
  warnings: string[];
  checks: {
    unbalanced_journal_entries: { passed: boolean; count: number };
    draft_journal_entries: { passed: boolean; count: number };
    unreconciled_bank_sessions: { passed: boolean; count: number };
    aging_ledger_discrepancies: {
      passed: boolean;
      customer_variance: number;
      supplier_variance: number;
    };
  };
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

  reverseJournalEntry: (id: number, reason?: string) =>
    post<any>(`/accounting/journal-entries/${id}/reverse`, { reason }),

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

  getIncomeStatement: (params?: { from_date?: string; to_date?: string }) =>
    get<IncomeStatementResponse>('/accounting/income-statement', { params }),

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

  // تحليل أعمار الديون والمطابقة
  getCustomerAging: (asOfDate?: string) =>
    get<CustomerAgingResponse>('/accounting/aging/customers', { params: { as_of_date: asOfDate } }),

  getSupplierAging: (asOfDate?: string) =>
    get<SupplierAgingResponse>('/accounting/aging/suppliers', { params: { as_of_date: asOfDate } }),

  getAgingReconciliation: (asOfDate?: string) =>
    get<AgingReconciliationResponse>('/accounting/aging/reconciliation', {
      params: { as_of_date: asOfDate },
    }),

  // مطابقة الأرباح مع الأستاذ العام
  getLedgerReconciliationSummary: (fromDate?: string, toDate?: string) =>
    get<LedgerReconciliationSummary>('/accounting/ledger-reconciliation', {
      params: { from_date: fromDate, to_date: toDate },
    }),

  // مطابقة الحسابات البنكية والخزينة
  getReconciliations: (params?: {
    account_id?: number;
    from_date?: string;
    to_date?: string;
    status?: string;
  }) => get<BankReconciliation[]>('/accounting/reconciliations', { params }),

  getReconciliationById: (id: number) =>
    get<BankReconciliation>(`/accounting/reconciliations/${id}`),

  createReconciliation: (data: CreateBankReconciliationPayload) =>
    post<BankReconciliation>('/accounting/reconciliations', data),

  importBankStatement: (reconciliationId: number, file: File) =>
    uploadFile<{ imported_count: number }>(
      `/accounting/reconciliations/${reconciliationId}/import-statement`,
      file,
      'file',
    ),

  getStatementTransactions: (reconciliationId: number, params?: { status?: string }) =>
    get<BankStatementTransaction[]>(
      `/accounting/reconciliations/${reconciliationId}/transactions`,
      {
        params,
      },
    ),

  autoMatchTransactions: (reconciliationId: number) =>
    post<{ matched_count: number; remaining_unmatched: number }>(
      `/accounting/reconciliations/${reconciliationId}/auto-match`,
    ),

  matchTransaction: (
    txId: number,
    data: { journal_entry_line_id?: number; bank_diff_entry?: boolean; notes?: string },
  ) =>
    post<BankStatementTransaction>(`/accounting/reconciliations/transactions/${txId}/match`, data),

  unmatchTransaction: (txId: number) =>
    post<BankStatementTransaction>(`/accounting/reconciliations/transactions/${txId}/unmatch`),

  excludeTransaction: (txId: number, reason?: string) =>
    post<BankStatementTransaction>(`/accounting/reconciliations/transactions/${txId}/exclude`, {
      reason,
    }),

  finalizeReconciliation: (reconciliationId: number) =>
    post<BankReconciliation>(`/accounting/reconciliations/${reconciliationId}/finalize`),

  // الفترات المحاسبية والإقفال المالي
  listPeriods: (params?: { status?: string }) =>
    get<FinancialPeriod[]>('/accounting/periods', { params }),

  getPeriodById: (id: number) => get<FinancialPeriod>(`/accounting/periods/${id}`),

  createPeriod: (data: Partial<FinancialPeriod>) =>
    post<FinancialPeriod>('/accounting/periods', data),

  getPeriodChecklist: (id: number) =>
    get<PeriodChecklistResponse>(`/accounting/periods/${id}/checklist`),

  closePeriod: (id: number, data?: { notes?: string }) =>
    post<FinancialPeriod>(`/accounting/periods/${id}/close`, data),

  reopenPeriod: (id: number, reason?: string) =>
    post<FinancialPeriod>(`/accounting/periods/${id}/reopen`, { reason }),

  // أوامر الشراء والاستلام
  listPurchaseOrders: (params?: {
    status?: string;
    supplier_id?: number;
    warehouse_id?: number;
    from_date?: string;
    to_date?: string;
    limit?: number;
  }) => get<PurchaseOrder[]>('/purchases/orders', { params }),

  getPurchaseOrderById: (id: number) => get<PurchaseOrder>(`/purchases/orders/${id}`),

  createPurchaseOrder: (data: CreatePurchaseOrderPayload) =>
    post<PurchaseOrder>('/purchases/orders', data),

  approvePurchaseOrder: (id: number) => post<PurchaseOrder>(`/purchases/orders/${id}/approve`),

  receiveGoods: (id: number, data: ReceiveGoodsPayload) =>
    post<any>(`/purchases/orders/${id}/receive`, data),

  cancelPurchaseOrder: (id: number) => post<PurchaseOrder>(`/purchases/orders/${id}/cancel`),
};
