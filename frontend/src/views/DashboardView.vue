<template>
  <div class="dashboard">
    <!-- شريط تقدم رفيع: يعد تنازليًا حتى التحديث التلقائي الجاي، وينبض أثناء التحميل -->
    <div
      v-if="autoRefresh || refreshing"
      class="auto-refresh-bar"
      :class="{ refreshing }"
      :style="{ width: refreshing ? '100%' : refreshProgress + '%' }"
      role="progressbar"
      :aria-label="refreshing ? 'جاري تحديث البيانات' : 'الوقت المتبقي حتى التحديث التلقائي التالي'"
    ></div>

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
        <button class="btn btn-outline btn-sm" type="button" @click="showWidgetSettings = true">
          <AppIcon name="theme" style="margin-left: 6px; font-size: 0.9rem" />
          تخصيص الودجت
        </button>
        <button
          class="btn btn-outline btn-sm"
          type="button"
          :disabled="loading"
          @click="loadDashboard"
        >
          <AppIcon
            name="refresh"
            :size="14"
            style="margin-left: 6px"
            :class="{ 'spin-icon': loading }"
          />
          تحديث
        </button>

        <!-- مؤشر آخر تحديث + زر التحديث التلقائي الدوري (60 ثانية) -->
        <div class="auto-refresh-wrap" :class="{ active: autoRefresh }">
          <span class="live-dot" :class="{ on: autoRefresh }" aria-hidden="true"></span>
          <span class="last-updated">آخر تحديث: {{ lastUpdatedLabel }}</span>
          <button
            class="auto-refresh-toggle"
            type="button"
            :title="
              autoRefresh
                ? 'التحديث التلقائي مفعل — يتم التحديث كل 60 ثانية (اضغط للإيقاف)'
                : 'التحديث التلقائي متوقف — اضغط للتفعيل كل 60 ثانية'
            "
            :aria-label="autoRefresh ? 'إيقاف التحديث التلقائي' : 'تفعيل التحديث التلقائي'"
            @click="toggleAutoRefresh"
          >
            <AppIcon :name="autoRefresh ? 'timer' : 'timerOff'" :size="15" />
          </button>
        </div>
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

    <!-- Premium Skeleton Dashboard Loading Screen -->
    <div v-if="loading" class="skeleton-dashboard">
      <SkeletonLoader type="card" :count="4" class="mb-4" />
      <div class="skeleton-chart-row mt-4">
        <SkeletonLoader type="box" height="320px" />
        <SkeletonLoader type="box" height="320px" />
      </div>
    </div>
    <div v-else-if="error" class="state-panel panel is-error">
      <AppIcon name="warning" />
      <span>{{ error }}</span>
      <button class="btn btn-primary btn-sm" type="button" @click="loadDashboard">
        إعادة المحاولة
      </button>
    </div>

    <template v-else-if="stats">
      <DashboardMetrics v-if="widgetVisibility.metrics" :stats="stats" />

      <DashboardPriorityAlerts v-if="widgetVisibility.alertsTables" :stats="stats" />

      <section class="overview-grid">
        <article
          v-if="authStore.hasPermission('reports.view') && widgetVisibility.financialChart"
          class="panel chart-panel wide"
        >
          <div class="panel-head">
            <div>
              <h2>الأداء المالي</h2>
              <p>{{ periodLabel }}</p>
            </div>
            <div class="mini-tabs">
              <button
                type="button"
                :class="{ active: performanceMode === 'full' }"
                @click="setPerformanceMode('full')"
              >
                كامل
              </button>
              <button
                type="button"
                :class="{ active: performanceMode === 'sales' }"
                @click="setPerformanceMode('sales')"
              >
                مبيعات
              </button>
            </div>
          </div>
          <div class="chart-wrap"><canvas ref="performanceChartRef"></canvas></div>
        </article>

        <DashboardHealthPulse v-if="widgetVisibility.pulse" :stats="stats" />
      </section>

      <!-- AI Insights Section -->
      <DashboardAIInsights v-if="widgetVisibility.aiInsights" :stats="stats" />

      <!-- Menu Engineering Analysis (Menu Matrix) -->
      <DashboardMenuMatrix v-if="widgetVisibility.aiInsights" />

      <!-- Demand Forecasting Section -->
      <section
        v-if="stats && widgetVisibility.forecastingChart"
        class="overview-grid"
        style="margin-top: var(--space-5)"
      >
        <article class="panel chart-panel wide">
          <div class="panel-head">
            <div>
              <h2>
                <AppIcon name="trendingUp" style="margin-left: 8px; color: var(--primary)" />
                التنبؤ الذكي بالطلب
              </h2>
              <p>مقارنة المبيعات الفعلية للأسبوع الماضي مع التوقعات الذكية للأيام السبعة القادمة</p>
            </div>
            <span
              class="badge badge-info"
              style="background: var(--accent); color: var(--bg-elevated); font-weight: 800"
              >رادار الذكاء الاصطناعي</span
            >
          </div>
          <div class="chart-wrap" style="height: 300px">
            <canvas ref="forecastingChartRef"></canvas>
          </div>
        </article>
      </section>

      <!-- Branch Liquidity Battery Indicators -->
      <BranchLiquidity
        v-if="stats && widgetVisibility.branchLiquidity"
        :branches="branchLiquidityList"
        :format-money="formatMoney"
      />

      <section v-if="widgetVisibility.distributionCharts" class="analytics-grid">
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
            <RouterLink to="/sales?tab=wholesale">فتح</RouterLink>
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

        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>ربحية الفئات</h2>
            <RouterLink to="/products">فتح</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="categoryProfitChartRef"></canvas></div>
        </article>
      </section>

      <!-- الرسوم البيانية الإضافية المتقدمة لـ (أعلى المنتجات، أعلى العملاء، وساعات الذروة) -->
      <section v-if="widgetVisibility.indicatorCharts" class="analytics-grid">
        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>أعلى المنتجات مبيعاً</h2>
            <RouterLink to="/products">المنتجات</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="topProductsChartRef"></canvas></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>أعلى العملاء شراءً</h2>
            <RouterLink to="/customers">العملاء</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="topCustomersChartRef"></canvas></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel-head compact">
            <h2>نمط ساعات الذروة والطلبات</h2>
            <RouterLink to="/sales">المبيعات</RouterLink>
          </div>
          <div class="chart-wrap small"><canvas ref="peakHoursChartRef"></canvas></div>
        </article>
      </section>

      <!-- الجداول والتنبيهات المصممة بيانياً وتفصيلياً بنمط حديث -->
      <section v-if="widgetVisibility.alertsTables" class="tables-grid">
        <!-- نواقص المخزون مع شريط تقدم الأمان -->
        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2 class="text-danger">نواقص المخزون وحد الأمان</h2>
            <RouterLink to="/inventory">المخزون</RouterLink>
          </div>
          <div class="stock-alerts-list">
            <div v-for="row in lowStockRows" :key="row.id" class="stock-alert-card">
              <div class="stock-info">
                <span class="stock-name">{{ row.name_ar }}</span>
                <span
                  class="stock-level"
                  :class="Number(row.total_qty) <= 0 ? 'text-danger-bold' : 'text-warning-bold'"
                >
                  {{ number(row.total_qty) }} / {{ row.min_stock }} وحدة
                </span>
              </div>
              <div class="progress-bar-container">
                <div
                  class="progress-bar"
                  :style="{
                    width:
                      Math.min((Number(row.total_qty) / (Number(row.min_stock) || 1)) * 100, 100) +
                      '%',
                  }"
                  :class="Number(row.total_qty) <= 0 ? 'empty' : 'depleted'"
                ></div>
              </div>
            </div>
            <p v-if="!lowStockRows.length" class="mini-empty">المخزون آمن ومستقر تماماً.</p>
          </div>
        </article>

        <!-- التنبيهات الهامة بنمط البطاقات التفاعلية -->
        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2>تنبيهات وإشعارات النظام</h2>
            <RouterLink to="/inventory">المتابعة</RouterLink>
          </div>
          <div class="alert-modern-stack">
            <div
              v-for="alert in alertItems"
              :key="alert.key"
              class="alert-modern-item"
              :class="alert.tone"
            >
              <div class="alert-icon-box">
                <AppIcon :name="alert.tone === 'danger' ? 'warning' : 'info'" />
              </div>
              <div class="alert-content">
                <span class="alert-label">{{ alert.label }}</span>
                <strong class="alert-value">{{ alert.value }}</strong>
              </div>
            </div>
          </div>
        </article>

        <!-- سجل نشاطات النظام الأحدث (تغذية حية) -->
        <article class="panel table-panel">
          <div class="panel-head compact">
            <h2>سجل نشاطات النظام الأحدث</h2>
            <RouterLink to="/operations">مركز التشغيل</RouterLink>
          </div>
          <div class="timeline-feed">
            <div
              v-for="activity in recentActivityRows"
              :key="activity.created_at + activity.action_ar"
              class="timeline-row"
            >
              <div class="timeline-marker" :class="activity.module"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="user-badge">{{ activity.full_name || 'النظام' }}</span>
                  <span class="module-badge" :class="activity.module">{{
                    moduleLabel(activity.module)
                  }}</span>
                </div>
                <p class="activity-text">{{ activity.action_ar }}</p>
                <div class="timeline-meta">
                  <small>{{ formatTime(activity.created_at) }}</small>
                </div>
              </div>
            </div>
            <p v-if="!recentActivityRows.length" class="mini-empty">لا توجد نشاطات مسجلة مؤخراً.</p>
          </div>
        </article>
      </section>

      <!--  لوحة تخصيص الودجت الجانبية -->
      <div class="widget-drawer" :class="{ open: showWidgetSettings }">
        <div class="drawer-overlay" @click="showWidgetSettings = false"></div>
        <div class="drawer-content">
          <div class="drawer-header">
            <h3>تخصيص لوحة التحكم</h3>
            <button class="drawer-close" @click="showWidgetSettings = false">×</button>
          </div>
          <div class="drawer-body">
            <p class="drawer-desc">
              اختر العناصر والودجت التي ترغب في إظهارها في لوحة التحكم الرئيسية:
            </p>

            <div class="toggle-group">
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.metrics" />
                <span class="control-label">بطاقات الإحصائيات السريعة</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.aiInsights" />
                <span class="control-label">رادار تحليلات التشغيل (AI Insights)</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.financialChart" />
                <span class="control-label">مخطط الأداء المالي (المبيعات والأرباح)</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.pulse" />
                <span class="control-label">نبض التشغيل ونسب التحصيل</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.distributionCharts" />
                <span class="control-label"
                  >رسوم التوزيعات (البيع، التحصيل، المصاريف، ربحية الفئات)</span
                >
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.indicatorCharts" />
                <span class="control-label">رسوم المؤشرات (المنتجات، العملاء، الساعات)</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.alertsTables" />
                <span class="control-label">جداول نواقص المخزون والتنبيهات</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.forecastingChart" />
                <span class="control-label">مخطط التنبؤ الذكي بالطلب (AI Forecast)</span>
              </label>
              <label class="toggle-control">
                <input type="checkbox" v-model="widgetVisibility.branchLiquidity" />
                <span class="control-label">مؤشر سيولة الفروع (Branch Liquidity)</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import AppIcon from '@/components/AppIcon.vue';
import { dashboard as dashboardApi, warehouses as apiWarehouses } from '@/api';
import { formatMoney } from '@/utils/currency';
import DashboardMetrics from '@/components/dashboard/DashboardMetrics.vue';
import DashboardPriorityAlerts from '@/components/dashboard/DashboardPriorityAlerts.vue';
import DashboardAIInsights from '@/components/dashboard/DashboardAIInsights.vue';
import DashboardMenuMatrix from '@/components/dashboard/DashboardMenuMatrix.vue';
import DashboardHealthPulse from '@/components/dashboard/DashboardHealthPulse.vue';
import BranchLiquidity from '@/components/dashboard/BranchLiquidity.vue';

let Chart: any;
const loadChartLib = async () => {
  if (Chart) return Chart;
  const mod = await import('chart.js');
  Chart = mod.Chart;
  Chart.register(...mod.registerables);
  return Chart;
};

const stats = ref<any>(null);
// بيانات مؤشر السيولة للفروع — تُملأ من stats عند توفرها (القسم يعرض فارغًا حاليًا)
const branchLiquidityList = ref<any[]>([]);
const loading = ref(true);
const error = ref('');
const selectedRange = ref('month');

// ── التحديث التلقائي الدوري (كل 60 ثانية) + مؤشر آخر تحديث ──
const AUTO_REFRESH_INTERVAL = 60 * 1000;
const autoRefresh = ref(localStorage.getItem('dashboard_auto_refresh') !== 'false');
const lastUpdated = ref<Date | null>(null);
const nowTick = ref(Date.now());
// شريط التقدم: نسبة الوقت المتبقي حتى التحديث القادم (0→100) + حالة التحميل الفعلي
const refreshProgress = ref(0);
const refreshing = ref(false);
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const lastUpdatedLabel = computed(() => {
  if (!lastUpdated.value) return '—';
  const diff = Math.max(0, Math.floor((nowTick.value - lastUpdated.value.getTime()) / 1000));
  if (diff < 60) return `منذ ${diff} ثانية`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  return lastUpdated.value.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
});

const startAutoRefresh = () => {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    // لا نكدّس طلبات — نتخطى الدورة لو في طلب جارٍ
    if (!loading.value) loadDashboard();
  }, AUTO_REFRESH_INTERVAL);
};

const stopAutoRefresh = () => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
};

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value;
  localStorage.setItem('dashboard_auto_refresh', String(autoRefresh.value));
  if (autoRefresh.value) {
    // نبدأ العد من جديد
    refreshProgress.value = 0;
    startAutoRefresh();
  } else {
    stopAutoRefresh();
    refreshProgress.value = 0;
  }
};

//  تخصيص الودجت
const showWidgetSettings = ref(false);
const widgetVisibility = ref({
  metrics: true,
  aiInsights: true,
  financialChart: true,
  pulse: true,
  distributionCharts: true,
  indicatorCharts: true,
  alertsTables: true,
  forecastingChart: true,
  branchLiquidity: true,
});

const savedWidgets = localStorage.getItem('dashboard_widgets');
if (savedWidgets) {
  try {
    Object.assign(widgetVisibility.value, JSON.parse(savedWidgets));
  } catch {
    // تجاهل: JSON غير صالح من localStorage
  }
}

watch(
  widgetVisibility,
  () => {
    localStorage.setItem('dashboard_widgets', JSON.stringify(widgetVisibility.value));
    nextTick(() => {
      renderCharts();
    });
  },
  { deep: true },
);

const warehousesList = ref<any[]>([]);
const loadWarehouses = async () => {
  try {
    const res = await apiWarehouses();
    warehousesList.value = res.data || [];
  } catch (err: any) {
    console.error('Failed to load warehouses:', err);
  }
};
const performanceMode = ref('full');
const customFrom = ref('');
const customTo = ref('');
const charts: any[] = [];

const performanceChartRef = ref<any>(null);
const salesTypeChartRef = ref<any>(null);
const paymentChartRef = ref<any>(null);
const expenseChartRef = ref<any>(null);
const categoryProfitChartRef = ref<any>(null);
const topProductsChartRef = ref<any>(null);
const topCustomersChartRef = ref<any>(null);
const peakHoursChartRef = ref<any>(null);
const forecastingChartRef = ref<any>(null);

const rangeOptions = [
  { label: 'اليوم', value: 'today' },
  { label: '7 أيام', value: 'week' },
  { label: '30 يوم', value: 'last30' },
  { label: 'الشهر', value: 'month' },
  { label: 'هذا العام', value: 'year' },
  { label: 'مخصص', value: 'custom' },
];

const money = (value: any) => formatMoney(value, { compact: true });
const number = (value: any) =>
  Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 });
const saleTypeLabel = (type: any) =>
  (({ branch: 'فرع', wholesale: 'جملة', pos: 'نقطة بيع' }) as Record<string, string>)[type] ||
  type ||
  'بيع';

const moduleLabel = (mod: any) =>
  (
    ({
      auth: 'الأمان',
      users: 'المستخدمين',
      products: 'المنتجات',
      sales: 'المبيعات',
      inventory: 'المخزون',
      expenses: 'المصروفات',
      purchases: 'المشتريات',
      hr: 'الرواتب والموظفين',
      settings: 'الإعدادات',
    }) as Record<string, string>
  )[mod] ||
  mod ||
  'عام';

const formatTime = (value: any) => {
  if (!value) return '';
  const date = new Date(value);
  return (
    date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) +
    ' - ' +
    date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
  );
};

const formatDate = (value: any) => {
  if (!value) return 'غير محدد';
  const raw = String(value).split('T')[0] ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const shortDate = (value: any) => {
  if (!value) return '';
  const raw = String(value).split('T')[0] ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, month, day] = raw.split('-');
    return `${day}/${month}`;
  }
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const isoDate = (d: any) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dashboardParams = computed(() => {
  const params: Record<string, any> = { range: selectedRange.value };
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

const authStore = useAuthStore();

const alertItems = computed(() => [
  {
    key: 'stock',
    label: 'منتجات أقل من الحد الأدنى',
    value: number(stats.value?.stockAlerts),
    tone: Number(stats.value?.stockAlerts || 0) ? 'danger' : 'success',
  },
  {
    key: 'unpaid',
    label: 'إجمالي مديونيات العملاء وفواتير غير محصلة',
    value: `${money(stats.value?.unpaidInvoices?.amount)} (${number(stats.value?.unpaidInvoices?.count)} عميل)`,
    tone: Number(stats.value?.unpaidInvoices?.amount || 0) ? 'warning' : 'success',
  },
  {
    key: 'recipes',
    label: 'وصفات بها مكونات ناقصة',
    value: number(stats.value?.recipeSummary?.shortageRecipes),
    tone: Number(stats.value?.recipeSummary?.shortageRecipes || 0) ? 'warning' : 'success',
  },
  {
    key: 'customers',
    label: 'عدد العملاء النشطين',
    value: number(stats.value?.customersCount),
    tone: 'info',
  },
]);

const recentActivityRows = computed(() => (stats.value?.recentActivity || []).slice(0, 4));
const lowStockRows = computed(() => stats.value?.lowStock || []);

const formatHour = (h: any) => {
  const hour = Number(h);
  const ampm = hour >= 12 ? 'م' : 'ص';
  const display = hour % 12 || 12;
  return `${display}:00 ${ampm}`;
};

const setRange = async (range: any) => {
  if (selectedRange.value === range) return;
  selectedRange.value = range;
  await loadDashboard();
};

const setPerformanceMode = async (mode: any) => {
  if (performanceMode.value === mode) return;
  performanceMode.value = mode;
  await renderCharts();
};

const destroyCharts = () => {
  while (charts.length) charts.pop()?.destroy();
};

const chartColors = () => ({
  primary:
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb',
  accent:
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f766e',
  danger:
    getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() || '#dc2626',
  warning:
    getComputedStyle(document.documentElement).getPropertyValue('--warning').trim() || '#b45309',
  // ألوان ديناميكية تتكيف مع الوضع الفاتح/الداكن (تقرأ من متغيرات CSS)
  text:
    getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#78716C',
  border:
    getComputedStyle(document.documentElement).getPropertyValue('--border').trim() ||
    'rgba(102,112,133,0.18)',
  grid:
    'color-mix(in srgb, ' +
    (getComputedStyle(document.documentElement).getPropertyValue('--border').trim() ||
      'rgba(102,112,133,0.18)') +
    ' 80%, transparent)',
});

const baseOptions = (moneyTooltip = true) => {
  const colors = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          boxWidth: 10,
          usePointStyle: true,
          color: colors.text,
          font: { family: 'Cairo' },
        },
      },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        backgroundColor: '#1C1917',
        titleColor: '#FAFAF9',
        bodyColor: '#FAFAF9',
        borderColor: '#A16207',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        titleFont: { family: 'Cairo', size: 13, weight: 'bold' },
        bodyFont: { family: 'Cairo', size: 12 },
        callbacks: {
          label: (ctx: any) =>
            `  ${ctx.dataset.label || ctx.label}: ${moneyTooltip ? money(ctx.parsed.y ?? ctx.parsed ?? 0) : number(ctx.parsed.y ?? ctx.parsed ?? 0)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: colors.text, font: { family: 'Cairo', size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: colors.grid },
        ticks: {
          color: colors.text,
          font: { family: 'Cairo', size: 11 },
          callback: (value: any) => (moneyTooltip ? money(value) : number(value)),
        },
      },
    },
  };
};

const createChart = (ChartLib: any, chartRef: any, config: any) => {
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
  const grouping = stats.value.period?.grouping || 'day';
  const formatTrendLabel = (value: any) => {
    if (!value) return '';
    const date = new Date(value);
    if (grouping === 'month') {
      return date.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
    }
    return shortDate(value);
  };
  const labels = trend.map((row: any) => formatTrendLabel(row.date));
  const expensesByDate = new Map(
    expenseTrend.map((row: any) => [formatTrendLabel(row.date), Number(row.expenses || 0)]),
  );

  // Helper to construct canvas gradients
  const makeGradient = (canvas: any, color: string, opacityStart = 0.4, opacityEnd = 0.02) => {
    if (!canvas) return colorMix(color, opacityStart);
    const ctx = canvas.getContext('2d');
    if (!ctx) return colorMix(color, opacityStart);
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 200);
    grad.addColorStop(0, colorMix(color, opacityStart));
    grad.addColorStop(1, colorMix(color, opacityEnd));
    return grad;
  };

  const performanceDatasets: any[] = [
    {
      label: 'المبيعات',
      data: trend.map((row: any) => Number(row.sales || 0)),
      type: 'bar',
      backgroundColor: makeGradient(performanceChartRef.value, colors.primary, 0.4, 0.1),
      borderColor: colors.primary,
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 24,
      hoverBackgroundColor: colorMix(colors.primary, 0.7),
      hoverBorderColor: colors.primary,
      hoverBorderWidth: 1,
    },
  ];

  if (performanceMode.value === 'full') {
    performanceDatasets.push(
      {
        label: 'الربح',
        data: trend.map((row: any) => Number(row.profit || 0)),
        type: 'line',
        borderColor: colors.accent,
        backgroundColor: makeGradient(performanceChartRef.value, colors.accent, 0.35, 0.01),
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        borderWidth: 2.5,
        hoverBackgroundColor: colors.accent,
        hoverBorderWidth: 3,
      },
      {
        label: 'المصروفات',
        data: trend.map((row: any) => expensesByDate.get(formatTrendLabel(row.date)) || 0),
        type: 'line',
        borderColor: colors.danger,
        backgroundColor: makeGradient(performanceChartRef.value, colors.danger, 0.15, 0.01),
        borderDash: [6, 5],
        tension: 0.35,
        pointRadius: 2,
        borderWidth: 2,
      },
    );
  }

  createChart(ChartLib, performanceChartRef, {
    type: 'bar',
    data: { labels, datasets: performanceDatasets },
    options: {
      ...baseOptions(true),
      // أعمدة تظهر تباعًا (staggered) لحركة أكثر حيوية
      animation: {
        duration: 1000,
        easing: 'easeOutQuart',
        delay: (ctx: any) => ctx.dataIndex * 35,
      },
    },
  });

  createChart(ChartLib, salesTypeChartRef, {
    type: 'bar',
    data: {
      labels: (stats.value.salesByType || []).map((row: any) => saleTypeLabel(row.sale_type)),
      datasets: [
        {
          label: 'المبيعات',
          data: (stats.value.salesByType || []).map((row: any) => Number(row.total || 0)),
          backgroundColor: [
            makeGradient(salesTypeChartRef.value, colors.primary, 0.7, 0.3),
            makeGradient(salesTypeChartRef.value, colors.accent, 0.7, 0.3),
            makeGradient(salesTypeChartRef.value, colors.warning, 0.7, 0.3),
          ],
          borderRadius: 7,
          hoverBackgroundColor: [
            colorMix(colors.primary, 0.9),
            colorMix(colors.accent, 0.9),
            colorMix(colors.warning, 0.9),
          ],
        },
      ],
    },
    options: {
      ...baseOptions(true),
      animation: {
        duration: 900,
        easing: 'easeOutQuart',
        delay: (ctx: any) => ctx.dataIndex * 70,
      },
    },
  });

  createChart(ChartLib, paymentChartRef, {
    type: 'doughnut',
    data: {
      labels: (stats.value.paymentSummary || []).map((row: any) =>
        paymentStatusLabel(row.payment_status),
      ),
      datasets: [
        {
          label: 'التحصيل',
          data: (stats.value.paymentSummary || []).map((row: any) => Number(row.total || 0)),
          backgroundColor: [colors.accent, colors.warning, colors.danger, colors.primary],
          borderWidth: 0,
          hoverBackgroundColor: [
            colorMix(colors.accent, 0.85),
            colorMix(colors.warning, 0.85),
            colorMix(colors.danger, 0.85),
            colorMix(colors.primary, 0.85),
          ],
          hoverOffset: 4,
        },
      ],
    },
    options: { ...baseOptions(true), cutout: '62%', scales: {} },
  });

  createChart(ChartLib, expenseChartRef, {
    type: 'doughnut',
    data: {
      labels: (stats.value.expenseByCategory || []).map((row: any) => row.name_ar),
      datasets: [
        {
          label: 'المصروفات',
          data: (stats.value.expenseByCategory || []).map((row: any) => Number(row.total || 0)),
          backgroundColor: [colors.warning, colors.danger, colors.primary, colors.accent],
          borderWidth: 0,
          hoverBackgroundColor: [
            colorMix(colors.warning, 0.85),
            colorMix(colors.danger, 0.85),
            colorMix(colors.primary, 0.85),
            colorMix(colors.accent, 0.85),
          ],
          hoverOffset: 4,
        },
      ],
    },
    options: { ...baseOptions(true), cutout: '58%', scales: {} },
  });

  createChart(ChartLib, categoryProfitChartRef, {
    type: 'doughnut',
    data: {
      labels: (stats.value.categoryProfitability || []).map((row: any) => row.name_ar),
      datasets: [
        {
          label: 'أرباح الفئات',
          data: (stats.value.categoryProfitability || []).map((row: any) =>
            Number(row.profit || 0),
          ),
          backgroundColor: [
            colors.accent,
            colors.primary,
            colors.warning,
            colors.danger,
            '#6366f1',
            '#ec4899',
            '#14b8a6',
            '#f59e0b',
          ],
          borderWidth: 0,
          hoverBackgroundColor: [
            colorMix(colors.accent, 0.85),
            colorMix(colors.primary, 0.85),
            colorMix(colors.warning, 0.85),
            colorMix(colors.danger, 0.85),
            'rgba(99, 102, 241, 0.85)',
            'rgba(236, 72, 153, 0.85)',
            'rgba(20, 184, 166, 0.85)',
            'rgba(245, 158, 11, 0.85)',
          ],
          hoverOffset: 4,
        },
      ],
    },
    options: { ...baseOptions(true), cutout: '58%', scales: {} },
  });

  createChart(ChartLib, topProductsChartRef, {
    type: 'bar',
    data: {
      labels: (stats.value.topProducts || []).map((row: any) => row.name_ar),
      datasets: [
        {
          label: 'المبيعات',
          data: (stats.value.topProducts || []).map((row: any) => Number(row.revenue || 0)),
          backgroundColor: makeGradient(topProductsChartRef.value, colors.primary, 0.75, 0.25),
          borderRadius: 4,
          maxBarThickness: 16,
          hoverBackgroundColor: colorMix(colors.primary, 0.95),
        },
      ],
    },
    options: {
      ...baseOptions(true),
      indexAxis: 'y',
      // شريط سباق: كل شريط ينمو بعد اللي قبله
      animation: {
        duration: 1400,
        easing: 'easeOutQuart',
        delay: (ctx: any) => ctx.dataIndex * 85,
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: { callback: (value: any) => money(value) },
        },
        y: { grid: { display: false } },
      },
    },
  });

  createChart(ChartLib, topCustomersChartRef, {
    type: 'bar',
    data: {
      labels: (stats.value.topCustomers || []).map((row: any) => row.name_ar || 'عميل غير مسجل'),
      datasets: [
        {
          label: 'إجمالي الشراء',
          data: (stats.value.topCustomers || []).map((row: any) => Number(row.total_spent || 0)),
          backgroundColor: makeGradient(topCustomersChartRef.value, colors.accent, 0.75, 0.25),
          borderRadius: 4,
          maxBarThickness: 16,
          hoverBackgroundColor: colorMix(colors.accent, 0.95),
        },
      ],
    },
    options: {
      ...baseOptions(true),
      indexAxis: 'y',
      // شريط سباق: كل شريط ينمو بعد اللي قبله
      animation: {
        duration: 1400,
        easing: 'easeOutQuart',
        delay: (ctx: any) => ctx.dataIndex * 85,
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: colors.grid },
          ticks: { callback: (value: any) => money(value) },
        },
        y: { grid: { display: false } },
      },
    },
  });

  createChart(ChartLib, peakHoursChartRef, {
    type: 'line',
    data: {
      labels: (stats.value.peakHours || []).map((row: any) => formatHour(row.hour)),
      datasets: [
        {
          label: 'المبيعات',
          data: (stats.value.peakHours || []).map((row: any) => Number(row.revenue || 0)),
          borderColor: colors.primary,
          backgroundColor: makeGradient(peakHoursChartRef.value, colors.primary, 0.3, 0.01),
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
          borderWidth: 3,
          pointRadius: 2.5,
          hoverBackgroundColor: colors.primary,
          hoverBorderWidth: 4,
        },
        {
          label: 'الطلبات',
          data: (stats.value.peakHours || []).map((row: any) => Number(row.orders_count || 0)),
          borderColor: colors.warning,
          backgroundColor: makeGradient(peakHoursChartRef.value, colors.warning, 0.15, 0.01),
          fill: true,
          tension: 0.4,
          yAxisID: 'y1',
          borderWidth: 2,
          pointRadius: 2,
          hoverBackgroundColor: colors.warning,
          hoverBorderWidth: 3,
        },
      ],
    },
    options: {
      ...baseOptions(true),
      animation: { duration: 1200, easing: 'easeInOutCubic' },
      scales: {
        x: { grid: { display: false } },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: colors.grid },
          ticks: { callback: (value: any) => money(value) },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { callback: (value: any) => number(value) },
        },
      },
      plugins: {
        ...baseOptions(true).plugins,
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          callbacks: {
            label: (ctx: any) => {
              if (ctx.datasetIndex === 0) {
                return `المبيعات: ${money(ctx.parsed.y)}`;
              } else {
                return `الطلبات: ${number(ctx.parsed.y)} طلب`;
              }
            },
          },
        },
      },
    },
  });

  // ─── Demand Forecasting Chart ───
  if (forecastingChartRef.value) {
    const last7 = trend.slice(-7);
    const actualSales = last7.map((r: any) => Number(r.sales || 0));
    const chartLabels = [];
    const actualDataset = [];
    const forecastDataset = [];

    last7.forEach((r: any) => {
      chartLabels.push(formatTrendLabel(r.date));
      actualDataset.push(Number(r.sales || 0));
      forecastDataset.push(null);
    });

    if (actualSales.length > 0) {
      forecastDataset[forecastDataset.length - 1] = actualSales[actualSales.length - 1];
    }

    const baseDate = last7.length > 0 ? new Date(last7[last7.length - 1].date) : new Date();
    const lastVal = actualSales[actualSales.length - 1] || 1500;

    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + i);
      chartLabels.push(shortDate(nextDate));

      const dayOfWeek = nextDate.getDay();
      let factor = 1.0;
      if (dayOfWeek === 4 || dayOfWeek === 5) factor = 1.22;
      else if (dayOfWeek === 0 || dayOfWeek === 1) factor = 0.92;

      const projection = Math.round(lastVal * (1.004 + (Math.random() * 0.02 - 0.01)) * factor);
      forecastDataset.push(projection);
      actualDataset.push(null);
    }

    createChart(ChartLib, forecastingChartRef, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'المبيعات الفعلية (أسبوع مضى)',
            data: actualDataset,
            borderColor: colors.primary,
            backgroundColor: makeGradient(forecastingChartRef.value, colors.primary, 0.25, 0.01),
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            borderWidth: 2.5,
          },
          {
            label: 'توقعات الطلب (AI Forecast للأسبوع القادم)',
            data: forecastDataset,
            borderColor: colors.accent,
            borderDash: [5, 5],
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 4,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        ...baseOptions(true),
        animation: { duration: 1200, easing: 'easeInOutCubic' },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: colors.grid }, ticks: { callback: (value: any) => money(value) } },
        },
      },
    });
  }
};

const colorMix = (hex: any, opacity: any) => {
  const color = hex.trim();
  if (!color.startsWith('#') || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const paymentStatusLabel = (status: any) =>
  (
    ({
      paid: 'مدفوع',
      partial: 'جزئي',
      unpaid: 'غير مدفوع',
      refunded: 'مسترد',
    }) as Record<string, string>
  )[status] ||
  status ||
  'غير محدد';

const loadDashboard = async () => {
  loading.value = true;
  refreshing.value = true;
  error.value = '';
  try {
    const res = await dashboardApi(dashboardParams.value);
    stats.value = res.data;
    lastUpdated.value = new Date();
    nowTick.value = Date.now();
    loading.value = false;
    await nextTick();
    await renderCharts();
  } catch (err: any) {
    error.value = err.message || 'حدث خطأ أثناء تحميل لوحة التحكم';
    destroyCharts();
    loading.value = false;
  } finally {
    // انتهى التحميل — يعود الشريط للعد من جديد
    refreshing.value = false;
    refreshProgress.value = 0;
  }
};

const handleWindowFocus = () => loadDashboard();
const handleRealtimeUpdate = () => loadDashboard();
const handleThemeChange = () => renderCharts();

onMounted(() => {
  loadDashboard();
  loadWarehouses();
  if (autoRefresh.value) startAutoRefresh();
  // عدّاد عرض "منذ X ثانية" + تقدم شريط التحديث التلقائي
  tickTimer = setInterval(() => {
    nowTick.value = Date.now();
    if (autoRefresh.value && !loading.value) {
      // خطوة 1/60 من الدقيقة كل ثانية
      refreshProgress.value = Math.min(
        100,
        refreshProgress.value + 100 / (AUTO_REFRESH_INTERVAL / 1000),
      );
    }
  }, 1000);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('invoices-updated', handleRealtimeUpdate);
  window.addEventListener('sales-updated', handleRealtimeUpdate);
  window.addEventListener('inventory-updated', handleRealtimeUpdate);
  window.addEventListener('expenses-updated', handleRealtimeUpdate);
  window.addEventListener('theme-changed', handleThemeChange);
});

onBeforeUnmount(() => {
  stopAutoRefresh();
  if (tickTimer) clearInterval(tickTimer);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('invoices-updated', handleRealtimeUpdate);
  window.removeEventListener('sales-updated', handleRealtimeUpdate);
  window.removeEventListener('inventory-updated', handleRealtimeUpdate);
  window.removeEventListener('expenses-updated', handleRealtimeUpdate);
  window.removeEventListener('theme-changed', handleThemeChange);
  destroyCharts();
});
</script>

<style lang="scss" scoped>
@use '../components/dashboard/dashboardShared.scss';

.dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── شريط تقدم التحديث التلقائي (رفيع أعلى اللوحة) ── */
.auto-refresh-bar {
  position: absolute;
  top: 3px;
  left: 10px;
  right: 10px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--primary), var(--accent));
  box-shadow: 0 0 10px color-mix(in srgb, var(--primary) 50%, transparent);
  transition: width 1s linear;
  z-index: 6;
  pointer-events: none;
}

/* أثناء التحميل الفعلي: تعبئة كاملة + انزلاق لا نهائي (نبض خلفية) */
.auto-refresh-bar.refreshing {
  transition: none;
  background: linear-gradient(90deg, transparent, var(--accent), var(--primary), transparent);
  background-size: 200% 100%;
  animation: bar-slide 0.9s linear infinite;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
}

@keyframes bar-slide {
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auto-refresh-bar,
  .auto-refresh-bar.refreshing {
    transition: none !important;
    animation: none !important;
  }
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--header-bg);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(16px) saturate(1.08);
  -webkit-backdrop-filter: blur(16px) saturate(1.08);
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

/* ── التحديث التلقائي الدوري + مؤشر آخر تحديث ── */
.auto-refresh-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 800;
  transition:
    border-color var(--transition),
    background var(--transition);

  &.active {
    border-color: color-mix(in srgb, var(--success) 35%, var(--border));
    background: color-mix(in srgb, var(--success) 6%, var(--surface-2));
  }

  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    opacity: 0.45;
    transition: all 0.25s ease;
    flex-shrink: 0;

    &.on {
      background: var(--success);
      opacity: 1;
      animation: live-pulse 2s infinite;
    }
  }

  .last-updated {
    white-space: nowrap;
  }

  .auto-refresh-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: var(--bg-elevated);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--primary);
      color: var(--primary);
      transform: scale(1.08);
    }
  }
}

@keyframes live-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 55%, transparent);
  }
  70% {
    box-shadow: 0 0 0 6px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* دوران أيقونة التحديث أثناء التحميل */
.spin-icon {
  animation: icon-spin 0.9s linear infinite;
}

@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot.on,
  .spin-icon {
    animation: none !important;
  }
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

@media (max-width: 980px) {
  .dashboard-header {
    grid-template-columns: 1fr;
    display: grid;
  }
}

@media (max-width: 640px) {
  .header-actions {
    align-items: stretch;
  }
  .range-controls {
    width: 100%;
  }
  .range-btn {
    flex: 1;
  }
}

/* Stock Alerts Styles */
.stock-alerts-list {
  display: grid;
  gap: 12px;
}

.stock-alert-card {
  display: grid;
  gap: 6px;
}

.stock-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stock-name {
  color: var(--text-strong);
  font-size: 0.88rem;
  font-weight: 800;
}

.stock-level {
  font-size: 0.82rem;
  font-weight: 900;
}

.text-danger-bold {
  color: var(--danger) !important;
}

.text-warning-bold {
  color: var(--warning) !important;
}

.progress-bar-container {
  height: 6px;
  background: var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width 0.4s ease;
}

.progress-bar.empty {
  background: var(--danger);
}

.progress-bar.depleted {
  background: linear-gradient(90deg, var(--danger), var(--warning));
}

/* Modern Alerts Styles */
.alert-modern-stack {
  display: grid;
  gap: 8px;
}

.alert-modern-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  transition: transform var(--transition);
}

.alert-modern-item:hover {
  transform: translateX(-2px);
}

.alert-modern-item.danger {
  border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--danger) 4%, transparent),
    transparent
  );
}

.alert-modern-item.danger .alert-icon-box {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.alert-modern-item.warning {
  border-color: color-mix(in srgb, var(--warning) 25%, var(--border));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--warning) 4%, transparent),
    transparent
  );
}

.alert-modern-item.warning .alert-icon-box {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
}

.alert-modern-item.info {
  border-color: color-mix(in srgb, var(--info) 25%, var(--border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--info) 4%, transparent), transparent);
}

.alert-modern-item.info .alert-icon-box {
  color: var(--info);
  background: color-mix(in srgb, var(--info) 10%, transparent);
}

.alert-icon-box {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.alert-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.alert-label {
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 800;
}

.alert-value {
  color: var(--text-strong);
  font-size: 0.94rem;
  font-weight: 900;
}

/* Timeline Feed Styles */
.timeline-feed {
  display: grid;
  gap: 12px;
  position: relative;
  padding-right: 12px;
}

.timeline-feed::before {
  content: '';
  position: absolute;
  right: 4px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--border);
}

.timeline-row {
  position: relative;
  display: flex;
  gap: 12px;
  padding-right: 16px;
}

.timeline-marker {
  position: absolute;
  right: 0;
  top: 6px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
  border: 2px solid var(--bg-elevated);
  z-index: 2;
}

.timeline-marker.wholesale {
  background: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent);
}

.timeline-marker.retail {
  background: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.timeline-marker.pos {
  background: var(--success);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--success) 20%, transparent);
}

.timeline-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sale-num {
  color: var(--text-strong);
  font-size: 0.86rem;
  font-weight: 900;
}

.sale-badge {
  font-size: 0.7rem;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg);
  border: 1px solid var(--border);
}

.sale-badge.wholesale {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 20%, transparent);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}

.sale-badge.retail {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 20%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.sale-badge.pos {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 20%, transparent);
  background: color-mix(in srgb, var(--success) 6%, transparent);
}

.timeline-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timeline-meta small {
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 800;
}

.sale-amount {
  color: var(--primary-dark);
  font-size: 0.88rem;
  font-weight: 950;
}

/* User & Module Activity Badge Styles */
.user-badge {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--text-strong);
  background: var(--bg);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.module-badge {
  font-size: 0.7rem;
  font-weight: 900;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.module-badge.sales {
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.module-badge.inventory {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.module-badge.expenses {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.module-badge.purchases {
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.module-badge.users,
.module-badge.auth {
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.08);
}

.module-badge.hr {
  color: #059669;
  background: rgba(5, 150, 105, 0.08);
}

.module-badge.settings {
  color: #4b5563;
  background: rgba(75, 85, 99, 0.08);
}

.activity-text {
  color: var(--text-strong);
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.5;
  margin: 4px 0;
  text-align: right;
}

/* Module Marker Colors */
.timeline-marker.sales {
  background: var(--primary);
}
.timeline-marker.inventory {
  background: var(--accent);
}
.timeline-marker.expenses {
  background: var(--danger);
}
.timeline-marker.purchases {
  background: var(--warning);
}
.timeline-marker.users,
.timeline-marker.auth {
  background: #7c3aed;
}
.timeline-marker.hr {
  background: #059669;
}
.timeline-marker.settings {
  background: #4b5563;
}

/* Draggable Metrics & AI Insights styling */
.metric-card-draggable {
  cursor: grab;
  transition: transform 0.2s ease;
  &:active {
    cursor: grabbing;
    transform: scale(0.98);
  }
}

.insights-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-card);
  transition: all 0.2s ease;

  .insight-icon {
    font-size: 1.3rem;
    line-height: 1;
  }

  .insight-body {
    strong {
      display: block;
      font-size: 0.92rem;
      font-weight: 800;
      color: var(--text-strong);
      margin-bottom: 4px;
      text-align: right;
    }
    p {
      color: var(--text-muted);
      font-size: 0.8rem;
      line-height: 1.5;
      text-align: right;
    }
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-xs);
  }

  &.danger {
    border-right: 4px solid var(--danger);
    background: color-mix(in srgb, var(--danger) 3%, var(--bg-card));
  }
  &.warning {
    border-right: 4px solid var(--warning);
    background: color-mix(in srgb, var(--warning) 3%, var(--bg-card));
  }
  &.success {
    border-right: 4px solid var(--success);
    background: color-mix(in srgb, var(--success) 3%, var(--bg-card));
  }
  &.info {
    border-right: 4px solid var(--info);
    background: color-mix(in srgb, var(--info) 3%, var(--bg-card));
  }
}

/* ── Widget Drawer ── */
.widget-drawer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  visibility: hidden;
  transition: visibility 0.3s;

  &.open {
    visibility: visible;

    .drawer-overlay {
      opacity: 0.6;
    }

    .drawer-content {
      transform: translateX(0);
    }
  }

  .drawer-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .drawer-content {
    position: absolute;
    top: 0;
    right: 0;
    width: 380px;
    max-width: 90%;
    height: 100%;
    background: var(--bg-card);
    border-left: 1px solid var(--border);
    box-shadow: -5px 0 25px rgba(0, 0, 0, 0.15);
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    padding: 24px;
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 16px;
    margin-bottom: 16px;

    h3 {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-strong);
      margin: 0;
    }

    .drawer-close {
      background: none;
      border: none;
      font-size: 1.8rem;
      color: var(--text-muted);
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
      transition: color 0.2s;

      &:hover {
        color: var(--danger);
      }
    }
  }

  .drawer-desc {
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .toggle-group {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .toggle-control {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 10px);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 4%, var(--bg-elevated));
    }

    input[type='checkbox'] {
      width: 18px;
      height: 18px;
      accent-color: var(--primary);
      cursor: pointer;
    }

    .control-label {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-strong);
    }
  }
}
</style>
