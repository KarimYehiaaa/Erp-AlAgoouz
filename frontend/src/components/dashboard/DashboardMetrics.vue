<template>
  <section class="metric-grid enterprise-kpi-grid">
    <div
      v-for="(metric, index) in orderedMetrics"
      :key="metric.key"
      class="metric-card-draggable stagger-fade-item"
      :class="'stagger-delay-' + ((index % 10) + 1)"
      draggable="true"
      @dragstart="onDragStart($event, index)"
      @dragover.prevent
      @drop="onDrop($event, index)"
      title="اسحب البطاقة لتغيير الترتيب"
    >
      <RouterLink
        v-spotlight
        class="metric-card hover-lift glass-glow-card"
        :class="metric.tone"
        :to="metric.to"
      >
        <div class="metric-top-bar">
          <span class="metric-icon"><AppIcon :name="metric.icon" :size="18" /></span>
          <span
            v-if="metric.delta !== undefined"
            class="trend-delta-pill"
            :class="metric.delta >= 0 ? 'up' : 'down'"
          >
            <AppIcon :name="metric.delta >= 0 ? 'trendingUp' : 'trendingDown'" :size="11" />
            {{ metric.delta >= 0 ? '+' : '' }}{{ metric.delta }}%
          </span>
        </div>
        <span class="metric-label">
          {{ metric.label }}
          <span v-if="metric.estimate" class="estimate-pill" :title="metric.estimateNote"
            >≈ تقديري</span
          >
        </span>
        <strong class="metric-num">
          <AnimatedNumber :value="metric.raw" :format="metric.format" />
        </strong>
        <small class="metric-sub">{{ metric.sub }}</small>
        <Sparkline
          v-if="metric.spark && metric.spark.length > 1"
          :data="metric.spark"
          :color="metric.sparkColor"
          class="metric-spark"
        />
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { formatMoney, abbreviateNumber, formatPercent } from '@/utils/formatters';
import AnimatedNumber from '@/components/ui/AnimatedNumber.vue';
import Sparkline from '@/components/ui/Sparkline.vue';
const props = defineProps({
  stats: { type: Object, required: true },
});

const authStore = useAuthStore();

// Helpers (تستخدم كدوال تنسيق داخل العداد المتحرك)
const money = (val: any) => formatMoney(val || 0);
const moneyCompact = (val: any) => formatMoney(val || 0, { compact: true });
const number = (val: any) => abbreviateNumber(val || 0);
const percent = (val: any) => formatPercent(val || 0);

const monthCards = computed(() => props.stats?.monthCards || {});

const mainMetrics = computed(() => {
  const s = props.stats;
  // بيانات الاتجاه للـ Sparklines (آخر 7 نقاط في المخطط)
  const salesTrend = (s?.salesTrend || []).map((r: any) => Number(r.sales || 0));
  const profitTrend = (s?.salesTrend || []).map((r: any) => Number(r.profit || 0));
  const expenseTrend = (s?.expenseTrend || []).map((r: any) => Number(r.expenses || 0));

  const metrics = [
    {
      key: 'sales',
      label: 'إجمالي المبيعات',
      raw: Number(s?.month?.sales || 0),
      format: money,
      spark: salesTrend,
      sparkColor: 'var(--primary)',
      delta: 12.4,
      sub: `${number(s?.month?.salesCount)} عملية`,
      icon: 'sales',
      tone: 'sales',
      to: '/sales',
    },
    {
      key: 'profit',
      label: 'صافي الربح',
      raw: Number(s?.month?.netProfit || 0),
      format: money,
      spark: profitTrend,
      sparkColor: 'var(--success)',
      delta: 8.2,
      sub: `${s?.month?.cogsBasis === 'purchases' ? 'تقديري بناء على مشتريات الفترة - ' : ''}تحصيل ${percent(s?.month?.collectionRate)}`,
      icon: 'reports',
      tone: 'profit',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'margin',
      label: 'هامش الربح %',
      raw: (Number(s?.month?.netProfit || 0) / (Number(s?.month?.sales || 0) || 1)) * 100,
      format: percent,
      delta: 2.1,
      sub: 'صافي الأرباح المئوية',
      icon: 'reports',
      tone: 'profit',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'cogs',
      label: 'تكلفة البضاعة المباعة',
      raw: Number(s?.month?.cost || 0),
      format: money,
      sub: 'تكلفة المواد والبضاعة المباشرة',
      icon: 'coins',
      tone: 'warning',
      to: '/recipes',
      perm: 'reports.view',
    },
    {
      key: 'purchases_sales_ratio',
      label: 'نسبة الشراء للبيع',
      raw: (Number(monthCards.value.purchases || 0) / (Number(s?.month?.sales || 0) || 1)) * 100,
      format: percent,
      sub: 'المعدل الصحي 25% - 35%',
      icon: 'purchases',
      tone:
        Number(monthCards.value.purchases || 0) / (Number(s?.month?.sales || 0) || 1) <= 0.35
          ? 'success'
          : 'warning',
      to: '/purchases',
      perm: 'inventory.manage',
    },
    {
      key: 'unpaid',
      label: 'مديونيات العملاء',
      raw: Number(s?.unpaidInvoices?.amount || 0),
      format: money,
      sub: `${number(s?.unpaidInvoices?.count)} عميل عليه مديونية`,
      icon: 'warning',
      tone: Number(s?.unpaidInvoices?.amount || 0) ? 'danger' : 'success',
      to: '/sales?tab=wholesale',
      perm: 'reports.view',
    },
    {
      key: 'expenses',
      label: 'المصروفات',
      raw: Number(s?.month?.expenses || 0),
      format: money,
      spark: expenseTrend,
      sparkColor: 'var(--danger)',
      sub: `${number(s?.month?.expensesCount)} حركة`,
      icon: 'expenses',
      tone: 'warning',
      to: '/expenses',
      perm: 'expenses.manage',
    },
    {
      key: 'purchases',
      label: 'المشتريات',
      raw: Number(monthCards.value.purchases || 0),
      format: money,
      sub: `${number(monthCards.value.purchasesCount)} فاتورة`,
      icon: 'purchases',
      tone: 'inventory',
      to: '/purchases',
      perm: 'inventory.manage',
    },
    {
      key: 'inventory',
      label: 'قيمة المخزون',
      raw: Number(s?.inventoryStats?.inventory_value || 0),
      format: money,
      sub: `${number(s?.inventoryStats?.products)} منتج`,
      icon: 'inventory',
      tone: 'inventory',
      to: '/inventory',
      perm: 'inventory.manage',
    },
    {
      key: 'cash',
      label: 'السيولة المتوفرة (الخزينة)',
      raw: Number(s?.realIncomeMonth || 0),
      format: money,
      estimate: true,
      estimateNote:
        s?.cashDetails?.estimateNote ||
        'تقدير نقدي: رصيد أول المدة + تحصيلات العملاء الفعلية − مدفوعات الموردين − المصروفات',
      // إظهار تحصيل الديون القديمة إن كان موجبًا (سداد عملاء على مبيعات/فواتير من فترات سابقة)
      sub:
        Number(s?.cashDetails?.oldDebtCollections || 0) > 0
          ? `منها ${moneyCompact(s?.cashDetails?.oldDebtCollections)} سداد ديون سابقة`
          : 'رصيد + تحصيلات − سداد موردين − مصاريف',
      icon: 'money',
      tone: Number(s?.realIncomeMonth || 0) >= 0 ? 'profit' : 'danger',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'total_assets',
      label: 'إجمالي أصول المنشأة',
      raw: Number(s?.totalAssets || 0),
      format: money,
      sub: 'الخزينة + المديونيات + المخزون',
      icon: 'reports',
      tone: Number(s?.totalAssets || 0) >= 0 ? 'success' : 'danger',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'active_customers',
      label: 'العملاء النشطون',
      raw: Number(s?.customersCount || 0),
      format: number,
      sub: 'عميل متفاعل بالفترة',
      icon: 'customers',
      tone: 'info',
      to: '/customers',
    },
  ];
  return metrics.filter((m: any) => !m.perm || authStore.hasPermission(m.perm));
});

const metricsOrder = ref<any[]>([]);

onMounted(() => {
  const saved = localStorage.getItem('dashboard_metrics_order_keys');
  if (saved) {
    try {
      metricsOrder.value = JSON.parse(saved);
    } catch {
      metricsOrder.value = [];
    }
  }
});

const orderedMetrics = computed(() => {
  const base = mainMetrics.value;
  if (!metricsOrder.value.length) return base;
  const sorted: any[] = [];
  metricsOrder.value.forEach((key: any) => {
    const found = base.find((m: any) => m.key === key);
    if (found) sorted.push(found);
  });
  base.forEach((m: any) => {
    if (!sorted.find((x: any) => x.key === m.key)) sorted.push(m);
  });
  return sorted;
});

const dragIndex = ref<any>(null);
const onDragStart = (event: any, index: any) => {
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
};

const onDrop = (event: any, index: any) => {
  if (dragIndex.value === null) return;
  const list = [...orderedMetrics.value];
  const temp = list[dragIndex.value];
  list[dragIndex.value] = list[index];
  list[index] = temp;

  metricsOrder.value = list.map((m: any) => m.key);
  localStorage.setItem('dashboard_metrics_order_keys', JSON.stringify(metricsOrder.value));
  dragIndex.value = null;
};
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

.metric-spark {
  margin-top: 4px;
  opacity: 0.92;
  transition: opacity 0.2s ease;
}

.metric-card.bento-metric-card:hover .metric-spark {
  opacity: 1;
}

/* وسام التقدير على البطاقات التقريبية (السيولة) */
.estimate-pill {
  display: inline-block;
  margin-right: 3px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 0.55rem;
  font-weight: 900;
  line-height: 1.3;
  vertical-align: middle;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  cursor: help;
}
</style>
