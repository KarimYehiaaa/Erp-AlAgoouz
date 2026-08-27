<template>
  <div class="tab-content animate-fade-in">
    <!-- Filters -->
    <div class="filters-bar card">
      <div class="filter-group search-group">
        <input
          :value="search"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          type="text"
          placeholder=" بحث باسم المنتج أو الكود..."
          class="search-input"
        />
      </div>
      <div class="filter-group">
        <select
          :value="selectedCategory"
          @change="emit('update:selectedCategory', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">كل التصنيفات</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name_ar }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <select
          :value="sortBy"
          @change="emit('update:sortBy', ($event.target as HTMLSelectElement).value)"
        >
          <option value="name">ترتيب: الاسم</option>
          <option value="margin_desc">ترتيب: أعلى هامش</option>
          <option value="margin_asc">ترتيب: أقل هامش</option>
          <option value="sales_desc">ترتيب: أكثر مبيعاً</option>
          <option value="profit_desc">ترتيب: أعلى ربح</option>
        </select>
      </div>
      <div class="filter-group toggle-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="showLowMarginOnly"
            @change="emit('update:showLowMarginOnly', ($event.target as HTMLInputElement).checked)"
          />
          <span>عرض الهوامش المنخفضة فقط (&lt; 25%)</span>
        </label>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-4 summary-row">
      <div class="summary-card">
        <div class="summary-icon"></div>
        <div class="summary-body">
          <div class="summary-label">إجمالي المبيعات</div>
          <div class="summary-value">{{ formatMoney(totalSales) }}</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-icon"></div>
        <div class="summary-body">
          <div class="summary-label">إجمالي التكلفة</div>
          <div class="summary-value">{{ formatMoney(totalCost) }}</div>
        </div>
      </div>
      <div class="summary-card profit">
        <div class="summary-icon"></div>
        <div class="summary-body">
          <div class="summary-label">إجمالي الربح</div>
          <div class="summary-value">{{ formatMoney(totalProfit) }}</div>
        </div>
      </div>
      <div class="summary-card">
        <div class="summary-icon"></div>
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
        <span></span>
        <p>لا توجد منتجات مطابقة</p>
      </div>
      <div v-else class="table-wrap">
        <table class="costs-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>التصنيف</th>
              <th>الوحدة</th>
              <th>سعر التكلفة</th>
              <th>سعر البيع</th>
              <th>هامش الربح</th>
              <th>الكمية المباعة</th>
              <th>إجمالي الإيراد</th>
              <th>إجمالي التكلفة</th>
              <th>صافي الربح</th>
              <th>وصفة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in filteredProducts"
              :key="p.id"
              :class="[rowClass(p), { 'row-alert': marginPct(p) < 25 }]"
            >
              <td class="product-name-cell">
                <div class="product-name-wrap">
                  <span
                    v-if="marginPct(p) < 25"
                    class="alert-indicator"
                    title="هامش ربح منخفض أقل من 25%"
                  ></span>
                  <div>
                    <div class="product-name">{{ p.name_ar }}</div>
                    <div class="product-sku">{{ p.sku }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span class="category-badge">{{ p.category_name || '—' }}</span>
              </td>
              <td>{{ unitLabel(p.unit) }}</td>
              <td class="price-cell">
                {{ formatMoney(p.purchase_price) }}
                <span class="cost-source-badge" :class="p.cost_source">{{
                  p.cost_source === 'recipe' ? 'وصفة' : 'شراء'
                }}</span>
              </td>
              <td class="price-cell">{{ formatMoney(p.sale_price) }}</td>
              <td>
                <div class="margin-bar-wrap">
                  <div
                    class="margin-bar"
                    :style="{ width: Math.max(0, Math.min(marginPct(p), 100)) + '%' }"
                    :class="marginClass(p)"
                  ></div>
                  <span class="margin-label" :class="marginClass(p)"
                    >{{ marginPct(p).toFixed(1) }}%</span
                  >
                </div>
              </td>
              <td class="number-cell">{{ formatQty(p.total_qty_sold) }}</td>
              <td class="price-cell">{{ formatMoney(p.total_revenue) }}</td>
              <td class="price-cell muted">{{ formatMoney(p.total_cost_sold) }}</td>
              <td
                class="price-cell"
                :class="p.net_profit >= 0 ? 'profit-positive' : 'profit-negative'"
              >
                {{ formatMoney(p.net_profit) }}
              </td>
              <td>
                <button
                  v-if="p.has_recipe"
                  class="recipe-btn has-recipe"
                  @click="emit('openRecipe', p.recipe_id)"
                >
                  {{ p.recipe_items_count }} مكونات
                </button>
                <span v-else class="recipe-badge no-recipe">شراء مباشر</span>
              </td>
              <td>
                <button class="btn-edit-price" @click="emit('edit', p)">تعديل</button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="6"><strong>الإجمالي</strong></td>
              <td class="number-cell">
                <strong>{{ totalUnitsSold.toLocaleString('en-GB') }}</strong>
              </td>
              <td class="price-cell">
                <strong>{{ formatMoney(totalSales) }}</strong>
              </td>
              <td class="price-cell muted">
                <strong>{{ formatMoney(totalCost) }}</strong>
              </td>
              <td class="price-cell profit-positive">
                <strong>{{ formatMoney(totalProfit) }}</strong>
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * تبويب تحليل هوامش الربح — الفلاتر + بطاقات الملخص + جدول التكاليف.
 *
 * @props filteredProducts — المنتجات المفلترة والمرتبة
 * @props loading — حالة تحميل
 * @props categories — التصنيفات
 * @props totalSales / totalCost / totalProfit / totalUnitsSold — ملخصات
 * @props search / selectedCategory / sortBy / showLowMarginOnly — v-models للفلاتر
 * @props marginPct / marginClass / rowClass / formatQty — أدوات الحساب
 * @props formatMoney — تنسيق العملة
 * @props unitLabel — تسمية الوحدة
 * @emits update:search / update:selectedCategory / update:sortBy / update:showLowMarginOnly
 * @emits edit — فتح تعديل السعر
 * @emits openRecipe — فتح محلل مكونات الوصفة
 */
defineProps<{
  filteredProducts: any[];
  loading: boolean;
  categories: any[];
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  totalUnitsSold: number;
  search: string;
  selectedCategory: any;
  sortBy: string;
  showLowMarginOnly: boolean;
  marginPct: (_p: any) => number;
  marginClass: (_p: any) => string;
  rowClass: (_p: any) => string;
  formatQty: (_v: any) => string;
  formatMoney: (_v: any) => string;
  unitLabel: (_u: any) => string;
}>();

const emit = defineEmits<{
  'update:search': [v: string];
  'update:selectedCategory': [v: any];
  'update:sortBy': [v: string];
  'update:showLowMarginOnly': [v: boolean];
  edit: [p: any];
  openRecipe: [recipeId: any];
}>();
</script>

<style lang="scss" scoped>
@import './costsTable.css';

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

.filters-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  .filter-group {
    flex: 1;
    min-width: 160px;
  }
  .search-input,
  select {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    font-size: 0.9rem;
  }
}

/* Summary Cards */
.summary-row {
  gap: 14px;
}
.summary-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  &.profit {
    border-color: rgba(46, 125, 79, 0.3);
    background: rgba(46, 125, 79, 0.04);
  }
  .summary-icon {
    font-size: 1.8rem;
  }
  .summary-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  .summary-value {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--primary-dark);
  }
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--primary-dark);
  user-select: none;
  input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
}
.toggle-group {
  display: flex;
  align-items: center;
  height: 100%;
  padding-top: 15px;
}
.search-group {
  flex: 1.5 !important;
}

@media (max-width: 768px) {
  .summary-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
