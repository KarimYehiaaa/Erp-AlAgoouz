<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>🧮 حاسبة تكلفة وهامش ربح التوليفات</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="form-section">
        <div class="form-group">
          <label>اسم التوليفة المقترحة (اختياري)</label>
          <input v-model="calcForm.name_ar" type="text" placeholder="مثال: توليفة مخصوصة بالهيل" />
        </div>
      </div>

      <div class="form-section">
        <div class="ingredients-header">
          <h4>المكونات ونسب الخلط</h4>
        </div>
        <div class="ingredients-form-list">
          <div v-for="(item, i) in calcForm.items" :key="i" class="ingredient-form-row">
            <div class="ingredient-form-fields">
              <div class="form-group flex-3">
                <label v-if="i === 0">الخامة (البن/مكون)</label>
                <select v-model.number="item.ingredient_product_id" @change="autoSetCalcUnit(item)">
                  <option :value="null">اختر الخامة</option>
                  <option v-for="p in rawMaterials" :key="p.id" :value="p.id">
                    {{ p.name_ar }} ({{ unitLabel(p.unit) }}) — الشراء:
                    {{ formatMoney(p.purchase_price) }}
                  </option>
                </select>
              </div>
              <div class="form-group flex-1">
                <label v-if="i === 0">الوزن</label>
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="0"
                  @input="calcProfitMargin"
                />
              </div>
              <div class="form-group flex-1">
                <label v-if="i === 0">الوحدة</label>
                <select v-model="item.unit_code" @change="calcProfitMargin">
                  <option v-for="u in recipeUnitOptions" :key="u.code" :value="u.code">
                    {{ u.label }}
                  </option>
                </select>
              </div>
              <div class="form-group flex-1">
                <label v-if="i === 0">التكلفة</label>
                <div class="cost-display">{{ formatMoney(itemCost(item, props.allProducts)) }}</div>
              </div>
            </div>
            <button
              type="button"
              class="remove-ingredient-btn"
              :disabled="calcForm.items.length === 1"
              @click="removeCalcItem(i)"
            >
              ✕
            </button>
          </div>
        </div>

        <button
          type="button"
          class="btn btn-outline btn-add-ingredient"
          @click="addCalcItem"
          style="width: 100%; margin-top: 8px"
        >
          + إضافة مكون آخر للتوليفة
        </button>
      </div>

      <div class="form-totals">
        <div class="total-row">
          <span>إجمالي وزن الخلطة:</span>
          <strong>{{ calcTotalWeightText }}</strong>
        </div>
        <div class="total-row">
          <span>إجمالي التكلفة الكلية للخلطة:</span>
          <strong>{{ formatMoney(calcTotalCost) }}</strong>
        </div>
        <div
          class="total-row"
          style="border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 4px"
        >
          <span>متوسط تكلفة الكيلو الواحد:</span>
          <strong style="color: var(--primary-dark); font-size: 1.1rem">{{
            formatMoney(calcCostPerKilo)
          }}</strong>
        </div>
      </div>

      <div
        class="form-section bg-light"
        style="background: rgba(var(--primary-rgb), 0.02); border-top: 1px solid var(--border)"
      >
        <h4 style="margin-bottom: 12px">تحديد هوامش الأرباح والبيع</h4>
        <div class="grid grid-2">
          <div class="form-group">
            <label>سعر البيع المقترح للكيلو (ج.م)</label>
            <input
              v-model.number="calcForm.target_price"
              type="number"
              min="0"
              step="0.5"
              placeholder="0"
              @input="onTargetPriceInput"
            />
          </div>
          <div class="form-group">
            <label>هامش الربح المستهدف (%)</label>
            <input
              v-model.number="calcForm.target_margin"
              type="number"
              min="-100"
              max="100"
              step="1"
              placeholder="40"
              @input="onTargetMarginInput"
            />
          </div>
        </div>

        <div class="form-group" style="margin-top: 14px">
          <label
            style="
              display: flex;
              justify-content: space-between;
              font-size: 0.82rem;
              font-weight: 600;
              color: var(--text-muted);
              margin-bottom: 6px;
            "
          >
            <span>تحريك الهامش المستهدف تفاعلياً:</span>
            <span style="font-weight: 700; color: var(--primary-dark)"
              >{{ calcForm.target_margin || 0 }}%</span
            >
          </label>
          <input
            v-model.number="calcForm.target_margin"
            type="range"
            min="-20"
            max="95"
            step="1"
            class="range-slider"
            @input="onTargetMarginInput"
          />
        </div>

        <div
          style="margin-top: 12px; display: flex; justify-content: space-between; font-size: 0.9rem"
        >
          <span>الحالة الربحية:</span>
          <strong :class="calcMarginClass" style="font-size: 1rem">
            {{ calcProfitStatusText }}
          </strong>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-outline" @click="emit('close')">إلغاء</button>
        <button class="btn btn-save" :disabled="!isCalcValid" @click="convertToRecipe">
          <AppIcon name="check" :size="16" /> تحويل لوصفة حقيقية
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { normalizeUnit, itemCost } from '@/utils/recipeCost';

/**
 * حاسبة تكلفة وهامش ربح التوليفات — تحسب كل شيء داخلياً
 * وتبعث بيانات الوصفة الجاهزة للتحويل.
 *
 * @props rawMaterials — الخامات المتاحة (لاختيار المكونات)
 * @props allProducts — القائمة الكاملة (لحساب التكاليف)
 * @props recipeUnitOptions — خيارات الوحدات
 * @props formatMoney — تنسيق العملة
 * @props unitLabel — تسمية الوحدة
 * @emits close — إغلاق الحاسبة
 * @emits convert — تحويل التوليفة إلى وصفة حقيقية (payload الوصفة)
 */
const props = defineProps<{
  rawMaterials: any[];
  allProducts: any[];
  recipeUnitOptions: any[];
  formatMoney: (_v: any) => string;
  unitLabel: (_u: any) => string;
}>();

const emit = defineEmits<{
  close: [];
  convert: [recipe: any];
}>();

// ─── state ────────────────────────────────────────────────────────────────
const calcForm = ref({
  name_ar: '',
  target_price: 0,
  target_margin: 40,
  items: [emptyCalcItem()],
});

function emptyCalcItem() {
  return { ingredient_product_id: null, quantity: 100, unit_code: 'g' };
}

const addCalcItem = () => calcForm.value.items.push(emptyCalcItem());
const removeCalcItem = (i: any) => {
  if (calcForm.value.items.length > 1) calcForm.value.items.splice(i, 1);
  calcProfitMargin();
};

const autoSetCalcUnit = (item: any) => {
  const p = props.allProducts.find((x: any) => x.id === item.ingredient_product_id);
  if (p) {
    const norm = normalizeUnit(p.unit);
    if (norm) item.unit_code = norm;
  }
  calcProfitMargin();
};

// ─── calculations ─────────────────────────────────────────────────────────
const calcTotalWeightGrams = computed(() => {
  return calcForm.value.items.reduce((sum: any, item: any) => {
    const qty = Number(item.quantity || 0);
    const norm = normalizeUnit(item.unit_code);
    if (norm === 'kg') return sum + qty * 1000;
    if (norm === 'g') return sum + qty;
    if (norm === 'l') return sum + qty * 1000;
    if (norm === 'ml') return sum + qty;
    return sum + qty;
  }, 0);
});

const calcTotalWeightText = computed(() => {
  const wg = calcTotalWeightGrams.value;
  if (wg >= 1000) return `${(wg / 1000).toFixed(2)} كيلو`;
  return `${wg.toFixed(0)} جرام`;
});

const calcTotalCost = computed(() => {
  return calcForm.value.items.reduce((s: any, it: any) => s + itemCost(it, props.allProducts), 0);
});

const calcCostPerKilo = computed(() => {
  const wg = calcTotalWeightGrams.value;
  const tc = calcTotalCost.value;
  if (!wg) return 0;
  return tc * (1000 / wg);
});

// Sync Target Price and Target Margin
const onTargetPriceInput = () => {
  const cost = calcCostPerKilo.value;
  const price = Number(calcForm.value.target_price || 0);
  if (price > 0) {
    calcForm.value.target_margin = Math.round(((price - cost) / price) * 100);
  } else {
    calcForm.value.target_margin = 0;
  }
};

const onTargetMarginInput = () => {
  const cost = calcCostPerKilo.value;
  const margin = Number(calcForm.value.target_margin || 0);
  if (margin < 100) {
    calcForm.value.target_price = Number((cost / (1 - margin / 100)).toFixed(2));
  } else {
    calcForm.value.target_price = 0;
  }
};

// Recalculate if totals change
const calcProfitMargin = () => {
  onTargetMarginInput();
};

const calcMarginClass = computed(() => {
  const m = Number(calcForm.value.target_margin || 0);
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
});

const calcProfitStatusText = computed(() => {
  const cost = calcCostPerKilo.value;
  const price = Number(calcForm.value.target_price || 0);
  const margin = Number(calcForm.value.target_margin || 0);
  if (!price || price <= 0) return 'الرجاء إدخال سعر البيع';
  if (price < cost) return `⚠️ بيع بخسارة! هامش الربح: ${margin}%`;
  return `✅ هامش الربح المحقق: ${margin}% (الربح للكيلو: ${props.formatMoney(price - cost)})`;
});

const isCalcValid = computed(() => {
  const validItems = calcForm.value.items.filter(
    (it: any) => it.ingredient_product_id && Number(it.quantity) > 0,
  );
  return validItems.length > 0 && calcTotalWeightGrams.value > 0;
});

const convertToRecipe = () => {
  const validItems = calcForm.value.items.filter(
    (it: any) => it.ingredient_product_id && Number(it.quantity) > 0,
  );
  emit('convert', {
    id: null,
    product_id: null,
    name_ar: calcForm.value.name_ar?.trim() || 'توليفة محتسبة',
    items: validItems.map((it: any) => ({
      ingredient_product_id: it.ingredient_product_id,
      quantity: Number(it.quantity),
      unit_code: it.unit_code || 'g',
    })),
  });
  emit('close');
};
</script>

<style lang="scss" scoped>
@import './recipeModal.css';

/* Range Slider */
.range-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  outline: none;
  margin: 6px 0;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #2e7d4f;
    cursor: pointer;
    transition: transform 0.1s;

    &:hover {
      transform: scale(1.2);
    }
  }
}
</style>
