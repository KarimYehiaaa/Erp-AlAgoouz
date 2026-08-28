<template>
  <div>
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card sales">
        <div class="kpi-icon"><AppIcon name="sales" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي المبيعات</div>
          <div class="kpi-value">{{ formatMoney(total) }}</div>
        </div>
      </div>
      <div class="kpi-card profit">
        <div class="kpi-icon"><AppIcon name="trendingUp" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي الأرباح</div>
          <div class="kpi-value">{{ formatMoney(profit) }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><AppIcon name="receipt" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">عدد العمليات</div>
          <div class="kpi-value">{{ count }}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="table-header">
        <h3>تفاصيل المبيعات</h3>
        <div class="type-filter">
          <button :class="{ active: filter === '' }" @click="$emit('filter', '')">الكل</button>
          <button :class="{ active: filter === 'branch' }" @click="$emit('filter', 'branch')">
            فرع
          </button>
          <button :class="{ active: filter === 'wholesale' }" @click="$emit('filter', 'wholesale')">
            جملة
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>العدد</th>
              <th>المبيعات</th>
              <th>التكلفة</th>
              <th>الربح</th>
              <th>الهامش</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.date}-${row.sale_type}`">
              <td>{{ row.date }}</td>
              <td>
                <span :class="['type-badge', row.sale_type]">{{
                  saleTypeLabel(row.sale_type)
                }}</span>
              </td>
              <td class="center">{{ row.count }}</td>
              <td class="money">{{ formatMoney(row.total || 0) }}</td>
              <td class="money muted">{{ formatMoney(row.cost || 0) }}</td>
              <td class="money" :class="row.profit >= 0 ? 'profit-pos' : 'profit-neg'">
                {{ formatMoney(row.profit || 0) }}
              </td>
              <td class="center">
                {{ row.total > 0 ? ((row.profit / row.total) * 100).toFixed(1) : 0 }}%
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="7" class="empty">لا توجد بيانات مبيعات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney } from '@/utils/currency';
import { saleTypeLabel } from '@/utils/reportLabels';

defineProps<{
  rows: any[];
  filter: string;
  total: number;
  profit: number;
  count: number;
}>();

defineEmits<{
  (_e: 'filter', _value: string): void;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
