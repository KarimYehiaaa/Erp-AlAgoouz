<template>
  <div>
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card profit">
        <div class="kpi-icon">📈</div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي الإيرادات</div>
          <div class="kpi-value">{{ formatMoney(totalRevenue) }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">💼</div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي التكلفة</div>
          <div class="kpi-value">{{ formatMoney(totalCost) }}</div>
        </div>
      </div>
      <div class="kpi-card" :class="totalNet >= 0 ? 'profit' : 'danger'">
        <div class="kpi-icon">{{ totalNet >= 0 ? '✅' : '❌' }}</div>
        <div class="kpi-body">
          <div class="kpi-label">صافي الربح</div>
          <div class="kpi-value">{{ formatMoney(totalNet) }}</div>
        </div>
      </div>
    </div>
    <div class="grid grid-2 mt-4">
      <div class="card">
        <h3>📊 الأرباح اليومية</h3>
        <div class="table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الإيراد</th>
                <th>التكلفة</th>
                <th>الربح</th>
                <th>الهامش</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in profit?.daily || []" :key="row.date">
                <td>{{ row.date }}</td>
                <td class="money">{{ formatMoney(row.revenue || 0) }}</td>
                <td class="money muted">{{ formatMoney(row.cost || 0) }}</td>
                <td class="money" :class="row.profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ formatMoney(row.profit || 0) }}
                </td>
                <td class="center">{{ row.margin_pct || 0 }}%</td>
              </tr>
              <tr v-if="!(profit?.daily || []).length">
                <td colspan="5" class="empty">لا توجد بيانات</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>🗂️ الأرباح حسب التصنيف</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>التصنيف</th>
              <th>المنتجات</th>
              <th>الإيراد</th>
              <th>الربح</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in profit?.byCategory || []" :key="row.category_name">
              <td>{{ row.category_name || 'بدون تصنيف' }}</td>
              <td class="center">{{ row.products_count }}</td>
              <td class="money">{{ formatMoney(row.total_revenue || 0) }}</td>
              <td class="money" :class="row.net_profit >= 0 ? 'profit-pos' : 'profit-neg'">
                {{ formatMoney(row.net_profit || 0) }}
              </td>
            </tr>
            <tr v-if="!(profit?.byCategory || []).length">
              <td colspan="4" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils/currency';

defineProps<{
  profit: any;
  totalRevenue: number;
  totalCost: number;
  totalNet: number;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
