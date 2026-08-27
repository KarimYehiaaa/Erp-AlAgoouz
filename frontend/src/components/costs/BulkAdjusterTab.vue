<template>
  <div class="tab-content animate-fade-in">
    <div class="adjuster-card card">
      <div class="adjuster-header">
        <h3>تعديل الأسعار الجماعي للمنتجات</h3>
        <p>تتيح لك هذه الأداة تعديل أسعار مجموعة من المنتجات دفعة واحدة في قاعدة البيانات.</p>
      </div>

      <div class="adjuster-warning alert alert-warning">
        <strong> تنبيه هام:</strong> التعديلات التي تقوم بها هنا هي تعديلات فعلية ونهائية وسيتم
        كتابتها مباشرة في قاعدة البيانات. يرجى مراجعة الحقول وتأكيد القرار قبل الضغط على زر التطبيق.
      </div>

      <div class="adjuster-form-wrap">
        <div class="form-grid">
          <div class="form-group">
            <label>التصنيف المستهدف</label>
            <select v-model="adjustCategory">
              <option value="">كل المنتجات (النظام بالكامل)</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name_ar }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>السعر المراد تعديله</label>
            <select v-model="adjustType">
              <option value="sale">سعر البيع (Sale Price)</option>
              <option value="purchase">سعر الشراء / التكلفة الأساسية (Purchase Price)</option>
            </select>
          </div>
          <div class="form-group">
            <label>طريقة التعديل</label>
            <select v-model="adjustMode">
              <option value="percent">نسبة مئوية (%)</option>
              <option value="fixed">قيمة ثابتة (ج.م)</option>
            </select>
          </div>
          <div class="form-group">
            <label>قيمة التعديل (يمكن أن تكون سالبة للخصم)</label>
            <input
              type="number"
              step="0.01"
              v-model.number="adjustValue"
              placeholder="مثال: 10 أو -5"
            />
          </div>
        </div>

        <div class="adjuster-actions">
          <button
            class="btn btn-primary btn-large"
            :disabled="adjustingPrices || adjustValue === 0"
            @click="applyBulkAdjustment"
          >
            {{ adjustingPrices ? 'جاري تطبيق التعديل الجماعي...' : 'تطبيق التعديل الجماعي فوراً' }}
          </button>
        </div>

        <div v-if="adjustSuccess" class="alert alert-success mt-15 animate-fade-in">
          {{ adjustSuccess }}
        </div>
        <div v-if="adjustError" class="alert alert-danger mt-15 animate-fade-in">
          {{ adjustError }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { products as productsApi } from '@/api';

/**
 * تبويب تعديل الأسعار الجماعي — يطبق التعديل في قاعدة البيانات مباشرة.
 *
 * @props categories — التصنيفات للفلاتر
 * @emits reload — إعادة تحميل بيانات التكاليف بعد التعديل
 */
defineProps<{
  categories: any[];
}>();

const emit = defineEmits<{
  reload: [];
}>();

// ─── state ────────────────────────────────────────────────────────────────────
const adjustCategory = ref('');
const adjustType = ref('sale'); // 'sale' | 'purchase'
const adjustMode = ref('percent'); // 'percent' | 'fixed'
const adjustValue = ref(0);
const adjustingPrices = ref(false);
const adjustSuccess = ref('');
const adjustError = ref('');

const applyBulkAdjustment = async () => {
  adjustSuccess.value = '';
  adjustError.value = '';

  if (adjustValue.value === 0) {
    adjustError.value = 'يرجى إدخال قيمة تعديل غير صفرية';
    return;
  }

  const confirmMsg = `هل أنت متأكد من تعديل أسعار ${adjustType.value === 'sale' ? 'البيع' : 'الشراء'} لجميع منتجات ${adjustCategory.value ? 'التصنيف المختار' : 'النظام بالكامل'} بمقدار ${adjustValue.value}${adjustMode.value === 'percent' ? '%' : ' ج.م'}؟ هذا التعديل نهائي ويؤثر مباشرة في قاعدة البيانات.`;
  if (!confirm(confirmMsg)) return;

  adjustingPrices.value = true;
  try {
    const res = await productsApi.bulkAdjustPrices({
      category_id: adjustCategory.value || null,
      type: adjustType.value,
      adjust_type: adjustMode.value,
      value: adjustValue.value,
    });
    adjustSuccess.value = `تم تعديل أسعار ${res.data?.updatedCount || 0} منتجات بنجاح.`;
    adjustValue.value = 0;
    emit('reload');
  } catch (e: any) {
    adjustError.value = e.message || 'فشل تعديل الأسعار جماعياً';
  } finally {
    adjustingPrices.value = false;
  }
};
</script>

<style lang="scss" scoped>
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.animate-fade-in {
  animation: fadeIn 0.25s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Adjuster card */
.adjuster-card {
  padding: 24px;
  .adjuster-header {
    margin-bottom: 20px;
    h3 {
      margin: 0 0 6px 0;
      color: var(--primary-dark);
    }
    p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--text-muted);
    }
  }
}

.alert {
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 20px;
  &.alert-warning {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #b45309;
  }
  &.alert-danger {
    background: rgba(180, 35, 24, 0.06);
    border: 1px solid rgba(180, 35, 24, 0.2);
    color: #b42318;
  }
  &.alert-success {
    background: rgba(46, 125, 79, 0.08);
    border: 1px solid rgba(46, 125, 79, 0.3);
    color: #2e7d4f;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.adjuster-actions {
  display: flex;
  justify-content: flex-end;
}
.btn-large {
  padding: 12px 28px;
  font-size: 1rem;
}
.mt-15 {
  margin-top: 15px;
}
</style>
