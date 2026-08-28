import { computed, reactive, ref } from 'vue';
import { reports as reportsApi, pl as plApi } from '@/api';

/**
 * حالة شاشة التقارير بالكامل: التبويبات، الفلاتر الزمنية، تحميل كل تقرير
 * (ملخص/ربح وخسارة/مبيعات/مخزون/أرباح/مصروفات/مشتريات/عملاء) والمجاميع المحسوبة.
 */
export function useReportsData() {
  const tabs = [
    { id: 'summary', icon: 'dashboard', label: 'الملخص العام' },
    { id: 'pl', icon: 'wallet', label: 'الربح والخسارة' },
    { id: 'sales', icon: 'sales', label: 'المبيعات' },
    { id: 'inventory', icon: 'inventory', label: 'المخزون' },
    { id: 'profit', icon: 'trendingUp', label: 'الأرباح' },
    { id: 'expenses', icon: 'expenses', label: 'المصروفات' },
    { id: 'purchases', icon: 'purchases', label: 'المشتريات' },
    { id: 'customers', icon: 'customers', label: 'العملاء' },
  ];

  const activeTab = ref('summary');
  const loading = ref(false);
  const error = ref('');
  const summary = ref<Record<string, any>>({});
  const salesFilter = ref('');
  const reportData = reactive<Record<string, any>>({
    sales: [],
    inventory: {},
    profit: {},
    expenses: {},
    purchases: {},
    customers: {},
  });

  // ── P&L state ──
  const plData = ref<any>(null);
  const plTrend = ref<any[]>([]);
  const plLoading = ref(false);
  const plError = ref('');

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const filters = reactive({ from_date: firstOfMonth, to_date: todayStr });

  // ── quick date helpers ──
  const selectMonth = (event: any) => {
    const value = event.target.value;
    if (!value) return;
    const [year, month] = value.split('-').map(Number);
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    filters.from_date = fromDate;
    filters.to_date = toDate;
    loadActiveTab();
  };

  const setQuick = (range: any) => {
    const now = new Date();
    const fmt = (d: any) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (range === 'today') {
      filters.from_date = fmt(now);
      filters.to_date = fmt(now);
    } else if (range === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      filters.from_date = fmt(d);
      filters.to_date = fmt(now);
    } else if (range === 'month') {
      filters.from_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      filters.to_date = fmt(now);
    } else if (range === 'year') {
      filters.from_date = `${now.getFullYear()}-01-01`;
      filters.to_date = fmt(now);
    } else {
      filters.from_date = '';
      filters.to_date = '';
    }
    loadActiveTab();
  };

  // ── computed ──
  const profitMarginPct = computed(() => {
    const s = Number(summary.value.sales?.total_sales || 0);
    const p = Number(summary.value.sales?.total_profit || 0);
    return s > 0 ? ((p / s) * 100).toFixed(1) : '0.0';
  });

  const filteredSalesRows = computed(() => {
    const rows = reportData.sales || [];
    return salesFilter.value ? rows.filter((r: any) => r.sale_type === salesFilter.value) : rows;
  });
  const salesTotal = computed(() =>
    filteredSalesRows.value.reduce((s: any, r: any) => s + Number(r.total || 0), 0),
  );
  const salesProfit = computed(() =>
    filteredSalesRows.value.reduce((s: any, r: any) => s + Number(r.profit || 0), 0),
  );
  const salesCount = computed(() =>
    filteredSalesRows.value.reduce((s: any, r: any) => s + Number(r.count || 0), 0),
  );

  const lowStockProducts = computed(() =>
    (reportData.inventory?.products || []).filter((p: any) => p.is_low_stock),
  );
  const lowStockCount = computed(() => lowStockProducts.value.length);
  const totalInventoryValue = computed(() =>
    (reportData.inventory?.warehouseValue || []).reduce(
      (s: any, r: any) => s + Number(r.total_value || 0),
      0,
    ),
  );

  const profitTotalRevenue = computed(() =>
    (reportData.profit?.daily || []).reduce((s: any, r: any) => s + Number(r.revenue || 0), 0),
  );
  const profitTotalCost = computed(() =>
    (reportData.profit?.daily || []).reduce((s: any, r: any) => s + Number(r.cost || 0), 0),
  );
  const profitTotalNet = computed(() =>
    (reportData.profit?.daily || []).reduce((s: any, r: any) => s + Number(r.profit || 0), 0),
  );

  const expensesTotal = computed(() =>
    (reportData.expenses?.byCategory || []).reduce((s: any, r: any) => s + Number(r.total || 0), 0),
  );
  const expensesCount = computed(() =>
    (reportData.expenses?.byCategory || []).reduce((s: any, r: any) => s + Number(r.count || 0), 0),
  );

  const customersTotal = computed(() =>
    (reportData.customers?.topCustomers || []).reduce(
      (s: any, r: any) => s + Number(r.total_spent || 0),
      0,
    ),
  );

  // ── data loading ──
  const buildParams = () => {
    const p: Record<string, string> = {};
    if (filters.from_date) p.from_date = filters.from_date;
    if (filters.to_date) p.to_date = filters.to_date;
    return p;
  };

  const loadTab = async (tabId: any) => {
    activeTab.value = tabId;
    error.value = '';

    // P&L tab له logic منفصل
    if (tabId === 'pl') {
      plError.value = '';
      plLoading.value = true;
      try {
        const [reportRes, trendRes] = await Promise.all([
          plApi.monthly({ from_date: filters.from_date, to_date: filters.to_date }),
          plApi.trend(6),
        ]);
        plData.value = reportRes?.data || reportRes || null;
        plTrend.value = trendRes?.data || trendRes || [];
      } catch (e: any) {
        plError.value = e?.message || 'تعذر تحميل تقرير الربح والخسارة';
      } finally {
        plLoading.value = false;
      }
      return;
    }

    loading.value = true;
    try {
      const params = buildParams();
      if (tabId === 'summary') {
        const res = await reportsApi('summary', params);
        summary.value = res?.data || res || {};
      } else {
        const res = await reportsApi(tabId, params);
        reportData[tabId] = res?.data || res || {};
      }
    } catch (e: any) {
      error.value = e?.message || 'تعذر تحميل التقرير';
    } finally {
      loading.value = false;
    }
  };

  const loadActiveTab = () => loadTab(activeTab.value);

  return {
    tabs,
    activeTab,
    loading,
    error,
    summary,
    salesFilter,
    reportData,
    plData,
    plTrend,
    plLoading,
    plError,
    filters,
    selectMonth,
    setQuick,
    profitMarginPct,
    filteredSalesRows,
    salesTotal,
    salesProfit,
    salesCount,
    lowStockProducts,
    lowStockCount,
    totalInventoryValue,
    profitTotalRevenue,
    profitTotalCost,
    profitTotalNet,
    expensesTotal,
    expensesCount,
    customersTotal,
    loadTab,
    loadActiveTab,
  };
}
