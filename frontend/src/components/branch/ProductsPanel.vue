<template>
  <div class="card products-panel" :class="{ 'mobile-hidden': activeTab !== 'products' }">
    <div class="panel-header">
      <h3>🛍️ منتجات الفرع</h3>
      <div class="panel-filters">
        <input
          ref="searchInputRef"
          :value="productSearch"
          type="text"
          placeholder="بحث عن منتج... (F7)"
          class="search-input"
          @input="onSearch"
        />
        <select :value="selectedCategory" @change="onCategory($event)" class="category-select">
          <option value="">كل التصنيفات</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name_ar }}
          </option>
        </select>
      </div>
    </div>

    <!-- Category Interactive Pills Bar -->
    <div v-if="categories.length" class="category-pills-bar">
      <button
        type="button"
        class="pill-btn"
        :class="{ active: !selectedCategory }"
        @click="selectCategory('')"
      >
        ✨ الكل
      </button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        type="button"
        class="pill-btn"
        :class="{ active: String(selectedCategory) === String(cat.id) }"
        @click="selectCategory(cat.id)"
      >
        {{ cat.name_ar }}
      </button>
    </div>

    <!-- Premium Skeletons for Product Grid Loading -->
    <div v-if="loadingProducts" class="products-grid">
      <div
        v-for="i in 8"
        :key="'sk-prod-' + i"
        class="product-card"
        style="
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          min-height: 84px;
        "
      >
        <SkeletonLoader type="line" height="14px" width="80%" class="mb-2" />
        <SkeletonLoader type="line" height="12px" width="50%" />
      </div>
    </div>
    <div v-else-if="!filteredProducts.length" class="empty-state">
      <span>🔍</span>
      <p>لا توجد منتجات مطابقة</p>
    </div>
    <div v-else class="products-grid">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        class="product-card"
        :class="{
          'no-recipe': !product.has_recipe,
          'low-stock': hasLowIngredients(product) || getProductStockClass(product) === 'low',
          'is-out-of-stock': getProductStockClass(product) === 'out',
          selected: isInCart(product.id),
        }"
        @click="emit('addToCart', product)"
      >
        <!-- 🟢 مؤشر المخزون المضيء -->
        <span
          class="stock-indicator-dot"
          :class="getProductStockClass(product)"
          :title="getProductStockTitle(product)"
        ></span>
        <div class="product-name">{{ product.name_ar }}</div>
        <div class="product-meta">
          <span class="product-price">{{ formatMoney(product.sale_price) }}</span>
          <span class="product-cat">{{ product.category_name || '—' }}</span>
        </div>
        <div class="product-status">
          <span
            v-if="!product.has_recipe"
            class="badge badge-info"
            title="بدون وصفة - سيتم خصم المنتج نفسه من المخزون"
            >خصم مباشر</span
          >
          <span v-else-if="hasLowIngredients(product)" class="badge badge-warning"
            >⚠️ مخزون منخفض</span
          >
          <span v-else class="badge badge-success">✓ متاح</span>
        </div>
        <div v-if="isInCart(product.id)" class="cart-qty-badge">
          {{ getCartQty(product.id) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SkeletonLoader from '@/components/SkeletonLoader.vue';

/**
 * @props filteredProducts — قائمة المنتجات بعد التصفية
 * @props categories — تصنيفات المنتجات لشريط الفلاتر
 * @props loadingProducts — حالة تحميل الشبكة (skeletons)
 * @props productSearch — نص البحث الحالي (v-model)
 * @props selectedCategory — التصنيف المختار (v-model)
 * @props activeTab — التبويب النشط (للإخفاء على الموبايل)
 * @props formatMoney — تنسيق العملة
 * @props hasLowIngredients — فحص مكونات الوصفة المنخفضة
 * @props getProductStockClass — حالة المخزون (good/low/out)
 * @props getProductStockTitle — عنوان مؤشر المخزون
 * @props isInCart — هل المنتج في السلة
 * @props getCartQty — كمية المنتج في السلة
 * @emits addToCart — إضافة منتج للسلة
 * @emits update:productSearch — تحديث نص البحث
 * @emits update:selectedCategory — تحديث التصنيف
 * @emits filter — إعادة تصفية القائمة
 */
defineProps<{
  filteredProducts: any[];
  categories: any[];
  loadingProducts: boolean;
  productSearch: string;
  selectedCategory: any;
  activeTab: string;
  formatMoney: (_v: any) => string;
  hasLowIngredients: (_p: any) => boolean;
  getProductStockClass: (_p: any) => string;
  getProductStockTitle: (_p: any) => string;
  isInCart: (_id: any) => boolean;
  getCartQty: (_id: any) => number;
}>();

const emit = defineEmits<{
  addToCart: [product: any];
  'update:productSearch': [v: string];
  'update:selectedCategory': [v: any];
  filter: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);

const onSearch = (e: Event) => {
  emit('update:productSearch', (e.target as HTMLInputElement).value);
  emit('filter');
};

const onCategory = (e: Event) => {
  emit('update:selectedCategory', (e.target as HTMLSelectElement).value);
  emit('filter');
};

const selectCategory = (id: any) => {
  emit('update:selectedCategory', id);
  emit('filter');
};

/** يُستخدم من الأب لتركيز حقل البحث عبر اختصار F7 */
defineExpose({
  focusSearch: () => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  },
});
</script>

<style lang="scss" scoped>
/* Products Panel */
.products-panel {
  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
    h3 {
      margin: 0;
      color: var(--primary-dark);
    }
    .panel-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  }
  .search-input,
  .category-select {
    flex: 1;
    min-width: 120px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    font-size: 0.9rem;
  }
}

/* Category Pills Bar */
.category-pills-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px 10px 2px;
  margin-bottom: 12px;
  scrollbar-width: thin;

  .pill-btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--bg-card, var(--bg));
    color: var(--text);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    &.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 2px 6px color-mix(in srgb, var(--primary) 30%, transparent);
    }
  }
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: calc(100vh - 250px);
  min-height: 520px;
  overflow-y: auto;
  padding: 6px;
}

.product-card {
  position: relative;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.25s ease,
    border-color 0.25s ease,
    background 0.25s ease;
  background: var(--bg-card);
  text-align: center;
  animation: card-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;

  @for $i from 1 through 24 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 15}ms;
    }
  }

  &:hover {
    border-color: var(--accent);
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(161, 98, 7, 0.1);
  }

  &:active {
    transform: translateY(-1px) scale(0.96);
  }

  &.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  &.no-recipe {
    border-style: dashed;
  }
  &.low-stock {
    border-color: #f59e0b;
  }

  .product-name {
    font-weight: 700;
    font-size: 0.88rem;
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .product-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .product-price {
    font-weight: 700;
    color: var(--primary-dark);
  }
  .product-status {
    margin-top: 4px;
  }

  .cart-qty-badge {
    position: absolute;
    top: -8px;
    left: -8px;
    background: var(--accent);
    color: #fff;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 800;
    box-shadow: var(--shadow-xs);
  }

  /* 🟢 مؤشر المخزون المضيء */
  .stock-indicator-dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;

    &.good {
      color: #10b981;
      background-color: #10b981;
    }
    &.low {
      color: #f97316;
      background-color: #f97316;
    }
    &.out {
      color: #ef4444;
      background-color: #ef4444;
    }
  }

  &.is-out-of-stock {
    opacity: 0.58;
    cursor: not-allowed;
    pointer-events: none;
    border-color: rgba(239, 68, 68, 0.22) !important;
    background: color-mix(in srgb, var(--danger) 2%, var(--bg-card)) !important;

    &:hover {
      transform: none !important;
      box-shadow: none !important;
    }
  }
}

@keyframes card-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
  span {
    font-size: 2.5rem;
    display: inline-block;
    margin-bottom: 8px;
    animation: search-sway 2.2s ease-in-out infinite;
  }
}

@keyframes search-sway {
  0%,
  100% {
    transform: rotate(-6deg) scale(1);
  }
  50% {
    transform: rotate(12deg) scale(1.08);
  }
}

@media (max-width: 900px) {
  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}

@media (max-width: 768px) {
  .products-panel {
    &.mobile-hidden {
      display: none !important;
    }
  }
}
</style>
