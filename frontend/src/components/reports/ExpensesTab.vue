<template>
  <div>
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card expenses">
        <div class="kpi-icon"><AppIcon name="expenses" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي المصروفات</div>
          <div class="kpi-value">{{ formatMoney(total) }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><AppIcon name="categories" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">عدد التصنيفات</div>
          <div class="kpi-value">{{ (expenses?.byCategory || []).length }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><AppIcon name="receipt" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">عدد المصروفات</div>
          <div class="kpi-value">{{ count }}</div>
        </div>
      </div>
    </div>
    <div class="grid grid-2 mt-4">
      <div class="card">
        <h3>حسب التصنيف</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>التصنيف</th>
              <th>العدد</th>
              <th>الإجمالي</th>
              <th>النسبة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in expenses?.byCategory || []" :key="row.category">
              <td>{{ row.category }}</td>
              <td class="center">{{ row.count }}</td>
              <td class="money">{{ formatMoney(row.total || 0) }}</td>
              <td class="center">{{ total > 0 ? ((row.total / total) * 100).toFixed(1) : 0 }}%</td>
            </tr>
            <tr v-if="!(expenses?.byCategory || []).length">
              <td colspan="4" class="empty">لا توجد مصروفات</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>حسب الشهر</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>العدد</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in expenses?.monthly || []" :key="row.month">
              <td>{{ row.month }}</td>
              <td class="center">{{ row.count }}</td>
              <td class="money">{{ formatMoney(row.total || 0) }}</td>
            </tr>
            <tr v-if="!(expenses?.monthly || []).length">
              <td colspan="3" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card mt-4">
      <h3>آخر المصروفات</h3>
      <table class="report-table">
        <thead>
          <tr>
            <th>العنوان</th>
            <th>التصنيف</th>
            <th>التاريخ</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in expenses?.recent || []" :key="`${row.title}-${row.expense_date}`">
            <td>{{ row.title }}</td>
            <td>{{ row.category }}</td>
            <td>{{ row.expense_date }}</td>
            <td class="money">{{ formatMoney(row.amount || 0) }}</td>
          </tr>
          <tr v-if="!(expenses?.recent || []).length">
            <td colspan="4" class="empty">لا توجد بيانات</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney } from '@/utils/currency';

defineProps<{
  expenses: any;
  total: number;
  count: number;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
