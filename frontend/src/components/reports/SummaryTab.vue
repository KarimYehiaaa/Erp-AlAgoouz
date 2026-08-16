<template>
  <div>
    <div class="kpi-grid">
      <div class="kpi-card sales">
        <div class="kpi-icon">💰</div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي المبيعات</div>
          <div class="kpi-value">{{ formatMoney(summary.sales?.total_sales || 0) }}</div>
          <div class="kpi-sub">{{ summary.sales?.sales_count || 0 }} عملية بيع</div>
        </div>
      </div>
      <div class="kpi-card profit">
        <div class="kpi-icon">📈</div>
        <div class="kpi-body">
          <div class="kpi-label">صافي الأرباح</div>
          <div class="kpi-value">{{ formatMoney(summary.sales?.total_profit || 0) }}</div>
          <div class="kpi-sub">{{ profitMarginPct }}% هامش ربح</div>
        </div>
      </div>
      <div class="kpi-card expenses">
        <div class="kpi-icon">💸</div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي المصروفات</div>
          <div class="kpi-value">{{ formatMoney(summary.expenses?.total_expenses || 0) }}</div>
          <div class="kpi-sub">{{ summary.expenses?.expenses_count || 0 }} مصروف</div>
        </div>
      </div>
      <div class="kpi-card cashflow" :class="summary.cashFlow >= 0 ? 'positive' : 'negative'">
        <div class="kpi-icon">{{ summary.cashFlow >= 0 ? '✅' : '⚠️' }}</div>
        <div class="kpi-body">
          <div class="kpi-label">التدفق النقدي</div>
          <div class="kpi-value">{{ formatMoney(summary.cashFlow || 0) }}</div>
          <div class="kpi-sub">مبيعات − مصروفات</div>
        </div>
      </div>
      <div class="kpi-card inventory">
        <div class="kpi-icon">📦</div>
        <div class="kpi-body">
          <div class="kpi-label">المنتجات</div>
          <div class="kpi-value">{{ summary.inventory?.products || 0 }}</div>
          <div class="kpi-sub">{{ summary.inventory?.warehouses || 0 }} مخزن</div>
        </div>
      </div>
      <div class="kpi-card customers">
        <div class="kpi-icon">👥</div>
        <div class="kpi-body">
          <div class="kpi-label">العملاء النشطون</div>
          <div class="kpi-value">{{ summary.customersCount || 0 }}</div>
          <div class="kpi-sub">{{ summary.unpaidInvoices?.count || 0 }} فاتورة غير مدفوعة</div>
        </div>
      </div>
    </div>

    <div class="grid grid-2 mt-4">
      <div class="card">
        <h3>🏆 أعلى المنتجات مبيعاً</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>الكمية</th>
              <th>الإيراد</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in summary.topProducts || []" :key="row.name_ar">
              <td>{{ row.name_ar }}</td>
              <td>{{ fmtQty(row.qty) }}</td>
              <td class="money">{{ formatMoney(row.revenue || 0) }}</td>
            </tr>
            <tr v-if="!(summary.topProducts || []).length">
              <td colspan="3" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>⚠️ تنبيهات المخزون المنخفض</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>المخزون</th>
              <th>الحد الأدنى</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in summary.lowStock || []" :key="row.product_id">
              <td>{{ row.name_ar }}</td>
              <td class="danger-text">{{ fmtQty(row.total_quantity) }}</td>
              <td>{{ row.min_stock }}</td>
            </tr>
            <tr v-if="!(summary.lowStock || []).length">
              <td colspan="3" class="empty">✅ لا توجد تنبيهات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils/currency';
import { fmtQty } from '@/utils/reportLabels';

defineProps<{
  summary: Record<string, any>;
  profitMarginPct: string;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
