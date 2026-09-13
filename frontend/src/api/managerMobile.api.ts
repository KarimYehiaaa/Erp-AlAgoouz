import api from './index';

export interface ExecutiveSummaryData {
  date: string;
  grandTotal: number;
  totalCount: number;
  yesterdayTotal: number;
  growthPercent: number;
  averageOrderValue: number;
  branch: {
    total: number;
    discount: number;
    count: number;
    cash: number;
    instapay: number;
    card: number;
    other: number;
  };
  wholesale: {
    total: number;
    discount: number;
    count: number;
    cash: number;
    instapay: number;
    card: number;
    other: number;
  };
  paymentTotals: {
    cash: number;
    instapay: number;
    card: number;
    other: number;
  };
  expenses: {
    total: number;
    count: number;
  };
  netCashflow: number;
  activeShift: {
    id: number;
    shift_number: string;
    status: string;
    opening_cash: number;
    opened_at: string;
    cashier_name: string;
    warehouse_name?: string;
    terminal_code?: string;
    current_expected_cash: number;
  } | null;
  recentSales?: Array<{
    id: number;
    saleNumber: string;
    saleType: string;
    paymentMethod: string;
    totalAmount: number;
    createdAt: string;
    cashierName: string;
    customerName: string;
  }>;
  pendingApprovalsCount: number;
}

export interface InventoryValuationData {
  totalValuation: number;
  totalRetailValue: number;
  totalQuantity: number;
  productsInStock: number;
  categories: Array<{
    name: string;
    slug: string;
    valuation: number;
    totalQuantity: number;
    productCount: number;
  }>;
  lowStockItems: Array<{
    id: number;
    name: string;
    sku: string;
    unit: string;
    category: string;
    minLimit: number;
    currentStock: number;
    costPrice: number;
    stockValue: number;
  }>;
}

export interface ManagerApprovalRequest {
  id: number;
  request_type: string;
  requester_user_id: number;
  requester_name: string;
  requester_username?: string;
  pos_shift_id?: number;
  terminal_id?: number;
  action_label: string;
  details: {
    amount?: number;
    discount_amount?: number;
    discount_ratio?: number;
    reason?: string;
    customer_name?: string;
    items_count?: number;
    [key: string]: any;
  };
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  override_token?: string;
  decided_by_user_id?: number;
  decided_by_name?: string;
  decided_at?: string;
  created_at: string;
}

export const managerMobileApi = {
  async getSummary(date?: string): Promise<ExecutiveSummaryData> {
    const res: any = await api.get('/manager-mobile/summary', { params: { date } });
    return res?.data !== undefined ? res.data : res;
  },

  async getInventoryValuation(): Promise<InventoryValuationData> {
    const res: any = await api.get('/manager-mobile/inventory');
    return res?.data !== undefined ? res.data : res;
  },

  async getApprovals(status: 'pending' | 'all' = 'pending'): Promise<ManagerApprovalRequest[]> {
    const res: any = await api.get('/manager-mobile/approvals', { params: { status } });
    return res?.data !== undefined ? res.data : res;
  },

  async decideApproval(
    id: number,
    decision: 'approved' | 'rejected',
  ): Promise<ManagerApprovalRequest> {
    const res: any = await api.post(`/manager-mobile/approvals/${id}/decide`, { decision });
    return res?.data !== undefined ? res.data : res;
  },

  async requestApproval(payload: {
    request_type?: string;
    action_label: string;
    details: any;
    pos_shift_id?: number | null;
    terminal_id?: number | null;
  }): Promise<ManagerApprovalRequest> {
    const res: any = await api.post('/pos/approvals/request', payload);
    return res?.data !== undefined ? res.data : res;
  },

  async checkApprovalStatus(id: number): Promise<ManagerApprovalRequest> {
    const res: any = await api.get(`/pos/approvals/${id}/status`);
    return res?.data !== undefined ? res.data : res;
  },
};

export default managerMobileApi;
