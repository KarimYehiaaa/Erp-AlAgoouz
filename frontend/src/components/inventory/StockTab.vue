<!--
  StockTab.vue — تبويب "المخزون": بطاقات التقييم + جدول المخزون
  يعرض تقييم قيمة المخزون (الإجمالي/الرئيسي/الفرع) وجدول المنتجات مع
  الخلايا المخصصة (الكود، الكميات، الحد الأدنى، الحالة) وأزرار الإجراءات
  (تحويل/تعديل/هالك). استُخرج من InventoryView.vue (كان 1,594 سطرًا).
-->
<template>
  <!-- Inventory Valuation Summary Cards -->
  <div class="grid grid-3 valuation-cards-row">
    <div class="card val-card val-total">
      <span class="val-label"> إجمالي تقييم رصيد المخزون (بالتكلفة)</span>
      <h3 class="val-amount">
        {{ formatMoney(totalInventoryValue) }}
      </h3>
    </div>
    <div class="card val-card val-main">
      <span class="val-label"> قيمة مخزون الرئيسي</span>
      <h3 class="val-amount">
        {{ formatMoney(mainWarehouseValue) }}
      </h3>
    </div>
    <div class="card val-card val-branch">
      <span class="val-label"> قيمة مخزون البيع</span>
      <h3 class="val-amount">
        {{ formatMoney(branchWarehouseValue) }}
      </h3>
    </div>
  </div>

  <BaseTable
    :items="items"
    :columns="stockColumns"
    :loading="loading"
    client-pagination
    :client-per-page="50"
    empty-message="لا توجد بيانات مخزون"
    :row-class="(i: any) => [{ 'row-low': i.is_low }, { 'row-highlight': isHighlighted(i) }]"
  >
    <template #cell-name_ar="{ item }">
      <div class="product-name">
        {{ item.name_ar }}
        <span v-if="item.has_active_recipe" class="recipe-chip">وصفة</span>
      </div>
    </template>
    <template #cell-sku="{ item }">
      <span class="mono">{{ item.sku || '—' }}</span>
    </template>
    <template #cell-purchase_price="{ item }">
      <span class="mono" style="font-weight: 700; color: #475569">
        {{ formatMoney(item.purchase_price || 0) }}
      </span>
    </template>
    <template #cell-total_quantity="{ item }">
      <span class="qty qty-total" :class="{ 'qty-low': item.is_low }">
        <strong>{{
          fmtQty(item.total_quantity !== undefined ? item.total_quantity : item.quantity)
        }}</strong>
      </span>
    </template>
    <template #cell-stock_value="{ item }">
      <span class="mono" style="font-weight: 800; color: var(--accent, #c77a2f)">
        {{ formatMoney(getItemStockValue(item)) }}
      </span>
    </template>
    <template #cell-main_quantity="{ item }">
      <span class="pill pill-main"> {{ fmtQty(getMainQty(item)) }} </span>
    </template>
    <template #cell-branch_quantity="{ item }">
      <span class="pill pill-branch"> {{ fmtQty(getBranchQty(item)) }} </span>
    </template>
    <template #cell-min_stock="{ item }">
      <span class="min-stock-tag" title="الحد الأدنى محسوب ومطبق بناءً على إجمالي رصيد المنشأة">
        {{ fmtQty(item.min_stock || 0) }}
      </span>
    </template>
    <template #cell-status="{ item }">
      <span :class="['badge', item.is_low ? 'badge-danger' : 'badge-success']">
        {{ item.is_low ? ' أقل من الحد الأدنى' : ' متوفر بالكامل' }}
      </span>
    </template>
    <template #cell-actions="{ item }">
      <button
        v-permission="'inventory.edit'"
        class="icon-btn"
        title="تحويل بين المخزن الرئيسي وصالة البيع"
        @click="$emit('openTransfer', item)"
      ></button>
      <button
        v-permission="'inventory.edit'"
        class="icon-btn"
        :class="{ disabled: item.has_active_recipe }"
        :disabled="item.has_active_recipe"
        :title="
          item.has_active_recipe ? 'منتج وصفة نشطة: يتم تحديثه من مكونات الوصفة فقط' : 'تعديل'
        "
        @click="$emit('openEdit', item)"
      ></button>
      <button
        v-permission="'inventory.edit'"
        class="icon-btn btn-danger"
        title="تسجيل هالك"
        @click="$emit('openWastage', item)"
      ></button>
    </template>
  </BaseTable>
</template>

<script setup lang="ts">
/**
 * تبويب المخزون — يستهلك من InventoryView.
 *
 * @props items                    جدول المخزون
 * @props loading                  حالة التحميل
 * @props stockColumns             أعمدة الجدول
 * @props totalInventoryValue      إجمالي تقييم المخزون
 * @props mainWarehouseValue       قيمة مخزون الرئيسي
 * @props branchWarehouseValue     قيمة مخزون الفرع/المحل
 * @props getItemStockValue        دالة قيمة الصنف (كمية × سعر)
 * @props getMainQty               دالة كمية الصنف في الرئيسي
 * @props getBranchQty             دالة كمية الصنف في الفرع
 * @props isHighlighted            دالة هل الصف مُبرَز
 * @props fmtQty                   دالة تنسيق الكميات
 * @props formatMoney              دالة تنسيق المبالغ
 *
 * @emits openTransfer  طلب فتح مودال التحويل لمنتج
 * @emits openEdit      طلب فتح مودال التعديل لمنتج
 * @emits openWastage   طلب فتح مودال تسجيل هالك لمنتج
 */
import BaseTable from '@/components/ui/BaseTable.vue';

defineProps<{
  items: any[];
  loading: boolean;
  stockColumns: any[];
  totalInventoryValue: number;
  mainWarehouseValue: number;
  branchWarehouseValue: number;
  getItemStockValue: (_item: any) => number;
  getMainQty: (_item: any) => any;
  getBranchQty: (_item: any) => any;
  isHighlighted: (_row: any) => boolean;
  fmtQty: (_v: any) => string;
  formatMoney: (_v: number | null | undefined) => string;
}>();

defineEmits<{
  openTransfer: [item: any];
  openEdit: [item: any];
  openWastage: [item: any];
}>();
</script>

<style lang="scss" scoped>
/* Table */
.table-wrap {
  overflow-x: auto;
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th {
    background: var(--bg);
    padding: 10px 12px;
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: 0;
  }
  tr:hover td {
    background: color-mix(in srgb, var(--primary) 3%, var(--bg-elevated));
  }
  .row-low td {
    background: color-mix(in srgb, var(--danger) 4%, var(--bg-elevated));
  }
}
.product-name {
  font-weight: 700;
}
.recipe-chip {
  display: inline-flex;
  align-items: center;
  margin-inline-start: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--info) 25%, transparent);
  background: color-mix(in srgb, var(--info) 10%, transparent);
  color: var(--info);
  font-size: 0.72rem;
  font-weight: 800;
}
.mono {
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.qty {
  font-weight: 700;
}
.qty-low {
  color: var(--danger);
}
.success-text {
  color: #2e7d4f;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
}
.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: var(--transition);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;

  &:hover {
    background: var(--bg);
    border-color: var(--primary-soft);
  }

  &.disabled,
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(1);
  }

  &.disabled:hover,
  &:disabled:hover {
    background: var(--bg-elevated);
    border-color: var(--border);
  }
}

/* Highlight produced row briefly */
.row-highlight td {
  animation: inv-highlight 1s ease-in-out 0s 3;
}
@keyframes inv-highlight {
  0% {
    background: color-mix(in srgb, var(--success) 35%, transparent);
  }
  100% {
    background: transparent;
  }
}

.breakdown-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.pill {
  font-size: 0.78rem;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  color: var(--text, #ccc);
  white-space: nowrap;
}
.pill-main {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
  color: var(--info);
}
.pill-branch {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.25);
  color: var(--success);
}
.valuation-cards-row {
  margin-bottom: 16px;
  gap: 12px;
}

.val-card {
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg-card);
  transition: all 0.2s ease;

  .val-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
    display: block;
    margin-bottom: 6px;
  }

  .val-amount {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 850;
  }

  &.val-total {
    border-color: color-mix(in srgb, var(--info) 28%, var(--border));
    background: color-mix(in srgb, var(--info) 6%, var(--bg-card));
    .val-amount {
      color: var(--info);
    }
  }

  &.val-main {
    border-color: color-mix(in srgb, var(--success) 28%, var(--border));
    background: color-mix(in srgb, var(--success) 6%, var(--bg-card));
    .val-amount {
      color: var(--success);
    }
  }

  &.val-branch {
    border-color: color-mix(in srgb, var(--warning) 28%, var(--border));
    background: color-mix(in srgb, var(--warning) 6%, var(--bg-card));
    .val-amount {
      color: var(--warning);
    }
  }
}
</style>
