<!--
  SalesToolbar.vue — شريط أدوات صفحة المبيعات (إجراءات + فلاتر تاريخ)
  ═══════════════════════════════════════════════════════════════
  أزرار إنشاء فاتورة/عروض أسعار/استيراد Excel + فلاتر الفترة.
  استُخرج من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <div class="page-toolbar card">
    <div v-if="activeTab !== 'monthly'" class="toolbar-actions">
      <router-link
        to="/invoices/create"
        class="btn btn-primary btn-sm"
        style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600"
      >
        <span>+ إنشاء فاتورة جملة</span>
      </router-link>
      <router-link
        to="/invoices/quotes"
        class="btn btn-outline btn-sm"
        style="display: inline-flex; align-items: center; gap: 6px"
      >
        <span>عرض أسعار</span>
      </router-link>
      <button
        type="button"
        class="icon-btn"
        title="تحميل قالب الاستيراد"
        @click="$emit('downloadTemplate')"
      >
        📥
      </button>
      <label class="icon-btn import-btn" title="فحص ملف Excel">
        🔍
        <input type="file" accept=".xlsx,.xls" hidden @change="onFile('validate')" />
      </label>
      <label class="icon-btn import-btn" title="استيراد من Excel">
        📤
        <input type="file" accept=".xlsx,.xls" hidden @change="onFile('import')" />
      </label>
    </div>
    <div class="filter-row">
      <div class="form-group">
        <label>من تاريخ</label>
        <input :value="filters.from_date" type="date" @change="onFromDate" />
      </div>
      <div class="form-group">
        <label>إلى تاريخ</label>
        <input :value="filters.to_date" type="date" @change="onToDate" />
      </div>
      <div class="form-group month-picker-group">
        <label>&nbsp;</label>
        <div class="month-filter-btn" title="اختر الشهر بالكامل">
          <AppIcon name="calendar" :size="18" />
          <input type="month" class="month-picker-overlay" @change="onMonth" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * شريط أدوات المبيعات — يستهلك من SalesView.
 *
 * @props activeTab  التبويب النشط (branch/wholesale/monthly)
 * @props filters    فلاتر الفترة { from_date, to_date }
 *
 * @emits downloadTemplate  طلب تحميل قالب الاستيراد
 * @emits validate          ملف مختار للفحص (File)
 * @emits import            ملف مختار للاستيراد (File)
 * @emits update:from_date  تغيير تاريخ البداية (يليها filter-change لإعادة التحميل)
 * @emits update:to_date    تغيير تاريخ النهاية
 * @emits select-month      قيمة شهر مختارة (YYYY-MM)
 */
import AppIcon from '@/components/AppIcon.vue';

defineProps<{
  activeTab: string;
  filters: { from_date: string; to_date: string };
}>();

const emit = defineEmits<{
  downloadTemplate: [];
  validate: [file: File];
  import: [file: File];
  'update:from_date': [value: string];
  'update:to_date': [value: string];
  'select-month': [value: string];
}>();

/** تمرير ملف الفحص/الاستيراد للأب ثم تصفير الحقل (يسمح بإعادة اختيار نفس الملف). */
const onFile = (kind: 'validate' | 'import') => (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (kind === 'validate') emit('validate', file);
  else emit('import', file);
  input.value = '';
};

const onFromDate = (e: Event) => {
  emit('update:from_date', (e.target as HTMLInputElement).value);
};

const onToDate = (e: Event) => {
  emit('update:to_date', (e.target as HTMLInputElement).value);
};

const onMonth = (e: Event) => {
  emit('select-month', (e.target as HTMLInputElement).value);
};
</script>

<style lang="scss" scoped>
.page-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding: 16px;
  border-radius: calc(var(--radius-lg) + 2px);
  border-color: var(--sales-panel-border);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, transparent), transparent 38%),
    color-mix(in srgb, var(--card-bg) 92%, var(--bg-elevated));
  box-shadow: var(--shadow-xs);
}
.toolbar-actions {
  display: flex;
  gap: 9px;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border));
}
.import-btn {
  cursor: pointer;
  margin: 0;
}
.icon-btn {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border));
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  cursor: pointer;
  transition:
    transform var(--transition),
    box-shadow var(--transition),
    border-color var(--transition);
  &:hover {
    transform: translateY(-2px);
    background: var(--bg);
    border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
    box-shadow: var(--shadow-xs);
  }
  &.warning {
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  }
  &.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  }
}
.filter-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-row .form-group {
  min-width: 160px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 82%, transparent);
}
.filter-row .form-group label {
  margin-bottom: 7px;
  font-size: 0.76rem;
  font-weight: 950;
}
.filter-row .form-group input {
  min-height: 38px;
  padding: 8px 10px;
  border-color: transparent;
  background: transparent;
  font-weight: 850;
}
.month-picker-group {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 48px !important;
}
.month-filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-end;
  margin-bottom: 8px;
}
.month-filter-btn:hover {
  background: var(--bg-hover);
  border-color: var(--primary);
  color: var(--primary);
}
.month-picker-overlay {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
</style>
