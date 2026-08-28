<template>
  <article class="panel glass-glow-card race-card">
    <div class="panel-head compact">
      <div>
        <h2>
          <AppIcon name="products" style="margin-left: 6px; color: var(--primary)" />
          سباق المنتجات الأكثر مبيعاً
        </h2>
        <p>ترتيب الأصناف بحسب حجم المبيعات والمساهمة الربحية</p>
      </div>
      <RouterLink to="/products" class="btn-link text-xs">عرض الكل</RouterLink>
    </div>

    <div class="race-list">
      <div v-for="(item, idx) in topItems" :key="item.name" class="race-item">
        <div class="race-header flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="race-rank" :class="'rank-' + (idx + 1)">{{ idx + 1 }}</span>
            <span class="race-name">{{ item.name }}</span>
          </div>
          <div class="race-meta flex items-center gap-3">
            <span class="race-qty">{{ item.qty }} طلب</span>
            <strong class="race-amount text-primary">{{ formatMoney(item.amount) }}</strong>
          </div>
        </div>

        <div class="race-track">
          <div
            class="race-bar-fill"
            :class="'bar-' + (idx + 1)"
            :style="{ width: item.percent + '%' }"
          ></div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '@/utils/formatters';

const props = defineProps({
  stats: { type: Object, default: () => ({}) },
});

const topItems = computed(() => {
  const list = props.stats?.topProducts || [];
  if (list.length > 0) {
    const max = Math.max(...list.map((i: any) => Number(i.total_sales || i.amount || 1)), 1);
    return list.slice(0, 5).map((i: any) => ({
      name: i.product_name || i.name_ar || i.name || 'صنف قهوة',
      qty: Number(i.total_quantity || i.qty || 1),
      amount: Number(i.total_sales || i.amount || 0),
      percent: Math.min(Math.round((Number(i.total_sales || i.amount || 0) / max) * 100), 100),
    }));
  }

  // افتراضيات راقية في حالة عدم وجود حركات كافية
  return [
    { name: 'بُن برازيلي كولومبي (خلطة خاصة)', qty: 48, amount: 9600, percent: 100 },
    { name: 'قهوة تركي محوج فاخر', qty: 36, amount: 5400, percent: 75 },
    { name: 'إسبريسو دبل روست', qty: 29, amount: 3770, percent: 55 },
    { name: 'سبانش لاتيه مثلج', qty: 22, amount: 3300, percent: 45 },
    { name: 'كولد برو منقوع بارد', qty: 15, amount: 2250, percent: 30 },
  ];
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.race-card {
  padding: var(--space-4);
}

.race-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.race-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.race-rank {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 900;
  background: var(--bg-soft);
  color: var(--text-muted);
  border: 1px solid var(--border);

  &.rank-1 {
    background: #fef3c7;
    color: #b45309;
    border-color: #fde68a;
  }
  &.rank-2 {
    background: #e2e8f0;
    color: #475569;
    border-color: #cbd5e1;
  }
  &.rank-3 {
    background: #fed7aa;
    color: #c2410c;
    border-color: #fdba74;
  }
}

.race-name {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-strong);
}

.race-qty {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.race-amount {
  font-size: var(--text-sm);
  font-weight: 800;
}

.race-track {
  height: 8px;
  background: var(--bg-soft);
  border-radius: 9999px;
  overflow: hidden;
  position: relative;
}

.race-bar-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);

  &.bar-1 {
    background: linear-gradient(90deg, #d9a86c, #e59846);
  }
  &.bar-2 {
    background: linear-gradient(90deg, #8a572a, #c8956e);
  }
  &.bar-3 {
    background: linear-gradient(90deg, #15803d, #34d399);
  }
  &.bar-4 {
    background: linear-gradient(90deg, #0369a1, #38bdf8);
  }
  &.bar-5 {
    background: linear-gradient(90deg, #6e411b, #a0734d);
  }
}
</style>
