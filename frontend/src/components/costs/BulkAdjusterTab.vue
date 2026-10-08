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
            :disabled="adjustingPrices || reviewingPrices || adjustValue === 0"
            @click="applyBulkAdjustment"
          >
            {{ adjustingPrices ? 'جاري تطبيق التعديل الجماعي...' : 'تطبيق التعديل الجماعي فوراً' }}
          </button>
          <button
            v-if="hasPendingAdjustment"
            data-test="review-adjustment"
            class="btn btn-secondary"
            :disabled="adjustingPrices || reviewingPrices"
            @click="reviewBulkAdjustment"
          >
            {{ reviewingPrices ? 'جاري التحقق من النتيجة...' : 'التحقق من نتيجة التعديل السابق' }}
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
import { getApiCacheScope } from '@/api/client';
import {
  readPendingPriceAdjustment,
  savePendingPriceAdjustment,
  clearPendingPriceAdjustment,
  PRICE_REPLAY_WINDOW_MS,
  type PendingPriceAdjustment,
  type PriceAdjustmentPayload,
} from '@/utils/pendingPriceAdjustment';

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
const adjustCategory = ref<number | ''>('');
const adjustType = ref<'sale' | 'purchase'>('sale');
const adjustMode = ref<'percent' | 'fixed'>('percent');
const adjustValue = ref(0);
const adjustingPrices = ref(false);
const reviewingPrices = ref(false);
const hasPendingAdjustment = ref(false);
const adjustSuccess = ref('');
const adjustError = ref('');
const operationScope = getApiCacheScope();
let pendingAdjustment: PendingPriceAdjustment | undefined;
try {
  pendingAdjustment = readPendingPriceAdjustment(operationScope);
  if (pendingAdjustment) {
    hasPendingAdjustment.value = true;
    const data = pendingAdjustment.payload;
    adjustCategory.value = data.category_id ?? '';
    adjustType.value = data.type;
    adjustMode.value = data.adjust_type;
    adjustValue.value = data.value;
    adjustError.value = 'يوجد تعديل سابق غير مؤكد؛ أعد المحاولة بنفس القيم للتحقق من نتيجته.';
  }
} catch {
  adjustError.value = 'تعذر قراءة التعديل المعلق؛ راجع نتيجة التعديل السابق قبل المتابعة.';
}
const makeOperationKey = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const applyBulkAdjustment = async () => {
  if (adjustingPrices.value || reviewingPrices.value) return;
  adjustSuccess.value = '';
  adjustError.value = '';

  if (adjustValue.value === 0) {
    adjustError.value = 'يرجى إدخال قيمة تعديل غير صفرية';
    return;
  }
  if (
    !Number.isFinite(adjustValue.value) ||
    adjustValue.value < -100 ||
    adjustValue.value > 10_000_000
  ) {
    adjustError.value = 'أدخل قيمة تعديل صحيحة بين -100 و10000000.';
    return;
  }

  const payload: PriceAdjustmentPayload = {
    category_id: adjustCategory.value ? Number(adjustCategory.value) : null,
    all_products: !adjustCategory.value,
    type: adjustType.value,
    adjust_type: adjustMode.value,
    value: adjustValue.value,
  };
  if (getApiCacheScope() !== operationScope) {
    adjustError.value = 'تغير الحساب أو الخادم؛ أعد فتح الشاشة قبل تعديل الأسعار.';
    return;
  }
  try {
    pendingAdjustment = readPendingPriceAdjustment(operationScope);
    hasPendingAdjustment.value = !!pendingAdjustment;
  } catch {
    adjustError.value = 'تعذر قراءة التعديل المعلق؛ راجع نتيجة التعديل السابق قبل المتابعة.';
    return;
  }
  if (
    pendingAdjustment &&
    (Date.now() - pendingAdjustment.createdAt >= PRICE_REPLAY_WINDOW_MS ||
      Date.now() < pendingAdjustment.createdAt)
  ) {
    adjustError.value =
      'راجع نتيجة التعديل السابق؛ انتهت مدة إعادة المحاولة الآمنة ولا يمكن تكراره تلقائيًا.';
    return;
  }
  if (pendingAdjustment && JSON.stringify(pendingAdjustment.payload) !== JSON.stringify(payload)) {
    adjustError.value =
      'راجع نتيجة التعديل السابق أولًا؛ يمكنك إعادة محاولته بنفس القيم دون تكرار الزيادة.';
    return;
  }

  const confirmMsg = `هل أنت متأكد من تعديل أسعار ${adjustType.value === 'sale' ? 'البيع' : 'الشراء'} لجميع منتجات ${adjustCategory.value ? 'التصنيف المختار' : 'النظام بالكامل'} بمقدار ${adjustValue.value}${adjustMode.value === 'percent' ? '%' : ' ج.م'}؟ هذا التعديل نهائي ويؤثر مباشرة في قاعدة البيانات.`;
  if (!confirm(confirmMsg)) return;

  pendingAdjustment ??= { version: 1, payload, key: makeOperationKey(), createdAt: Date.now() };
  try {
    savePendingPriceAdjustment(operationScope, pendingAdjustment);
    hasPendingAdjustment.value = true;
  } catch {
    adjustError.value = 'تعذر حفظ العملية لاستعادتها بأمان؛ لم يُرسل تعديل الأسعار.';
    return;
  }
  adjustingPrices.value = true;
  const operation = pendingAdjustment;
  try {
    const res = await productsApi.bulkAdjustPrices(payload, operation.key);
    clearPendingPriceAdjustment(operationScope, operation.key);
    pendingAdjustment = undefined;
    hasPendingAdjustment.value = false;
    adjustSuccess.value = `تم تعديل أسعار ${res.data?.updatedCount || 0} منتجات بنجاح.`;
    adjustValue.value = 0;
    emit('reload');
  } catch (e: any) {
    if ([400, 401, 403, 404, 422, 429].includes(e.status)) {
      try {
        clearPendingPriceAdjustment(operationScope, operation.key);
        pendingAdjustment = undefined;
        hasPendingAdjustment.value = false;
      } catch {
        adjustError.value = 'تعذر إزالة التعديل المعلق؛ راجع نتيجته قبل بدء تعديل آخر.';
        return;
      }
    }
    adjustError.value = e.message || 'فشل تعديل الأسعار جماعياً';
  } finally {
    adjustingPrices.value = false;
  }
};

const reviewBulkAdjustment = async () => {
  if (adjustingPrices.value || reviewingPrices.value) return;
  adjustError.value = '';
  adjustSuccess.value = '';
  if (getApiCacheScope() !== operationScope) {
    adjustError.value = 'تغير الحساب أو الخادم؛ أعد فتح الشاشة قبل مراجعة التعديل.';
    return;
  }
  reviewingPrices.value = true;
  try {
    const operation = readPendingPriceAdjustment(operationScope);
    if (!operation) {
      hasPendingAdjustment.value = false;
      adjustError.value = 'لا توجد عملية معلقة محفوظة في هذه الشاشة.';
      return;
    }
    const response = await productsApi.bulkAdjustmentStatus(operation.key);
    if (getApiCacheScope() !== operationScope)
      throw new Error('تغير الحساب أو الخادم؛ أعد فتح الشاشة لمراجعة النتيجة.');
    if (
      response.data?.state === 'completed' &&
      Number.isSafeInteger(response.data.updatedCount) &&
      response.data.updatedCount! >= 0
    ) {
      clearPendingPriceAdjustment(operationScope, operation.key);
      pendingAdjustment = undefined;
      hasPendingAdjustment.value = false;
      adjustValue.value = 0;
      adjustSuccess.value = `سبق تعديل أسعار ${response.data.updatedCount} منتجات بنجاح؛ لم تُنفذ زيادة جديدة.`;
      emit('reload');
    } else {
      adjustError.value =
        response.data?.state === 'processing'
          ? 'العملية قيد المعالجة أو نتيجتها غير مؤكدة؛ احتُفظ بها للمراجعة دون تكرارها.'
          : 'تعذر تأكيد نتيجة التعديل من السجل؛ راجع الأسعار وسجل النشاط قبل أي تعديل جديد.';
    }
  } catch (error: any) {
    adjustError.value = error.message || 'تعذر التحقق من نتيجة التعديل السابق.';
  } finally {
    reviewingPrices.value = false;
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
