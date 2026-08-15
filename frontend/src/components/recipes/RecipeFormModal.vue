<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>{{ form.id ? '✏️ تعديل وصفة' : '➕ وصفة جديدة' }}</h3>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="form-section">
        <div class="grid grid-2">
          <div class="form-group">
            <label>المنتج النهائي *</label>
            <select v-model.number="form.product_id" :disabled="!!form.id">
              <option :value="null">اختر المنتج</option>
              <option v-for="p in allProducts" :key="p.id" :value="p.id">
                {{ p.name_ar }} ({{ unitLabel(p.unit) }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>اسم الوصفة *</label>
            <input v-model="form.name_ar" type="text" placeholder="مثال: توليفة العجوز" />
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="ingredients-header">
          <h4>المكونات</h4>
          <div class="recipe-type-hint">
            <span v-if="form.items.length === 1" class="type-badge simple"
              >⚡ وصفة بسيطة (مكون واحد)</span
            >
            <span v-else class="type-badge compound"
              >🔗 وصفة مركبة ({{ form.items.length }} مكونات)</span
            >
          </div>
        </div>

        <div class="ingredients-form-list">
          <div v-for="(item, i) in form.items" :key="i" class="ingredient-form-row">
            <div class="ingredient-form-fields">
              <div class="form-group flex-3">
                <label v-if="i === 0">المكون (خامة)</label>
                <select v-model.number="item.ingredient_product_id" @change="autoSetUnit(item)">
                  <option :value="null">اختر الخامة</option>
                  <option v-for="p in rawMaterials" :key="p.id" :value="p.id">
                    {{ p.name_ar }} ({{ unitLabel(p.unit) }}) — مخزون:
                    {{ formatQty(p.total_stock) }}
                  </option>
                </select>
              </div>
              <div class="form-group flex-1">
                <label v-if="i === 0">الكمية</label>
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="0"
                />
              </div>
              <div class="form-group flex-1">
                <label v-if="i === 0">الوحدة</label>
                <select v-model="item.unit_code">
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
              :disabled="form.items.length === 1"
              @click="emit('removeItem', i)"
              :title="
                form.items.length === 1 ? 'يجب أن يكون هناك مكون واحد على الأقل' : 'حذف المكون'
              "
            >
              ✕
            </button>
          </div>
        </div>

        <button type="button" class="btn btn-outline btn-add-ingredient" @click="emit('addItem')">
          + إضافة مكون آخر
        </button>
      </div>

      <div class="form-totals">
        <div class="total-row">
          <span>إجمالي تكلفة الوصفة:</span>
          <strong>{{ formatMoney(totalFormCost) }}</strong>
        </div>
        <div v-if="form.product_id" class="total-row">
          <span>سعر بيع المنتج:</span>
          <strong>{{ formatMoney(selectedProductSalePrice) }}</strong>
        </div>
        <div v-if="form.product_id" class="total-row profit-row">
          <span>هامش الربح المتوقع:</span>
          <strong :class="formMarginClass">{{ formMarginPct.toFixed(1) }}%</strong>
        </div>
      </div>

      <p v-if="formError" class="form-error">{{ formError }}</p>

      <div class="modal-actions">
        <button class="btn btn-outline" @click="emit('close')">إلغاء</button>
        <button class="btn btn-save" :disabled="saving" @click="emit('save')">
          <AppIcon name="save" :size="16" />
          {{ saving ? '⏳ جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'إضافة الوصفة' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { itemCost, normalizeUnit } from '@/utils/recipeCost';

/**
 * @props form — بيانات الوصفة (كائن reactable يُعدَّل مباشرة)
 * @props allProducts — كل المنتجات لاختيار المنتج النهائي
 * @props rawMaterials — الخامات المتاحة للمكونات
 * @props recipeUnitOptions — خيارات الوحدات
 * @props saving — حالة الحفظ
 * @props formError — رسالة الخطأ
 * @props totalFormCost — إجمالي تكلفة الوصفة
 * @props selectedProductSalePrice — سعر بيع المنتج المختار
 * @props formMarginPct — هامش الربح المتوقع
 * @props formMarginClass — فئة لون الهامش
 * @props formatMoney — تنسيق العملة
 * @props formatQty — تنسيق الكميات
 * @props unitLabel — تسمية الوحدة
 * @emits close — إغلاق المودال
 * @emits save — حفظ الوصفة
 * @emits addItem — إضافة مكون
 * @emits removeItem — حذف مكون
 */
const props = defineProps<{
  form: any;
  allProducts: any[];
  rawMaterials: any[];
  recipeUnitOptions: any[];
  saving: boolean;
  formError: string;
  totalFormCost: number;
  selectedProductSalePrice: number;
  formMarginPct: number;
  formMarginClass: string;
  formatMoney: (_v: any) => string;
  formatQty: (_v: any) => string;
  unitLabel: (_u: any) => string;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
  addItem: [];
  removeItem: [i: string | number];
}>();

const autoSetUnit = (item: any) => {
  const p = props.allProducts.find((x: any) => x.id === item.ingredient_product_id);
  if (p) {
    const norm = normalizeUnit(p.unit);
    if (norm) item.unit_code = norm;
  }
};
</script>

<style lang="scss" scoped>
@import './recipeModal.css';
</style>
