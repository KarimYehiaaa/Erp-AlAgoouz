<!--
  MovementsTab.vue — تبويب "حركة المخزون": سجل الحركات مع الفلترة
  جدول حركات المخزون مع فلتر النوع (تحويلات/مبيعات/مشتريات/هالك/تعديل)
  وزر طباعة إذن التحويل للحركات من نوع transfer.
  استُخرج من InventoryView.vue (كان 1,594 سطرًا).
-->
<template>
  <div class="card table-wrap">
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
        flex-wrap: wrap;
        gap: 10px;
      "
    >
      <h3 style="margin: 0">سجل حركة المخزون</h3>
      <div style="display: flex; align-items: center; gap: 8px">
        <label style="font-size: 0.84rem; font-weight: 700">تصفية الحركات:</label>
        <select
          :value="movementTypeFilter"
          class="warehouse-select"
          style="font-size: 0.85rem"
          @change="onFilterChange"
        >
          <option value="">كل الحركات</option>
          <option value="transfer">التحويلات فقط</option>
          <option value="sale">مبيعات</option>
          <option value="purchase">مشتريات</option>
          <option value="wastage">هالك</option>
          <option value="adjustment">تعديل مخزون</option>
        </select>
      </div>
    </div>

    <BaseTable
      :items="items"
      :columns="columns"
      client-pagination
      :client-per-page="50"
      empty-message="لا توجد حركات"
    >
      <template #cell-product_name="{ item }">
        <div style="display: flex; flex-direction: column">
          <strong style="font-size: 0.9rem">{{ item.product_name }}</strong>
          <small class="mono" style="color: #888" v-if="item.product_sku">{{
            item.product_sku
          }}</small>
        </div>
      </template>
      <template #cell-movement_type="{ item }">
        <span :class="['move-badge', item.movement_type]">{{
          movementLabel(item.movement_type)
        }}</span>
      </template>
      <template #cell-quantity="{ item }">
        <span class="qty">{{ fmtQty(item.quantity) }}</span>
      </template>
      <template #cell-from_warehouse="{ item }">
        {{ item.from_warehouse || '—' }}
      </template>
      <template #cell-to_warehouse="{ item }">
        {{ item.to_warehouse || '—' }}
      </template>
      <template #cell-user_name="{ item }">
        {{ item.user_name || '—' }}
      </template>
      <template #cell-created_at="{ item }">
        {{ new Date(item.created_at).toLocaleString('en-GB') }}
      </template>
      <template #cell-actions="{ item }">
        <button
          v-if="item.movement_type === 'transfer'"
          class="icon-btn"
          title="طباعة إذن التحويل المخزني"
          @click="$emit('printVoucher', item)"
        ></button>
      </template>
    </BaseTable>
  </div>
</template>

<script setup lang="ts">
/**
 * تبويب حركة المخزون — يستهلك من InventoryView.
 *
 * @props items                 قائمة الحركات المفلترة
 * @props columns               أعمدة الجدول
 * @props movementTypeFilter    فلتر النوع (v-model:movement-type-filter)
 * @props movementLabel         دالة تسمية نوع الحركة
 * @props fmtQty                دالة تنسيق الكميات
 *
 * @emits update:movementTypeFilter  تغيير فلتر النوع
 * @emits printVoucher               طلب طباعة إذن تحويل من حركة (item)
 */
import BaseTable from '@/components/ui/BaseTable.vue';

defineProps<{
  items: any[];
  columns: any[];
  movementTypeFilter: string;
  movementLabel: (_t: any) => string;
  fmtQty: (_v: any) => string;
}>();

const emit = defineEmits<{
  'update:movementTypeFilter': [value: string];
  printVoucher: [item: any];
}>();

const onFilterChange = (e: Event) => {
  emit('update:movementTypeFilter', (e.target as HTMLSelectElement).value);
};
</script>

<style lang="scss" scoped>
.table-wrap {
  overflow-x: auto;
}
.warehouse-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 0.9rem;
}
.mono {
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.qty {
  font-weight: 700;
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

/* Movement badges */
.move-badge {
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  &.sale {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.purchase {
    background: rgba(99, 102, 241, 0.12);
    color: #4f46e5;
  }
  &.purchase_reversal {
    background: rgba(180, 35, 24, 0.12);
    color: #b42318;
  }
  &.transfer {
    background: rgba(8, 145, 178, 0.12);
    color: #0891b2;
  }
  &.adjustment {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }
  &.return {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.consumption {
    background: rgba(180, 35, 24, 0.12);
    color: #b42318;
  }
  &.production {
    background: rgba(46, 125, 79, 0.12);
    color: #2e7d4f;
  }
  &.opening_production {
    background: rgba(180, 83, 9, 0.12);
    color: #b45309;
  }
}
</style>
