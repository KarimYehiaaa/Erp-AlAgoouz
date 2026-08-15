<template>
  <article
    class="panel health-panel"
    style="display: flex; flex-direction: column; align-items: center; gap: 14px"
  >
    <div
      class="panel-head compact"
      style="width: 100%; display: flex; justify-content: space-between; margin-bottom: 0"
    >
      <h2>نبض التشغيل</h2>
    </div>

    <!-- Radial Progress Ring Gauge -->
    <div
      class="radial-gauge-wrap"
      style="width: 110px; height: 110px; margin: 10px auto; display: grid; place-items: center"
    >
      <svg
        class="radial-gauge-svg"
        width="110"
        height="110"
        viewBox="0 0 100 100"
        style="transform: rotate(-90deg); grid-area: 1 / 1"
      >
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="transparent"
          stroke="var(--border)"
          stroke-width="8"
        ></circle>
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="transparent"
          stroke="var(--accent)"
          stroke-width="8"
          stroke-dasharray="263.89"
          :stroke-dashoffset="
            263.89 * (1 - Math.min(Math.max(stats?.month?.collectionRate || 0, 0), 1))
          "
          stroke-linecap="round"
          style="transition: stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)"
        ></circle>
      </svg>
      <div
        class="radial-gauge-text"
        style="
          grid-area: 1 / 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          margin-top: 4px;
        "
      >
        <span
          style="
            font-size: 1.4rem;
            font-weight: 900;
            color: var(--text-strong);
            line-height: 1;
            direction: ltr;
          "
          >{{ percent(stats?.month?.collectionRate) }}</span
        >
        <small
          style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; margin-top: 4px"
          >كفاءة التحصيل</small
        >
      </div>
    </div>

    <ul class="health-list" style="width: 100%; margin-top: auto; padding: 0; list-style: none">
      <li
        v-for="item in healthItems"
        :key="item.label"
        style="
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
        "
      >
        <span>{{ item.label }}</span>
        <strong :class="item.tone">{{ item.value }}</strong>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatPercent, abbreviateNumber } from '@/utils/formatters';

const props = defineProps({
  stats: { type: Object, required: true },
});

const percent = (val: any) => formatPercent(val || 0);
const number = (val: any) => abbreviateNumber(val || 0);

const healthItems = computed(() => [
  { label: 'نسبة التحصيل', value: percent(props.stats?.month?.collectionRate), tone: 'success' },
  {
    label: 'تنبيهات المخزون',
    value: number(props.stats?.stockAlerts),
    tone: Number(props.stats?.stockAlerts || 0) ? 'danger' : 'success',
  },
  {
    label: 'وصفات ناقصة',
    value: number(props.stats?.recipeSummary?.shortageRecipes),
    tone: Number(props.stats?.recipeSummary?.shortageRecipes || 0) ? 'warning' : 'success',
  },
  { label: 'عملاء نشطين', value: number(props.stats?.customersCount), tone: 'info' },
  { label: 'مخازن', value: number(props.stats?.inventoryStats?.warehouses), tone: 'info' },
]);
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

.health-panel {
  /* البطاقة تعتمد على .panel/.panel-head المشتركة — تُستورد من dashboardShared */
}
</style>
