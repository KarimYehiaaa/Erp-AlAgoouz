<template>
  <div class="costs-page">
    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">💰</span>
        <div>
          <h2>تكاليف المنتجات والوصفات</h2>
          <p>تحليل التكاليف، هوامش الربح، محاكاة التضخم، تعديل الأسعار، والتحكم في الهدر</p>
        </div>
      </div>
      <div class="header-meta">
        <div class="meta-item">
          <span class="meta-label">إجمالي المنتجات</span>
          <span class="meta-value">{{ products.length }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">متوسط هامش الربح</span>
          <span class="meta-value">{{ avgMargin }}%</span>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="costs-tabs card">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'analysis' }"
        @click="activeTab = 'analysis'"
      >
        📊 تحليل هوامش الربح
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'simulator' }"
        @click="activeTab = 'simulator'"
      >
        📈 محاكي التضخم (What-If)
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'bulk_adjust' }"
        @click="activeTab = 'bulk_adjust'"
      >
        🏷️ تعديل الأسعار جماعياً
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'wastage' }"
        @click="activeTab = 'wastage'"
      >
        🗑️ تقرير الهدر والفواقد
      </button>
    </div>

    <!-- TAB 1: MARGIN ANALYSIS -->
    <MarginAnalysisTab
      v-if="activeTab === 'analysis'"
      :filtered-products="filteredProducts"
      :loading="loading"
      :categories="categories"
      :total-sales="totalSales"
      :total-cost="totalCost"
      :total-profit="totalProfit"
      :total-units-sold="totalUnitsSold"
      v-model:search="search"
      v-model:selected-category="selectedCategory"
      v-model:sort-by="sortBy"
      v-model:show-low-margin-only="showLowMarginOnly"
      :margin-pct="marginPct"
      :margin-class="marginClass"
      :row-class="rowClass"
      :format-qty="formatQty"
      :format-money="formatMoney"
      :unit-label="unitLabel"
      @edit="openEdit"
      @open-recipe="openRecipeBreakdown"
    />

    <!-- TAB 2: INFLATION SIMULATOR -->
    <InflationSimulatorTab
      v-if="activeTab === 'simulator'"
      :products="products"
      :recipes-list="recipesList"
      :categories="categories"
      :avg-margin="avgMargin"
      :margin-pct="marginPct"
      :format-money="formatMoney"
    />

    <!-- TAB 3: BULK PRICE ADJUSTER -->
    <BulkAdjusterTab v-if="activeTab === 'bulk_adjust'" :categories="categories" @reload="load" />

    <!-- TAB 4: WASTAGE REPORT -->
    <WastageTab v-if="activeTab === 'wastage'" :format-qty="formatQty" :unit-label="unitLabel" />

    <!-- Edit Price Modal -->
    <div v-if="editingProduct" class="modal-overlay" @click.self="editingProduct = null">
      <div class="modal-card">
        <h3>تعديل أسعار: {{ editingProduct.name_ar }}</h3>
        <div class="form-group">
          <label>سعر الشراء / التكلفة (ج.م)</label>
          <input v-model.number="editForm.purchase_price" type="number" min="0" step="0.01" />
        </div>
        <div class="form-group">
          <label>سعر البيع (ج.م)</label>
          <input v-model.number="editForm.sale_price" type="number" min="0" step="0.01" />
        </div>
        <div class="modal-preview">
          <span>هامش الربح المتوقع:</span>
          <strong :class="editMarginClass">{{ editMarginPct.toFixed(1) }}%</strong>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" :disabled="savingPrice" @click="savePrice">
            {{ savingPrice ? 'جاري الحفظ...' : 'حفظ' }}
          </button>
          <button class="btn btn-outline" @click="editingProduct = null">إلغاء</button>
        </div>
        <p v-if="priceError" class="error-msg">{{ priceError }}</p>
      </div>
    </div>

    <!-- Recipe Breakdown Modal (Cost Breakdown Analyzer) -->
    <div
      v-if="selectedRecipe || loadingRecipe"
      class="modal-overlay"
      @click.self="selectedRecipe = null"
    >
      <div class="modal-card recipe-breakdown-card">
        <div v-if="loadingRecipe" class="loading-state">⏳ جاري تحميل تفاصيل الوصفة...</div>
        <div v-else-if="recipeError" class="error-state">
          <span></span>
          <p>{{ recipeError }}</p>
          <button class="btn btn-outline" @click="selectedRecipe = null">إغلاق</button>
        </div>
        <div v-else-if="selectedRecipe">
          <div class="modal-header">
            <h3>محلل مكونات التكلفة: {{ selectedRecipe.product_name }}</h3>
            <span class="recipe-sku-badge">{{ selectedRecipe.product_sku }}</span>
          </div>

          <div class="recipe-summary-box">
            <div class="summary-item">
              <span class="label">إجمالي تكلفة المكونات</span>
              <strong class="val">{{ formatMoney(selectedRecipe.estimated_total_cost) }}</strong>
            </div>
            <div class="summary-item">
              <span class="label">سعر البيع الحالي</span>
              <strong class="val">{{
                formatMoney(getProductSalePrice(selectedRecipe.product_id))
              }}</strong>
            </div>
            <div class="summary-item">
              <span class="label">هامش الربح للوصفة</span>
              <strong class="val profit-positive"
                >{{ getRecipeMargin(selectedRecipe).toFixed(1) }}%</strong
              >
            </div>
          </div>

          <h4>مساهمة كل مكون في التكلفة الإجمالية:</h4>
          <div class="ingredient-analysis-list">
            <div
              v-for="item in selectedRecipe.items"
              :key="item.id"
              class="ingredient-analysis-row"
            >
              <div class="ing-info">
                <span class="ing-name">{{ item.ingredient_name }}</span>
                <span class="ing-qty"
                  >{{ item.quantity }} {{ unitLabel(item.unit_code) }} ×
                  {{ formatMoney(item.ingredient_unit_price) }}</span
                >
              </div>
              <div class="ing-cost-wrap">
                <span class="ing-cost">{{ formatMoney(item.estimated_cost) }}</span>
                <span class="ing-pct"
                  >{{
                    computeContributionPct(
                      item.estimated_cost,
                      selectedRecipe.estimated_total_cost,
                    )
                  }}%</span
                >
              </div>
              <div class="progress-bar-container">
                <div
                  class="progress-bar"
                  :style="{
                    width:
                      computeContributionPct(
                        item.estimated_cost,
                        selectedRecipe.estimated_total_cost,
                      ) + '%',
                  }"
                  :class="
                    contributionClass(
                      computeContributionPct(
                        item.estimated_cost,
                        selectedRecipe.estimated_total_cost,
                      ),
                    )
                  "
                ></div>
              </div>
            </div>
          </div>

          <div class="modal-actions mt-20">
            <button class="btn btn-outline" @click="selectedRecipe = null">إغلاق المحلل</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import MarginAnalysisTab from '@/components/costs/MarginAnalysisTab.vue';
import InflationSimulatorTab from '@/components/costs/InflationSimulatorTab.vue';
import BulkAdjusterTab from '@/components/costs/BulkAdjusterTab.vue';
import WastageTab from '@/components/costs/WastageTab.vue';
import { products as productsApi, recipes as recipesApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

const { categories, loadMeta, unitLabel } = useProductMeta();

// ─── Tabs ────────────────────────────────────────────────────────────────────
const activeTab = ref('analysis'); // 'analysis' | 'simulator' | 'bulk_adjust' | 'wastage'

// ─── State ───────────────────────────────────────────────────────────────────
const loading = ref(false);
const products = ref<any[]>([]);
const recipesList = ref<any[]>([]);

// Margin analysis filters (v-model مع تبويب التحليل)
const search = ref('');
const selectedCategory = ref('');
const sortBy = ref('name');
const showLowMarginOnly = ref(false);

// Edit Price Modal
const editingProduct = ref<any>(null);
const editForm = ref({ purchase_price: 0, sale_price: 0 });
const savingPrice = ref(false);
const priceError = ref('');

// Recipe Breakdown Modal
const selectedRecipe = ref<any>(null);
const loadingRecipe = ref(false);
const recipeError = ref('');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const marginPct = (p: any) => {
  const buy = Number(p.purchase_price || 0);
  const sell = Number(p.sale_price || 0);
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
};

const marginClass = (p: any) => {
  const m = marginPct(p);
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
};

const rowClass = (p: any) => {
  if (!p.has_recipe && p.total_qty_sold > 0) return 'row-no-recipe';
  return '';
};

const formatQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3);
};

// ─── Computed Properties ──────────────────────────────────────────────────────
const filteredProducts = computed(() => {
  let list = products.value;
  if (selectedCategory.value)
    list = list.filter((p: any) => p.category_id == selectedCategory.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (p: any) => p.name_ar.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q),
    );
  }
  if (showLowMarginOnly.value) {
    list = list.filter((p: any) => marginPct(p) < 25);
  }
  return [...list].sort((a: any, b: any) => {
    if (sortBy.value === 'margin_desc') return marginPct(b) - marginPct(a);
    if (sortBy.value === 'margin_asc') return marginPct(a) - marginPct(b);
    if (sortBy.value === 'sales_desc')
      return Number(b.total_qty_sold || 0) - Number(a.total_qty_sold || 0);
    if (sortBy.value === 'profit_desc')
      return Number(b.net_profit || 0) - Number(a.net_profit || 0);
    return (a.name_ar || '').localeCompare(b.name_ar || '', 'ar');
  });
});

const totalSales = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.total_revenue || 0), 0),
);
const totalCost = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.total_cost_sold || 0), 0),
);
const totalProfit = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.net_profit || 0), 0),
);
const totalUnitsSold = computed(() =>
  filteredProducts.value.reduce((s: any, p: any) => s + Number(p.total_qty_sold || 0), 0),
);
const avgMargin = computed(() => {
  if (!filteredProducts.value.length) return '0.0';
  const sum = filteredProducts.value.reduce((s: any, p: any) => s + marginPct(p), 0);
  return (sum / filteredProducts.value.length).toFixed(1);
});

// Edit modal margin computed
const editMarginPct = computed(() => {
  const buy = Number(editForm.value.purchase_price || 0);
  const sell = Number(editForm.value.sale_price || 0);
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
});
const editMarginClass = computed(() => {
  const m = editMarginPct.value;
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
});

// ─── Cost Breakdown Analyzer Modal Helpers ────────────────────────────────────
const getProductSalePrice = (productId: any) => {
  const p = products.value.find((prod: any) => prod.id === productId);
  return p ? Number(p.sale_price || 0) : 0;
};

const getRecipeMargin = (recipe: any) => {
  const sell = getProductSalePrice(recipe.product_id);
  const cost = Number(recipe.estimated_total_cost || 0);
  if (!sell) return 0;
  return ((sell - cost) / sell) * 100;
};

const computeContributionPct = (itemCost: any, totalCost: any) => {
  if (!totalCost) return '0.0';
  return ((Number(itemCost) / Number(totalCost)) * 100).toFixed(1);
};

const contributionClass = (pctStr: any) => {
  const pct = Number(pctStr);
  if (pct >= 50) return 'contrib-high';
  if (pct >= 20) return 'contrib-mid';
  return 'contrib-low';
};

// ─── Data Loading ─────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  try {
    const [prodRes, recRes] = await Promise.all([
      productsApi.costsReport(),
      recipesApi.listRecipes().catch(() => ({ data: [] })),
    ]);
    products.value = prodRes.data || [];
    recipesList.value = recRes.data || [];
    await loadMeta();
  } catch (e: any) {
    console.error('فشل تحميل التكاليف والوصفات:', e.message);
  } finally {
    loading.value = false;
  }
};

// ─── Edit Price Modal Actions ─────────────────────────────────────────────────
const openEdit = (product: any) => {
  editingProduct.value = product;
  editForm.value = {
    purchase_price: Number(product.purchase_price || 0),
    sale_price: Number(product.sale_price || 0),
  };
  priceError.value = '';
};

const savePrice = async () => {
  priceError.value = '';
  if (!editForm.value.sale_price || editForm.value.sale_price <= 0) {
    priceError.value = 'سعر البيع يجب أن يكون أكبر من صفر';
    return;
  }
  savingPrice.value = true;
  try {
    await productsApi.update(editingProduct.value.id, {
      purchase_price: editForm.value.purchase_price,
      sale_price: editForm.value.sale_price,
    });
    editingProduct.value = null;
    await load();
  } catch (e: any) {
    priceError.value = e.message || 'فشل الحفظ';
  } finally {
    savingPrice.value = false;
  }
};

// ─── Cost Breakdown Analyzer Actions ──────────────────────────────────────────
const openRecipeBreakdown = async (recipeId: any) => {
  loadingRecipe.value = true;
  recipeError.value = '';
  selectedRecipe.value = {}; // Opens modal immediately in loading state
  try {
    const res = await recipesApi.getRecipe(recipeId);
    selectedRecipe.value = res.data;
  } catch (e: any) {
    recipeError.value = e.message || 'فشل تحميل تفاصيل الوصفة';
  } finally {
    loadingRecipe.value = false;
  }
};

onMounted(load);
</script>

<style lang="scss" scoped>
.costs-page {
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
  .header-meta {
    display: flex;
    gap: 24px;
  }
  .meta-item {
    text-align: center;
    .meta-label {
      display: block;
      font-size: 0.78rem;
      color: var(--text-muted);
    }
    .meta-value {
      display: block;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--primary-dark);
    }
  }
}

/* Tab Navigation */
.costs-tabs {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;

  .tab-btn {
    padding: 10px 20px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted);
    border-radius: var(--radius);
    transition: all 0.2s ease;
    white-space: nowrap;

    &:hover {
      background: var(--bg);
      color: var(--primary-dark);
    }

    &.active {
      background: rgba(30, 41, 59, 0.06);
      color: var(--primary-dark);
      border-bottom: 2px solid var(--primary-dark);
    }
  }
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 28px;
  width: min(420px, 92vw);
  box-shadow: var(--shadow-lg);
  h3 {
    margin: 0 0 20px;
    color: var(--primary-dark);
  }
  .modal-preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: var(--radius);
    margin: 12px 0 20px;
    font-size: 0.9rem;
  }
  .modal-actions {
    display: flex;
    gap: 10px;
  }
  .error-msg {
    color: #b42318;
    margin-top: 10px;
    font-size: 0.88rem;
  }
}

.recipe-breakdown-card {
  width: min(540px, 95vw) !important;
  max-height: 90vh;
  overflow-y: auto;

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;
    margin-bottom: 16px;

    h3 {
      margin: 0;
    }
  }

  .recipe-sku-badge {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
}

.recipe-summary-box {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  background: var(--bg);
  padding: 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  margin-bottom: 20px;

  .summary-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    .label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .val {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--primary-dark);
    }
  }
}

.ingredient-analysis-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 10px;
}

.ingredient-analysis-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);

  .ing-info {
    display: flex;
    justify-content: space-between;

    .ing-name {
      font-weight: 600;
      color: var(--primary-dark);
    }

    .ing-qty {
      font-size: 0.78rem;
      color: var(--text-muted);
    }
  }

  .ing-cost-wrap {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;

    .ing-cost {
      font-weight: 600;
    }

    .ing-pct {
      color: var(--text-muted);
      font-weight: 700;
    }
  }

  .progress-bar-container {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;

    .progress-bar {
      height: 100%;
      border-radius: 3px;

      &.contrib-low {
        background: #2e7d4f;
      }
      &.contrib-mid {
        background: #f59e0b;
      }
      &.contrib-high {
        background: #b42318;
      }
    }
  }
}

.mt-20 {
  margin-top: 20px;
}

.loading-state,
.empty-state,
.error-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  span {
    font-size: 2rem;
    display: block;
    margin-bottom: 8px;
  }
}

@media (max-width: 768px) {
  .recipe-summary-box {
    grid-template-columns: 1fr;
  }
}
</style>
