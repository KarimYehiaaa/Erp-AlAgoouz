<template>
  <div class="kpi-grid">
    <div v-for="card in cards" :key="card.key" class="kpi-card" :class="card.colorClass">
      <div class="kpi-header">
        <AppIcon :name="card.icon" :size="20" class="kpi-icon" />
        <span
          v-if="card.change !== null"
          class="kpi-change"
          :class="card.change >= 0 ? 'up' : 'down'"
        >
          {{ card.change >= 0 ? '↑' : '↓' }} {{ Math.abs(card.change).toFixed(1) }}%
        </span>
      </div>
      <div class="kpi-value">{{ formatNumber(card.value) }}</div>
      <div class="kpi-label">{{ card.label }}</div>
      <div v-if="card.sub" class="kpi-sub">{{ card.sub }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps({
  dashboard: { type: Object, default: () => ({}) },
  counts: { type: Object, default: () => ({}) },
});

const formatNumber = (n: any) => {
  if (n === null || n === undefined) return '—';
  if (typeof n === 'string') return n;
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n);
};

const cards = computed(() => {
  const d = props.dashboard || {};
  const today = d.today || {};
  const month = d.monthCards || {};
  const comparison = d.comparison || {};
  const c = props.counts || {};

  return [
    {
      key: 'todaySales',
      icon: 'sales',
      label: 'مبيعات اليوم',
      value: today.totalSales || 0,
      change: comparison.salesChange ?? null,
      colorClass: 'green',
      sub: `${today.salesCount || 0} فاتورة`,
    },
    {
      key: 'todayProfit',
      icon: 'trendingUp',
      label: 'أرباح اليوم',
      value: today.profit || 0,
      change: comparison.profitChange ?? null,
      colorClass: 'emerald',
    },
    {
      key: 'monthSales',
      icon: 'coins',
      label: 'مبيعات الشهر',
      value: month.totalSales || 0,
      change: null,
      colorClass: 'blue',
    },
    {
      key: 'monthExpenses',
      icon: 'expenses',
      label: 'مصروفات الشهر',
      value: month.expenses || 0,
      change: null,
      colorClass: 'orange',
    },
    {
      key: 'treasury',
      icon: 'wallet',
      label: 'رصيد الخزينة',
      value: month.cashNet || 0,
      change: null,
      colorClass: 'purple',
    },
    {
      key: 'products',
      icon: 'products',
      label: 'المنتجات',
      value: c.totalProducts || 0,
      change: null,
      colorClass: 'cyan',
      sub: c.lowStockCount ? ` ${c.lowStockCount} تحت الحد` : null,
    },
    {
      key: 'customers',
      icon: 'customers',
      label: 'العملاء',
      value: c.totalCustomers || 0,
      change: null,
      colorClass: 'indigo',
    },
    {
      key: 'debts',
      icon: 'warning',
      label: 'مستحقات للمحل (ديون)',
      value: d.unpaidInvoices?.amount || 0,
      change: null,
      colorClass: 'cyan',
      sub: `${d.unpaidInvoices?.count || 0} عميل عليه مديونية`,
    },
    {
      key: 'activeUsers',
      icon: 'users',
      label: 'مستخدمون نشطون (24 ساعة)',
      value: c.activeUsers24h || 0,
      change: null,
      colorClass: 'teal',
      sub: `إجمالي: ${c.totalUsers || 0}`,
    },
  ];
});
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

.kpi-card {
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  position: relative;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  border-radius: 0 16px 16px 0;
}

.kpi-card.green::before {
  background: var(--success);
}
.kpi-card.emerald::before {
  background: var(--success);
}
.kpi-card.blue::before {
  background: var(--info);
}
.kpi-card.orange::before {
  background: var(--warning);
}
.kpi-card.purple::before {
  background: var(--accent);
}
.kpi-card.cyan::before {
  background: var(--info);
}
.kpi-card.indigo::before {
  background: var(--accent);
}
.kpi-card.teal::before {
  background: var(--success);
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

.kpi-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.kpi-icon {
  font-size: 1.4rem;
}

.kpi-change {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 8px;
}

.kpi-change.up {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success);
}

.kpi-change.down {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
}

.kpi-value {
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--text-strong, #fff);
  line-height: 1.2;
  font-feature-settings: 'tnum';
}

.kpi-label {
  font-size: 0.8rem;
  color: var(--text-muted, #888);
  font-weight: 600;
  margin-top: 4px;
}

.kpi-sub {
  font-size: 0.72rem;
  color: var(--text-muted, #888);
  margin-top: 3px;
  font-weight: 500;
}
</style>
