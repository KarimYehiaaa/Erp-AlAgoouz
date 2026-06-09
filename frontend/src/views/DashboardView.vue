<template>
  <div class="dashboard">
    <section class="dashboard-header">
      <div>
        <h1>لوحة التحكم</h1>
        <p>ملخص تنفيذي للمبيعات والتحصيل والمخزون والمصروفات خلال الفترة المختارة.</p>
      </div>

      <div class="header-actions">
        <div class="range-controls" role="group" aria-label="اختيار الفترة">
          <button
            v-for="option in rangeOptions"
            :key="option.value"
            type="button"
            class="range-btn"
            :class="{ active: selectedRange === option.value }"
            @click="setRange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <button class="btn btn-outline btn-sm" type="button" :disabled="loading" @click="loadDashboard">
          تحديث
        </button>
      </div>
    </section>

    <section v-if="selectedRange === 'custom'" class="custom-range panel">
      <label>
        من
        <input v-model="customFrom" type="date" @change="loadDashboard" />
      </label>
      <label>
        إلى
        <input v-model="customTo" type="date" @change="loadDashboard" />
      </label>
    </section>

    <div v-if="loading" class="state-panel panel">جاري تحميل بيانات لوحة التحكم...</div>
    <div v-else-if="error" class="state-panel panel is-error">
      <AppIcon name="warning" />
      <span>{{ error }}</span>
      <button class="btn btn-primary btn-sm" type="button" @click="loadDashboard">إعادة المحاولة</button>
    </div>

    <template v-else-if="stats">
      <section class="metric-grid">
        <RouterLink
          v-for="metric in mainMetrics"
          :key="metric.key"
          class="metric-card"
          :class="metric.tone"
          :to="metric.to"
        >
          <span class="metric-icon"><AppIcon :name="metric.icon" /></span>
          <span class="metric-label">{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.sub }}</small>
        </RouterLink>
      </section>

      <section class="overview-grid">
        <article class="panel chart-panel wide">
          <div class="panel-head">
            <div>
              <h2>الأداء المالي</h2>
              <p>{{ periodLabel }}</p>
            </div>
            <div class="mini-tabs">
              <button type="button" :class="{ active: performanceMode === 'full' }" @click="setPerformanceMode('full')">كامل</button>
              <button type="button" :class="{ active: performanceMode === 'sales' }" @click="setPerformanceMode('sales')">مبيعات</button>
            </div>
          </div>
          <div class="chart-wrap"><canvas ref="performanceChartRef"></canvas></div>
        </article>

        <article class="panel health-panel">
          <div class="panel-head compact">
            <h2>نبض التشغيل</h2>
            <strong>{{ percent(stats.month?.collectionRate) }}</strong>
          </div>
          <ul class="health-list">
            <li v-for="item in healthItems" :key="item.label">
              <span>{{ item.label }}</span>
              <strong :class="item.tone">{{ item.value }}</strong>
            </li>
          </ul>
        </article>
      </section>

      <section class="analytics-grid">
        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>أنواع البيع</h2>
            <RouterLink to="/sales">فتح</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="salesTypeChartRef"></canvas></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>حالات التحصيل</h2>
            <RouterLink to="/invoices">فتح</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="paymentChartRef"></canvas></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>المصروفات</h2>
            <RouterLink to="/expenses">فتح</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="expenseChartRef"></canvas></div>
        </article>
      </section>

      <section class="tables-grid">
        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2>أعلى المنتجات</h2>
            <RouterLink to="/products">المنتجات</RouterLink>
          </div>
          <div class="mini-table">
            <div v-for="row in topProductsRows" :key="row.id || row.sku" class="table-row">
              <span>{{ row.name_ar }}</span>
              <strong>{{ money(row.revenue) }}</strong>
              <small>{{ number(row.qty) }} وحدة</small>
            </div>
            <p v-if="!topProductsRows.length" class="mini-empty">لا توجد مبيعات منتجات في هذه الفترة.</p>
          </div>
        </article>

        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2>أعلى العملاء</h2>
            <RouterLink to="/customers">العملاء</RouterLink>
          </div>
          <div class="mini-table">
            <div v-for="row in topCustomersRows" :key="row.id" class="table-row">
              <span>{{ row.name_ar }}</span>
              <strong>{{ money(row.total_spent) }}</strong>
              <small>{{ number(row.sales_count) }} عملية</small>
            </div>
            <p v-if="!topCustomersRows.length" class="mini-empty">لا توجد مبيعات مرتبطة بعملاء في هذه الفترة.</p>
          </div>
        </article>

        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2>تنبيهات مهمة</h2>
            <RouterLink to="/inventory">المتابعة</RouterLink>
          </div>
          <div class="alert-stack">
            <div v-for="alert in alertItems" :key="alert.key" class="alert-item" :class="alert.tone">
              <span>{{ alert.label }}</span>
              <strong>{{ alert.value }}</strong>
            </div>
          </div>
        </article>

        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2>آخر المبيعات</h2>
            <RouterLink to="/sales">كل المبيعات</RouterLink>
          </div>
          <div class="event-list">
            <div v-for="sale in recentSalesRows" :key="sale.id" class="event-row">
              <div>
                <strong>{{ sale.sale_number }}</strong>
                <small>{{ formatDate(sale.sale_date) }} - {{ saleTypeLabel(sale.sale_type) }}</small>
              </div>
              <span>{{ money(sale.total_amount) }}</span>
            </div>
            <p v-if="!recentSalesRows.length" class="mini-empty">لا توجد مبيعات حديثة.</p>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { dashboard as dashboardApi } from '@/api';
import { formatMoney } from '@/utils/currency';

let Chart;
const loadChartLib = async () => {
  if (Chart) return Chart;
  const mod = await import('chart.js');
  Chart = mod.Chart;
  Chart.register(...mod.registerables);
  return Chart;
};

const stats = ref(null);
const loading = ref(true);
const error = ref('');
const selectedRange = ref('month');
const performanceMode = ref('full');
const customFrom = ref('');
const customTo = ref('');
const charts = [];

const performanceChartRef = ref(null);
const salesTypeChartRef = ref(null);
const paymentChartRef = ref(null);
const expenseChartRef = ref(null);

const rangeOptions = [
  { label: 'اليوم', value: 'today' },
  { label: '7 أيام', value: 'week' },
  { label: '30 يوم', value: 'last30' },
  { label: 'الشهر', value: 'month' },
  { label: 'مخصص', value: 'custom' },
];

const money = (value) => formatMoney(value, { compact: true });
const number = (value) => Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const percent = (value) => `${Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;
const saleTypeLabel = (type) => ({ branch: 'فرع', wholesale: 'جملة', pos: 'نقطة بيع' }[type] || type || 'بيع');

const formatDate = (value) => {
  if (!value) return 'غير محدد';
  const raw = String(value).split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const shortDate = (value) => {
  if (!value) return '';
  const raw = String(value).split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, month, day] = raw.split('-');
    return `${day}/${month}`;
  }
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dashboardParams = computed(() => {
  const params = { range: selectedRange.value };
  if (selectedRange.value === 'custom') {
    if (customFrom.value) params.from_date = customFrom.value;
    if (customTo.value) params.to_date = customTo.value;
  }
  if (selectedRange.value === 'last30') {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    params.range = 'custom';
    params.from_date = isoDate(start);
    params.to_date = isoDate(today);
  }
  return params;
});

const periodLabel = computed(() => {
  if (!stats.value?.period) return 'لا توجد فترة محددة';
  return `من ${formatDate(stats.value.period.start)} إلى ${formatDate(stats.value.period.end)}`;
});

const monthCards = computed(() => stats.value?.monthCards || {});
const mainMetrics = computed(() => [
  { key: 'sales', label: 'إجمالي المبيعات', value: money(stats.value?.month?.sales), sub: `${number(stats.value?.month?.salesCount)} عملية`, icon: 'sales', tone: 'sales', to: '/sales' },
  { key: 'profit', label: 'صافي الربح', value: money(stats.value?.month?.netProfit), sub: `تحصيل ${percent(stats.value?.month?.collectionRate)}`, icon: 'reports', tone: 'profit', to: '/reports' },
  { key: 'unpaid', label: 'غير محصل', value: money(stats.value?.unpaidInvoices?.amount), sub: `${number(stats.value?.unpaidInvoices?.count)} فاتورة`, icon: 'warning', tone: Number(stats.value?.unpaidInvoices?.amount || 0) ? 'danger' : 'success', to: '/invoices' },
  { key: 'expenses', label: 'المصروفات', value: money(stats.value?.month?.expenses), sub: `${number(stats.value?.month?.expensesCount)} حركة`, icon: 'expenses', tone: 'warning', to: '/expenses' },
  { key: 'purchases', label: 'المشتريات', value: money(monthCards.value.purchases), sub: `${number(monthCards.value.purchasesCount)} فاتورة`, icon: 'purchases', tone: 'inventory', to: '/purchases' },
  { key: 'inventory', label: 'قيمة المخزون', value: money(stats.value?.inventoryStats?.inventory_value), sub: `${number(stats.value?.inventoryStats?.products)} منتج`, icon: 'inventory', tone: 'inventory', to: '/inventory' },
  { key: 'recipes', label: 'الوصفات النشطة', value: number(stats.value?.recipeSummary?.active), sub: `${number(stats.value?.recipeSummary?.ingredients)} مكون`, icon: 'recipes', tone: 'recipe', to: '/recipes' },
  { key: 'cash', label: 'صافي التدفق', value: money(monthCards.value.cashNet), sub: 'بعد المبيعات والمشتريات والمصروفات', icon: 'money', tone: Number(monthCards.value.cashNet || 0) >= 0 ? 'profit' : 'danger', to: '/reports' },
]);

const healthItems = computed(() => [
  { label: 'نسبة التحصيل', value: percent(stats.value?.month?.collectionRate), tone: 'success' },
  { label: 'تنبيهات المخزون', value: number(stats.value?.stockAlerts), tone: Number(stats.value?.stockAlerts || 0) ? 'danger' : 'success' },
  { label: 'وصفات ناقصة', value: number(stats.value?.recipeSummary?.shortageRecipes), tone: Number(stats.value?.recipeSummary?.shortageRecipes || 0) ? 'warning' : 'success' },
  { label: 'عملاء نشطين', value: number(stats.value?.customersCount), tone: 'info' },
  { label: 'مخازن', value: number(stats.value?.inventoryStats?.warehouses), tone: 'info' },
]);

const alertItems = computed(() => [
  { key: 'stock', label: 'منتجات أقل من الحد الأدنى', value: number(stats.value?.stockAlerts), tone: Number(stats.value?.stockAlerts || 0) ? 'danger' : 'success' },
  { key: 'unpaid', label: 'فواتير غير محصلة', value: `${number(stats.value?.unpaidInvoices?.count)} / ${money(stats.value?.unpaidInvoices?.amount)}`, tone: Number(stats.value?.unpaidInvoices?.amount || 0) ? 'warning' : 'success' },
  { key: 'recipes', label: 'وصفات بها مكونات ناقصة', value: number(stats.value?.recipeSummary?.shortageRecipes), tone: Number(stats.value?.recipeSummary?.shortageRecipes || 0) ? 'warning' : 'success' },
  { key: 'customers', label: 'عدد العملاء النشطين', value: number(stats.value?.customersCount), tone: 'info' },
]);

const topProductsRows = computed(() => stats.value?.topProducts || []);
const topCustomersRows = computed(() => stats.value?.topCustomers || []);
const recentSalesRows = computed(() => stats.value?.recentSales || []);

const setRange = async (range) => {
  if (selectedRange.value === range) return;
  selectedRange.value = range;
  await loadDashboard();
};

const setPerformanceMode = async (mode) => {
  if (performanceMode.value === mode) return;
  performanceMode.value = mode;
  await renderCharts();
};

const destroyCharts = () => {
  while (charts.length) charts.pop()?.destroy();
};

const chartColors = () => ({
  primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb',
  accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f766e',
  danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#dc2626',
  warning: getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#b45309',
  grid: 'rgba(102,112,133,0.18)',
});

const baseOptions = (moneyTooltip = true) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
    tooltip: {
      rtl: true,
      textDirection: 'rtl',
      callbacks: {
        label: (ctx) => `${ctx.dataset.label || ctx.label}: ${moneyTooltip ? money(ctx.parsed.y ?? ctx.parsed ?? 0) : number(ctx.parsed.y ?? ctx.parsed ?? 0)}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, grid: { color: chartColors().grid }, ticks: { callback: (value) => (moneyTooltip ? money(value) : number(value)) } },
  },
});

const createChart = (ChartLib, chartRef, config) => {
  if (!chartRef.value) return;
  charts.push(new ChartLib(chartRef.value, config));
};

const renderCharts = async () => {
  if (!stats.value) return;
  destroyCharts();
  await nextTick();
  const ChartLib = await loadChartLib();
  const colors = chartColors();
  const trend = stats.value.salesTrend || [];
  const expenseTrend = stats.value.expenseTrend || [];
  const labels = trend.map((row) => shortDate(row.date));
  const expensesByDate = new Map(expenseTrend.map((row) => [shortDate(row.date), Number(row.expenses || 0)]));

  const performanceDatasets = [{
    label: 'المبيعات',
    data: trend.map((row) => Number(row.sales || 0)),
    type: 'bar',
    backgroundColor: colorMix(colors.primary, 0.22),
    borderColor: colors.primary,
    borderRadius: 6,
    borderSkipped: false,
    maxBarThickness: 24,
  }];

  if (performanceMode.value === 'full') {
    performanceDatasets.push(
      {
        label: 'الربح',
        data: trend.map((row) => Number(row.profit || 0)),
        type: 'line',
        borderColor: colors.accent,
        backgroundColor: colorMix(colors.accent, 0.12),
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        borderWidth: 2,
      },
      {
        label: 'المصروفات',
        data: trend.map((row) => expensesByDate.get(shortDate(row.date)) || 0),
        type: 'line',
        borderColor: colors.danger,
        borderDash: [6, 5],
        tension: 0.35,
        pointRadius: 2,
        borderWidth: 2,
      }
    );
  }

  createChart(ChartLib, performanceChartRef, {
    type: 'bar',
    data: { labels, datasets: performanceDatasets },
    options: baseOptions(true),
  });

  createChart(ChartLib, salesTypeChartRef, {
    type: 'bar',
    data: {
      labels: (stats.value.salesByType || []).map((row) => saleTypeLabel(row.sale_type)),
      datasets: [{ label: 'المبيعات', data: (stats.value.salesByType || []).map((row) => Number(row.total || 0)), backgroundColor: [colors.primary, colors.accent, colors.warning], borderRadius: 7 }],
    },
    options: baseOptions(true),
  });

  createChart(ChartLib, paymentChartRef, {
    type: 'doughnut',
    data: {
      labels: (stats.value.paymentSummary || []).map((row) => paymentStatusLabel(row.payment_status)),
      datasets: [{ label: 'التحصيل', data: (stats.value.paymentSummary || []).map((row) => Number(row.total || 0)), backgroundColor: [colors.accent, colors.warning, colors.danger, colors.primary], borderWidth: 0 }],
    },
    options: { ...baseOptions(true), cutout: '62%', scales: {} },
  });

  createChart(ChartLib, expenseChartRef, {
    type: 'doughnut',
    data: {
      labels: (stats.value.expenseByCategory || []).map((row) => row.name_ar),
      datasets: [{ label: 'المصروفات', data: (stats.value.expenseByCategory || []).map((row) => Number(row.total || 0)), backgroundColor: [colors.warning, colors.danger, colors.primary, colors.accent], borderWidth: 0 }],
    },
    options: { ...baseOptions(true), cutout: '58%', scales: {} },
  });
};

const colorMix = (hex, opacity) => {
  const color = hex.trim();
  if (!color.startsWith('#') || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const paymentStatusLabel = (status) => ({
  paid: 'مدفوع',
  partial: 'جزئي',
  unpaid: 'غير مدفوع',
  refunded: 'مسترد',
}[status] || status || 'غير محدد');

const loadDashboard = async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await dashboardApi(dashboardParams.value);
    stats.value = res.data;
    loading.value = false;
    await nextTick();
    await renderCharts();
  } catch (err) {
    error.value = err.message || 'حدث خطأ أثناء تحميل لوحة التحكم';
    destroyCharts();
    loading.value = false;
  }
};

const handleWindowFocus = () => loadDashboard();

onMounted(() => {
  loadDashboard();
  window.addEventListener('focus', handleWindowFocus);
});

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleWindowFocus);
  destroyCharts();
});
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xs);
}

.dashboard-header h1 {
  color: var(--text-strong);
  font-size: 1.45rem;
  font-weight: 900;
}

.dashboard-header p {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.header-actions,
.range-controls,
.mini-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.range-controls,
.mini-tabs {
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.range-btn,
.mini-tabs button {
  min-height: 30px;
  padding: 5px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-weight: 800;
}

.range-btn.active,
.mini-tabs button.active {
  background: var(--bg-elevated);
  color: var(--primary-dark);
  box-shadow: var(--shadow-xs);
}

.custom-range {
  display: flex;
  gap: 12px;
  padding: 14px;
}

.custom-range label {
  color: var(--text-muted);
  font-weight: 800;
}

.custom-range input {
  display: block;
  margin-top: 6px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  color: var(--text);
}

.state-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 150px;
  padding: 20px;
  color: var(--text-muted);
  font-weight: 800;
}

.state-panel.is-error {
  color: var(--danger);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 4px 12px;
  align-items: center;
  min-height: 112px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xs);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}

.metric-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--primary) 25%, var(--border));
  box-shadow: var(--shadow-sm);
}

.metric-icon {
  grid-row: 1 / 4;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--primary) 10%, var(--bg-elevated));
  color: var(--primary-dark);
}

.metric-label {
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 900;
}

.metric-card strong {
  color: var(--text-strong);
  font-size: 1.18rem;
  font-weight: 900;
  line-height: 1.2;
}

.metric-card small {
  color: var(--text-muted);
  font-size: 0.74rem;
  line-height: 1.35;
}

.metric-card.danger .metric-icon { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.metric-card.success .metric-icon { color: var(--success); background: color-mix(in srgb, var(--success) 10%, transparent); }
.metric-card.warning .metric-icon { color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); }
.metric-card.inventory .metric-icon { color: var(--info); background: color-mix(in srgb, var(--info) 10%, transparent); }
.metric-card.recipe .metric-icon { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 0.85fr);
  gap: 12px;
}

.analytics-grid,
.tables-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.tables-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.panel {
  padding: 15px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-head.compact {
  align-items: center;
}

.panel-head h2 {
  color: var(--text-strong);
  font-size: 1rem;
  font-weight: 900;
}

.panel-head p,
.panel-head a {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 800;
}

.panel-head a:hover {
  color: var(--primary-dark);
}

.chart-wrap {
  position: relative;
  height: 320px;
}

.chart-wrap.small {
  height: 240px;
}

.health-list {
  display: grid;
  gap: 8px;
  list-style: none;
}

.health-list li,
.alert-item,
.table-row,
.event-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

.health-list li:last-child,
.table-row:last-child,
.event-row:last-child {
  border-bottom: 0;
}

.health-list span,
.alert-item span {
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 800;
}

.health-list strong,
.alert-item strong {
  color: var(--text-strong);
  font-weight: 900;
}

.success { color: var(--success) !important; }
.warning { color: var(--warning) !important; }
.danger { color: var(--danger) !important; }
.info { color: var(--info) !important; }

.mini-table,
.alert-stack,
.event-list {
  display: grid;
  gap: 2px;
}

.table-row,
.event-row {
  display: grid;
  grid-template-columns: 1fr auto;
}

.table-row small {
  grid-column: 1 / -1;
  color: var(--text-muted);
  font-size: 0.74rem;
}

.table-row span,
.event-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-strong);
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-row small {
  display: block;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.table-row strong,
.event-row span {
  color: var(--primary-dark);
  font-weight: 900;
  white-space: nowrap;
}

.mini-empty {
  padding: 16px 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.alert-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

@media (max-width: 1300px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tables-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 980px) {
  .dashboard-header,
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-header {
    display: grid;
  }

  .analytics-grid,
  .tables-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .metric-grid { grid-template-columns: 1fr; }
  .header-actions { align-items: stretch; }
  .range-controls { width: 100%; }
  .range-btn { flex: 1; }
}
</style>
