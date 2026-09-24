import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReportsData } from '../useReportsData';
import { reports as reportsApi, pl as plApi } from '@/api';

// محاكاة وحدة الـ API بالكامل — الاختبارات لا تلمس أي خادم أو قاعدة بيانات.
vi.mock('@/api', () => ({
  reports: vi.fn(),
  pl: {
    monthly: vi.fn(),
    trend: vi.fn(),
  },
}));

const mockedReports = vi.mocked(reportsApi);
const mockedPl = vi.mocked(plApi);

/** بيانات مبيعات تجريبية مختلطة الأنواع. */
const SAMPLE_SALES = [
  { date: '2026-08-01', sale_type: 'retail', count: 3, total: 1000, cost: 600, profit: 400 },
  { date: '2026-08-02', sale_type: 'retail', count: 2, total: 500, cost: 300, profit: 200 },
  { date: '2026-08-03', sale_type: 'wholesale', count: 1, total: 2500, cost: 2000, profit: 500 },
];

describe('useReportsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // سلوك افتراضي هادئ: كل التحميلات ترجع { data: undefined } فلا ينهار شيء.
    mockedReports.mockResolvedValue({ data: undefined });
    mockedPl.monthly.mockResolvedValue({ data: undefined });
    mockedPl.trend.mockResolvedValue({ data: undefined });
  });

  it('يبدأ بحالة أولية صحيحة (ملخص + فلاتر الشهر الحالي)', () => {
    const r = useReportsData();
    expect(r.activeTab.value).toBe('summary');
    expect(r.loading.value).toBe(false);
    expect(r.error.value).toBe('');
    expect(r.summary.value).toEqual({});
    expect(r.salesFilter.value).toBe('');

    // الفلاتر تبدأ من أول الشهر الحالي حتى اليوم.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    expect(r.filters.from_date).toBe(firstOfMonth);
    expect(r.filters.to_date).toBe(todayStr);
  });

  it('يصفّي صفوف المبيعات حسب النوع ويحسب المجاميع على الصفوف المفلترة فقط', () => {
    const r = useReportsData();
    r.reportData.sales = SAMPLE_SALES;

    // بدون فلتر: كل الصفوف.
    expect(r.filteredSalesRows.value).toHaveLength(3);
    expect(r.salesTotal.value).toBe(4000);
    expect(r.salesProfit.value).toBe(1100);
    expect(r.salesCount.value).toBe(6);

    // فلتر "فرع".
    r.salesFilter.value = 'retail';
    expect(r.filteredSalesRows.value).toHaveLength(2);
    expect(r.filteredSalesRows.value.every((row: any) => row.sale_type === 'retail')).toBe(true);
    expect(r.salesTotal.value).toBe(1500);
    expect(r.salesProfit.value).toBe(600);
    expect(r.salesCount.value).toBe(5);

    // فلتر "جملة".
    r.salesFilter.value = 'wholesale';
    expect(r.filteredSalesRows.value).toHaveLength(1);
    expect(r.salesTotal.value).toBe(2500);
    expect(r.salesProfit.value).toBe(500);

    // العودة للكل.
    r.salesFilter.value = '';
    expect(r.filteredSalesRows.value).toHaveLength(3);
  });

  it('يحسب هامش الربح مع حماية القسمة على صفر', () => {
    const r = useReportsData();

    // لا مبيعات → "0.0" بدون Infinity/NaN.
    expect(r.profitMarginPct.value).toBe('0.0');

    // نسبة عادية.
    r.summary.value = { sales: { total_sales: 1000, total_profit: 100 } };
    expect(r.profitMarginPct.value).toBe('10.0');

    // مبيعات بلا أرباح.
    r.summary.value = { sales: { total_sales: 500, total_profit: 0 } };
    expect(r.profitMarginPct.value).toBe('0.0');
  });

  it('يحسب مؤشرات المخزون: المنخفض والعدد وقيمة المخزون الكلية', () => {
    const r = useReportsData();
    r.reportData.inventory = {
      products: [
        { product_id: 1, name_ar: 'بن', is_low_stock: true, total_quantity: 2, min_stock: 5 },
        { product_id: 2, name_ar: 'شاي', is_low_stock: false, total_quantity: 20, min_stock: 5 },
        { product_id: 3, name_ar: 'قهوة', is_low_stock: true, total_quantity: 1, min_stock: 3 },
      ],
      warehouseValue: [
        { warehouse_name: 'رئيسي', total_value: 10000 },
        { warehouse_name: 'فرع', total_value: 5000 },
      ],
    };

    expect(r.lowStockProducts.value).toHaveLength(2);
    expect(r.lowStockProducts.value.map((p: any) => p.name_ar)).toEqual(['بن', 'قهوة']);
    expect(r.lowStockCount.value).toBe(2);
    expect(r.totalInventoryValue.value).toBe(15000);
  });

  it('يحسب مجاميع الأرباح اليومية', () => {
    const r = useReportsData();
    r.reportData.profit = {
      daily: [
        { date: '2026-08-01', revenue: 1000, cost: 600, profit: 400 },
        { date: '2026-08-02', revenue: 500, cost: 300, profit: 200 },
      ],
    };

    expect(r.profitTotalRevenue.value).toBe(1500);
    expect(r.profitTotalCost.value).toBe(900);
    expect(r.profitTotalNet.value).toBe(600);
  });

  it('يحسب مجاميع المصروفات والعدد', () => {
    const r = useReportsData();
    r.reportData.expenses = {
      byCategory: [
        { category: 'إيجار', count: 1, total: 3000 },
        { category: 'رواتب', count: 2, total: 5000 },
      ],
    };

    expect(r.expensesTotal.value).toBe(8000);
    expect(r.expensesCount.value).toBe(3);
  });

  it('يحسب إجمالي مشتريات أفضل العملاء', () => {
    const r = useReportsData();
    r.reportData.customers = {
      topCustomers: [
        { name_ar: 'أحمد', total_spent: 3000 },
        { name_ar: 'محمد', total_spent: 1500 },
      ],
    };

    expect(r.customersTotal.value).toBe(4500);
  });

  it('selectMonth يحدد بداية ونهاية الشهر ويحدّث التقرير الحالي', async () => {
    const r = useReportsData();
    r.selectMonth({ target: { value: '2026-08' } });

    expect(r.filters.from_date).toBe('2026-08-01');
    expect(r.filters.to_date).toBe('2026-08-31');
    // فبراير (سنة غير كبيسة) → 28 يومًا.
    r.selectMonth({ target: { value: '2026-02' } });
    expect(r.filters.to_date).toBe('2026-02-28');
    // إلغاء (قيمة فارغة) لا يغيّر شيئًا.
    const before = { ...r.filters };
    r.selectMonth({ target: { value: '' } });
    expect(r.filters).toEqual(before);

    expect(mockedReports).toHaveBeenCalledWith('summary', expect.anything());
  });

  it('setQuick يضبط النطاقات الزمنية: اليوم/أسبوع/شهر/سنة/الكل', () => {
    const r = useReportsData();

    r.setQuick('today');
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(r.filters.from_date).toBe(todayStr);
    expect(r.filters.to_date).toBe(todayStr);

    r.setQuick('year');
    expect(r.filters.from_date).toBe(`${today.getFullYear()}-01-01`);

    r.setQuick('all');
    expect(r.filters.from_date).toBe('');
    expect(r.filters.to_date).toBe('');
  });

  it('loadTab يحمّل الملخص في summary', async () => {
    const r = useReportsData();
    mockedReports.mockResolvedValue({
      data: { sales: { total_sales: 999 }, customersCount: 3 },
    });

    await r.loadTab('summary');

    expect(r.activeTab.value).toBe('summary');
    expect(r.summary.value.sales.total_sales).toBe(999);
    expect(r.summary.value.customersCount).toBe(3);
    expect(mockedReports).toHaveBeenCalledWith('summary', {
      from_date: r.filters.from_date,
      to_date: r.filters.to_date,
    });
  });

  it('loadTab يخزّن تقارير التبويبات الأخرى في reportData', async () => {
    const r = useReportsData();
    mockedReports.mockResolvedValue({ data: [{ date: '2026-08-01', total: 10 }] });

    await r.loadTab('sales');

    expect(r.activeTab.value).toBe('sales');
    expect(r.reportData.sales).toEqual([{ date: '2026-08-01', total: 10 }]);
  });

  it('loadTab لتبويب الربح والخسارة يستخدم مسار pl المنفصل', async () => {
    const r = useReportsData();
    mockedPl.monthly.mockResolvedValue({
      data: { net_profit: { amount: 500 }, cogs_basis: 'purchases' },
    });
    mockedPl.trend.mockResolvedValue({ data: [{ month: '2026-08-01', revenue: 100 }] });

    const promise = r.loadTab('pl');
    // أثناء التحميل تظهر حالة plLoading.
    expect(r.plLoading.value).toBe(true);
    await promise;

    expect(r.activeTab.value).toBe('pl');
    expect(r.plLoading.value).toBe(false);
    expect(r.plData.value.net_profit.amount).toBe(500);
    expect(r.plTrend.value).toEqual([{ month: '2026-08-01', revenue: 100 }]);
    expect(mockedPl.monthly).toHaveBeenCalledTimes(1);
    expect(mockedPl.trend).toHaveBeenCalledWith(6);
  });

  it('loadTab يمسك أخطاء API ويضعها في error / plError', async () => {
    const r = useReportsData();
    mockedReports.mockRejectedValue(new Error('تعذر الاتصال'));

    await r.loadTab('summary');
    expect(r.error.value).toContain('تعذر الاتصال');
    expect(r.loading.value).toBe(false);

    mockedPl.monthly.mockRejectedValue(new Error('تعذر تحميل تقرير الربح والخسارة'));
    await r.loadTab('pl');
    expect(r.plError.value).toContain('تعذر تحميل');
    expect(r.plLoading.value).toBe(false);
  });
});
