<template>
  <div class="costs-page">

    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">🧪</span>
        <div>
          <h2>تكاليف المنتجات</h2>
          <p>تحليل سعر الشراء والبيع وهامش الربح لكل منتج في المحل</p>
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

    <!-- Filters -->
    <div class="filters-bar card">
      <div class="filter-group">
        <input v-model="search" type="text" placeholder="🔍 بحث باسم المنتج أو الكود..." class="search-input" />
      </div>
      <div class="filter-group">
        <select v-model="selectedCategory">
          <option value="">كل التصنيفات</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_ar }}</option>
        </select>
      </div>
      <div class="filter-group">
        <select v-model="sortBy">
          <option value="name">ترتيب: الاسم</option>
          <option value="margin_desc">ترتيب: أعلى هامش</option>
          <option value="margin_asc">ترتيب: أقل هامش</option>
          <option value="sales_desc">ترتيب: أكثر مبيعاً</option>
          <option value="profit_desc">ترتيب: أعلى ربح</option>
        </select>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-4 summary-row">
      <div class="summary-card">
        <div class="summary-icon">💰</div>
        <div class="summary-body">
          <div class="summary-label">إجمالي المبيعات</div>
          <div class="summary-value">{{ formatMoney(totalSales) }}</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-icon">📦</div>
        <div class="summary-body">
          <div class="summary-label">إجمالي التكلفة</div>
          <div class="summary-value">{{ formatMoney(totalCost) }}</div>
        </div>
      </div>
      <div class="summary-card profit">
        <div class="summary-icon">📈</div>
        <div class="summary-body">
          <div class="summary-label">إجمالي الربح</div>
          <div class="summary-value">{{ formatMoney(totalProfit) }}</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-icon">🔢</div>
        <div class="summary-body">
          <div class="summary-label">إجمالي الوحدات المباعة</div>
          <div class="summary-value">{{ totalUnitsSold.toLocaleString('en-GB') }}</div>
        </div>
      </div>
    </div>

    <!-- Products Cost Table -->
    <div class="card table-card">
      <div v-if="loading" class="loading-state">⏳ جاري تحميل البيانات...</div>
      <div v-else-if="!filteredProducts.length" class="empty-state">
        <span>🔍</span><p>لا توجد منتجات مطابقة</p>
      </div>
      <div v-else class="table-wrap">
        <table class="costs-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>التصنيف</th>
              <th>الوحدة</th>
              <th>سعر الشراء</th>
              <th>سعر البيع</th>
              <th>هامش الربح</th>
              <th>الكمية المباعة</th>
              <th>إجمالي الإيراد</th>
              <th>إجمالي التكلفة</th>
              <th>صافي الربح</th>
              <th>وصفة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredProducts" :key="p.id" :class="rowClass(p)">
              <td class="product-name-cell">
                <div class="product-name">{{ p.name_ar }}</div>
                <div class="product-sku">{{ p.sku }}</div>
              </td>
              <td>
                <span class="category-badge">{{ p.category_name || '—' }}</span>
              </td>
              <td>{{ unitLabel(p.unit) }}</td>
              <td class="price-cell">{{ formatMoney(p.purchase_price) }}</td>
              <td class="price-cell">{{ formatMoney(p.sale_price) }}</td>
              <td>
                <div class="margin-bar-wrap">
                  <div class="margin-bar" :style="{ width: Math.min(marginPct(p), 100) + '%' }" :class="marginClass(p)"></div>
                  <span class="margin-label" :class="marginClass(p)">{{ marginPct(p).toFixed(1) }}%</span>
                </div>
              </td>
              <td class="number-cell">{{ formatQty(p.total_qty_sold) }}</td>
              <td class="price-cell">{{ formatMoney(p.total_revenue) }}</td>
              <td class="price-cell muted">{{ formatMoney(p.total_cost_sold) }}</td>
              <td class="price-cell" :class="p.net_profit >= 0 ? 'profit-positive' : 'profit-negative'">
                {{ formatMoney(p.net_profit) }}
              </td>
              <td>
                <span v-if="p.has_recipe" class="recipe-badge has-recipe" :title="p.recipe_name">
                  🧾 {{ p.recipe_items_count }} مكون
                </span>
                <span v-else class="recipe-badge no-recipe">— مباشر</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="6"><strong>الإجمالي</strong></td>
              <td class="number-cell"><strong>{{ totalUnitsSold.toLocaleString('en-GB') }}</strong></td>
              <td class="price-cell"><strong>{{ formatMoney(totalSales) }}</strong></td>
              <td class="price-cell muted"><strong>{{ formatMoney(totalCost) }}</strong></td>
              <td class="price-cell profit-positive"><strong>{{ formatMoney(totalProfit) }}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Edit Price Modal -->
    <div v-if="editingProduct" class="modal-overlay" @click.self="editingProduct = null">
      <div class="modal-card">
        <h3>✏️ تعديل أسعار: {{ editingProduct.name_ar }}</h3>
        <div class="form-group">
          <label>سعر الشراء (ج.م)</label>
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

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { products as productsApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

const { categories, loadMeta, unitLabel } = useProductMeta();
// ─── state ──────────────────────────────────────────────────────────────────
const loading = ref(false);
const products = ref([]);
const search = ref('');
const selectedCategory = ref('');
const sortBy = ref('name');
const editingProduct = ref(null);
const editForm = ref({ purchase_price: 0, sale_price: 0 });
const savingPrice = ref(false);
const priceError = ref('');

// ─── helpers ─────────────────────────────────────────────────────────────────
const marginPct = (p) => {
  const buy = Number(p.purchase_price || 0);
  const sell = Number(p.sale_price || 0);
  if (!sell) return 0;
  return ((sell - buy) / sell) * 100;
};

const marginClass = (p) => {
  const m = marginPct(p);
  if (m >= 40) return 'margin-high';
  if (m >= 20) return 'margin-mid';
  return 'margin-low';
};

const rowClass = (p) => {
  if (!p.has_recipe && p.total_qty_sold > 0) return 'row-no-recipe';
  return '';
};

const formatQty = (v) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3);
};

// ─── computed ─────────────────────────────────────────────────────────────────
const filteredProducts = computed(() => {
  let list = products.value;
  if (selectedCategory.value) list = list.filter((p) => p.category_id == selectedCategory.value);
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter((p) => p.name_ar.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => {
    if (sortBy.value === 'margin_desc') return marginPct(b) - marginPct(a);
    if (sortBy.value === 'margin_asc') return marginPct(a) - marginPct(b);
    if (sortBy.value === 'sales_desc') return Number(b.total_qty_sold || 0) - Number(a.total_qty_sold || 0);
    if (sortBy.value === 'profit_desc') return Number(b.net_profit || 0) - Number(a.net_profit || 0);
    return (a.name_ar || '').localeCompare(b.name_ar || '', 'ar');
  });
});

const totalSales = computed(() => filteredProducts.value.reduce((s, p) => s + Number(p.total_revenue || 0), 0));
const totalCost = computed(() => filteredProducts.value.reduce((s, p) => s + Number(p.total_cost_sold || 0), 0));
const totalProfit = computed(() => filteredProducts.value.reduce((s, p) => s + Number(p.net_profit || 0), 0));
const totalUnitsSold = computed(() => filteredProducts.value.reduce((s, p) => s + Number(p.total_qty_sold || 0), 0));
const avgMargin = computed(() => {
  if (!filteredProducts.value.length) return '0.0';
  const sum = filteredProducts.value.reduce((s, p) => s + marginPct(p), 0);
  return (sum / filteredProducts.value.length).toFixed(1);
});

// edit modal computed
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

// ─── data loading ─────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  try {
    const prodRes = await productsApi.costsReport();
    products.value = prodRes.data || [];
    await loadMeta();
  } catch (e) {
    console.error('فشل تحميل التكاليف:', e.message);
  } finally {
    loading.value = false;
  }
};

// ─── edit price ───────────────────────────────────────────────────────────────
const openEdit = (product) => {
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
  } catch (e) {
    priceError.value = e.message || 'فشل الحفظ';
  } finally {
    savingPrice.value = false;
  }
};

onMounted(load);
</script>

<style lang="scss" scoped>
.costs-page { display: flex; flex-direction: column; gap: 20px; }

.page-header {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;
  .header-title { display: flex; align-items: center; gap: 14px;
    .header-icon { font-size: 2rem; }
    h2 { margin: 0; font-size: 1.3rem; color: var(--primary-dark); }
    p { margin: 4px 0 0; font-size: 0.85rem; color: var(--text-muted); }
  }
  .header-meta { display: flex; gap: 24px; }
  .meta-item { text-align: center;
    .meta-label { display: block; font-size: 0.78rem; color: var(--text-muted); }
    .meta-value { display: block; font-size: 1.4rem; font-weight: 800; color: var(--primary-dark); }
  }
}

.filters-bar {
  display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
  .filter-group { flex: 1; min-width: 160px; }
  .search-input, select { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); font-size: 0.9rem; }
}

/* Summary Cards */
.summary-row { gap: 14px; }
.summary-card {
  display: flex; align-items: center; gap: 14px; padding: 16px 20px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  &.profit { border-color: rgba(46,125,79,0.3); background: rgba(46,125,79,0.04); }
  .summary-icon { font-size: 1.8rem; }
  .summary-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
  .summary-value { font-size: 1.15rem; font-weight: 800; color: var(--primary-dark); }
}

/* Table */
.table-card { overflow: hidden; }
.table-wrap { overflow-x: auto; }
.costs-table {
  width: 100%; border-collapse: collapse; font-size: 0.88rem;
  th { background: var(--bg); padding: 11px 12px; text-align: right; font-weight: 700; color: var(--text-muted); font-size: 0.8rem; border-bottom: 2px solid var(--border); white-space: nowrap; }
  td { padding: 11px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:hover td { background: rgba(0,0,0,0.02); }
  .product-name-cell { .product-name { font-weight: 600; } .product-sku { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; } }
  .price-cell { font-weight: 600; white-space: nowrap; }
  .number-cell { text-align: center; }
  .muted { color: var(--text-muted); font-weight: 400; }
  .profit-positive { color: #2e7d4f; }
  .profit-negative { color: #b42318; }
  .row-no-recipe td { background: rgba(241,196,15,0.05); }
}

.category-badge { background: var(--bg); padding: 2px 8px; border-radius: 20px; font-size: 0.78rem; border: 1px solid var(--border); white-space: nowrap; }

/* Margin bar */
.margin-bar-wrap { display: flex; align-items: center; gap: 8px; min-width: 100px; }
.margin-bar { height: 6px; border-radius: 3px; transition: width 0.3s; min-width: 4px; }
.margin-label { font-size: 0.82rem; font-weight: 700; white-space: nowrap; }
.margin-high { background: #2e7d4f; color: #2e7d4f; }
.margin-mid { background: #f59e0b; color: #b45309; }
.margin-low { background: #b42318; color: #b42318; }

/* Recipe badge */
.recipe-badge { padding: 3px 8px; border-radius: 20px; font-size: 0.78rem; white-space: nowrap; }
.has-recipe { background: rgba(46,125,79,0.1); color: #2e7d4f; border: 1px solid rgba(46,125,79,0.2); }
.no-recipe { background: var(--bg); color: var(--text-muted); border: 1px solid var(--border); }

/* Totals row */
.totals-row td { background: var(--bg); border-top: 2px solid var(--border); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.modal-card {
  background: var(--bg-card); border-radius: var(--radius); padding: 28px; width: min(420px, 92vw);
  box-shadow: var(--shadow-lg);
  h3 { margin: 0 0 20px; color: var(--primary-dark); }
  .modal-preview { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg); border-radius: var(--radius); margin: 12px 0 20px; font-size: 0.9rem; }
  .modal-actions { display: flex; gap: 10px; }
  .error-msg { color: #b42318; margin-top: 10px; font-size: 0.88rem; }
}

.loading-state, .empty-state { text-align: center; padding: 48px; color: var(--text-muted);
  span { font-size: 2rem; display: block; margin-bottom: 8px; }
}

@media (max-width: 768px) {
  .summary-row { grid-template-columns: 1fr 1fr; }
}
</style>
