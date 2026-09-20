<template>
  <div class="pos-catalog-master card">
    <!-- ═══════════════════ TOP POS CONTROL BAR ═══════════════════ -->
    <div class="pos-top-control-bar">
      <!-- Search Input Box -->
      <div class="pos-search-wrapper">
        <span class="search-icon-slot">
          <AppIcon name="search" :size="18" />
        </span>
        <input
          ref="searchInputRef"
          :value="productSearch"
          type="text"
          placeholder="ابحث عن صنف، مشروب، أو امسح الباركود... (F2 أو F7)"
          class="pos-search-input"
          @input="onSearchInput"
          @keydown.esc="clearSearchOrReset"
        />
        <button
          v-if="productSearch"
          type="button"
          class="pos-search-clear-btn"
          @click="clearSearchOrReset"
          title="مسح البحث (Esc)"
          aria-label="مسح البحث"
        >
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <!-- Navigation & Mode Indicator -->
      <div class="pos-mode-indicator">
        <button
          v-if="selectedCategory || productSearch"
          type="button"
          class="btn-back-to-categories"
          @click="backToCategories"
          title="العودة لجميع الأقسام (Esc)"
        >
          <AppIcon name="arrowRight" :size="16" />
          <span>جميع الأقسام</span>
        </button>

        <div
          v-if="selectedCategory && !productSearch"
          class="current-cat-chip"
          :class="currentCategoryVisual.cardClass"
        >
          <span class="chip-icon">
            <AppIcon :name="currentCategoryVisual.icon" :size="16" />
          </span>
          <span class="chip-title">{{ currentCategoryName }}</span>
          <span class="chip-count">{{ filteredProducts.length }} صنف</span>
        </div>

        <div v-else-if="productSearch" class="search-results-chip">
          <AppIcon name="search" :size="14" />
          <span>نتائج البحث: <strong>{{ filteredProducts.length }} صنف</strong></span>
        </div>

        <div v-else class="catalog-summary-chip">
          <AppIcon name="layers" :size="14" />
          <span>{{ categories.length }} أقسام متاحة</span>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ SECONDARY QUICK-SWITCH CATEGORY STRIP ═══════════════════ -->
    <!-- Visible when in products mode for rapid 1-tap switching without leaving -->
    <div v-if="categories.length > 1" class="pos-categories-quick-strip">
      <button
        type="button"
        class="quick-cat-pill"
        :class="{ active: !selectedCategory && !productSearch }"
        @click="backToCategories"
      >
        <AppIcon name="layers" :size="14" />
        <span>الكل</span>
      </button>

      <button
        v-for="cat in categories"
        :key="'quick-cat-' + cat.id"
        type="button"
        class="quick-cat-pill"
        :class="[getCategoryVisual(cat.name_ar).cardClass, { active: String(selectedCategory) === String(cat.id) }]"
        @click="selectCategory(cat.id)"
      >
        <AppIcon :name="getCategoryVisual(cat.name_ar).icon" :size="14" />
        <span>{{ cat.name_ar }}</span>
      </button>
    </div>

    <!-- ═══════════════════ MAIN DYNAMIC STAGE ═══════════════════ -->
    <div class="pos-stage-container">
      <Transition name="pos-view-transition" mode="out-in">
        <!-- ═══════════════════════════════════════════════════════════════ -->
        <!-- VIEW 1: CATEGORIES MATRIX (CATEGORIES-FIRST VIEW)               -->
        <!-- ═══════════════════════════════════════════════════════════════ -->
        <div v-if="isCategoryView" key="categories-view" class="pos-categories-matrix-view">
          <div class="categories-header-headline">
            <div class="headline-title-wrap">
              <span class="headline-sparkle"><AppIcon name="sparkles" :size="18" /></span>
              <h3>الأقسام الرئيسية لنقاط البيع</h3>
            </div>
            <p class="headline-subtitle">اضغط على أي قسم لعرض أصنافه وتخصيصها بالكامل</p>
          </div>

          <!-- Massive Touch-First Category Cards Grid -->
          <div class="pos-categories-grid">
            <div
              v-for="cat in categories"
              :key="'cat-card-' + cat.id"
              class="pos-category-card"
              :class="getCategoryVisual(cat.name_ar).cardClass"
              @click="selectCategory(cat.id)"
              role="button"
              tabindex="0"
              @keydown.enter="selectCategory(cat.id)"
            >
              <!-- Background Ambient Glow -->
              <div class="cat-card-glow"></div>

              <!-- 3D Rendered Category Visual Box -->
              <div class="cat-card-visual-box" :class="getCategoryVisual(cat.name_ar).iconBgClass">
                <img
                  :src="getCategoryVisual(cat.name_ar).image"
                  :alt="cat.name_ar"
                  class="cat-3d-asset"
                  loading="lazy"
                />
                <span class="cat-floating-icon">
                  <AppIcon :name="getCategoryVisual(cat.name_ar).icon" :size="20" />
                </span>
              </div>

              <!-- Category Details & Count Badge -->
              <div class="cat-card-body">
                <h4 class="cat-card-name">{{ cat.name_ar }}</h4>
                <div class="cat-card-footer">
                  <span class="cat-count-badge">
                    <AppIcon name="layers" :size="12" />
                    <span>{{ getCategoryProductCount(cat.id) }} صنف</span>
                  </span>
                  <span class="cat-enter-arrow">
                    <AppIcon name="arrowLeft" :size="14" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════════════ -->
        <!-- VIEW 2: FOCUSED PRODUCTS CATALOG (PRODUCTS VIEW)                -->
        <!-- ═══════════════════════════════════════════════════════════════ -->
        <div v-else key="products-view" class="pos-products-catalog-view">
          <!-- Loading Skeletons -->
          <div v-if="loadingProducts" class="pos-products-grid">
            <div v-for="i in 12" :key="'sk-prod-' + i" class="pos-product-card skeleton-card">
              <div class="card-image-box skeleton-box"></div>
              <SkeletonLoader type="line" height="16px" width="80%" />
              <SkeletonLoader type="line" height="14px" width="50%" />
            </div>
          </div>

          <!-- Empty State -->
          <div v-else-if="!filteredProducts.length" class="pos-empty-state">
            <div class="empty-icon-circle">
              <AppIcon name="search" :size="36" />
            </div>
            <h3>لم نتمكن من العثور على أصناف</h3>
            <p>لا توجد منتجات مطابقة لهذا القسم أو مصطلح البحث المدخل.</p>
            <button type="button" class="btn btn-primary" @click="backToCategories">
              <AppIcon name="arrowRight" :size="16" />
              <span>العودة لجميع الأقسام</span>
            </button>
          </div>

          <!-- Enlarged, Touch-Friendly Products Grid -->
          <div v-else class="pos-products-grid">
            <div
              v-for="product in filteredProducts"
              :key="product.id"
              class="pos-product-card"
              :class="[
                getProductVisual(product).cardClass,
                {
                  'is-in-cart': isInCart(product.id),
                  'is-low-stock': hasLowIngredients(product) || getProductStockClass(product) === 'low',
                  'is-out-of-stock': getProductStockClass(product) === 'out',
                },
              ]"
              @pointerdown="startLongPress(product)"
              @pointerup="cancelLongPress"
              @pointercancel="cancelLongPress"
              @pointerleave="cancelLongPress"
              @pointermove="cancelLongPress"
              @contextmenu.prevent
              @click="handleCardClick(product)"
              @keydown.enter="handleCardClick(product)"
              @keydown.space.prevent="handleCardClick(product)"
              role="button"
              tabindex="0"
              :title="
                product.name_ar +
                ' (اضغط مطولاً أو اضغط على أيقونة التفاصيل للتخصيص)'
              "
            >
              <!-- Stock Status Dot -->
              <span
                class="card-stock-dot"
                :class="getProductStockClass(product)"
                :title="getProductStockTitle(product)"
              ></span>

              <!-- Product Details / Customizer Action Button -->
              <button
                type="button"
                class="card-customizer-btn"
                @click.stop="openCustomizer(product)"
                title="تفاصيل وإضافات المنتج"
                aria-label="تفاصيل وإضافات المنتج"
              >
                <AppIcon name="sliders" :size="14" />
              </button>

              <!-- In-Cart Quantity Counter Badge -->
              <span v-if="isInCart(product.id)" class="card-qty-badge">
                {{ getCartQty(product.id) }}
              </span>

              <!-- 3D Rendered Product Image -->
              <div class="card-image-box" :class="getProductVisual(product).iconBgClass">
                <img
                  :src="getProductVisual(product).threeDImage"
                  :alt="product.name_ar"
                  class="card-3d-img"
                  loading="lazy"
                />
              </div>

              <!-- Product Feature Visual Badge -->
              <span
                v-if="getProductVisual(product).badge"
                class="card-visual-badge"
                :class="getProductVisual(product).badgeClass"
              >
                {{ getProductVisual(product).badge }}
              </span>

              <!-- Product Title & Price Info -->
              <div class="card-info">
                <span class="card-title">{{ product.name_ar }}</span>
                <span class="card-price">{{ formatMoney(product.sale_price) }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- ═══════════════════ PRODUCT DETAILS / CUSTOMIZER MODAL ═══════════════════ -->
    <div
      v-if="showCustomizerModal && activeCustomProduct"
      class="customizer-modal-backdrop"
      @click.self="closeCustomizer"
    >
      <div class="card customizer-modal-card">
        <!-- Header -->
        <div class="customizer-header">
          <div class="header-title-wrap">
            <span class="modal-coffee-icon"><AppIcon name="sliders" :size="20" /></span>
            <div>
              <h3>تفاصيل وإضافة الصنف</h3>
              <p class="custom-prod-title">{{ activeCustomProduct.name_ar }}</p>
            </div>
          </div>
          <button
            type="button"
            class="close-custom-btn"
            @click="closeCustomizer"
            aria-label="إغلاق"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="customizer-body">
          <div class="product-detail-layout">
            <div class="product-detail-preview">
              <div class="detail-product-image" :class="activeProductVisual.iconBgClass">
                <img :src="activeProductVisual.threeDImage" :alt="activeCustomProduct.name_ar" />
              </div>
              <span class="detail-data-label">بيانات الصنف</span>
            </div>

            <div class="product-detail-info">
              <span class="detail-kicker">إضافة سريعة للسلة</span>
              <h4>{{ activeCustomProduct.name_ar }}</h4>
              <div class="detail-facts">
                <span v-if="activeProductCategory"><AppIcon name="layers" :size="14" /> {{ activeProductCategory }}</span>
                <span><AppIcon name="tag" :size="14" /> {{ formatMoney(activeCustomProduct.sale_price) }}</span>
                <span><AppIcon name="products" :size="14" /> {{ activeProductUnit }}</span>
              </div>
              <span class="detail-stock-status" :class="activeStockClass">
                {{ activeStockLabel }}
              </span>
            </div>
          </div>

          <div class="custom-section detail-quantity-section">
            <label class="custom-sec-title">الكمية المطلوبة</label>
            <div class="detail-quantity-control">
              <button type="button" class="detail-quantity-btn" @click="customQuantity = Math.max(1, customQuantity - 1)">−</button>
              <strong>{{ customQuantity }}</strong>
              <button type="button" class="detail-quantity-btn" @click="customQuantity += 1">+</button>
            </div>
          </div>

          <div class="custom-section">
            <label class="custom-sec-title" for="pos-product-note">ملاحظة اختيارية للطلب</label>
            <textarea id="pos-product-note" v-model="customNotes" class="custom-notes-input" rows="2" placeholder="مثال: بدون سكر أو تجهيز خاص..."></textarea>
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="customizer-footer">
          <button type="button" class="btn btn-outline" @click="closeCustomizer">
            إلغاء (Esc)
          </button>
          <button
            type="button"
            class="btn btn-primary add-custom-btn"
            @click="confirmCustomization"
          >
            إضافة للسلة
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import SkeletonLoader from '@/components/SkeletonLoader.vue';
import { getProductVisual, getCategoryVisual } from '@/composables/useProductVisuals';

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
  addToCart: [product: any, customQty?: number, customNotes?: string];
  'update:productSearch': [v: string];
  'update:selectedCategory': [v: any];
  filter: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);

// ═══════════════════ CATEGORIES-FIRST VIEW COMPUTATION ═══════════════════
const isCategoryView = computed(() => {
  // If user is searching anything, immediately switch to products catalog
  if (props.productSearch && props.productSearch.trim().length > 0) {
    return false;
  }
  // Otherwise, show categories when no specific category is selected
  return !props.selectedCategory;
});

const currentCategoryName = computed(() => {
  if (!props.selectedCategory) return 'جميع الأصناف';
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? cat.name_ar : 'القسم المحدد';
});

const currentCategoryVisual = computed(() => {
  if (!props.selectedCategory) return getCategoryVisual('');
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? getCategoryVisual(cat.name_ar) : getCategoryVisual('');
});

const getCategoryProductCount = (catId: any) => {
  const cat = props.categories.find((c: any) => String(c.id) === String(catId));
  if (cat && cat.products_count !== undefined && cat.products_count !== null) {
    return cat.products_count;
  }
  // Fallback calculate if products are loaded
  if (props.filteredProducts && props.filteredProducts.length) {
    const count = props.filteredProducts.filter(
      (p: any) => String(p.category_id) === String(catId) || String(p.category) === String(catId)
    ).length;
    if (count > 0) return count;
  }
  return 0;
};

// ═══════════════════ NAVIGATION ACTIONS ═══════════════════
const selectCategory = (id: any) => {
  emit('update:selectedCategory', id);
  emit('filter');
};

const backToCategories = () => {
  emit('update:selectedCategory', '');
  emit('update:productSearch', '');
  emit('filter');
};

const onSearchInput = (e: Event) => {
  const v = (e.target as HTMLInputElement).value;
  emit('update:productSearch', v);
  emit('filter');
};

const clearSearchOrReset = () => {
  if (props.productSearch) {
    emit('update:productSearch', '');
    emit('filter');
  } else {
    backToCategories();
  }
};

const handleCardClick = (product: any) => {
  if (isLongPressTriggered) {
    isLongPressTriggered = false;
    return;
  }
  emit('addToCart', product);
};

// ═══════════════════ COFFEE CUSTOMIZER LOGIC ═══════════════════
const showCustomizerModal = ref(false);
const activeCustomProduct = ref<any>(null);

const customQuantity = ref(1);
const customNotes = ref('');

const activeProductVisual = computed(() =>
  activeCustomProduct.value ? getProductVisual(activeCustomProduct.value) : getProductVisual({})
);

const activeProductCategory = computed(() =>
  activeCustomProduct.value?.category_name || activeCustomProduct.value?.category || ''
);

const activeProductUnit = computed(() =>
  activeCustomProduct.value?.unit || activeCustomProduct.value?.unit_name || 'وحدة'
);

const activeStockClass = computed(() =>
  activeCustomProduct.value ? props.getProductStockClass(activeCustomProduct.value) : ''
);

const activeStockLabel = computed(() => {
  if (!activeCustomProduct.value) return '';
  const stockClass = activeStockClass.value;
  if (stockClass === 'out') return 'غير متوفر حاليًا';
  if (stockClass === 'low') return 'المخزون منخفض';
  return 'متوفر للبيع';
});

const openCustomizer = (product: any) => {
  activeCustomProduct.value = product;
  customQuantity.value = 1;
  customNotes.value = '';
  showCustomizerModal.value = true;
};

const closeCustomizer = () => {
  showCustomizerModal.value = false;
  activeCustomProduct.value = null;
};

const confirmCustomization = () => {
  if (activeCustomProduct.value) {
    emit(
      'addToCart',
      activeCustomProduct.value,
      customQuantity.value,
      customNotes.value.trim() || undefined
    );
  }
  closeCustomizer();
};

// Long Press Detection for Customizer
let longPressTimer: any = null;
let isLongPressTriggered = false;

const startLongPress = (product: any) => {
  isLongPressTriggered = false;
  longPressTimer = setTimeout(() => {
    isLongPressTriggered = true;
    openCustomizer(product);
  }, 480);
};

const cancelLongPress = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
};

defineExpose({
  focusSearch: () => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  },
});
</script>

<style lang="scss" scoped>
/* ═══════════════════ MAIN POS CATALOG WRAPPER ═══════════════════ */
.pos-catalog-master {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 580px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}

/* ═══════════════════ TOP CONTROL BAR ═══════════════════ */
.pos-top-control-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-soft);
}

.pos-search-wrapper {
  position: relative;
  flex: 1;
  min-width: 260px;
  display: flex;
  align-items: center;

  .search-icon-slot {
    position: absolute;
    right: 14px;
    color: var(--text-muted);
    pointer-events: none;
    display: flex;
    align-items: center;
  }

  .pos-search-input {
    width: 100%;
    height: 46px;
    padding: 0 42px 0 38px;
    background: var(--bg-soft);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text-strong);
    font-size: 0.95rem;
    font-weight: 600;
    transition: all var(--transition);

    &:focus {
      border-color: var(--primary);
      background: var(--bg-elevated);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
      outline: none;
    }

    &::placeholder {
      color: var(--text-muted);
      font-weight: 500;
    }
  }

  .pos-search-clear-btn {
    position: absolute;
    left: 12px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition);

    &:hover {
      background: var(--danger-soft);
      color: var(--danger);
    }
  }
}

.pos-mode-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.btn-back-to-categories {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 18px;
  background: var(--primary-soft);
  color: var(--primary);
  border: 1.5px solid var(--primary);
  border-radius: var(--radius-md);
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: var(--primary);
    color: #ffffff;
    transform: translateX(4px);
    box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 30%, transparent);
  }

  &:active {
    transform: scale(0.96);
  }
}

.current-cat-chip,
.search-results-chip,
.catalog-summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 16px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-strong);
  font-size: 0.9rem;
  font-weight: 750;

  .chip-icon {
    display: flex;
    align-items: center;
    color: var(--primary);
  }

  .chip-count {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
}

/* ═══════════════════ SECONDARY QUICK-SWITCH CATEGORY STRIP ═══════════════════ */
.pos-categories-quick-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;

  .quick-cat-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;

    .pill-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--primary);
    }

    &:hover {
      background: var(--bg-elevated);
      border-color: var(--primary);
      color: var(--primary);
    }

    &.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 25%, transparent);

      .pill-dot {
        background: #ffffff;
      }
    }
  }
}

/* ═══════════════════ MAIN STAGE & TRANSITIONS ═══════════════════ */
.pos-stage-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
}

.pos-view-transition-enter-active,
.pos-view-transition-leave-active {
  transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.pos-view-transition-enter-from {
  opacity: 0;
  transform: scale(0.985) translateY(6px);
}

.pos-view-transition-leave-to {
  opacity: 0;
  transform: scale(1.015) translateY(-6px);
}

/* ═══════════════════ VIEW 1: CATEGORIES MATRIX ═══════════════════ */
.pos-categories-matrix-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-2) 0;
}

.categories-header-headline {
  text-align: right;
  padding: 4px 0 10px;

  .headline-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;

    .headline-sparkle {
      color: var(--primary);
      display: flex;
    }

    h3 {
      font-size: 1.35rem;
      font-weight: 850;
      color: var(--text-strong);
      margin: 0;
    }
  }

  .headline-subtitle {
    font-size: 0.88rem;
    color: var(--text-muted);
    margin: 4px 0 0;
    font-weight: 500;
  }
}

.pos-categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
  width: 100%;
}

.pos-category-card {
  position: relative;
  background: var(--bg-elevated);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: var(--shadow-sm);

  .cat-card-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 0%, var(--theme-glow, rgba(138, 87, 42, 0.08)) 0%, transparent 70%);
    opacity: 0.6;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .cat-card-visual-box {
    position: relative;
    width: 100%;
    height: 110px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-soft);
    border: 1px solid var(--border-soft);
    overflow: hidden;

    .cat-3d-asset {
      max-width: 90px;
      max-height: 90px;
      object-fit: contain;
      filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.18));
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .cat-floating-icon {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
  }

  .cat-card-body {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .cat-card-name {
      font-size: 1.15rem;
      font-weight: 850;
      color: var(--text-strong);
      margin: 0;
      line-height: 1.3;
    }

    .cat-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .cat-count-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--text-muted);
        background: var(--bg-soft);
        padding: 3px 8px;
        border-radius: 6px;
      }

      .cat-enter-arrow {
        color: var(--text-muted);
        display: flex;
        align-items: center;
        transition: transform 0.2s;
      }
    }
  }

  &:hover {
    transform: translateY(-4px);
    border-color: var(--primary);
    box-shadow: 0 10px 24px -4px color-mix(in srgb, var(--primary) 22%, transparent);

    .cat-3d-asset {
      transform: scale(1.08) rotate(-2deg);
    }

    .cat-enter-arrow {
      color: var(--primary);
      transform: translateX(-4px);
    }
  }

  &:active {
    transform: scale(0.96);
  }
}

/* ═══════════════════ VIEW 2: FOCUSED PRODUCTS CATALOG ═══════════════════ */
.pos-products-catalog-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.pos-products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
  gap: 14px;
}

.pos-product-card {
  position: relative;
  background: var(--bg-elevated);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-height: 195px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: var(--shadow-xs);

  .card-stock-dot {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--success);
    border: 1.5px solid #ffffff;
    z-index: 2;

    &.low {
      background: var(--warning);
    }

    &.out {
      background: var(--danger);
    }
  }

  .card-customizer-btn {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 3;
    transition: all var(--transition);

    &:hover {
      background: var(--primary);
      color: #ffffff;
      transform: scale(1.1);
    }
  }

  .card-qty-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--primary);
    color: #ffffff;
    font-size: 0.82rem;
    font-weight: 850;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 40%, transparent);
    z-index: 4;
    animation: bounceIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .card-image-box {
    width: 90px;
    height: 90px;
    border-radius: var(--radius-md, 10px);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 4px 0 8px;
    background: #ffffff;
    border: 1.5px solid var(--border-soft, #f0ebe1);
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .card-3d-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
  }

  &:hover .card-image-box .card-3d-img {
    transform: scale(1.08);
  }

  .card-visual-badge {
    font-size: 0.72rem;
    font-weight: 750;
    padding: 2px 8px;
    border-radius: 6px;
    margin-bottom: 6px;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-info {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;

    .card-title {
      font-size: 0.96rem;
      font-weight: 800;
      color: var(--text-strong);
      line-height: 1.25;
      max-height: 2.5em;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .card-price {
      font-size: 1.05rem;
      font-weight: 850;
      color: var(--primary);
    }
  }

  &:hover {
    transform: translateY(-3px);
    border-color: var(--primary);
    box-shadow: 0 8px 20px -4px color-mix(in srgb, var(--primary) 20%, transparent);

    .card-3d-img {
      transform: scale(1.08);
    }
  }

  &:active {
    transform: scale(0.96);
  }

  &.is-in-cart {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 4%, var(--bg-elevated));
  }

  &.is-out-of-stock {
    opacity: 0.55;
    filter: grayscale(0.7);
    cursor: not-allowed;
  }
}

@keyframes bounceIn {
  0% { transform: scale(0.6); opacity: 0; }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}

/* ═══════════════════ EMPTY STATE & SKELETONS ═══════════════════ */
.pos-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);

  .empty-icon-circle {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: var(--bg-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    margin-bottom: 16px;
  }

  h3 {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-strong);
    margin: 0 0 8px;
  }

  p {
    font-size: 0.9rem;
    margin: 0 0 20px;
    max-width: 360px;
  }
}

.skeleton-card {
  min-height: 195px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.skeleton-box {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--border) 40%, transparent);
}

/* ═══════════════════ LUXURY COLOR THEMES ═══════════════════ */
.visual-espresso { --theme-glow: rgba(138, 87, 42, 0.25); border-color: rgba(138, 87, 42, 0.24); }
.icon-bg-espresso { background: linear-gradient(135deg, rgba(138, 87, 42, 0.12) 0%, rgba(74, 43, 18, 0.04) 100%); color: #8a572a; }
.badge-espresso { background: rgba(138, 87, 42, 0.14); color: #6e411b; border: 1px solid rgba(138, 87, 42, 0.2); }

.visual-gold { --theme-glow: rgba(217, 119, 6, 0.25); border-color: rgba(217, 119, 6, 0.24); }
.icon-bg-gold { background: linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.04) 100%); color: #b45309; }
.badge-gold { background: rgba(217, 119, 6, 0.14); color: #92400e; border: 1px solid rgba(217, 119, 6, 0.2); }

.visual-mocha { --theme-glow: rgba(120, 53, 15, 0.25); border-color: rgba(120, 53, 15, 0.24); }
.icon-bg-mocha { background: linear-gradient(135deg, rgba(120, 53, 15, 0.12) 0%, rgba(180, 83, 9, 0.04) 100%); color: #78350f; }
.badge-mocha { background: rgba(120, 53, 15, 0.14); color: #78350f; border: 1px solid rgba(120, 53, 15, 0.2); }

.visual-ice { --theme-glow: rgba(2, 132, 199, 0.25); border-color: rgba(2, 132, 199, 0.24); }
.icon-bg-ice { background: linear-gradient(135deg, rgba(14, 165, 233, 0.14) 0%, rgba(56, 189, 248, 0.04) 100%); color: #0284c7; }
.badge-ice { background: rgba(2, 132, 199, 0.14); color: #0369a1; border: 1px solid rgba(2, 132, 199, 0.2); }

.visual-berry { --theme-glow: rgba(225, 29, 72, 0.25); border-color: rgba(225, 29, 72, 0.24); }
.icon-bg-berry { background: linear-gradient(135deg, rgba(225, 29, 72, 0.12) 0%, rgba(244, 63, 94, 0.04) 100%); color: #e11d48; }
.badge-berry { background: rgba(225, 29, 72, 0.14); color: #be123c; border: 1px solid rgba(225, 29, 72, 0.2); }

.visual-emerald { --theme-glow: rgba(5, 150, 105, 0.25); border-color: rgba(5, 150, 105, 0.24); }
.icon-bg-emerald { background: linear-gradient(135deg, rgba(16, 185, 129, 0.13) 0%, rgba(5, 150, 105, 0.04) 100%); color: #059669; }
.badge-emerald { background: rgba(5, 150, 105, 0.14); color: #047857; border: 1px solid rgba(5, 150, 105, 0.2); }

.visual-amber { --theme-glow: rgba(234, 88, 12, 0.25); border-color: rgba(234, 88, 12, 0.24); }
.icon-bg-amber { background: linear-gradient(135deg, rgba(234, 88, 12, 0.13) 0%, rgba(249, 115, 22, 0.04) 100%); color: #ea580c; }
.badge-amber { background: rgba(234, 88, 12, 0.14); color: #c2410c; border: 1px solid rgba(234, 88, 12, 0.2); }

.visual-cream { --theme-glow: rgba(161, 98, 7, 0.2); border-color: rgba(161, 98, 7, 0.22); }
.icon-bg-cream { background: linear-gradient(135deg, rgba(200, 149, 110, 0.14) 0%, rgba(254, 243, 199, 0.25) 100%); color: #92400e; }
.badge-cream { background: rgba(161, 98, 7, 0.14); color: #854d0e; border: 1px solid rgba(161, 98, 7, 0.2); }

.visual-sunset { --theme-glow: rgba(147, 51, 234, 0.25); border-color: rgba(147, 51, 234, 0.24); }
.icon-bg-sunset { background: linear-gradient(135deg, rgba(147, 51, 234, 0.12) 0%, rgba(236, 72, 153, 0.04) 100%); color: #9333ea; }
.badge-sunset { background: rgba(147, 51, 234, 0.14); color: #7e22ce; border: 1px solid rgba(147, 51, 234, 0.2); }

.visual-caramel { --theme-glow: rgba(180, 83, 9, 0.25); border-color: rgba(180, 83, 9, 0.24); }
.icon-bg-caramel { background: linear-gradient(135deg, rgba(180, 83, 9, 0.13) 0%, rgba(245, 158, 11, 0.04) 100%); color: #b45309; }
.badge-caramel { background: rgba(180, 83, 9, 0.14); color: #92400e; border: 1px solid rgba(180, 83, 9, 0.2); }

/* Dark Theme Overrides */
[data-theme='dark'] {
  .icon-bg-espresso { color: #f0cb9e; background: linear-gradient(135deg, rgba(217, 168, 108, 0.2) 0%, rgba(37, 23, 15, 0.8) 100%); }
  .badge-espresso { color: #f0cb9e; background: rgba(217, 168, 108, 0.16); }

  .icon-bg-gold { color: #fde68a; background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(45, 29, 10, 0.8) 100%); }
  .badge-gold { color: #fde68a; background: rgba(251, 191, 36, 0.16); }

  .icon-bg-ice { color: #7dd3fc; background: linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(12, 35, 55, 0.8) 100%); }
  .badge-ice { color: #7dd3fc; background: rgba(56, 189, 248, 0.16); }

  .icon-bg-berry { color: #fda4af; background: linear-gradient(135deg, rgba(251, 113, 133, 0.2) 0%, rgba(50, 15, 25, 0.8) 100%); }
  .badge-berry { color: #fda4af; background: rgba(251, 113, 133, 0.16); }

  .icon-bg-emerald { color: #6ee7b7; background: linear-gradient(135deg, rgba(52, 211, 153, 0.2) 0%, rgba(10, 40, 25, 0.8) 100%); }
  .badge-emerald { color: #6ee7b7; background: rgba(52, 211, 153, 0.16); }

  .pos-category-card .cat-card-visual-box .cat-floating-icon {
    background: rgba(30, 30, 30, 0.85);
    color: var(--primary-light);
  }
}

/* ═══════════════════ CUSTOMIZER MODAL ═══════════════════ */
.customizer-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.customizer-modal-card {
  width: 100%;
  max-width: 490px;
  background: var(--bg-elevated);
  border: 1.5px solid var(--primary);
  border-radius: var(--radius-lg);
  padding: 22px;
  box-shadow: var(--shadow-lg);
  animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalScale {
  0% { transform: scale(0.94); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.customizer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;

    .modal-coffee-icon {
      color: var(--primary);
    }

    h3 {
      margin: 0;
      color: var(--text-strong);
      font-size: 1.1rem;
      font-weight: 850;
    }

    .custom-prod-title {
      margin: 2px 0 0;
      font-size: var(--text-sm);
      color: var(--primary);
      font-weight: 700;
    }
  }

  .close-custom-btn {
    background: var(--bg-soft);
    border: none;
    color: var(--text-muted);
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      background: var(--danger-soft);
      color: var(--danger);
    }
  }
}

.customizer-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}

.custom-section {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .custom-sec-title {
    font-size: var(--text-xs);
    font-weight: 750;
    color: var(--text-muted);
  }
}

.custom-options-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;

  &.cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }
  &.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
}

.option-pill-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--transition);

  &:active {
    transform: scale(0.96);
  }

  &.active {
    background: var(--primary);
    color: #ffffff;
    border-color: var(--primary);
    font-weight: 850;
    box-shadow: var(--shadow-xs);
  }

  &.highlight {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
}

.spec-summary-badge {
  background: var(--bg-soft);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: var(--text-xs);

  .spec-label {
    color: var(--text-muted);
    font-weight: 700;
    white-space: nowrap;
  }

  .spec-text {
    color: var(--text-strong);
  }
}

.customizer-footer {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);

  .add-custom-btn {
    flex: 1;
  }
}

/* Touch-first cashier sizing: every primary target stays comfortable on a POS screen. */
.pos-categories-quick-strip {
  padding: 2px 0 8px;

  .quick-cat-pill {
    min-height: 48px;
    padding-inline: 16px;
    border-radius: 12px;
    font-size: 0.92rem;
    touch-action: manipulation;
  }
}

.pos-categories-grid {
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 18px;
}

.pos-category-card {
  min-height: 216px;
  padding: 18px;
  touch-action: manipulation;
  user-select: none;

  .cat-card-visual-box {
    height: 124px;

    .cat-3d-asset {
      max-width: 104px;
      max-height: 104px;
    }
  }
}

.pos-products-grid {
  grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
  gap: 16px;
}

.pos-product-card {
  min-height: 232px;
  padding: 16px;
  touch-action: manipulation;
  user-select: none;

  .card-customizer-btn {
    width: 44px;
    height: 44px;
    top: 10px;
    left: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    z-index: 3;
  }

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent);
    outline-offset: 3px;
  }
}

.customizer-modal-card {
  max-width: 720px;
}

.close-custom-btn {
  min-width: 48px;
  min-height: 48px;
}

.option-pill-btn {
  min-height: 54px;
  padding: 10px 8px;
  font-size: 0.86rem;
  touch-action: manipulation;
}

.detail-quantity-control {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 58px;
  padding: 5px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;

  strong {
    min-width: 52px;
    text-align: center;
    font-size: 1.2rem;
    color: var(--text-strong);
  }
}

.detail-quantity-btn {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-strong);
  font-size: 1.5rem;
  font-weight: 900;
  cursor: pointer;
}

.detail-notes-label {
  margin-top: 8px;
}

.custom-notes-input {
  width: 100%;
  resize: vertical;
  min-height: 88px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-strong);
  font: inherit;
  font-size: 0.95rem;
}

.customizer-footer .btn {
  min-height: 56px;
  touch-action: manipulation;
}

/* Truthful, focused product detail panel. It only presents fields that exist on the product. */
.customizer-modal-card {
  max-width: 680px;
  padding: 20px;
}

.customizer-body {
  gap: 16px;
  max-height: 68vh;
}

.product-detail-layout {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
}

.product-detail-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

.detail-product-image {
  min-height: 142px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 118px;
    height: 118px;
    object-fit: contain;
    filter: drop-shadow(0 8px 12px rgba(0, 0, 0, 0.14));
  }
}

.detail-data-label,
.detail-kicker {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.product-detail-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;

  h4 {
    margin: 0;
    color: var(--text-strong);
    font-size: 1.35rem;
    line-height: 1.35;
    font-weight: 900;
  }
}

.detail-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-elevated);
    color: var(--text);
    font-size: 0.78rem;
    font-weight: 750;
  }
}

.detail-stock-status {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--success-soft, rgba(22, 163, 74, 0.1));
  color: var(--success, #15803d);
  font-size: 0.78rem;
  font-weight: 850;

  &.low {
    background: var(--warning-soft, rgba(217, 119, 6, 0.12));
    color: var(--warning, #b45309);
  }

  &.out {
    background: var(--danger-soft, rgba(220, 38, 38, 0.1));
    color: var(--danger, #b91c1c);
  }
}

.detail-quantity-section {
  gap: 8px;
}

.custom-notes-input {
  min-height: 72px;
}

@media (max-width: 560px) {
  .product-detail-layout {
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 12px;
  }

  .detail-product-image {
    min-height: 110px;

    img {
      width: 88px;
      height: 88px;
    }
  }

  .product-detail-info h4 {
    font-size: 1.05rem;
  }
}
</style>
