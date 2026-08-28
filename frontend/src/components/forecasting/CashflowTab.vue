<template>
  <div class="card table-card">
    <h3>توقع التدفقات النقدية والسيولة (Cash Flow Runway)</h3>
    <p class="section-desc">
      تقدير السيولة النقدية المتوفرة للـ 30 يوماً القادمة بناءً على متوسطات المبيعات اليومية
      التاريخية، مقارنةً بمتوسط المصاريف والمشتريات اليومية.
    </p>

    <div v-if="cashflowData" class="cashflow-dashboard">
      <!-- Mini stats inside cashflow tab -->
      <div class="grid grid-4 cashflow-mini-stats">
        <div class="card mini-stat-card">
          <span class="mini-icon"><AppIcon name="money" :size="20" /></span>
          <div class="mini-meta">
            <h4>السيولة الحالية</h4>
            <p class="font-bold">{{ formatMoney(cashflowData.currentBalance) }}</p>
          </div>
        </div>
        <div class="card mini-stat-card">
          <span class="mini-icon"><AppIcon name="trendingUp" :size="20" /></span>
          <div class="mini-meta">
            <h4>الرصيد المتوقع (30 يوم)</h4>
            <p
              class="font-bold"
              :class="cashflowData.projectedBalance30d < 0 ? 'text-danger' : 'text-success'"
            >
              {{ formatMoney(cashflowData.projectedBalance30d) }}
            </p>
          </div>
        </div>
        <div class="card mini-stat-card">
          <span class="mini-icon"><AppIcon name="activity" :size="20" /></span>
          <div class="mini-meta">
            <h4>صافي التغيير المتوقع</h4>
            <p
              class="font-bold"
              :class="cashflowData.netChange < 0 ? 'text-danger' : 'text-success'"
            >
              {{ cashflowData.netChange > 0 ? '+' : '' }}{{ formatMoney(cashflowData.netChange) }}
            </p>
          </div>
        </div>
        <div class="card mini-stat-card">
          <span class="mini-icon"><AppIcon name="clock" :size="20" /></span>
          <div class="mini-meta">
            <h4>أيام البقاء الآمن (Runway)</h4>
            <p
              class="font-bold"
              :class="
                cashflowData.runwayDays !== null ? 'text-danger animate-pulse' : 'text-success'
              "
            >
              {{
                cashflowData.runwayDays !== null
                  ? `${cashflowData.runwayDays} يوم`
                  : 'مستقر (30+ يوم)'
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- Alert banner inside cashflow tab -->
      <div class="cashflow-alert-bar" :class="'status-' + cashflowData.status">
        <span class="alert-icon">
          {{ cashflowData.status === 'healthy' ? '' : cashflowData.status === 'warning' ? '' : '' }}
        </span>
        <p class="alert-text">{{ cashflowData.warningMsg }}</p>
      </div>

      <!-- Chart container -->
      <div
        class="chart-container"
        style="position: relative; height: 320px; margin-bottom: 24px; width: 100%"
      >
        <canvas ref="chartCanvas"></canvas>
      </div>

      <!-- Table of daily points -->
      <div class="table-wrap">
        <table class="forecast-table">
          <thead>
            <tr>
              <th>اليوم</th>
              <th>التاريخ</th>
              <th>الوارد المتوقع (إيراد مبيعات)</th>
              <th>الصادر المتوقع (مصاريف + مشتريات)</th>
              <th>صافي التدفق اليومي</th>
              <th>الرصيد التراكمي المتوقع</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="point in filteredPoints"
              :key="point.date"
              :class="point.balance < 0 ? 'row-critical' : ''"
            >
              <td class="font-bold">{{ point.day_name }}</td>
              <td class="muted">{{ formatDate(point.date) }}</td>
              <td class="text-success font-bold">+{{ formatMoney(point.projected_in) }}</td>
              <td class="text-danger font-bold">-{{ formatMoney(point.projected_out) }}</td>
              <td
                class="font-bold"
                :class="
                  point.projected_in - point.projected_out < 0 ? 'text-danger' : 'text-success'
                "
              >
                {{ point.projected_in - point.projected_out > 0 ? '+' : ''
                }}{{ formatMoney(point.projected_in - point.projected_out) }}
              </td>
              <td class="font-bold amount">{{ formatMoney(point.balance) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="empty">لا تتوفر بيانات توقعات التدفق المالي حالياً.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney } from '@/utils/currency';

// تبويب التدفقات النقدية — إحصائيات مصغرة + شريط تنبيه + رسم Chart.js + جدول النقاط اليومية.
// منطق الرسم كله هنا (تحميل chart.js ديناميكيًا + رسم/تدمير المخطط عند تغيير البيانات).
const props = defineProps<{ cashflowData: any; searchTerm?: string }>();

const chartCanvas = ref<HTMLCanvasElement | null>(null);
let chartInstance: any = null;
let ChartLib: any = null;

const filteredPoints = computed(() => {
  const points = props.cashflowData?.dailyPoints || [];
  const q = (props.searchTerm || '').trim().toLowerCase();
  if (!q) return points;
  return points.filter(
    (p: any) => p.day_name.toLowerCase().includes(q) || p.date.toLowerCase().includes(q),
  );
});

const formatDate = (value: any) => {
  if (!value) return 'غير محدد';
  const raw = String(value).split('T')[0]!;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-') as [string, string, string];
    return `${day}/${month}/${year}`;
  }
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const loadChartLib = async () => {
  if (ChartLib) return ChartLib;
  const mod = await import('chart.js');
  ChartLib = mod.Chart;
  ChartLib.register(...mod.registerables);
  return ChartLib;
};

const renderChart = async () => {
  if (!chartCanvas.value || !props.cashflowData) return;

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const Chart = await loadChartLib();
  const ctx = chartCanvas.value.getContext('2d');
  if (!ctx) return;

  const points = props.cashflowData.dailyPoints || [];
  const labels = points.map((p: any) => formatDate(p.date));
  const balances = points.map((p: any) => p.balance);

  const colors = {
    primary:
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#176b5b',
    // ألوان ديناميكية تتكيف مع الوضع الفاتح/الداكن
    text:
      getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() ||
      '#78716C',
    grid:
      'color-mix(in srgb, ' +
      (getComputedStyle(document.documentElement).getPropertyValue('--border').trim() ||
        'rgba(102,112,133,0.18)') +
      ' 80%, transparent)',
  };

  const colorMix = (color: any, opacity: any) => {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  };

  const makeGradient = (canvas: any, color: any, opacityStart = 0.35, opacityEnd = 0.01) => {
    if (!canvas) return color;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 250);
    grad.addColorStop(0, colorMix(color, opacityStart));
    grad.addColorStop(1, colorMix(color, opacityEnd));
    return grad;
  };

  const chartGradient = makeGradient(chartCanvas.value, colors.primary, 0.3, 0.01);

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'رصيد السيولة المتوقع (ج.م)',
          data: balances,
          borderColor: colors.primary,
          backgroundColor: chartGradient,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2.5,
          hoverBackgroundColor: colors.primary,
          hoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            usePointStyle: true,
            color: colors.text,
            font: {
              family: 'Outfit, Cairo, sans-serif',
            },
          },
        },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          callbacks: {
            label: (context: any) => `${context.dataset.label}: ${formatMoney(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: {
              family: 'Outfit, Cairo, sans-serif',
            },
          },
        },
        y: {
          beginAtZero: false,
          grid: {
            color: colors.grid,
          },
          ticks: {
            color: colors.text,
            font: {
              family: 'Outfit, Cairo, sans-serif',
            },
            callback: (val: any) => formatMoney(val),
          },
        },
      },
    },
  });
};

watch(
  () => props.cashflowData,
  () => {
    renderChart();
  },
  { flush: 'post' },
);

// إعادة رسم المخطط عند تغيير الثيم حتى تأخذ الخطوط والألوان قيم الوضع الجديد
const handleThemeChange = () => renderChart();

onMounted(() => {
  renderChart();
  window.addEventListener('theme-changed', handleThemeChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('theme-changed', handleThemeChange);
});
</script>

<style lang="scss" scoped>
@use './forecastShared.scss';

.cashflow-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cashflow-mini-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 8px;
}

.mini-stat-card {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);

  .mini-icon {
    font-size: 1.8rem;
  }

  .mini-meta {
    h4 {
      margin: 0;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    p {
      margin: 4px 0 0;
      font-size: 1.1rem;
      color: var(--text-strong);
    }
  }
}

.cashflow-alert-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius);
  font-size: 0.88rem;
  line-height: 1.4;

  &.status-healthy {
    background: rgba(16, 185, 129, 0.08);
    border-right: 4px solid var(--success);
    color: var(--success);
  }

  &.status-warning {
    background: rgba(245, 158, 11, 0.08);
    border-right: 4px solid var(--warning);
    color: var(--warning);
  }

  &.status-danger {
    background: rgba(239, 68, 68, 0.08);
    border-right: 4px solid var(--danger);
    color: var(--danger);
  }

  .alert-icon {
    font-size: 1.25rem;
  }

  .alert-text {
    margin: 0;
  }
}

.chart-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
