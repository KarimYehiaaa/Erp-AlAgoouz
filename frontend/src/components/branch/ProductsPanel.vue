<template>
  <div class="card products-panel" :class="{ 'mobile-hidden': activeTab !== 'products' }">
    <!-- Top Filter Header -->
    <div class="pos-top-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          ref="searchInputRef"
          :value="productSearch"
          type="text"
          placeholder="ابحث عن صنف بالاسم أو الباركود... (F7)"
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

      <!-- Current Category Status Badge -->
      <div class="active-cat-badge" :title="'التصنيف المختار: ' + currentCategoryName">
        <span class="cat-badge-icon">{{ currentCategoryIcon }}</span>
        <span class="cat-badge-name">{{ currentCategoryName }}</span>
        <span class="cat-badge-count">({{ filteredProducts.length }})</span>
      </div>
    </div>

    <!-- Products & Side Categories Layout Body -->
    <div class="products-layout-body">
      <!-- 📂 Expandable Side Categories Drawer (Opens on Hover or Tap) -->
      <aside
        v-if="categories.length"
        class="category-side-drawer"
        :class="{ 'is-expanded': isDrawerOpen }"
        @mouseenter="isDrawerOpen = true"
        @mouseleave="isDrawerOpen = false"
      >
        <div
          class="drawer-header"
          @click="isDrawerOpen = !isDrawerOpen"
          title="مرر الماوس لتوسيع قائمة التصنيفات"
        >
          <span class="drawer-icon">📂</span>
          <span class="drawer-title">التصنيفات</span>
          <span class="drawer-arrow">{{ isDrawerOpen ? '◀' : '▶' }}</span>
        </div>

        <div class="drawer-categories-list">
          <button
            type="button"
            class="side-cat-btn"
            :class="{ active: !selectedCategory }"
            @click="selectCategory('')"
            title="✨ كل الأصناف"
          >
            <span class="cat-btn-icon">✨</span>
            <span class="cat-btn-label">كل المنتجات</span>
          </button>

          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="side-cat-btn"
            :class="{ active: String(selectedCategory) === String(cat.id) }"
            @click="selectCategory(cat.id)"
            :title="cat.name_ar"
          >
            <span class="cat-btn-icon">{{ getCategoryIcon(cat.name_ar) }}</span>
            <span class="cat-btn-label">{{ cat.name_ar }}</span>
          </button>
        </div>
      </aside>

      <!-- Main Products Grid Area -->
      <div class="products-content-area">
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
          <p>لا توجد منتجات مطابقة لهذا التصنيف أو البحث</p>
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
  addToCart: [product: any];
  'update:productSearch': [v: string];
  'update:selectedCategory': [v: any];
  filter: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);
const isDrawerOpen = ref(false);

const getCategoryIcon = (name: string) => {
  if (!name) return '✨';
  const n = name.toLowerCase();
  if (n.includes('ساخن') || n.includes('قهو') || n.includes('اسبريسو')) return '☕';
  if (n.includes('بارد') || n.includes('مثلج') || n.includes('ايس')) return '🧊';
  if (n.includes('بن') || n.includes('حبوب') || n.includes('طحن') || n.includes('تركي'))
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

const onSearch = (e: Event) => {
  emit('update:productSearch', (e.target as HTMLInputElement).value);
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
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Top Bar ── */
.pos-top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;

    .search-icon {
      position: absolute;
      right: 12px;
      font-size: 0.95rem;
      color: var(--text-muted);
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      padding: 9px 36px 9px 32px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg);
      font-size: 0.9rem;
      color: var(--text);
      transition: all 0.2s ease;

      &:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
        outline: none;
      }
    }

    .clear-search-btn {
      position: absolute;
      left: 10px;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.85rem;
      padding: 4px;
      border-radius: 50%;

      &:hover {
        color: var(--text);
      }
    }
  }

  .active-cat-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.2);
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.82rem;
    white-space: nowrap;

    .cat-badge-icon {
      font-size: 0.9rem;
    }
    .cat-badge-name {
      color: var(--primary, #10b981);
      font-weight: 800;
    }
    .cat-badge-count {
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 600;
    }
  }
}

/* ── Body Layout with Side Categories ── */
.products-layout-body {
  display: flex;
  align-items: stretch;
  gap: 12px;
  position: relative;
  min-height: 520px;
}

/* ── 📂 Side Categories Rail / Drawer ── */
.category-side-drawer {
  width: 50px;
  min-width: 50px;
  background: var(--bg, #171723);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    width 0.28s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.28s ease;
  position: relative;
  z-index: 20;
  max-height: calc(100vh - 220px);
  overflow: hidden;

  /* Expanding on Hover or Class */
  &:hover,
  &.is-expanded {
    width: 190px;
    min-width: 190px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    background: var(--bg-card, #1e1e2d);
    border-color: var(--primary, #10b981);

    .drawer-header {
      .drawer-title {
        opacity: 1;
        width: auto;
        display: inline-block;
      }
      .drawer-arrow {
        transform: rotate(180deg);
      }
    }

    .side-cat-btn {
      justify-content: flex-start;
      padding: 8px 12px;

      .cat-btn-label {
        opacity: 1;
        width: auto;
        display: inline-block;
      }
    }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    user-select: none;
    color: var(--text-muted);

    .drawer-icon {
      font-size: 1.1rem;
      min-width: 24px;
      text-align: center;
    }

    .drawer-title {
      font-size: 0.82rem;
      font-weight: 800;
      color: var(--text-strong, #ffffff);
      opacity: 0;
      width: 0;
      display: none;
      transition: opacity 0.2s ease;
      white-space: nowrap;
    }

    .drawer-arrow {
      margin-right: auto;
      font-size: 0.7rem;
      transition: transform 0.2s ease;
    }
  }

  .drawer-categories-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 2px;
  }

  .side-cat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 8px 6px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text, #e2e8f0);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    min-height: 38px;

    .cat-btn-icon {
      font-size: 1.1rem;
      min-width: 24px;
      text-align: center;
    }

    .cat-btn-label {
      font-size: 0.84rem;
      font-weight: 700;
      opacity: 0;
      width: 0;
      display: none;
      transition: opacity 0.2s ease;
    }

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--primary, #10b981);
      border-color: rgba(255, 255, 255, 0.1);
    }

    &.active {
      background: var(--primary, #10b981);
      color: #ffffff;
      font-weight: 800;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);

      .cat-btn-label {
        color: #ffffff;
      }
    }
  }
}

/* ── Main Products Content Area ── */
.products-content-area {
  flex: 1;
  min-width: 0;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
  gap: 10px;
  max-height: calc(100vh - 240px);
  min-height: 500px;
  overflow-y: auto;
  padding: 4px;
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
      color: #f59e0b;
      background-color: #f59e0b;
    }
    &.out {
      color: #ef4444;
      background-color: #ef4444;
    }
  }
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);

  span {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 8px;
  }
}

@keyframes card-fade-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 768px) {
  .pos-top-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .category-side-drawer {
    display: none;
  }
}
</style>
