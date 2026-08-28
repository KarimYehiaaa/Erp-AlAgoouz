<template>
  <div>
    <div class="kpi-grid kpi-grid-3">
      <div class="kpi-card inventory">
        <div class="kpi-icon"><AppIcon name="inventory" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">إجمالي المنتجات</div>
          <div class="kpi-value">{{ (inventory?.products || []).length }}</div>
        </div>
      </div>
      <div class="kpi-card danger">
        <div class="kpi-icon"><AppIcon name="warning" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">منتجات منخفضة</div>
          <div class="kpi-value">{{ lowStockCount }}</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon"><AppIcon name="money" :size="24" /></div>
        <div class="kpi-body">
          <div class="kpi-label">قيمة المخزون</div>
          <div class="kpi-value">{{ formatMoney(totalValue) }}</div>
        </div>
      </div>
    </div>
    <div class="grid grid-2 mt-4">
      <div class="card">
        <h3>قيمة المخزون بالمستودع</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>المستودع</th>
              <th>المنتجات</th>
              <th>القيمة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in inventory?.warehouseValue || []" :key="row.warehouse_name">
              <td>{{ row.warehouse_name }}</td>
              <td class="center">{{ row.products_count }}</td>
              <td class="money">{{ formatMoney(row.total_value || 0) }}</td>
            </tr>
            <tr v-if="!(inventory?.warehouseValue || []).length">
              <td colspan="3" class="empty">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>المنتجات المنخفضة</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>المخزون</th>
              <th>الحد الأدنى</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lowStock" :key="row.product_id">
              <td>{{ row.name_ar }}</td>
              <td class="danger-text">{{ fmtQty(row.total_quantity) }}</td>
              <td>{{ row.min_stock }}</td>
            </tr>
            <tr v-if="!lowStock.length">
              <td colspan="3" class="empty">لا توجد تنبيهات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card mt-4">
      <h3>كل المنتجات</h3>
      <div class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>كود الصنف (SKU)</th>
              <th>التصنيف</th>
              <th>المخزون</th>
              <th>الحد الأدنى</th>
              <th>سعر الشراء</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in inventory?.products || []" :key="row.product_id">
              <td>{{ row.name_ar }}</td>
              <td class="mono">{{ row.sku }}</td>
              <td>{{ row.category_name || '—' }}</td>
              <td>{{ fmtQty(row.total_quantity) }}</td>
              <td>{{ row.min_stock }}</td>
              <td class="money">{{ formatMoney(row.purchase_price || 0) }}</td>
              <td>
                <span :class="['status-badge', row.is_low_stock ? 'danger' : 'success']">{{
                  row.is_low_stock ? 'منخفض' : 'طبيعي'
                }}</span>
              </td>
            </tr>
            <tr v-if="!(inventory?.products || []).length">
              <td colspan="7" class="empty">لا توجد بيانات</td>
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
import { fmtQty } from '@/utils/reportLabels';

defineProps<{
  inventory: any;
  lowStock: any[];
  lowStockCount: number;
  totalValue: number;
}>();
</script>

<style lang="scss" scoped>
@use './reportsShared.scss' as *;
</style>
