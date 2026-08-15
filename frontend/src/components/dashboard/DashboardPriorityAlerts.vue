<template>
  <section class="command-strip panel card-premium-flow">
    <div class="command-copy">
      <span>مركز المتابعة</span>
      <strong>{{ priorityHeadline }}</strong>
      <small>أهم البنود التي تحتاج مراجعة قبل نهاية اليوم.</small>
    </div>
    <RouterLink
      v-for="action in priorityActions"
      :key="action.key"
      class="command-item"
      :class="action.tone"
      :to="action.to"
    >
      <span class="command-value">{{ action.value }}</span>
      <span class="command-label">{{ action.label }}</span>
    </RouterLink>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney, abbreviateNumber } from '@/utils/formatters';

const props = defineProps({
  stats: { type: Object, required: true },
});

const money = (val: any) => formatMoney(val || 0);
const number = (val: any) => abbreviateNumber(val || 0);

const monthCards = computed(() => props.stats?.monthCards || {});

const priorityActions = computed(() => [
  {
    key: 'stock',
    label: 'مخزون منخفض',
    value: number(props.stats?.stockAlerts),
    tone: Number(props.stats?.stockAlerts || 0) ? 'danger' : 'success',
    to: '/inventory',
  },
  {
    key: 'recipes',
    label: 'وصفات ناقصة',
    value: number(props.stats?.recipeSummary?.shortageRecipes),
    tone: Number(props.stats?.recipeSummary?.shortageRecipes || 0) ? 'warning' : 'success',
    to: '/recipes',
  },
  {
    key: 'unpaid',
    label: 'غير محصل',
    value: money(props.stats?.unpaidInvoices?.amount),
    tone: Number(props.stats?.unpaidInvoices?.amount || 0) ? 'warning' : 'success',
    to: '/sales?tab=wholesale',
  },
  {
    key: 'cash',
    label: 'صافي التدفق',
    value: money(monthCards.value.cashNet),
    tone: Number(monthCards.value.cashNet || 0) >= 0 ? 'success' : 'danger',
    to: '/reports',
  },
]);

const priorityHeadline = computed(() => {
  const risky = priorityActions.value.filter((item: any) => item.tone !== 'success').length;
  return risky ? `${risky} بند يحتاج متابعة` : 'الوضع مستقر';
});
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';
</style>
