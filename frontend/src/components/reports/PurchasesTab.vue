<template>
  <div>
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card">
        <div class="kpi-icon"></div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي المشتريات</div>
          <div class="kpi-value">
            {{ formatMoney(purchases?.summary?.total_amount || 0) }}
          </div>
          <div class="kpi-sub">{{ purchases?.summary?.invoices_count || 0 }} فاتورة</div>
        </div>
      </div>
      <div class="kpi-card profit">
        <div class="kpi-icon"></div>
        <div class="kpi-body">
          <div class="kpi-label">المدفوع</div>
          <div class="kpi-value">
            {{ formatMoney(purchases?.summary?.paid_amount || 0) }}
          </div>
        </div>
      </div>
      <div class="kpi-card danger">
        <div class="kpi-icon">⏳</div>
        <div class="kpi-body">
          <div class="kpi-label">المتبقي</div>
          <div class="kpi-value">
            {{ formatMoney(purchases?.summary?.unpaid_amount || 0) }}
          </div>
        </div>
      </div>
    </div>
    <div class="grid grid-2 mt-4">
      <div class="card">
        <h3>حسب المورد</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>المورد</th>
              <th>الفواتير</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in purchases?.bySupplier || []" :key="row.supplier_name">
              <td>{{ row.supplier_name }}</td>
              <td class="center">{{ row.invoices_count }}</td>
              <td class="money">{{ formatMoney(row.total_amount || 0) }}</td>
              <td class="money profit-pos">{{ formatMoney(row.paid_amount || 0) }}</td>
            </tr>
            <tr v-if="!(purchases?.bySupplier || []).length">
              <td colspan="4" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>آخر الفواتير</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>الفاتورة</th>
              <th>المورد</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in purchases?.recent || []" :key="row.invoice_number">
              <td class="mono">{{ row.invoice_number }}</td>
              <td>{{ row.supplier_name }}</td>
              <td class="money">{{ formatMoney(row.total_amount || 0) }}</td>
              <td>
                <span :class="['status-badge', row.status === 'paid' ? 'success' : 'warning']">{{
                  purchaseStatusLabel(row.status)
                }}</span>
              </td>
            </tr>
            <tr v-if="!(purchases?.recent || []).length">
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
import { purchaseStatusLabel } from '@/utils/reportLabels';

defineProps<{
  purchases: any;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
