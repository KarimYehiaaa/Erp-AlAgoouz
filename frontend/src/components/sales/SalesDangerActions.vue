<!--
  SalesDangerActions.vue — إدارة الحذف: حسب النوع / يوم محدد / شامل
  أزرار حذف مبيعات الفرع/الجملة أو يوم محدد أو كل المبيعات (للمدير).
  استُخرج من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <div class="danger-actions card">
    <div class="danger-title">إدارة الحذف</div>

    <!-- حذف حسب النوع -->
    <div class="danger-row">
      <span class="danger-label">حذف حسب النوع:</span>
      <button
        type="button"
        class="delete-type-btn branch"
        :disabled="saving"
        @click="$emit('deleteType', 'branch')"
        title="حذف كل مبيعات الفرع نهائياً"
      >
        <span class="btn-icon"></span>
        <span class="btn-text">حذف مبيعات الفرع</span>
      </button>
      <button
        type="button"
        class="delete-type-btn wholesale"
        :disabled="saving"
        @click="$emit('deleteType', 'wholesale')"
        title="حذف كل مبيعات الجملة نهائياً"
      >
        <span class="btn-icon"></span>
        <span class="btn-text">حذف مبيعات الجملة</span>
      </button>
    </div>

    <!-- حذف حسب اليوم -->
    <div class="danger-row">
      <span class="danger-label">حذف يوم محدد:</span>
      <input v-model="date" type="date" class="date-input" />
      <button
        type="button"
        class="delete-type-btn day"
        :disabled="saving || !date"
        @click="$emit('deleteDay')"
        title="حذف مبيعات هذا اليوم فقط"
      >
        <span class="btn-icon"></span>
        <span class="btn-text">حذف مبيعات اليوم</span>
      </button>
    </div>

    <!-- حذف الكل -->
    <div class="danger-row">
      <span class="danger-label">حذف شامل:</span>
      <button
        type="button"
        class="delete-type-btn all"
        :disabled="saving"
        @click="$emit('deleteAll')"
        title="حذف كل المبيعات نهائياً"
      >
        <span class="btn-icon"></span>
        <span class="btn-text">حذف كل المبيعات</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * إدارة الحذف — يستهلك من SalesView.
 *
 * @props saving      حالة تنفيذ عملية (تعطيل الأزرار)
 * @props deleteDate  التاريخ المحدد للحذف (v-model:deleteDate)
 *
 * @emits update:deleteDate  تغيير التاريخ المحدد
 * @emits deleteType         حذف حسب النوع (branch/wholesale)
 * @emits deleteDay          حذف اليوم المحدد
 * @emits deleteAll          حذف كل المبيعات
 */
const props = defineProps<{
  saving: boolean;
  deleteDate: string;
}>();

const emit = defineEmits<{
  'update:deleteDate': [value: string];
  deleteType: [saleType: string];
  deleteDay: [];
  deleteAll: [];
}>();

/** ربط التاريخ كـ v-model مع إرجاع التغيير للأب. */
const date = computed({
  get: () => props.deleteDate,
  set: (v: string) => emit('update:deleteDate', v),
});
</script>

<style lang="scss" scoped>
.danger-actions {
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  background: color-mix(in srgb, var(--danger) 3%, transparent);
  border-radius: var(--radius-sm);
  padding: 16px 20px;
  margin-top: 4px;
}
.danger-title {
  font-weight: 800;
  color: var(--text-strong);
  margin-bottom: 14px;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.danger-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 12%, transparent);
  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}
.danger-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
  min-width: 110px;
  flex-shrink: 0;
}
.date-input {
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
  font-size: 0.88rem;
  max-width: 160px;
}
.delete-type-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: var(--transition);
  border: 2px solid transparent;

  .btn-icon {
    font-size: 1rem;
  }
  .btn-text {
    white-space: nowrap;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.branch {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary-dark);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }

  &.wholesale {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent);
    }
  }

  &.day {
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--warning);
      color: #fff;
      border-color: var(--warning);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--warning) 35%, transparent);
    }
  }

  &.all {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--danger) 35%, transparent);
    }
  }
}
</style>
