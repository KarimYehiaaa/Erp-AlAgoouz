<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>إنتاج دفعة</h3>
        <button class="close-btn" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </div>

      <div class="form-section">
        <div class="produce-summary">
          <div class="produce-product">{{ produceForm.product_name }}</div>
          <div class="produce-sub">{{ produceModeHelp }}</div>
        </div>
        <div class="form-group">
          <label>نوع العملية *</label>
          <select v-model="produceForm.mode">
            <option value="production">إنتاج فعلي - يخصم المكونات</option>
            <option value="opening_production">رصيد افتتاحي - بدون خصم مكونات</option>
          </select>
        </div>
        <div class="grid grid-2">
          <div class="form-group">
            <label>الكمية المنتجة *</label>
            <input v-model.number="produceForm.quantity" type="number" min="0.001" step="0.001" />
          </div>
          <div class="form-group">
            <label>الوحدة (تلقائي)</label>
            <input :value="unitLabel(produceForm.unit || '')" type="text" readonly />
          </div>
          <div class="form-group">
            <label>المخزن *</label>
            <select v-model.number="produceForm.warehouse_id">
              <option :value="null">اختر المخزن</option>
              <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>ملاحظات</label>
          <textarea v-model="produceForm.notes" rows="3" placeholder="اختياري"></textarea>
        </div>
        <div v-if="produceError" class="form-error">{{ produceError }}</div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-outline" @click="emit('close')">إلغاء</button>
        <button class="btn btn-save" :disabled="producing" @click="emit('save')">
          <AppIcon name="check" :size="16" />
          {{ producing ? '⏳ جاري الحفظ...' : produceActionLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/**
 * @props produceForm — نموذج الإنتاج (كائن reactable يُعدَّل مباشرة)
 * @props warehouses — قائمة المخازن
 * @props producing — حالة الحفظ
 * @props produceError — رسالة الخطأ
 * @props produceActionLabel — تسمية زر الحفظ
 * @props produceModeHelp — نص مساعدة حسب نوع العملية
 * @props unitLabel — تسمية الوحدة
 * @emits close — إغلاق المودال
 * @emits save — تنفيذ الإنتاج
 */
defineProps<{
  produceForm: any;
  warehouses: any[];
  producing: boolean;
  produceError: string;
  produceActionLabel: string;
  produceModeHelp: string;
  unitLabel: (_u: any) => string;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
}>();
</script>

<style lang="scss" scoped>
@import './recipeModal.css';

.produce-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
  .produce-product {
    font-weight: 800;
    color: var(--primary-dark);
    font-size: 1rem;
  }
  .produce-sub {
    color: var(--text-muted);
    font-size: 0.88rem;
  }
}
</style>
