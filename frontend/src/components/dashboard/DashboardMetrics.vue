<template>
  <section class="metric-grid circular-grid">
    <div
      v-for="(metric, index) in orderedMetrics"
      :key="metric.key"
      class="metric-card-draggable circular-draggable stagger-fade-item"
      :class="'stagger-delay-' + ((index % 10) + 1)"
      draggable="true"
      @dragstart="onDragStart($event, index)"
      @dragover.prevent
      @drop="onDrop($event, index)"
      title="اسحب البطاقة لتغيير الترتيب"
    >
      <RouterLink class="metric-card circular-card hover-lift" :class="metric.tone" :to="metric.to">
        <span class="metric-icon"><AppIcon :name="metric.icon" :size="18" /></span>
        <span class="metric-label">{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small class="metric-sub">{{ metric.sub }}</small>
      </RouterLink>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { formatMoney, abbreviateNumber, formatPercent } from '@/utils/formatters';

const props = defineProps({
  stats: { type: Object, required: true },
});

const authStore = useAuthStore();

// Helpers
const money = (val) => formatMoney(val || 0);
const number = (val) => abbreviateNumber(val || 0);
const percent = (val) => formatPercent(val || 0);

const monthCards = computed(() => props.stats?.monthCards || {});

const mainMetrics = computed(() => {
  const s = props.stats;
  const metrics = [
    {
      key: 'sales',
      label: 'إجمالي المبيعات',
      value: money(s?.month?.sales),
      sub: `${number(s?.month?.salesCount)} عملية`,
      icon: 'sales',
      tone: 'sales',
      to: '/sales',
    },
    {
      key: 'profit',
      label: 'صافي الربح',
      value: money(s?.month?.netProfit),
      sub: `${s?.month?.cogsBasis === 'purchases_estimate' ? 'تقديري بناء على مشتريات الفترة - ' : ''}تحصيل ${percent(s?.month?.collectionRate)}`,
      icon: 'reports',
      tone: 'profit',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'margin',
      label: 'هامش الربح %',
      value: percent(
        (Number(s?.month?.netProfit || 0) / (Number(s?.month?.sales || 0) || 1)) * 100,
      ),
      sub: 'صافي الأرباح المئوية',
      icon: 'reports',
      tone: 'profit',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'cogs',
      label: 'تكلفة البضاعة',
      value: money(s?.month?.cost),
      sub: 'تكلفة تحضير المشروبات',
      icon: 'coffee',
      tone: 'warning',
      to: '/recipes',
      perm: 'reports.view',
    },
    {
      key: 'purchases_sales_ratio',
      label: 'نسبة الشراء للبيع',
      value: percent(
        (Number(monthCards.value.purchases || 0) / (Number(s?.month?.sales || 0) || 1)) * 100,
      ),
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
      value: money(s?.unpaidInvoices?.amount),
      sub: `${number(s?.unpaidInvoices?.count)} عميل عليه مديونية`,
      icon: 'warning',
      tone: Number(s?.unpaidInvoices?.amount || 0) ? 'danger' : 'success',
      to: '/sales?tab=wholesale',
      perm: 'reports.view',
    },
    {
      key: 'expenses',
      label: 'المصروفات',
      value: money(s?.month?.expenses),
      sub: `${number(s?.month?.expensesCount)} حركة`,
      icon: 'expenses',
      tone: 'warning',
      to: '/expenses',
      perm: 'expenses.manage',
    },
    {
      key: 'purchases',
      label: 'المشتريات',
      value: money(monthCards.value.purchases),
      sub: `${number(monthCards.value.purchasesCount)} فاتورة`,
      icon: 'purchases',
      tone: 'inventory',
      to: '/purchases',
      perm: 'inventory.manage',
    },
    {
      key: 'inventory',
      label: 'قيمة المخزون',
      value: money(s?.inventoryStats?.inventory_value),
      sub: `${number(s?.inventoryStats?.products)} منتج`,
      icon: 'inventory',
      tone: 'inventory',
      to: '/inventory',
      perm: 'inventory.manage',
    },
    {
      key: 'cash',
      label: 'السيولة المتوفرة',
      value: money(s?.cashFlowMonth),
      sub: 'مبيعات كاش - مصروفات ومشتريات',
      icon: 'money',
      tone: Number(s?.cashFlowMonth || 0) >= 0 ? 'profit' : 'danger',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'real-income',
      label: 'الدخل الحقيقي',
      value: money(s?.realIncomeMonth),
      sub: `صافي التدفق - الآجل ${money(s?.unpaidInvoices?.amount)}`,
      icon: 'reports',
      tone: Number(s?.realIncomeMonth || 0) >= 0 ? 'success' : 'danger',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'active_customers',
      label: 'العملاء النشطون',
      value: number(s?.customersCount),
      sub: 'عميل متفاعل بالفترة',
      icon: 'customers',
      tone: 'info',
      to: '/customers',
    },
  ];
  return metrics.filter((m) => !m.perm || authStore.hasPermission(m.perm));
});

const metricsOrder = ref([]);

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
  const sorted = [];
  metricsOrder.value.forEach((key) => {
    const found = base.find((m) => m.key === key);
    if (found) sorted.push(found);
  });
  base.forEach((m) => {
    if (!sorted.find((x) => x.key === m.key)) sorted.push(m);
  });
  return sorted;
});

const dragIndex = ref(null);
const onDragStart = (event, index) => {
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
};

const onDrop = (event, index) => {
  if (dragIndex.value === null) return;
  const list = [...orderedMetrics.value];
  const temp = list[dragIndex.value];
  list[dragIndex.value] = list[index];
  list[index] = temp;

  metricsOrder.value = list.map((m) => m.key);
  localStorage.setItem('dashboard_metrics_order_keys', JSON.stringify(metricsOrder.value));
  dragIndex.value = null;
};
</script>

<style lang="scss" scoped>
/* Inherit styles from parent or keep global metric grid styles */
</style>
