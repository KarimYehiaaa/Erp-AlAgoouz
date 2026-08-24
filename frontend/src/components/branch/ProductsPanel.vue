<template>
  <div class="card full-catalog-panel">
    <!-- ═══════════════════ شريط البحث والتصنيفات العلوي ═══════════════════ -->
    <div class="catalog-top-header">
      <div class="search-and-status-row">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            ref="searchInputRef"
            :value="productSearch"
            type="text"
            placeholder="ابحث عن صنف بالاسم أو امسح الباركود مباشرة... (F2 أو F7)"
            class="search-input"
            @input="onSearch"
          />
          <button
            v-if="productSearch"
            type="button"
            class="clear-search-btn"
            @click="
              emit('update:productSearch', '');
              emit('filter');
            "
            title="مسح البحث"
          >
            ✕
          </button>
        </div>

        <!-- ملخص التصنيف المختار -->
        <div class="active-cat-indicator" :title="'التصنيف: ' + currentCategoryName">
          <span class="cat-ind-icon">{{ currentCategoryIcon }}</span>
          <span class="cat-ind-name">{{ currentCategoryName }}</span>
          <span class="cat-ind-count">{{ filteredProducts.length }} صنف متاح</span>
        </div>
      </div>

      <!-- 📂 شريط التصنيفات الأفقي الفاخر (Horizontal Category Pills Bar) -->
      <nav v-if="categories.length" class="horizontal-categories-nav">
        <div class="categories-scroll-track">
          <button
            type="button"
            class="cat-tab-pill"
            :class="{ active: !selectedCategory }"
            @click="selectCategory('')"
          >
            <span class="pill-icon">✨</span>
            <span class="pill-label">كل المنتجات</span>
          </button>

          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="cat-tab-pill"
            :class="{ active: String(selectedCategory) === String(cat.id) }"
            @click="selectCategory(cat.id)"
          >
            <span class="pill-icon">{{ getCategoryIcon(cat.name_ar) }}</span>
            <span class="pill-label">{{ cat.name_ar }}</span>
          </button>
        </div>
      </nav>
    </div>

    <!-- ═══════════════════ شبكة المنتجات العريضة (Full-Width Touch Grid) ═══════════════════ -->
    <div class="catalog-grid-wrapper">
      <!-- هيكل التحميل -->
      <div v-if="loadingProducts" class="products-touch-grid">
        <div v-for="i in 12" :key="'sk-prod-' + i" class="product-touch-card skeleton-card">
          <SkeletonLoader type="line" height="18px" width="75%" class="mb-2" />
          <SkeletonLoader type="line" height="14px" width="45%" class="mb-3" />
          <SkeletonLoader type="line" height="24px" width="90%" />
        </div>
      </div>

      <!-- حالة عدم وجود نتائج -->
      <div v-else-if="!filteredProducts.length" class="empty-catalog-state">
        <span class="empty-icon">🔍</span>
        <h3>لم يتم العثور على منتجات مطابقة</h3>
        <p>تأكد من كتابة الاسم بشكل صحيح أو اختر قسماً آخر.</p>
        <button
          type="button"
          class="btn-reset-filters"
          @click="
            emit('update:productSearch', '');
            selectCategory('');
          "
        >
          عرض جميع الأصناف
        </button>
      </div>

      <!-- شبكة بطاقات المنتجات -->
      <div v-else class="products-touch-grid">
        <article
          v-for="product in filteredProducts"
          :key="product.id"
          class="product-touch-card"
          :class="{
            'is-selected': isInCart(product.id),
            'no-recipe': !product.has_recipe,
            'low-stock': hasLowIngredients(product) || getProductStockClass(product) === 'low',
            'is-out-of-stock': getProductStockClass(product) === 'out',
          }"
          @click="handleCardClick(product)"
        >
          <!-- رأس البطاقة ومؤشر المخزون -->
          <div class="card-header-line">
            <span
              class="stock-pulse-dot"
              :class="getProductStockClass(product)"
              :title="getProductStockTitle(product)"
            ></span>
            <span class="category-tag-small">{{ product.category_name || 'عام' }}</span>
            <div v-if="isInCart(product.id)" class="cart-current-badge">
              <span class="cart-qty-num">{{ getCartQty(product.id) }}</span>
              <span class="cart-qty-lbl">في السلة</span>
            </div>
          </div>

          <!-- اسم وسعر المنتج -->
          <div class="product-info-block">
            <h4 class="product-title" :title="product.name_ar">{{ product.name_ar }}</h4>
            <div class="price-row">
              <span class="price-number">{{ formatMoney(product.sale_price) }}</span>
              <span v-if="product.unit" class="unit-badge">/ {{ product.unit }}</span>
            </div>
          </div>

          <!-- 🫘 أزرار أوزان سريعة للبن والحبوب (Direct Quick Weights) -->
          <div v-if="isWeightProduct(product)" class="quick-weights-strip" @click.stop>
            <button
              type="button"
              class="weight-btn"
              @click="addWithWeight(product, 0.125, 'ثمن')"
              title="إضافة ثمن كجم (125g)"
            >
              ⅛ ثمن
            </button>
            <button
              type="button"
              class="weight-btn"
              @click="addWithWeight(product, 0.25, 'ربع')"
              title="إضافة ربع كجم (250g)"
            >
              ¼ ربع
            </button>
            <button
              type="button"
              class="weight-btn"
              @click="addWithWeight(product, 0.5, 'نصف')"
              title="إضافة نصف كجم (500g)"
            >
              ½ نصف
            </button>
            <button
              type="button"
              class="weight-btn kilo"
              @click="addWithWeight(product, 1.0, 'كيلو')"
              title="إضافة كيلو كامل (1000g)"
            >
              1k كيلو
            </button>
          </div>

          <!-- شريط الحالة للمنتجات العادية -->
          <div v-else class="card-footer-strip">
            <span v-if="hasLowIngredients(product)" class="status-chip warning">⚠️ منخفض</span>
            <span v-else-if="getProductStockClass(product) === 'out'" class="status-chip danger"
              >نفذ</span
            >
            <span v-else class="status-chip success">✓ متاح</span>
            <span class="click-to-add-hint">اضغط للإضافة +</span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SkeletonLoader from '@/components/SkeletonLoader.vue';

const props = defineProps<{
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
  addToCart: [product: any, customQty?: number, customUnit?: string];
  'update:productSearch': [v: string];
  'update:selectedCategory': [v: any];
  filter: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);

const getCategoryIcon = (name: string) => {
  if (!name) return '✨';
  const n = name.toLowerCase();
  if (n.includes('ساخن') || n.includes('قهو') || n.includes('اسبريسو')) return '☕';
  if (n.includes('بارد') || n.includes('مثلج') || n.includes('ايس')) return '🧊';
  if (
    n.includes('بن') ||
    n.includes('حبوب') ||
    n.includes('طحن') ||
    n.includes('تركي') ||
    n.includes('توليف')
  )
    return '🫘';
  if (n.includes('حلوي') || n.includes('كيك') || n.includes('شوكولات') || n.includes('وافل'))
    return '🍰';
  if (n.includes('عصير') || n.includes('سموذي') || n.includes('موهيتو')) return '🥤';
  if (n.includes('شاي') || n.includes('أعشاب') || n.includes('كركديه')) return '🫖';
  if (n.includes('ساندوتش') || n.includes('اكل') || n.includes('وجب') || n.includes('كرواسون'))
    return '🥪';
  if (n.includes('صوص') || n.includes('نكه') || n.includes('سيرب') || n.includes('إضاف'))
    return '🍯';
  return '📁';
};

const currentCategoryName = computed(() => {
  if (!props.selectedCategory) return 'كل المنتجات';
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? cat.name_ar : 'كل المنتجات';
});

const currentCategoryIcon = computed(() => {
  if (!props.selectedCategory) return '✨';
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? getCategoryIcon(cat.name_ar) : '✨';
});

const isWeightProduct = (product: any) => {
  const cat = (product.category_name || '').toLowerCase();
  const name = (product.name_ar || '').toLowerCase();
  const unit = (product.unit || '').toLowerCase();
  return (
    unit.includes('كجم') ||
    unit.includes('كيلو') ||
    unit.includes('جرام') ||
    cat.includes('بن') ||
    cat.includes('حبوب') ||
    cat.includes('توليف') ||
    name.includes('بن') ||
    name.includes('توليفة')
  );
};

const onSearch = (e: Event) => {
  emit('update:productSearch', (e.target as HTMLInputElement).value);
  emit('filter');
};

const selectCategory = (id: any) => {
  emit('update:selectedCategory', id);
  emit('filter');
};

const handleCardClick = (product: any) => {
  emit('addToCart', product);
};

const addWithWeight = (product: any, weightFraction: number, _label: string) => {
  emit('addToCart', product, weightFraction);
};

/** يُستخدم من الأب لتركيز حقل البحث عبر اختصار F2 أو F7 */
defineExpose({
  focusSearch: () => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  },
});
</script>

<style lang="scss" scoped>
/* ═══════════════════════════════════════════════════════════════════
   FULL CATALOG PANEL (100% SCREEN REAL ESTATE REDESIGN)
   ═══════════════════════════════════════════════════════════════════ */

.full-catalog-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 16px;
  min-height: calc(100vh - 180px);
}

/* ── Top Header Bar ── */
.catalog-top-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  padding-bottom: 12px;
}

.search-and-status-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 280px;

  .search-icon {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1rem;
    color: var(--primary, #d4a373);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 12px 42px 12px 36px;
    border: 1.5px solid var(--border, rgba(212, 163, 115, 0.3));
    border-radius: 14px;
    background: var(--bg, #140d08);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text, #f7ede2);
    transition: all 0.2s ease;

    &:focus {
      border-color: var(--primary, #d4a373);
      box-shadow: 0 0 0 3px rgba(212, 163, 115, 0.2);
      outline: none;
    }
  }

  .clear-search-btn {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: var(--text-muted, #a89f91);
    cursor: pointer;
    font-size: 0.85rem;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }
  }
}

.active-cat-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(212, 163, 115, 0.12);
  border: 1px solid rgba(212, 163, 115, 0.3);
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 0.85rem;
  white-space: nowrap;

  .cat-ind-icon {
    font-size: 1.1rem;
  }
  .cat-ind-name {
    color: var(--primary, #d4a373);
    font-weight: 800;
  }
  .cat-ind-count {
    color: var(--text-muted, #a89f91);
    font-size: 0.8rem;
  }
}

/* ── Horizontal Category Navigation ── */
.horizontal-categories-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.categories-scroll-track {
  display: flex;
  gap: 8px;
  padding: 4px 2px;
}

.cat-tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 24px;
  color: var(--text-muted, #d4a373);
  font-size: 0.88rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  .pill-icon {
    font-size: 1rem;
  }

  &:hover {
    background: rgba(212, 163, 115, 0.15);
    border-color: rgba(212, 163, 115, 0.4);
    transform: translateY(-1px);
  }

  &.active {
    background: linear-gradient(135deg, #d4a373 0%, #b07d4b 100%);
    color: #140d08;
    border-color: #faedcd;
    box-shadow: 0 4px 14px rgba(212, 163, 115, 0.35);
    font-weight: 800;
  }
}

/* ── Product Touch Grid ── */
.catalog-grid-wrapper {
  flex: 1;
  overflow-y: auto;
}

.products-touch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
  gap: 12px;
}

@media (min-width: 1200px) {
  .products-touch-grid {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 14px;
  }
}

.product-touch-card {
  background: linear-gradient(145deg, rgba(35, 20, 12, 0.85) 0%, rgba(25, 15, 9, 0.95) 100%);
  border: 1.5px solid rgba(212, 163, 115, 0.22);
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 120px;
  cursor: pointer;
  user-select: none;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(212, 163, 115, 0.55);
    box-shadow:
      0 8px 20px rgba(0, 0, 0, 0.5),
      0 0 12px rgba(212, 163, 115, 0.15);
  }

  &.is-selected {
    border-color: #d4a373;
    background: linear-gradient(145deg, rgba(55, 32, 18, 0.95) 0%, rgba(35, 20, 12, 0.95) 100%);
    box-shadow: 0 0 16px rgba(212, 163, 115, 0.25);
  }

  &.is-out-of-stock {
    opacity: 0.6;
    filter: grayscale(0.4);
  }
}

.card-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.stock-pulse-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;

  &.low {
    background: #f59e0b;
    box-shadow: 0 0 6px #f59e0b;
  }
  &.out {
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
  }
}

.category-tag-small {
  font-size: 0.68rem;
  color: var(--text-muted, #a89f91);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 6px;
}

.cart-current-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  background: #d4a373;
  color: #140d08;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 800;

  .cart-qty-num {
    font-size: 0.78rem;
  }
}

.product-info-block {
  margin-bottom: 8px;
}

.product-title {
  margin: 0 0 4px;
  font-size: 0.96rem;
  font-weight: 800;
  color: #faedcd;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 4px;

  .price-number {
    font-size: 1.15rem;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: 0.3px;
  }

  .unit-badge {
    font-size: 0.72rem;
    color: #d4a373;
  }
}

/* ── Quick Weights Strip ── */
.quick-weights-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(212, 163, 115, 0.2);
}

.weight-btn {
  padding: 4px 2px;
  background: rgba(212, 163, 115, 0.12);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 6px;
  color: #faedcd;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;

  &:hover {
    background: #d4a373;
    color: #140d08;
    border-color: #faedcd;
  }

  &.kilo {
    background: rgba(212, 163, 115, 0.25);
    font-weight: 800;
  }
}

.card-footer-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);

  .status-chip {
    font-size: 0.68rem;
    padding: 1px 6px;
    border-radius: 6px;

    &.success {
      color: #86efac;
    }
    &.warning {
      color: #fde047;
    }
    &.danger {
      color: #fca5a5;
    }
  }

  .click-to-add-hint {
    font-size: 0.68rem;
    color: rgba(212, 163, 115, 0.6);
  }
}

.empty-catalog-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted, #d4a373);

  .empty-icon {
    font-size: 3rem;
    display: block;
    margin-bottom: 12px;
  }

  h3 {
    color: #faedcd;
    margin: 0 0 6px;
  }

  p {
    font-size: 0.88rem;
    margin: 0 0 16px;
  }

  .btn-reset-filters {
    padding: 8px 18px;
    background: #d4a373;
    color: #140d08;
    border: none;
    border-radius: 10px;
    font-weight: 700;
    cursor: pointer;
  }
}
</style>
