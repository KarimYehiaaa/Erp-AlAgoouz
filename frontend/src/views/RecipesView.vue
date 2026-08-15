<template>
  <div class="recipes-page">
    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">🥣</span>
        <div>
          <h2>وصفات المنتجات</h2>
          <p>تعريف مكونات كل منتج — يُخصم المخزون تلقائياً عند البيع</p>
        </div>
      </div>
      <div class="header-actions" style="display: flex; gap: 10px">
        <button class="btn btn-outline" @click="openCalculator">
          <AppIcon name="costs" :size="16" /> حاسبة التوليفات
        </button>
        <button class="btn btn-add" @click="openNewRecipe">
          <AppIcon name="add" :size="16" /> وصفة جديدة
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-3 stats-row">
      <div class="stat-card card">
        <div class="stat-icon">🧾</div>
        <div class="stat-body">
          <div class="stat-label">إجمالي الوصفات</div>
          <div class="stat-value">{{ recipes.length }}</div>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon">📦</div>
        <div class="stat-body">
          <div class="stat-label">منتجات بدون وصفة</div>
          <div class="stat-value warn">{{ productsWithoutRecipe.length }}</div>
        </div>
      </div>
      <div class="stat-card card">
        <div class="stat-icon">⚠️</div>
        <div class="stat-body">
          <div class="stat-label">مخزون منخفض</div>
          <div class="stat-value danger">{{ lowStockIngredients }}</div>
        </div>
      </div>
    </div>

    <!-- Recipes List -->
    <div v-if="loading" class="loading-state card">⏳ جاري التحميل...</div>
    <div v-else-if="!recipes.length" class="empty-state card">
      <span>🥣</span>
      <p>لا توجد وصفات بعد. أضف وصفة لكل منتج في المحل.</p>
      <button class="btn btn-add" @click="openNewRecipe">
        <AppIcon name="add" :size="16" /> إضافة أول وصفة
      </button>
    </div>
    <div v-else class="recipes-grid">
      <div v-for="recipe in recipes" :key="recipe.id" class="recipe-card card">
        <div class="recipe-header">
          <div class="recipe-product">
            <span
              class="recipe-type-badge"
              :class="recipe.items.length === 1 ? 'simple' : 'compound'"
            >
              {{ recipe.items.length === 1 ? '⚡ بسيط' : '🔗 مركب' }}
            </span>
            <div>
              <div class="recipe-product-name">{{ recipe.product_name }}</div>
              <div class="recipe-name-sub">{{ recipe.name_ar }} · {{ recipe.product_sku }}</div>
            </div>
          </div>
          <div class="recipe-actions">
            <button class="icon-btn edit" title="تعديل" @click="openEdit(recipe)">
              <AppIcon name="edit" :size="16" />
            </button>
            <button class="icon-btn" title="إنتاج دفعة" @click="openProduce(recipe)">
              <AppIcon name="coffee" :size="16" />
            </button>
            <button class="icon-btn danger" title="حذف" @click="deleteRecipe(recipe.id)">
              <AppIcon name="delete" :size="16" />
            </button>
          </div>
        </div>

        <!-- Ingredients -->
        <div class="ingredients-list">
          <div v-for="item in recipe.items" :key="item.id" class="ingredient-row">
            <div class="ingredient-info">
              <span class="ingredient-name">{{ item.ingredient_name }}</span>
              <span class="ingredient-qty"
                >{{ item.quantity }} {{ unitLabel(item.unit_code) }}</span
              >
            </div>
            <div class="ingredient-stock">
              <div class="stock-bar-wrap">
                <div
                  class="stock-bar"
                  :class="stockBarClass(item)"
                  :style="{ width: stockBarWidth(item) + '%' }"
                ></div>
              </div>
              <span class="stock-label" :class="stockBarClass(item)">
                متاح: {{ formatQty(item.stock_available) }} {{ unitLabel(item.ingredient_unit) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Recipe Footer -->
        <div class="recipe-footer">
          <div class="recipe-cost">
            <span class="cost-label">تكلفة الوصفة:</span>
            <span class="cost-value">{{ formatMoney(recipe.estimated_total_cost || 0) }}</span>
          </div>
          <div class="recipe-sales">
            <span class="sales-label">مبيعات الشهر:</span>
            <span class="sales-value"
              >{{ formatQty(recipe.monthly_sold || 0) }} {{ unitLabel(recipe.product_unit) }}</span
            >
          </div>
          <div class="recipe-stock-impact">
            <span class="impact-label">تأثير على المخزون:</span>
            <span class="impact-value" :class="recipe.can_produce > 0 ? 'ok' : 'danger'">
              {{
                recipe.can_produce > 0
                  ? `يمكن إنتاج ${formatQty(recipe.can_produce)} وحدة`
                  : '⚠️ مخزون غير كافٍ'
              }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Products Without Recipe Warning -->
    <div v-if="productsWithoutRecipe.length" class="card warning-card">
      <h3>⚠️ منتجات بدون وصفة ({{ productsWithoutRecipe.length }})</h3>
      <p class="warning-note">هذه المنتجات سيتم خصمها مباشرة من مخزون المنتج نفسه عند البيع.</p>
      <div class="no-recipe-list">
        <div v-for="p in productsWithoutRecipe" :key="p.id" class="no-recipe-item">
          <span class="no-recipe-name">{{ p.name_ar }}</span>
          <span class="no-recipe-sku">{{ p.sku }}</span>
          <button class="btn btn-sm btn-outline" @click="openNewRecipeFor(p)">+ إضافة وصفة</button>
        </div>
      </div>
    </div>

    <!-- Recipe Form Modal -->
    <RecipeFormModal
      v-if="showForm"
      :form="form"
      :all-products="allProducts"
      :raw-materials="rawMaterials"
      :recipe-unit-options="recipeUnitOptions"
      :saving="saving"
      :form-error="formError"
      :total-form-cost="totalFormCost"
      :selected-product-sale-price="selectedProductSalePrice"
      :form-margin-pct="formMarginPct"
      :form-margin-class="formMarginClass"
      :format-money="formatMoney"
      :format-qty="formatQty"
      :unit-label="unitLabel"
      @close="closeForm"
      @save="saveRecipe"
      @add-item="addItem"
      @remove-item="removeItem"
    />

    <!-- Produce Batch Modal -->
    <ProduceModal
      v-if="showProduceModal"
      :produce-form="produceForm"
      :warehouses="warehouses"
      :producing="producing"
      :produce-error="produceError"
      :produce-action-label="produceActionLabel"
      :produce-mode-help="produceModeHelp"
      :unit-label="unitLabel"
      @close="closeProduce"
      @save="saveProduce"
    />

    <!-- Calculator Modal -->
    <CalculatorModal
      v-if="showCalculator"
      :raw-materials="rawMaterials"
      :all-products="allProducts"
      :recipe-unit-options="recipeUnitOptions"
      :format-money="formatMoney"
      :unit-label="unitLabel"
      @close="closeCalculator"
      @convert="convertToRecipe"
    />

    <!-- ═══════ سجل عمليات الإنتاج ═══════ -->
    <div class="card productions-section">
      <div class="productions-header">
        <div>
          <h3>🏭 سجل عمليات الإنتاج</h3>
          <p>كل الدفعات المنتجة — يمكن عكس أي عملية لاسترداد المكونات وطرح المنتج</p>
        </div>
        <div class="productions-filters">
          <input v-model="prodFilter.from_date" type="date" class="filter-input" title="من تاريخ" />
          <input v-model="prodFilter.to_date" type="date" class="filter-input" title="إلى تاريخ" />
          <button class="btn btn-outline" @click="loadProductions">🔄</button>
        </div>
      </div>

      <div v-if="productionsLoading" class="loading-state">⏳ جاري التحميل...</div>
      <div v-else-if="!productions.length" class="empty-state">
        <span>🏭</span>
        <p>لا توجد عمليات إنتاج بعد</p>
      </div>
      <div v-else class="productions-table">
        <div class="prod-table-head">
          <span>المنتج</span>
          <span>الوصفة</span>
          <span class="col-num">الكمية</span>
          <span>المخزن</span>
          <span>التاريخ</span>
          <span class="col-num">المخزون الحالي</span>
          <span class="col-status">الحالة</span>
          <span class="col-actions">إجراء</span>
        </div>
        <div
          v-for="prod in productions"
          :key="prod.movement_id"
          class="prod-table-row"
          :class="{ reversed: prod.is_reversed }"
        >
          <span class="prod-name">{{ prod.product_name }}</span>
          <span class="prod-recipe">{{ prod.recipe_name || '—' }}</span>
          <span class="col-num">
            <strong>{{ formatQty(prod.quantity) }}</strong>
            <small>{{ prod.movement_type === 'opening_production' ? 'افتتاحي' : '' }}</small>
          </span>
          <span>{{ prod.warehouse_name || '—' }}</span>
          <span class="prod-date">{{ formatProdDate(prod.created_at) }}</span>
          <span class="col-num" :class="Number(prod.current_stock) <= 0 ? 'stock-low' : 'stock-ok'">
            {{ formatQty(prod.current_stock) }}
          </span>
          <span class="col-status">
            <span v-if="prod.is_reversed" class="badge-reversed">✓ تم العكس</span>
            <span v-else class="badge-active">نشط</span>
          </span>
          <span class="col-actions">
            <button
              v-if="!prod.is_reversed"
              class="btn btn-sm btn-danger"
              :disabled="reversing === prod.movement_id"
              @click="confirmReverse(prod)"
            >
              {{ reversing === prod.movement_id ? '...' : '↩️ عكس' }}
            </button>
            <span v-else class="text-muted">—</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Reverse Confirm Modal -->
    <div v-if="showReverseModal" class="modal-overlay" @click.self="showReverseModal = false">
      <div class="modal-card reverse-modal">
        <div class="modal-header">
          <h3>↩️ تأكيد عكس عملية الإنتاج</h3>
          <button class="close-btn" @click="showReverseModal = false">✕</button>
        </div>
        <div class="form-section" v-if="reverseTarget">
          <div class="reverse-summary">
            <div class="reverse-row">
              <span>المنتج:</span>
              <strong>{{ reverseTarget.product_name }}</strong>
            </div>
            <div class="reverse-row">
              <span>الكمية المنتجة:</span>
              <strong>{{ formatQty(reverseTarget.quantity) }}</strong>
            </div>
            <div class="reverse-row">
              <span>المخزون الحالي:</span>
              <strong
                :class="
                  Number(reverseTarget.current_stock) < Number(reverseTarget.quantity)
                    ? 'text-warn'
                    : ''
                "
              >
                {{ formatQty(reverseTarget.current_stock) }}
                <small v-if="Number(reverseTarget.current_stock) < Number(reverseTarget.quantity)">
                  (أقل من الكمية المنتجة — سيُعكس بالمتاح)
                </small>
              </strong>
            </div>
            <div class="reverse-row">
              <span>التاريخ:</span>
              <strong>{{ formatProdDate(reverseTarget.created_at) }}</strong>
            </div>
          </div>
          <div class="form-group" style="margin-top: 14px">
            <label>كمية العكس (اتركها فارغة للعكس الكامل)</label>
            <input
              v-model.number="reverseQtyInput"
              type="number"
              min="0.001"
              step="0.001"
              :max="reverseTarget.quantity"
              :placeholder="`الكمية الكاملة: ${formatQty(reverseTarget.quantity)}`"
            />
          </div>
          <div class="reverse-warning">
            ⚠️ هذا الإجراء سيطرح المنتج النهائي من المخزون ويُعيد المكونات — لا يمكن التراجع.
          </div>
          <p v-if="reverseError" class="form-error">{{ reverseError }}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="showReverseModal = false">إلغاء</button>
          <button class="btn btn-delete" :disabled="reversing" @click="doReverse">
            <AppIcon name="delete" :size="16" />
            {{ reversing ? '⏳ جاري العكس...' : 'تأكيد العكس' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import RecipeFormModal from '@/components/recipes/RecipeFormModal.vue';
import ProduceModal from '@/components/recipes/ProduceModal.vue';
import CalculatorModal from '@/components/recipes/CalculatorModal.vue';
import { costs as costsApi, products as productsApi, warehouses as warehousesApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { normalizeUnit, convertQty, itemCost } from '@/utils/recipeCost';
import { useProductMeta } from '@/composables/useProductMeta';

const { units: dbUnits, loadMeta, unitLabel: metaUnitLabel } = useProductMeta();

// ─── state ──────────────────────────────────────────────────────────────────
const loading = ref(false);
const recipes = ref<any[]>([]);
const allProducts = ref<any[]>([]);
const warehouses = ref<any[]>([]);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const showProduceModal = ref(false);
const producing = ref(false);
const produceError = ref('');
const produceForm = ref<Record<string, any>>({
  recipe_id: null,
  product_name: '',
  unit: '',
  mode: 'production',
  quantity: 1,
  warehouse_id: null,
  notes: '',
});

const form = ref({
  id: null,
  product_id: null,
  name_ar: '',
  items: [emptyItem()],
});

// ─── Calculator state (فتح/إغلاق فقط — المنطق داخل المكوّن) ────────────────
const showCalculator = ref(false);

const openCalculator = () => {
  showCalculator.value = true;
};

const closeCalculator = () => {
  showCalculator.value = false;
};

const convertToRecipe = (recipe: any) => {
  form.value = {
    id: null,
    product_id: null,
    name_ar: recipe.name_ar || 'توليفة محتسبة',
    items: recipe.items || [],
  };
  formError.value = '';
  showForm.value = true;
};

function emptyItem() {
  return { ingredient_product_id: null, quantity: 1, unit_code: 'count' };
}

// ─── helpers ─────────────────────────────────────────────────────────────────
// unitLabel: يستخدم الـ composable أولاً ثم fallback للأكواد القديمة
const unitLabel = (unit: any) => metaUnitLabel(unit);

// الوحدات المتاحة للوصفات — تشمل الوحدات من الـ DB + الأكواد الفيزيائية دايماً
const recipeUnitOptions = computed(() => {
  const units = [];
  const seen = new Set();

  for (const u of dbUnits.value) {
    const code = normalizeUnit(u.name_ar) || String(u.name_ar || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    units.push({ code, label: u.name_ar });
  }

  const physical = [
    { code: 'kg', label: 'كجم' },
    { code: 'g', label: 'جرام' },
    { code: 'l', label: 'لتر' },
    { code: 'ml', label: 'مل' },
    { code: 'count', label: 'عدد' },
  ];
  for (const p of physical) {
    if (!seen.has(p.code)) {
      seen.add(p.code);
      units.push(p);
    }
  }

  return units;
});

const formatQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3);
};

// ─── computed ─────────────────────────────────────────────────────────────────
// raw materials = all products (ingredients come from the full product list)
const rawMaterials = computed(() => allProducts.value);

const productsWithoutRecipe = computed(() => {
  const withRecipe = new Set(recipes.value.map((r: any) => r.product_id));
  return allProducts.value.filter((p: any) => !withRecipe.has(p.id));
});

const lowStockIngredients = computed(() => {
  let count = 0;
  for (const recipe of recipes.value) {
    for (const item of recipe.items || []) {
      if (Number(item.stock_available || 0) < Number(item.quantity || 0)) count++;
    }
  }
  return count;
});

// stock bar helpers — مع تحويل الوحدات
const getAvailableInRecipeUnit = (item: any) => {
  const availableRaw = Number(item.stock_available || 0);
  const recipeUnit = normalizeUnit(item.unit_code);
  const stockUnit = normalizeUnit(item.ingredient_unit);
  if (!recipeUnit || !stockUnit || recipeUnit === stockUnit) return availableRaw;
  const converted = convertQty(availableRaw, stockUnit, recipeUnit);
  return converted != null ? converted : availableRaw;
};

const stockBarWidth = (item: any) => {
  const needed = Number(item.quantity || 0);
  const available = getAvailableInRecipeUnit(item);
  if (!needed) return 100;
  return Math.min((available / needed) * 100, 100);
};

const stockBarClass = (item: any) => {
  const pct = stockBarWidth(item);
  if (pct >= 100) return 'stock-ok';
  if (pct >= 50) return 'stock-warn';
  return 'stock-low';
};

// form cost calculation
const itemCostLocal = (item: any) => itemCost(item, allProducts.value);

const totalFormCost = computed(() =>
  form.value.items.reduce((s: any, it: any) => s + itemCostLocal(it), 0),
);

const selectedProductSalePrice = computed(() => {
  const p = allProducts.value.find((x: any) => x.id === form.value.product_id);
  return Number(p?.sale_price || 0);
});

const formMarginPct = computed(() => {
  const sell = selectedProductSalePrice.value;
  const cost = totalFormCost.value;
  if (!sell) return 0;
  return ((sell - cost) / sell) * 100;
});

const formMarginClass = computed(() => {
  const m = formMarginPct.value;
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
});

const produceActionLabel = computed(() =>
  produceForm.value.mode === 'opening_production' ? 'حفظ الرصيد الافتتاحي' : 'إنتاج الدفعة',
);

const produceModeHelp = computed(() =>
  produceForm.value.mode === 'opening_production'
    ? 'يزود مخزون المنتج بدون خصم المكونات لأنه رصيد موجود من قبل.'
    : 'يخصم مكونات الوصفة ويحولها إلى مخزون فعلي للمنتج.',
);

// ─── data loading ─────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  try {
    const [recRes, allProdRes, whRes] = await Promise.all([
      costsApi.listRecipes(),
      productsApi.list({ limit: 1000 }),
      warehousesApi(),
    ]);
    const rawRecipes = recRes.data || [];
    allProducts.value = allProdRes.data || [];
    warehouses.value = whRes.data || [];

    // Ensure produceForm has a default warehouse selected.
    if (warehouses.value.length) {
      if (!produceForm.value.warehouse_id) produceForm.value.warehouse_id = warehouses.value[0].id;
    }

    recipes.value = rawRecipes.map((r: any) => {
      const enrichedItems = (r.items || []).map((item: any) => {
        const p = allProducts.value.find((prod: any) => prod.id === item.ingredient_product_id);
        const globalStock = p ? Number(p.total_stock || 0) : null;

        // Use global stock across all warehouses to prevent false "insufficient stock" warnings
        return {
          ...item,
          stock_available: globalStock != null ? Number(globalStock) : item.stock_available || 0,
        };
      });

      let canProduce = Infinity;
      for (const item of enrichedItems) {
        const neededRaw = Number(item.quantity || 0);
        const recipeUnit = normalizeUnit(item.unit_code);
        const stockUnit = normalizeUnit(item.ingredient_unit);
        const availableRaw = Number(item.stock_available || 0);

        if (neededRaw <= 0) continue;

        // تحويل الـ available للوحدة نفسها زي الـ recipe
        let availableConverted = availableRaw;
        if (recipeUnit && stockUnit && recipeUnit !== stockUnit) {
          const converted = convertQty(availableRaw, stockUnit, recipeUnit);
          if (converted != null) availableConverted = converted;
        }

        canProduce = Math.min(canProduce, Math.floor(availableConverted / neededRaw));
      }
      if (canProduce === Infinity) canProduce = 0;

      return { ...r, items: enrichedItems, can_produce: canProduce };
    });

    await loadMeta();
    if (!produceForm.value.warehouse_id && warehouses.value.length) {
      produceForm.value.warehouse_id = warehouses.value[0].id;
    }
  } catch (e: any) {
    console.error('فشل تحميل الوصفات:', e.message);
  } finally {
    loading.value = false;
  }
};

// ─── form actions ─────────────────────────────────────────────────────────────
const openNewRecipe = () => {
  form.value = { id: null, product_id: null, name_ar: '', items: [emptyItem()] };
  formError.value = '';
  showForm.value = true;
};

const openNewRecipeFor = (product: any) => {
  form.value = {
    id: null,
    product_id: product.id,
    name_ar: `وصفة ${product.name_ar}`,
    items: [emptyItem()],
  };
  formError.value = '';
  showForm.value = true;
};

const openEdit = (recipe: any) => {
  form.value = {
    id: recipe.id,
    product_id: recipe.product_id,
    name_ar: recipe.name_ar || '',
    items: (recipe.items || []).map((it: any) => ({
      ingredient_product_id: it.ingredient_product_id,
      quantity: Number(it.quantity),
      unit_code: it.unit_code || 'count',
    })),
  };
  formError.value = '';
  showForm.value = true;
};

const openProduce = (recipe: any) => {
  const product = allProducts.value.find((x: any) => Number(x.id) === Number(recipe.product_id));
  produceForm.value = {
    recipe_id: recipe.id,
    product_name: recipe.product_name || '',
    unit: product?.unit || recipe.product_unit || recipe.unit || 'kg',
    mode: 'production',
    quantity: 1,
    warehouse_id:
      product?.primary_warehouse_id ||
      produceForm.value.warehouse_id ||
      warehouses.value[0]?.id ||
      null,
    notes: '',
  };
  produceError.value = '';
  showProduceModal.value = true;
};

const closeForm = () => {
  showForm.value = false;
  formError.value = '';
};
const closeProduce = () => {
  showProduceModal.value = false;
  produceError.value = '';
};

const addItem = () => form.value.items.push(emptyItem());
const removeItem = (i: any) => {
  if (form.value.items.length > 1) form.value.items.splice(i, 1);
};

const saveRecipe = async () => {
  formError.value = '';
  if (!form.value.product_id) {
    formError.value = 'اختر المنتج النهائي';
    return;
  }
  if (!form.value.name_ar?.trim()) {
    formError.value = 'اكتب اسم الوصفة';
    return;
  }
  const items = form.value.items.filter(
    (x: any) => x.ingredient_product_id && Number(x.quantity) > 0,
  );
  if (!items.length) {
    formError.value = 'أضف مكوناً واحداً على الأقل';
    return;
  }

  saving.value = true;
  try {
    const payload = {
      product_id: form.value.product_id,
      name_ar: form.value.name_ar.trim(),
      items,
    };
    if (form.value.id) await costsApi.updateRecipe(form.value.id, payload);
    else await costsApi.createRecipe(payload);
    closeForm();
    await load();
  } catch (e: any) {
    formError.value = e.message || 'فشل الحفظ';
  } finally {
    saving.value = false;
  }
};

const deleteRecipe = async (id: any) => {
  if (!confirm('تأكيد حذف الوصفة؟ بعد الحذف سيتم خصم المنتج نفسه مباشرة من المخزون عند البيع.'))
    return;
  try {
    await costsApi.deleteRecipe(id);
    await load();
  } catch (e: any) {
    alert(e.message || 'فشل الحذف');
  }
};

const saveProduce = async () => {
  produceError.value = '';
  if (!produceForm.value.recipe_id) {
    produceError.value = 'لم يتم تحديد الوصفة';
    return;
  }
  if (!Number(produceForm.value.quantity) || Number(produceForm.value.quantity) <= 0) {
    produceError.value = 'الكمية يجب أن تكون أكبر من صفر';
    return;
  }
  if (!produceForm.value.warehouse_id) {
    produceError.value = 'اختر المخزن';
    return;
  }

  producing.value = true;
  try {
    await costsApi.produceRecipe(produceForm.value.recipe_id, {
      quantity: Number(produceForm.value.quantity),
      warehouse_id: produceForm.value.warehouse_id,
      mode: produceForm.value.mode,
      notes: produceForm.value.notes?.trim() || null,
    });
    closeProduce();
    await load();
    // Notify other views (inventory) that production occurred
    try {
      window.dispatchEvent(
        new CustomEvent('inventory-updated', {
          detail: {
            product_id: produceForm.value.product_id || produceForm.value.recipe_id,
            warehouse_id: produceForm.value.warehouse_id,
          },
        }),
      );
    } catch (e: any) {
      console.warn('Failed to dispatch inventory-updated event', e);
    }
  } catch (e: any) {
    produceError.value = e.message || 'فشل الإنتاج';
  } finally {
    producing.value = false;
  }
};

// ─── Productions ──────────────────────────────────────────────────────────
const productions = ref<any[]>([]);
const productionsLoading = ref(false);
const prodFilter = ref({
  from_date: '',
  to_date: '',
});

// Reverse state
const showReverseModal = ref(false);
const reverseTarget = ref<any>(null);
const reverseQtyInput = ref<any>(null);
const reversing = ref(false); // movement_id of the one being reversed, or false
const reverseError = ref('');

const formatProdDate = (ts: any) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const loadProductions = async () => {
  productionsLoading.value = true;
  try {
    const params: Record<string, any> = {};
    if (prodFilter.value.from_date) params.from_date = prodFilter.value.from_date;
    if (prodFilter.value.to_date) params.to_date = prodFilter.value.to_date;
    productions.value = (await costsApi.listProductions(params))?.data || [];
  } catch {
    productions.value = [];
  } finally {
    productionsLoading.value = false;
  }
};

const confirmReverse = (prod: any) => {
  reverseTarget.value = prod;
  reverseQtyInput.value = null;
  reverseError.value = '';
  showReverseModal.value = true;
};

const doReverse = async () => {
  if (!reverseTarget.value) return;
  reverseError.value = '';
  reversing.value = reverseTarget.value.movement_id;
  try {
    const body: Record<string, any> = {};
    if (reverseQtyInput.value && Number(reverseQtyInput.value) > 0) {
      body.reverse_qty = Number(reverseQtyInput.value);
    }
    await costsApi.reverseProduction(reverseTarget.value.movement_id, body);
    showReverseModal.value = false;
    await loadProductions();
    await load(); // تحديث المخزون في بطاقات الوصفات
  } catch (e: any) {
    reverseError.value = e.message || 'فشل عكس العملية';
  } finally {
    reversing.value = false;
  }
};

onMounted(async () => {
  await load();
  await loadProductions();
});
</script>

<style lang="scss" scoped>
.recipes-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  .header-title {
    display: flex;
    align-items: center;
    gap: 14px;
    .header-icon {
      font-size: 2rem;
    }
    h2 {
      margin: 0;
      font-size: 1.3rem;
      color: var(--primary-dark);
    }
    p {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  }
}

/* Stats */
.stats-row {
  gap: 14px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  .stat-icon {
    font-size: 1.8rem;
  }
  .stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .stat-value {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--primary-dark);
    &.warn {
      color: #b45309;
    }
    &.danger {
      color: #b42318;
    }
  }
}

/* Recipes Grid */
.recipes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

.recipe-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  .recipe-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 14px;
    .recipe-product {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .recipe-product-name {
      font-weight: 700;
      font-size: 1rem;
      color: var(--primary-dark);
    }
    .recipe-name-sub {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .recipe-actions {
      display: flex;
      gap: 6px;
    }
  }
}

.recipe-type-badge {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  &.simple {
    background: rgba(46, 125, 79, 0.1);
    color: #2e7d4f;
    border: 1px solid rgba(46, 125, 79, 0.2);
  }
  &.compound {
    background: rgba(99, 60, 180, 0.1);
    color: #5b21b6;
    border: 1px solid rgba(99, 60, 180, 0.2);
  }
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  transition: var(--transition);
  &:hover {
    background: var(--bg);
  }
  &.danger:hover {
    background: rgba(180, 35, 24, 0.1);
    border-color: rgba(180, 35, 24, 0.3);
  }
}

/* Ingredients */
.ingredients-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.ingredient-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
  .ingredient-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    .ingredient-name {
      font-weight: 600;
      font-size: 0.88rem;
    }
    .ingredient-qty {
      font-size: 0.82rem;
      color: var(--text-muted);
      background: var(--bg-card);
      padding: 2px 8px;
      border-radius: 12px;
    }
  }
  .ingredient-stock {
    display: flex;
    align-items: center;
    gap: 8px;
    .stock-bar-wrap {
      flex: 1;
      height: 5px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    .stock-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }
    .stock-label {
      font-size: 0.75rem;
      white-space: nowrap;
    }
  }
}

.stock-ok {
  background: #2e7d4f;
  color: #2e7d4f;
}
.stock-warn {
  background: #f59e0b;
  color: #b45309;
}
.stock-low {
  background: #b42318;
  color: #b42318;
}

/* Recipe Footer */
.recipe-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 0.82rem;
  .recipe-cost,
  .recipe-sales,
  .recipe-stock-impact {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cost-label,
  .sales-label,
  .impact-label {
    color: var(--text-muted);
  }
  .cost-value,
  .sales-value {
    font-weight: 700;
    color: var(--primary-dark);
  }
  .impact-value {
    font-weight: 700;
    &.ok {
      color: #2e7d4f;
    }
    &.danger {
      color: #b42318;
    }
  }
}

/* Warning Card */
.warning-card {
  border: 1px solid rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.04);
  h3 {
    margin: 0 0 6px;
    color: #b45309;
  }
  .warning-note {
    color: var(--text-muted);
    font-size: 0.88rem;
    margin-bottom: 14px;
  }
  .no-recipe-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .no-recipe-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--bg);
    border-radius: 8px;
    .no-recipe-name {
      font-weight: 600;
      flex: 1;
    }
    .no-recipe-sku {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-family: monospace;
    }
  }
}

/* Reverse Modal (owned by the view) */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  width: min(680px, 96vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px 0;
    h3 {
      margin: 0;
      color: var(--primary-dark);
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 1.1rem;
      cursor: pointer;
      color: var(--text-muted);
      padding: 4px 8px;
    }
  }
  .form-section {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
  }
  textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    background: var(--bg-elevated);
    color: var(--text);
    font-family: inherit;
    resize: vertical;
  }
}

.form-error {
  color: #b42318;
  padding: 10px 24px;
  font-size: 0.88rem;
}
.modal-actions {
  display: flex;
  gap: 10px;
  padding: 16px 24px;
}

.loading-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
}
.empty-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  span {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 8px;
  }
  p {
    margin-bottom: 16px;
  }
}

/* ─── Productions Section ─── */
.productions-section {
  margin-top: 0;
  padding: 0;
  overflow: hidden;
}

.productions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;

  h3 {
    margin: 0 0 4px;
    font-size: 1.05rem;
    color: var(--text-strong);
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
}

.productions-filters {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-input {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-elevated);
  font-size: 0.85rem;
  color: var(--text-strong);
}

.productions-table {
  overflow-x: auto;
}

.prod-table-head,
.prod-table-row {
  display: grid;
  grid-template-columns: 1.8fr 1.2fr 90px 100px 130px 110px 90px 90px;
  align-items: center;
  gap: 10px;
  padding: 10px 22px;
  font-size: 0.84rem;
}

.prod-table-head {
  background: var(--bg);
  font-weight: 800;
  color: var(--text-muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
}

.prod-table-row {
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--primary) 3%, transparent);
  }
  &:last-child {
    border-bottom: none;
  }

  &.reversed {
    opacity: 0.55;
    background: color-mix(in srgb, var(--border) 20%, transparent);
  }
}

.prod-name {
  font-weight: 700;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-recipe {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-date {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.col-num {
  text-align: center;
}
.col-status {
  text-align: center;
}
.col-actions {
  text-align: end;
}

.badge-reversed {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 800;
  background: color-mix(in srgb, var(--success, #22c55e) 12%, var(--bg));
  color: var(--success, #22c55e);
}

.badge-active {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 800;
  background: color-mix(in srgb, var(--primary) 10%, var(--bg));
  color: var(--primary-dark);
}

.text-muted {
  color: var(--text-muted);
}
.text-warn {
  color: var(--warning, #f59e0b);
}

/* Reverse Modal */
.reverse-modal {
  max-width: 460px;
}

.reverse-summary {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.reverse-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;

  &:last-child {
    border-bottom: none;
  }
  span {
    color: var(--text-muted);
  }
  strong {
    color: var(--text-strong);
  }
}

.reverse-warning {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 6%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--border));
  color: var(--danger);
  font-size: 0.85rem;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .recipes-grid {
    grid-template-columns: 1fr;
  }
  .prod-table-head {
    display: none;
  }
  .prod-table-row {
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 12px 16px;
  }
  .productions-filters {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
