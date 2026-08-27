<template>
  <div>
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card customers">
        <div class="kpi-icon"></div>
        <div class="kpi-body">
          <div class="kpi-label">أعلى عميل إنفاقاً</div>
          <div class="kpi-value">
            {{ customers?.topCustomers?.[0]?.name_ar || '—' }}
          </div>
          <div class="kpi-sub">
            {{ formatMoney(customers?.topCustomers?.[0]?.total_spent || 0) }}
          </div>
        </div>
      </div>
      <div class="kpi-card danger">
        <div class="kpi-icon"></div>
        <div class="kpi-body">
          <div class="kpi-label">فواتير غير مدفوعة</div>
          <div class="kpi-value">{{ (customers?.unpaidInvoices || []).length }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"></div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي مشتريات العملاء</div>
          <div class="kpi-value">{{ formatMoney(total) }}</div>
        </div>
      </div>
    </div>
    <div class="grid grid-2 mt-4">
      <div class="card">
        <h3>أعلى العملاء إنفاقاً</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>النوع</th>
              <th>المشتريات</th>
              <th>الإجمالي</th>
              <th>الرصيد</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in customers?.topCustomers || []" :key="row.name_ar">
              <td>{{ row.name_ar }}</td>
              <td>
                <span :class="['type-badge', row.customer_type]">{{
                  customerTypeLabel(row.customer_type)
                }}</span>
              </td>
              <td class="center">{{ row.sales_count }}</td>
              <td class="money">{{ formatMoney(row.total_spent || 0) }}</td>
              <td class="money" :class="row.balance < 0 ? 'profit-neg' : ''">
                {{ formatMoney(row.balance || 0) }}
              </td>
            </tr>
            <tr v-if="!(customers?.topCustomers || []).length">
              <td colspan="5" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>⏳ فواتير غير مدفوعة</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>الفاتورة</th>
              <th>العميل</th>
              <th>المبلغ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in customers?.unpaidInvoices || []" :key="row.invoice_number">
              <td class="mono">{{ row.invoice_number }}</td>
              <td>{{ row.customer_name || '—' }}</td>
              <td class="money danger-text">{{ formatMoney(row.total_amount || 0) }}</td>
              <td>
                <span
                  :class="['status-badge', row.payment_status === 'partial' ? 'warning' : 'danger']"
                  >{{ paymentStatusLabel(row.payment_status) }}</span
                >
              </td>
            </tr>
            <tr v-if="!(customers?.unpaidInvoices || []).length">
              <td colspan="4" class="empty">لا توجد فواتير معلقة</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils/currency';
import { customerTypeLabel, paymentStatusLabel } from '@/utils/reportLabels';

defineProps<{
  customers: any;
  total: number;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
