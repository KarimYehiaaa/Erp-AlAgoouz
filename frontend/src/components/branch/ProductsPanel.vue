<template>
  <div class="card full-catalog-panel">
    <!-- ═══════════════════ شريط البحث والتصنيفات والأنماط ═══════════════════ -->
    <div class="catalog-top-header">
      <div class="search-and-status-row">
        <div class="search-box">
          <span class="search-icon"></span>
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
          ></button>
        </div>

        <!--  أزرار التبديل بين كثافة العرض والأنماط (Point 7: Grid Density & View Mode Switcher) -->
        <div class="view-mode-switch-group">
          <button
            type="button"
            class="mode-switch-btn"
            :class="{ active: viewMode === '3d' }"
            @click="setViewMode('3d')"
            title="الوضع المجسم ثلاثي الأبعاد (3D Tactile)"
          >
            <span class="btn-icon"></span>
            <span class="btn-label">3D مجسم</span>
          </button>

          <button
            type="button"
            class="mode-switch-btn"
            :class="{ active: viewMode === 'compact' }"
            @click="setViewMode('compact')"
            title="الوضع المدمج السريع للشاشات العريضة (Compact Grid)"
          >
            <span class="btn-icon"></span>
            <span class="btn-label">مدمج</span>
          </button>

          <button
            type="button"
            class="mode-switch-btn"
            :class="{ active: viewMode === 'color' }"
            @click="setViewMode('color')"
            title="الوضع الملون بحسب الأقسام (Color-Coded)"
          >
            <span class="btn-icon"></span>
            <span class="btn-label">ملون</span>
          </button>
        </div>

        <!-- ملخص التصنيف المختار -->
        <div class="active-cat-indicator" :title="'التصنيف: ' + currentCategoryName">
          <span class="cat-ind-icon">{{ currentCategoryIcon }}</span>
          <span class="cat-ind-name">{{ currentCategoryName }}</span>
          <span class="cat-ind-count">{{ filteredProducts.length }} صنف</span>
        </div>
      </div>

      <!--  شريط المفاتيح الذهبية والأكثر طلباً (Point 2: Pinned Fast Keys Ribbon) -->
      <div v-if="fastKeyProducts.length && !productSearch" class="fast-keys-ribbon">
        <div class="fast-keys-header">
          <span class="ribbon-icon"></span>
          <span class="ribbon-title">الأكثر طلباً:</span>
        </div>
        <div class="fast-keys-scroll">
          <button
            v-for="fastProd in fastKeyProducts"
            :key="'fast-' + fastProd.id"
            type="button"
            class="fast-key-chip"
            :class="{ 'in-cart': isInCart(fastProd.id) }"
            @click="handleCardClick(fastProd)"
            :title="fastProd.name_ar + ' (' + formatMoney(fastProd.sale_price) + ')'"
          >
            <span class="fast-key-icon">{{ getCategoryIcon(fastProd.category_name) }}</span>
            <span class="fast-key-name">{{ fastProd.name_ar }}</span>
            <span v-if="isInCart(fastProd.id)" class="fast-key-badge">{{
              getCartQty(fastProd.id)
            }}</span>
          </button>
        </div>
      </div>

      <!--  شريط التصنيفات الأفقي الفاخر (Horizontal Category Pills Bar) -->
      <nav v-if="categories.length" class="horizontal-categories-nav">
        <div class="categories-scroll-track">
          <button
            type="button"
            class="cat-tab-pill"
            :class="{ active: !selectedCategory }"
            @click="selectCategory('')"
          >
            <span class="pill-icon"></span>
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

    <!-- ═══════════════════ شبكة المنتجات (Products Grid with Dynamic Density) ═══════════════════ -->
    <div class="catalog-grid-wrapper">
      <!-- هيكل التحميل -->
      <div v-if="loadingProducts" class="products-grid-container" :class="['mode-' + viewMode]">
        <div v-for="i in 12" :key="'sk-prod-' + i" class="product-tile skeleton-tile">
          <SkeletonLoader type="line" height="20px" width="80%" />
        </div>
      </div>

      <!-- حالة عدم وجود نتائج -->
      <div v-else-if="!filteredProducts.length" class="empty-catalog-state">
        <span class="empty-icon"></span>
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

      <!-- شبكة بطاقات المنتجات مع دعم اللمس المطول والتخصيص -->
      <div v-else class="products-grid-container" :class="['mode-' + viewMode]">
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          class="product-tile"
          :class="[
            'cat-color-' + getCategoryColorKey(product.category_name),
            {
              'is-selected': isInCart(product.id),
              'low-stock': hasLowIngredients(product) || getProductStockClass(product) === 'low',
              'is-out-of-stock': getProductStockClass(product) === 'out',
            },
          ]"
          @mousedown="startLongPress(product)"
          @mouseup="cancelLongPress"
          @mouseleave="cancelLongPress"
          @touchstart.passive="startLongPress(product)"
          @touchend="cancelLongPress"
          @click="handleCardClick(product)"
          :title="
            product.name_ar + (isCoffeeProduct(product) ? ' (انقر مطولاً أو انقر  للتخصيص)' : '')
          "
        >
          <!-- زاوية مؤشر المخزون المضيء -->
          <span
            class="tile-stock-dot"
            :class="getProductStockClass(product)"
            :title="getProductStockTitle(product)"
          ></span>

          <!--  زر التخصيص السريع للبن والمشروبات (Point 1: Coffee Customizer Trigger) -->
          <button
            v-if="isCoffeeProduct(product)"
            type="button"
            class="tile-customize-btn"
            @click.stop="openCustomizer(product)"
            title="تخصيص درجة الطحن، التحميص، والإضافات"
          ></button>

          <!-- شارة عدد القطع المختارة في السلة (3D Floating Badge) -->
          <span v-if="isInCart(product.id)" class="tile-qty-badge">
            {{ getCartQty(product.id) }}
          </span>

          <!--  اسم المنتج الرئيسي -->
          <div class="tile-center-content">
            <span class="product-main-name">{{ product.name_ar }}</span>
          </div>

          <!-- طبقة اللمعان والانعكاس الضوئي 3D -->
          <span v-if="viewMode === '3d'" class="specular-highlight"></span>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ نافذة تخصيص البن والمشروبات (Point 1: Coffee Customizer Modal) ═══════════════════ -->
    <div
      v-if="showCustomizerModal && activeCustomProduct"
      class="customizer-modal-backdrop"
      @click.self="closeCustomizer"
    >
      <div class="card customizer-modal-card">
        <!-- Header -->
        <div class="customizer-header">
          <div class="header-title-wrap">
            <span class="modal-coffee-icon"></span>
            <div>
              <h3>تخصيص مواصفات البن / الطلب</h3>
              <p class="custom-prod-title">{{ activeCustomProduct.name_ar }}</p>
            </div>
          </div>
          <button type="button" class="close-custom-btn" @click="closeCustomizer"></button>
        </div>

        <div class="customizer-body">
          <!-- 1. درجة الطحن -->
          <div class="custom-section">
            <label class="custom-sec-title"> درجة الطحن المطلوبة:</label>
            <div class="custom-options-grid">
              <button
                v-for="grind in grindOptions"
                :key="grind.id"
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedGrind === grind.label }"
                @click="selectedGrind = grind.label"
              >
                <span class="pill-emoji">{{ grind.icon }}</span>
                <span>{{ grind.label }}</span>
              </button>
            </div>
          </div>

          <!-- 2. درجة التحميص -->
          <div class="custom-section">
            <label class="custom-sec-title"> درجة التحميص:</label>
            <div class="custom-options-grid cols-4">
              <button
                v-for="roast in roastOptions"
                :key="roast.id"
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedRoast === roast.label }"
                @click="selectedRoast = roast.label"
              >
                <span class="pill-emoji">{{ roast.icon }}</span>
                <span>{{ roast.label }}</span>
              </button>
            </div>
          </div>

          <!-- 3. إضافات التحويجة -->
          <div class="custom-section">
            <label class="custom-sec-title"> إضافات التحويجة والحبهان:</label>
            <div class="custom-options-grid cols-3">
              <button
                v-for="spice in spiceOptions"
                :key="spice.id"
                type="button"
                class="option-pill-btn"
                :class="{ active: selectedSpices === spice.label }"
                @click="selectedSpices = spice.label"
              >
                <span class="pill-emoji">{{ spice.icon }}</span>
                <span>{{ spice.label }}</span>
              </button>
            </div>
          </div>

          <!-- 4. الوزن / الكمية السريعة -->
          <div class="custom-section">
            <label class="custom-sec-title"> الوزن / الحجم المطلوب:</label>
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
  addToCart: [product: any, customQty?: number, customNotes?: string];
  'update:productSearch': [v: string];
  'update:selectedCategory': [v: any];
  filter: [];
}>();

const searchInputRef = ref<HTMLInputElement | null>(null);

// ───  Point 7: View Mode State (3d | compact | color) ───
const viewMode = ref<'3d' | 'compact' | 'color'>(
  (localStorage.getItem('pos_view_mode') as any) || '3d',
);

const setViewMode = (mode: '3d' | 'compact' | 'color') => {
  viewMode.value = mode;
  localStorage.setItem('pos_view_mode', mode);
};

// ───  Point 2: Pinned Fast Keys Logic (Top Popular Items) ───
const fastKeyProducts = computed(() => {
  if (!props.filteredProducts.length) return [];
  // Return first 6 items or items with high velocity
  return props.filteredProducts.slice(0, 6);
});

// ───  Point 1: Coffee Customizer State & Options ───
const showCustomizerModal = ref(false);
const activeCustomProduct = ref<any>(null);

const grindOptions = [
  { id: 'beans', label: 'حبوب كاملة', icon: '' },
  { id: 'turkish', label: 'تركي ناعم', icon: '' },
  { id: 'espresso', label: 'إسبريسو', icon: '' },
  { id: 'v60', label: 'فلتر V60', icon: '' },
  { id: 'french', label: 'فرنش برس', icon: '' },
  { id: 'moka', label: 'موكا بوت', icon: '' },
];

const roastOptions = [
  { id: 'light', label: 'فاتح', icon: '' },
  { id: 'medium', label: 'وسط', icon: '' },
  { id: 'dark', label: 'غامق', icon: '' },
  { id: 'med_dark', label: 'وسط مع غامق', icon: '' },
];

const spiceOptions = [
  { id: 'plain', label: 'بدون حبهان (سادة)', icon: '' },
  { id: 'light_card', label: 'حبهان خفيف', icon: '' },
  { id: 'med_card', label: 'حبهان مظبوط', icon: '' },
  { id: 'extra_card', label: 'حبهان زيادة', icon: '' },
  { id: 'mastic', label: 'مستكة وحبهان', icon: '' },
  { id: 'special', label: 'تحويجة العجوز الملكية', icon: '' },
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

// ─── Long Press Detection ───
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

const getCategoryIcon = (name: string) => {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('ساخن') || n.includes('قهو') || n.includes('اسبريسو')) return '';
  if (n.includes('بارد') || n.includes('مثلج') || n.includes('ايس')) return '';
  if (
    n.includes('بن') ||
    n.includes('حبوب') ||
    n.includes('طحن') ||
    n.includes('تركي') ||
    n.includes('توليف')
  )
    return '';
  if (n.includes('حلوي') || n.includes('كيك') || n.includes('شوكولات') || n.includes('وافل'))
    return '';
  if (n.includes('عصير') || n.includes('سموذي') || n.includes('موهيتو')) return '';
  if (n.includes('شاي') || n.includes('أعشاب') || n.includes('كركديه')) return '';
  if (n.includes('ساندوتش') || n.includes('اكل') || n.includes('وجب') || n.includes('كرواسون'))
    return '';
  if (n.includes('صوص') || n.includes('نكه') || n.includes('سيرب') || n.includes('إضاف')) return '';
  return '';
};

const getCategoryColorKey = (catName: string) => {
  if (!catName) return 'gold';
  const n = catName.toLowerCase();
  if (n.includes('ساخن') || n.includes('قهو')) return 'coffee';
  if (n.includes('بارد') || n.includes('مثلج') || n.includes('ايس')) return 'ice';
  if (n.includes('بن') || n.includes('حبوب') || n.includes('توليف')) return 'beans';
  if (n.includes('حلوي') || n.includes('كيك')) return 'dessert';
  if (n.includes('عصير') || n.includes('موهيتو')) return 'juice';
  return 'gold';
};

const currentCategoryName = computed(() => {
  if (!props.selectedCategory) return 'كل المنتجات';
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? cat.name_ar : 'كل المنتجات';
});

const currentCategoryIcon = computed(() => {
  if (!props.selectedCategory) return '';
  const cat = props.categories.find((c: any) => String(c.id) === String(props.selectedCategory));
  return cat ? getCategoryIcon(cat.name_ar) : '';
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

/** يُستخدم من الأب لتركيز حقل البحث عبر اختصار F2 أو F7 */
defineExpose({
  focusSearch: () => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  },
});
</script>

<style lang="scss" scoped>
/* FULL CATALOG PANEL WITH 3D TACTILE BUTTON CARDS & DENSITY MODES */

.full-catalog-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 18px;
  min-height: calc(100vh - 180px);
}

/* ── Top Header Bar ── */
.catalog-top-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  padding-bottom: 10px;
}

.search-and-status-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 260px;

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
    padding: 10px 40px 10px 34px;
    border: 1.5px solid var(--border, rgba(212, 163, 115, 0.3));
    border-radius: 14px;
    background: var(--bg, #140d08);
    font-size: 0.92rem;
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
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: var(--text-muted, #a89f91);
    cursor: pointer;
    font-size: 0.85rem;
    width: 22px;
    height: 22px;
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

/* ──  Point 7: View Mode Switch Group ── */
.view-mode-switch-group {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(212, 163, 115, 0.25);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
}

.mode-switch-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 9px;
  color: var(--text-muted, #a89f91);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;

  .btn-icon {
    font-size: 0.85rem;
  }

  &:hover {
    color: #faedcd;
    background: rgba(212, 163, 115, 0.1);
  }

  &.active {
    background: #d4a373;
    color: #140d08;
    font-weight: 800;
    box-shadow: 0 2px 8px rgba(212, 163, 115, 0.35);
  }
}

.active-cat-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(212, 163, 115, 0.12);
  border: 1px solid rgba(212, 163, 115, 0.3);
  padding: 6px 14px;
  border-radius: 12px;
  font-size: 0.82rem;
  white-space: nowrap;

  .cat-ind-icon {
    font-size: 1rem;
  }
  .cat-ind-name {
    color: var(--primary, #d4a373);
    font-weight: 800;
  }
  .cat-ind-count {
    color: var(--text-muted, #a89f91);
    font-size: 0.76rem;
  }
}

/* ──  Point 2: Pinned Fast Keys Ribbon ── */
.fast-keys-ribbon {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(212, 163, 115, 0.08);
  border: 1px dashed rgba(212, 163, 115, 0.35);
  border-radius: 12px;
  padding: 6px 12px;
}

.fast-keys-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 800;
  color: #faedcd;
  white-space: nowrap;
}

.fast-keys-scroll {
  display: flex;
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
  background: linear-gradient(145deg, #2a1a0f 0%, #1c1008 100%);
  border: 1px solid rgba(212, 163, 115, 0.4);
  border-radius: 10px;
  color: #faedcd;
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
  transition: all 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: #faedcd;
    background: #d4a373;
    color: #140d08;
  }

  &.in-cart {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }

  .fast-key-badge {
    background: #d4a373;
    color: #140d08;
    font-size: 0.7rem;
    font-weight: 900;
    padding: 1px 5px;
    border-radius: 8px;
  }
}

/* ── Horizontal Category Navigation ── */
.horizontal-categories-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.categories-scroll-track {
  display: flex;
  gap: 8px;
  padding: 2px;
}

.cat-tab-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 24px;
  color: var(--text-muted, #d4a373);
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

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

/* GRID DENSITY AND CARD MODES */

.catalog-grid-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px 20px 2px;
}

/* 1. Mode 3D (Default Tactile) */
.products-grid-container.mode-3d {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;

  .product-tile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 105px;
    padding: 16px 14px;
    border-radius: 16px;
    cursor: pointer;
    user-select: none;
    background: linear-gradient(180deg, #2b1a10 0%, #1a0f07 100%);
    border: 1px solid rgba(212, 163, 115, 0.28);
    border-top: 2px solid rgba(250, 237, 205, 0.45);
    box-shadow:
      0 7px 0 #0c0704,
      0 10px 18px rgba(0, 0, 0, 0.65),
      inset 0 1px 1px rgba(255, 255, 255, 0.15),
      inset 0 -2px 4px rgba(0, 0, 0, 0.4);
    transition: all 0.12s cubic-bezier(0.2, 0.8, 0.4, 1);

    &:hover {
      transform: translateY(-3px);
      border-color: rgba(212, 163, 115, 0.6);
      box-shadow:
        0 10px 0 #0c0704,
        0 14px 24px rgba(0, 0, 0, 0.75);
    }

    &:active {
      transform: translateY(6px);
      box-shadow:
        0 1px 0 #0c0704,
        inset 0 3px 6px rgba(0, 0, 0, 0.6);
    }

    &.is-selected {
      background: linear-gradient(180deg, #3d2414 0%, #26160c 100%);
      border-color: #d4a373;
      box-shadow:
        0 7px 0 #120904,
        0 0 14px rgba(212, 163, 115, 0.35);
    }
  }
}

/* 2. Mode Compact (Small fast matrix) */
.products-grid-container.mode-compact {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;

  .product-tile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 65px;
    padding: 10px 8px;
    border-radius: 10px;
    cursor: pointer;
    background: rgba(35, 22, 14, 0.9);
    border: 1.5px solid rgba(212, 163, 115, 0.25);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition: all 0.12s ease;

    &:hover {
      transform: translateY(-2px);
      border-color: #d4a373;
      background: rgba(55, 34, 22, 0.95);
    }

    &.is-selected {
      border-color: #faedcd;
      background: #4a2817;
    }

    .product-main-name {
      font-size: 0.88rem;
    }
  }
}

/* 3. Mode Color-Coded (Vibrant categories) */
.products-grid-container.mode-color {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;

  .product-tile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: 85px;
    padding: 12px;
    border-radius: 14px;
    cursor: pointer;
    background: rgba(20, 13, 8, 0.9);
    border-width: 2px;
    border-style: solid;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    transition: all 0.15s ease;

    &.cat-color-coffee {
      border-color: #b07d4b;
      background: rgba(176, 125, 75, 0.12);
    }
    &.cat-color-beans {
      border-color: #e6b800;
      background: rgba(230, 184, 0, 0.12);
    }
    &.cat-color-ice {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }
    &.cat-color-dessert {
      border-color: #f472b6;
      background: rgba(244, 114, 182, 0.12);
    }
    &.cat-color-juice {
      border-color: #4ade80;
      background: rgba(74, 222, 128, 0.12);
    }
    &.cat-color-gold {
      border-color: #d4a373;
      background: rgba(212, 163, 115, 0.12);
    }

    &:hover {
      transform: translateY(-2px);
      filter: brightness(1.2);
    }
  }
}

/* ── Center Name Typography ── */
.tile-center-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.product-main-name {
  font-size: 1.02rem;
  font-weight: 850;
  color: #f7ede2;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

/* ── Badges & Buttons on Card ── */
.tile-stock-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 7px;
  height: 7px;
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

.tile-customize-btn {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(212, 163, 115, 0.25);
  border-radius: 6px;
  font-size: 0.72rem;
  padding: 2px 5px;
  cursor: pointer;
  opacity: 0.65;
  transition: all 0.15s ease;

  &:hover {
    opacity: 1;
    background: #d4a373;
    color: #140d08;
  }
}

.tile-qty-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  min-width: 24px;
  height: 24px;
  padding: 0 5px;
  border-radius: 12px;
  background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
  color: #140d08;
  font-size: 0.8rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #faedcd;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
  z-index: 5;
}

.specular-highlight {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 35%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 100%);
  border-radius: 15px 15px 0 0;
  pointer-events: none;
}

.skeleton-tile {
  min-height: 95px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
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

/* CUSTOMIZER MODAL (Point 1: Long-Press / Customizer Modal) */

.customizer-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
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
  background: #1b120c;
  border: 2px solid #d4a373;
  border-radius: 20px;
  padding: 20px;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.8),
    0 0 24px rgba(212, 163, 115, 0.25);
  animation: modalScale 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalScale {
  0% {
    transform: scale(0.92);
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
  border-bottom: 1px solid rgba(212, 163, 115, 0.25);
  margin-bottom: 14px;

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;

    .modal-coffee-icon {
      font-size: 1.6rem;
    }

    h3 {
      margin: 0;
      color: #faedcd;
      font-size: 1.1rem;
      font-weight: 850;
    }

    .custom-prod-title {
      margin: 2px 0 0;
      font-size: 0.85rem;
      color: #d4a373;
      font-weight: 700;
    }
  }

  .close-custom-btn {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #fff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 1rem;
    cursor: pointer;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
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
    font-size: 0.82rem;
    font-weight: 750;
    color: #d4a373;
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 163, 115, 0.25);
  border-radius: 10px;
  color: #faedcd;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;

  .pill-emoji {
    font-size: 0.9rem;
  }

  &:hover {
    background: rgba(212, 163, 115, 0.2);
    border-color: #d4a373;
  }

  &.active {
    background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
    color: #140d08;
    border-color: #faedcd;
    font-weight: 850;
    box-shadow: 0 3px 10px rgba(212, 163, 115, 0.35);
  }

  &.highlight {
    background: rgba(212, 163, 115, 0.15);
  }
}

.spec-summary-badge {
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed #d4a373;
  border-radius: 10px;
  padding: 8px 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.8rem;

  .spec-label {
    color: #d4a373;
    font-weight: 700;
    white-space: nowrap;
  }

  .spec-text {
    color: #ffffff;
  }
}

.customizer-footer {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(212, 163, 115, 0.25);

  .add-custom-btn {
    flex: 1;
    background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
    border: 1px solid #faedcd;
    color: #140d08;
    font-weight: 850;
    padding: 10px;
    border-radius: 12px;
    cursor: pointer;
  }
}
</style>
