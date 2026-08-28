<template>
  <div class="card full-catalog-panel">
    <!-- ═══════════════════ شريط البحث والتصنيفات ═══════════════════ -->
    <div class="catalog-top-header">
      <div class="search-and-status-row">
        <div class="search-box">
          <span class="search-icon"><AppIcon name="search" :size="16" /></span>
          <input
            ref="searchInputRef"
            :value="productSearch"
            type="text"
            placeholder="ابحث عن صنف أو امسح الباركود... (F2 أو F7)"
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
            aria-label="مسح البحث"
          >
            <AppIcon name="close" :size="14" />
          </button>
        </div>

        <!-- مؤشر التصنيف المختار -->
        <div class="active-cat-indicator" :title="'التصنيف: ' + currentCategoryName">
          <span class="cat-ind-icon">
            <AppIcon :name="currentCategoryVisual.icon" :size="14" />
          </span>
          <span class="cat-ind-name">{{ currentCategoryName }}</span>
          <span class="cat-ind-count">{{ filteredProducts.length }} صنف</span>
        </div>
      </div>

      <!-- شريط المفاتيح السريعة للأصناف الأكثر طلباً -->
      <div v-if="fastKeyProducts.length && !productSearch" class="fast-keys-ribbon">
        <div class="fast-keys-header">
          <span class="ribbon-icon"><AppIcon name="trendingUp" :size="14" /></span>
          <span class="ribbon-title">الأكثر طلباً:</span>
        </div>
        <div class="fast-keys-scroll">
          <button
            v-for="fastProd in fastKeyProducts"
            :key="'fast-' + fastProd.id"
            type="button"
            class="fast-key-chip"
            :class="[getProductVisual(fastProd).cardClass, { 'in-cart': isInCart(fastProd.id) }]"
            @click="handleCardClick(fastProd)"
            :title="fastProd.name_ar + ' (' + formatMoney(fastProd.sale_price) + ')'"
          >
            <span class="fast-key-icon">
              <AppIcon :name="getProductVisual(fastProd).icon" :size="13" />
            </span>
            <span class="fast-key-name">{{ fastProd.name_ar }}</span>
            <span v-if="isInCart(fastProd.id)" class="fast-key-badge">{{
              getCartQty(fastProd.id)
            }}</span>
          </button>
        </div>
      </div>

      <!-- شريط التصنيفات الأفقي الفاخر التفاعلي للمس -->
      <nav v-if="categories.length" class="horizontal-categories-nav">
        <div class="categories-scroll-track">
          <button
            type="button"
            class="cat-tab-pill"
            :class="{ active: !selectedCategory }"
            @click="selectCategory('')"
          >
            <span class="pill-icon"><AppIcon name="layers" :size="14" /></span>
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
            <span class="pill-icon">
              <AppIcon :name="getCategoryVisual(cat.name_ar).icon" :size="14" />
            </span>
            <span class="pill-label">{{ cat.name_ar }}</span>
          </button>
        </div>
      </nav>
    </div>

    <!-- ═══════════════════ شبكة المنتجات الموحدة للمس (Touch-First Products Grid) ═══════════════════ -->
    <div class="catalog-grid-wrapper">
      <!-- هيكل التحميل -->
      <div v-if="loadingProducts" class="products-grid-container">
        <div v-for="i in 12" :key="'sk-prod-' + i" class="pos-product-card skeleton-card">
          <div class="card-image-box skeleton-box"></div>
          <SkeletonLoader type="line" height="14px" width="80%" />
          <SkeletonLoader type="line" height="12px" width="50%" />
        </div>
      </div>

      <!-- حالة عدم وجود نتائج -->
      <div v-else-if="!filteredProducts.length" class="empty-catalog-state">
        <span class="empty-icon"><AppIcon name="search" :size="36" /></span>
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

      <!-- شبكة بطاقات المنتجات الموحدة والمحسنة بصرياً وللمس السريع -->
      <div v-else class="products-grid-container">
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
          @mousedown="startLongPress(product)"
          @mouseup="cancelLongPress"
          @mouseleave="cancelLongPress"
          @touchstart.passive="startLongPress(product)"
          @touchend="cancelLongPress"
          @click="handleCardClick(product)"
          role="button"
          tabindex="0"
          :title="
            product.name_ar + (isCoffeeProduct(product) ? ' (انقر مطولاً أو انقر للتخصيص)' : '')
          "
        >
          <!-- زاوية مؤشر المخزون المضيء -->
          <span
            class="card-stock-dot"
            :class="getProductStockClass(product)"
            :title="getProductStockTitle(product)"
          ></span>

          <!-- زر التخصيص السريع للبن والمشروبات -->
          <button
            v-if="isCoffeeProduct(product)"
            type="button"
            class="card-customizer-btn"
            @click.stop="openCustomizer(product)"
            title="تخصيص درجة الطحن والتحميص"
            aria-label="تخصيص البن"
          >
            <AppIcon name="sliders" :size="12" />
          </button>

          <!-- شارة عدد القطع المختارة في السلة -->
          <span v-if="isInCart(product.id)" class="card-qty-badge">
            {{ getCartQty(product.id) }}
          </span>

          <!-- 1. صورة المنتج أو الأيقونة المعبرة الفاخرة في الأعلى -->
          <div class="card-image-box" :class="getProductVisual(product).iconBgClass">
            <img
              v-if="product.image || product.image_url"
              :src="product.image || product.image_url"
              :alt="product.name_ar"
              class="card-img"
              loading="lazy"
            />
            <div v-else class="card-fallback-icon">
              <AppIcon :name="getProductVisual(product).icon" :size="26" />
            </div>
          </div>

          <!-- 2. شارة المنتج الذكية -->
          <span
            v-if="getProductVisual(product).badge"
            class="card-visual-badge"
            :class="getProductVisual(product).badgeClass"
          >
            {{ getProductVisual(product).badge }}
          </span>

          <!-- 3. اسم المنتج وسعره مباشرة أسفل الصورة والشارة -->
          <div class="card-info">
            <span class="card-title">{{ product.name_ar }}</span>
            <span class="card-price">{{ formatMoney(product.sale_price) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ نافذة تخصيص البن والمشروبات ═══════════════════ -->
    <div
      v-if="showCustomizerModal && activeCustomProduct"
      class="customizer-modal-backdrop"
      @click.self="closeCustomizer"
    >
      <div class="card customizer-modal-card">
        <!-- Header -->
        <div class="customizer-header">
          <div class="header-title-wrap">
            <span class="modal-coffee-icon"><AppIcon name="coffee" :size="20" /></span>
            <div>
              <h3>تخصيص مواصفات البن / الطلب</h3>
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
          <!-- 1. درجة الطحن -->
          <div class="custom-section">
            <label class="custom-sec-title">درجة الطحن المطلوبة:</label>
            <div class="custom-options-grid">
              <button
                v-for="grind in grindOptions"
                :key="grind.id"
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedGrind === grind.label }"
                @click="selectedGrind = grind.label"
              >
                <AppIcon v-if="grind.icon" :name="grind.icon" :size="14" class="pill-emoji" />
                <span>{{ grind.label }}</span>
              </button>
            </div>
          </div>

          <!-- 2. درجة التحميص -->
          <div class="custom-section">
            <label class="custom-sec-title">درجة التحميص:</label>
            <div class="custom-options-grid cols-4">
              <button
                v-for="roast in roastOptions"
                :key="roast.id"
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedRoast === roast.label }"
                @click="selectedRoast = roast.label"
              >
                <AppIcon v-if="roast.icon" :name="roast.icon" :size="14" class="pill-emoji" />
                <span>{{ roast.label }}</span>
              </button>
            </div>
          </div>

          <!-- 3. إضافات التحويجة -->
          <div class="custom-section">
            <label class="custom-sec-title">إضافات التحويجة والحبهان:</label>
            <div class="custom-options-grid cols-3">
              <button
                v-for="spice in spiceOptions"
                :key="spice.id"
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedSpices === spice.label }"
                @click="selectedSpices = spice.label"
              >
                <AppIcon v-if="spice.icon" :name="spice.icon" :size="14" class="pill-emoji" />
                <span>{{ spice.label }}</span>
              </button>
            </div>
          </div>

          <!-- 4. الوزن / الكمية السريعة -->
          <div class="custom-section">
            <label class="custom-sec-title">الوزن / الحجم المطلوب:</label>
            <div class="custom-options-grid cols-4">
              <button
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedWeight === 0.125 }"
                @click="selectedWeight = 0.125"
              >
                ⅛ ثمن (125g)
              </button>
              <button
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedWeight === 0.25 }"
                @click="selectedWeight = 0.25"
              >
                ¼ ربع (250g)
              </button>
              <button
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedWeight === 0.5 }"
                @click="selectedWeight = 0.5"
              >
                ½ نصف (500g)
              </button>
              <button
                type="button"
                class="option-pill-btn highlight"
                :class="{ active: selectedWeight === 1.0 }"
                @click="selectedWeight = 1.0"
              >
                1k كيلو (1000g)
              </button>
            </div>
          </div>

          <!-- ملخص المواصفات المجمعة -->
          <div class="spec-summary-badge">
            <span class="spec-label">المواصفات:</span>
            <strong class="spec-text">{{ compiledCustomNotes }}</strong>
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
            إضافة للسلة مع المواصفات (Enter)
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

// Pinned Fast Keys Logic (Top Popular Items)
const fastKeyProducts = computed(() => {
  if (!props.filteredProducts.length) return [];
  return props.filteredProducts.slice(0, 6);
});

// Coffee Customizer State & Options
const showCustomizerModal = ref(false);
const activeCustomProduct = ref<any>(null);

const grindOptions = [
  { id: 'beans', label: 'حبوب كاملة', icon: 'bean' },
  { id: 'turkish', label: 'تركي ناعم', icon: 'coffee' },
  { id: 'espresso', label: 'إسبريسو', icon: 'coffee' },
  { id: 'v60', label: 'فلتر V60', icon: 'flask' },
  { id: 'french', label: 'فرنش برس', icon: 'flask' },
  { id: 'moka', label: 'موكا بوت', icon: 'coffee' },
];

const roastOptions = [
  { id: 'light', label: 'فاتح', icon: 'sun' },
  { id: 'medium', label: 'وسط', icon: 'zap' },
  { id: 'dark', label: 'غامق', icon: 'moon' },
  { id: 'med_dark', label: 'وسط مع غامق', icon: 'sparkles' },
];

const spiceOptions = [
  { id: 'plain', label: 'بدون حبهان (سادة)', icon: 'tag' },
  { id: 'light_card', label: 'حبهان خفيف', icon: 'sparkles' },
  { id: 'med_card', label: 'حبهان مظبوط', icon: 'check' },
  { id: 'extra_card', label: 'حبهان زيادة', icon: 'check' },
  { id: 'mastic', label: 'مستكة وحبهان', icon: 'shield' },
  { id: 'special', label: 'تحويجة العجوز الملكية', icon: 'sparkles' },
];

const selectedGrind = ref('تركي ناعم');
const selectedRoast = ref('وسط');
const selectedSpices = ref('حبهان مظبوط');
const selectedWeight = ref(0.25);

const isCoffeeProduct = (product: any) => {
  const cat = (product.category_name || '').toLowerCase();
  const name = (product.name_ar || '').toLowerCase();
  return (
    cat.includes('بن') ||
    cat.includes('حبوب') ||
    cat.includes('توليف') ||
    cat.includes('قهو') ||
    cat.includes('اسبريسو') ||
    name.includes('بن') ||
    name.includes('توليفة') ||
    name.includes('قهوة')
  );
};

const compiledCustomNotes = computed(() => {
  return `طحن: ${selectedGrind.value} • تحميص: ${selectedRoast.value} • تحويجة: ${selectedSpices.value}`;
});

const openCustomizer = (product: any) => {
  activeCustomProduct.value = product;
  selectedGrind.value = 'تركي ناعم';
  selectedRoast.value = 'وسط';
  selectedSpices.value = 'حبهان مظبوط';
  selectedWeight.value = 0.25;
  showCustomizerModal.value = true;
};

const closeCustomizer = () => {
  showCustomizerModal.value = false;
  activeCustomProduct.value = null;
};

const confirmCustomization = () => {
  if (activeCustomProduct.value) {
    emit('addToCart', activeCustomProduct.value, selectedWeight.value, compiledCustomNotes.value);
  }
  closeCustomizer();
};

// Long Press Detection
let longPressTimer: any = null;
let isLongPressTriggered = false;

const startLongPress = (product: any) => {
  if (!isCoffeeProduct(product)) return;
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

const currentCategoryName = computed(() => {
  if (!props.selectedCategory) return 'كل المنتجات';
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? cat.name_ar : 'كل المنتجات';
});

const currentCategoryVisual = computed(() => {
  if (!props.selectedCategory) return { icon: 'layers', emoji: '☕' };
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? getCategoryVisual(cat.name_ar) : { icon: 'coffee', emoji: '☕' };
});

const onSearch = (e: Event) => {
  emit('update:productSearch', (e.target as HTMLInputElement).value);
  emit('filter');
};

const selectCategory = (id: any) => {
  emit('update:selectedCategory', id);
  emit('filter');
};

const handleCardClick = (product: any) => {
  if (isLongPressTriggered) {
    isLongPressTriggered = false;
    return;
  }
  emit('addToCart', product);
};

defineExpose({
  focusSearch: () => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  },
});
</script>

<style lang="scss" scoped>
@use '@/styles/variables' as *;

.full-catalog-panel {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  min-height: calc(100vh - 180px);
  box-shadow: var(--shadow-sm);
}

/* ── Top Header Bar ── */
.catalog-top-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.search-and-status-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 240px;

  .search-icon {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--primary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 10px 40px 10px 34px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text);
    transition:
      border-color var(--transition),
      box-shadow var(--transition);

    &:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--focus-ring);
      outline: none;
    }
  }

  .clear-search-btn {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: var(--bg-soft);
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: var(--danger-soft);
      color: var(--danger);
    }
  }
}

.active-cat-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);

  .cat-ind-icon {
    color: var(--primary);
    display: flex;
    align-items: center;
  }

  .cat-ind-name {
    font-weight: 750;
    color: var(--text-strong);
  }

  .cat-ind-count {
    color: var(--primary);
    font-weight: 800;
  }
}

/* ── Pinned Fast Keys Ribbon ── */
.fast-keys-ribbon {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;

  .fast-keys-header {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--primary);
    font-size: var(--text-xs);
    font-weight: 800;
    white-space: nowrap;
  }

  .fast-keys-scroll {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  .fast-key-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-full, 9999px);
    color: var(--text);
    font-size: var(--text-xs);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition:
      transform var(--transition),
      border-color var(--transition),
      box-shadow var(--transition);

    &:active {
      transform: scale(0.95);
      background: var(--accent-soft);
    }

    &.in-cart {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent-dark, var(--primary));
    }

    .fast-key-icon {
      display: flex;
      align-items: center;
    }

    .fast-key-badge {
      padding: 1px 6px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      font-size: 0.68rem;
    }
  }
}

/* ── Category Tabs Navigation ── */
.horizontal-categories-nav {
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  .categories-scroll-track {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .cat-tab-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-full, 9999px);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition);

    &:active {
      transform: scale(0.96);
    }

    &.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
      box-shadow: var(--shadow-xs);
    }

    .pill-icon {
      display: flex;
      align-items: center;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Touch-First Unified Products Grid & Card Styles
   ═══════════════════════════════════════════════════════════════════════════════ */

.catalog-grid-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px 20px 2px;
}

.products-grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 12px;
  width: 100%;

  @media (min-width: 1200px) {
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 14px;
  }

  @media (max-width: 600px) {
    grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
    gap: 8px;
  }
}

/* Unified POS Product Card with Glassmorphism & Theme Palette */
.pos-product-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  text-align: center;
  padding: 10px 8px 10px;
  min-height: 154px;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.12s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;

  /* Immediate Tactile Feedback for Touch */
  &:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  &:active {
    transform: scale(0.95);
    border-color: var(--primary);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &.is-in-cart {
    border-color: var(--accent) !important;
    background: var(--accent-soft) !important;
    box-shadow:
      0 0 0 1.5px var(--accent),
      var(--shadow-sm);
  }

  &.is-out-of-stock {
    opacity: 0.45;
    filter: grayscale(0.8);
  }

  /* Card Stock Dot */
  .card-stock-dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    z-index: 2;

    &.low {
      background: var(--warning);
      box-shadow: 0 0 6px rgba(183, 101, 17, 0.6);
    }
    &.out {
      background: var(--danger);
      box-shadow: 0 0 6px rgba(220, 38, 38, 0.6);
    }
  }

  /* In-Cart Quantity Badge */
  .card-qty-badge {
    position: absolute;
    top: -6px;
    left: -6px;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: var(--primary);
    color: #ffffff;
    font-size: 0.75rem;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--bg-card);
    box-shadow: var(--shadow-sm);
    z-index: 4;
  }

  /* Coffee Customizer Trigger Button */
  .card-customizer-btn {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition);
    z-index: 2;

    &:active {
      transform: scale(0.9);
      background: var(--accent);
      color: #ffffff;
    }
  }
}

/* Image / Icon Container */
.card-image-box {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-soft);
  overflow: hidden;
  margin-top: 4px;
  margin-bottom: 6px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  transition: transform 0.15s ease;

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-fallback-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
  }
}

.pos-product-card:hover .card-image-box .card-fallback-icon {
  transform: scale(1.08);
}

/* Expressive Product Badge */
.card-visual-badge {
  display: inline-block;
  font-size: 0.64rem;
  font-weight: 800;
  padding: 1px 7px;
  border-radius: 9999px;
  margin-bottom: 4px;
  white-space: nowrap;
  max-width: 96%;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* Centered Product Information */
.card-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 3px;
  margin-top: auto;
}

.card-title {
  font-size: 0.88rem;
  font-weight: 750;
  color: var(--text-strong);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.card-price {
  font-size: 0.84rem;
  font-weight: 900;
  color: var(--primary);
}

/* ═══════════════════ Dynamic Visual Color Themes ═══════════════════ */

/* 1. Espresso (Deep Coffee & Roasted Beans) */
.theme-espresso {
  border-color: rgba(138, 87, 42, 0.22);
  &:hover {
    box-shadow: 0 4px 18px rgba(138, 87, 42, 0.16);
    border-color: #8a572a;
  }
}
.icon-bg-espresso {
  background: linear-gradient(135deg, rgba(138, 87, 42, 0.12) 0%, rgba(74, 43, 18, 0.04) 100%);
  border-color: rgba(138, 87, 42, 0.25);
  color: #8a572a;
}
.badge-espresso {
  background: rgba(138, 87, 42, 0.12);
  color: #6e411b;
  border: 1px solid rgba(138, 87, 42, 0.2);
}

/* 2. Gold (Golden Blend, Warm Pastries & Snacks) */
.theme-gold {
  border-color: rgba(217, 119, 6, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(217, 119, 6, 0.16);
    border-color: #d97706;
  }
}
.icon-bg-gold {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.05) 100%);
  border-color: rgba(217, 119, 6, 0.25);
  color: #b45309;
}
.badge-gold {
  background: rgba(217, 119, 6, 0.12);
  color: #92400e;
  border: 1px solid rgba(217, 119, 6, 0.2);
}

/* 3. Mocha (Chocolate, Brownies & Cocoa) */
.theme-mocha {
  border-color: rgba(120, 53, 15, 0.22);
  &:hover {
    box-shadow: 0 4px 18px rgba(120, 53, 15, 0.16);
    border-color: #78350f;
  }
}
.icon-bg-mocha {
  background: linear-gradient(135deg, rgba(120, 53, 15, 0.14) 0%, rgba(180, 83, 9, 0.05) 100%);
  border-color: rgba(120, 53, 15, 0.25);
  color: #78350f;
}
.badge-mocha {
  background: rgba(120, 53, 15, 0.12);
  color: #78350f;
  border: 1px solid rgba(120, 53, 15, 0.2);
}

/* 4. Ice (Cold Drinks, Iced Coffee, Soda & Water) */
.theme-ice {
  border-color: rgba(2, 132, 199, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(2, 132, 199, 0.16);
    border-color: #0284c7;
  }
}
.icon-bg-ice {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.14) 0%, rgba(56, 189, 248, 0.05) 100%);
  border-color: rgba(2, 132, 199, 0.25);
  color: #0284c7;
}
.badge-ice {
  background: rgba(2, 132, 199, 0.12);
  color: #0369a1;
  border: 1px solid rgba(2, 132, 199, 0.2);
}

/* 5. Berry (Cakes, Desserts, Berries & Sweets) */
.theme-berry {
  border-color: rgba(225, 29, 72, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(225, 29, 72, 0.16);
    border-color: #e11d48;
  }
}
.icon-bg-berry {
  background: linear-gradient(135deg, rgba(225, 29, 72, 0.14) 0%, rgba(244, 63, 94, 0.05) 100%);
  border-color: rgba(225, 29, 72, 0.25);
  color: #e11d48;
}
.badge-berry {
  background: rgba(225, 29, 72, 0.12);
  color: #be123c;
  border: 1px solid rgba(225, 29, 72, 0.2);
}

/* 6. Emerald (Tea, Herbs & Matcha) */
.theme-emerald {
  border-color: rgba(5, 150, 105, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(5, 150, 105, 0.16);
    border-color: #059669;
  }
}
.icon-bg-emerald {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(5, 150, 105, 0.05) 100%);
  border-color: rgba(5, 150, 105, 0.25);
  color: #059669;
}
.badge-emerald {
  background: rgba(5, 150, 105, 0.12);
  color: #047857;
  border: 1px solid rgba(5, 150, 105, 0.2);
}

/* 7. Amber (Citrus, Fresh Juices & Savory) */
.theme-amber {
  border-color: rgba(234, 88, 12, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(234, 88, 12, 0.16);
    border-color: #ea580c;
  }
}
.icon-bg-amber {
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.14) 0%, rgba(249, 115, 22, 0.05) 100%);
  border-color: rgba(234, 88, 12, 0.25);
  color: #ea580c;
}
.badge-amber {
  background: rgba(234, 88, 12, 0.12);
  color: #c2410c;
  border: 1px solid rgba(234, 88, 12, 0.2);
}

/* 8. Cream (Milk, Latte & Dairy) */
.theme-cream {
  border-color: rgba(200, 149, 110, 0.26);
  &:hover {
    box-shadow: 0 4px 18px rgba(200, 149, 110, 0.16);
    border-color: #c8956e;
  }
}
.icon-bg-cream {
  background: linear-gradient(135deg, rgba(200, 149, 110, 0.16) 0%, rgba(254, 243, 199, 0.1) 100%);
  border-color: rgba(200, 149, 110, 0.3);
  color: #92400e;
}
.badge-cream {
  background: rgba(200, 149, 110, 0.14);
  color: #854d0e;
  border: 1px solid rgba(200, 149, 110, 0.25);
}

/* 9. Sunset (Smoothies & Exotic Blends) */
.theme-sunset {
  border-color: rgba(147, 51, 234, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(147, 51, 234, 0.16);
    border-color: #9333ea;
  }
}
.icon-bg-sunset {
  background: linear-gradient(135deg, rgba(147, 51, 234, 0.14) 0%, rgba(236, 72, 153, 0.05) 100%);
  border-color: rgba(147, 51, 234, 0.25);
  color: #9333ea;
}
.badge-sunset {
  background: rgba(147, 51, 234, 0.12);
  color: #7e22ce;
  border: 1px solid rgba(147, 51, 234, 0.2);
}

/* 10. Caramel (Syrups, Flavors & Toppings) */
.theme-caramel {
  border-color: rgba(180, 83, 9, 0.24);
  &:hover {
    box-shadow: 0 4px 18px rgba(180, 83, 9, 0.16);
    border-color: #b45309;
  }
}
.icon-bg-caramel {
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.14) 0%, rgba(245, 158, 11, 0.05) 100%);
  border-color: rgba(180, 83, 9, 0.25);
  color: #b45309;
}
.badge-caramel {
  background: rgba(180, 83, 9, 0.12);
  color: #92400e;
  border: 1px solid rgba(180, 83, 9, 0.2);
}

/* ── Dark Mode Adaptations for Theme Colors ── */
[data-theme='dark'] {
  .icon-bg-espresso {
    color: #f0cb9e;
    background: linear-gradient(135deg, rgba(217, 168, 108, 0.2) 0%, rgba(37, 23, 15, 0.8) 100%);
  }
  .badge-espresso {
    color: #f0cb9e;
    background: rgba(217, 168, 108, 0.16);
  }

  .icon-bg-gold {
    color: #fde68a;
    background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(45, 29, 10, 0.8) 100%);
  }
  .badge-gold {
    color: #fde68a;
    background: rgba(251, 191, 36, 0.16);
  }

  .icon-bg-mocha {
    color: #fcd34d;
    background: linear-gradient(135deg, rgba(180, 83, 9, 0.22) 0%, rgba(40, 20, 10, 0.8) 100%);
  }
  .badge-mocha {
    color: #fcd34d;
    background: rgba(180, 83, 9, 0.16);
  }

  .icon-bg-ice {
    color: #7dd3fc;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(12, 35, 55, 0.8) 100%);
  }
  .badge-ice {
    color: #7dd3fc;
    background: rgba(56, 189, 248, 0.16);
  }

  .icon-bg-berry {
    color: #fda4af;
    background: linear-gradient(135deg, rgba(251, 113, 133, 0.2) 0%, rgba(50, 15, 25, 0.8) 100%);
  }
  .badge-berry {
    color: #fda4af;
    background: rgba(251, 113, 133, 0.16);
  }

  .icon-bg-emerald {
    color: #6ee7b7;
    background: linear-gradient(135deg, rgba(52, 211, 153, 0.2) 0%, rgba(10, 40, 25, 0.8) 100%);
  }
  .badge-emerald {
    color: #6ee7b7;
    background: rgba(52, 211, 153, 0.16);
  }

  .icon-bg-amber {
    color: #fdba74;
    background: linear-gradient(135deg, rgba(251, 146, 60, 0.2) 0%, rgba(48, 22, 10, 0.8) 100%);
  }
  .badge-amber {
    color: #fdba74;
    background: rgba(251, 146, 60, 0.16);
  }

  .icon-bg-cream {
    color: #fef08a;
    background: linear-gradient(135deg, rgba(234, 179, 8, 0.18) 0%, rgba(35, 27, 18, 0.8) 100%);
  }
  .badge-cream {
    color: #fef08a;
    background: rgba(234, 179, 8, 0.16);
  }

  .icon-bg-sunset {
    color: #d8b4fe;
    background: linear-gradient(135deg, rgba(192, 132, 252, 0.2) 0%, rgba(38, 15, 52, 0.8) 100%);
  }
  .badge-sunset {
    color: #d8b4fe;
    background: rgba(192, 132, 252, 0.16);
  }

  .icon-bg-caramel {
    color: #fcd34d;
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(42, 25, 12, 0.8) 100%);
  }
  .badge-caramel {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.16);
  }
}

/* Skeleton Loading Tile */
.skeleton-card {
  min-height: 154px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
}

.skeleton-box {
  background: color-mix(in srgb, var(--border) 40%, transparent);
}

/* Empty State */
.empty-catalog-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);

  .empty-icon {
    color: var(--text-muted);
    display: block;
    margin-bottom: 12px;
  }

  h3 {
    color: var(--text-strong);
    margin: 0 0 6px;
  }
  p {
    font-size: var(--text-sm);
    margin: 0 0 16px;
  }

  .btn-reset-filters {
    padding: 8px 18px;
    background: var(--primary);
    color: #ffffff;
    border: none;
    border-radius: var(--radius-sm);
    font-weight: 700;
    cursor: pointer;
  }
}

/* ═══════════════════ Customizer Modal ═══════════════════ */

.customizer-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.customizer-modal-card {
  width: 100%;
  max-width: 480px;
  background: var(--bg-elevated);
  border: 1.5px solid var(--primary);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-lg);
  animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalScale {
  0% {
    transform: scale(0.94);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
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
</style>
