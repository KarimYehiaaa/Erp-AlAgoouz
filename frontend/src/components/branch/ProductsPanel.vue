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
          <span class="cat-ind-count">{{ filteredProducts.length }} صنف</span>
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

    <!-- ═══════════════════ شبكة المنتجات المجسمة 3D (Tactile 3D Cards Grid) ═══════════════════ -->
    <div class="catalog-grid-wrapper">
      <!-- هيكل التحميل -->
      <div v-if="loadingProducts" class="products-3d-grid">
        <div v-for="i in 12" :key="'sk-prod-' + i" class="product-3d-card skeleton-3d-card">
          <SkeletonLoader type="line" height="22px" width="80%" />
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

      <!-- شبكة بطاقات المنتجات الثلاثية الأبعاد (3D Tactile Buttons) -->
      <div v-else class="products-3d-grid">
        <button
          v-for="product in filteredProducts"
          :key="product.id"
          type="button"
          class="product-3d-card"
          :class="{
            'is-selected': isInCart(product.id),
            'low-stock': hasLowIngredients(product) || getProductStockClass(product) === 'low',
            'is-out-of-stock': getProductStockClass(product) === 'out',
          }"
          @click="handleCardClick(product)"
          :title="
            product.name_ar + (product.sale_price ? ' — ' + formatMoney(product.sale_price) : '')
          "
        >
          <!-- زاوية مؤشر المخزون الخفي/المضيء -->
          <span
            class="card-stock-dot"
            :class="getProductStockClass(product)"
            :title="getProductStockTitle(product)"
          ></span>

          <!-- شارة عدد القطع المختارة في السلة (3D Floating Badge) -->
          <span v-if="isInCart(product.id)" class="cart-qty-3d-badge">
            {{ getCartQty(product.id) }}
          </span>

          <!-- ✨ اسم المنتج الرئيسي (التركيز الكامل والواضح في المنتصف) -->
          <div class="card-center-content">
            <span class="product-title-3d">{{ product.name_ar }}</span>
          </div>

          <!-- طبقة اللمعان والانعكاس الضوئي 3D -->
          <span class="specular-highlight"></span>
        </button>
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
   FULL CATALOG PANEL WITH 3D TACTILE BUTTON CARDS
   ═══════════════════════════════════════════════════════════════════ */

.full-catalog-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 18px;
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

/* ═══════════════════════════════════════════════════════════════════
   3D TACTILE PRODUCT CARDS GRID (تصميم مجسم بارز ثلاثي الأبعاد)
   ═══════════════════════════════════════════════════════════════════ */

.catalog-grid-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px 20px 2px;
}

.products-3d-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

@media (min-width: 1200px) {
  .products-3d-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 18px;
  }
}

@media (min-width: 1600px) {
  .products-3d-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
  }
}

/* ── 3D Tactile Card (الزر المجسم ثلاثي الأبعاد) ── */
.product-3d-card {
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
  text-decoration: none;
  font-family: inherit;
  outline: none;

  /* 3D Base Material & Gradients */
  background: linear-gradient(180deg, #2b1a10 0%, #1a0f07 100%);
  border: 1px solid rgba(212, 163, 115, 0.28);
  border-top: 2px solid rgba(250, 237, 205, 0.45); /* انعكاس الحافة العلوية */

  /* 3D Depth Shadow (بروز مجسم حقيقي) */
  box-shadow:
    0 7px 0 #0c0704,
    /* الحافة السفلية ثلاثية الأبعاد */ 0 10px 18px rgba(0, 0, 0, 0.65),
    /* ظل السقوط */ inset 0 1px 1px rgba(255, 255, 255, 0.15),
    /* بريق داخلي علوي */ inset 0 -2px 4px rgba(0, 0, 0, 0.4); /* ظل سفلي داخلي */

  transition:
    transform 0.12s cubic-bezier(0.2, 0.8, 0.4, 1),
    box-shadow 0.12s cubic-bezier(0.2, 0.8, 0.4, 1),
    border-color 0.15s ease,
    background 0.15s ease;

  /* ── 3D Hover State (ارتفاع إضافي للزر) ── */
  &:hover {
    transform: translateY(-3px);
    border-color: rgba(212, 163, 115, 0.6);
    border-top-color: #faedcd;
    background: linear-gradient(180deg, #382215 0%, #20130a 100%);
    box-shadow:
      0 10px 0 #0c0704,
      0 14px 24px rgba(0, 0, 0, 0.75),
      inset 0 1px 2px rgba(255, 255, 255, 0.25),
      inset 0 -2px 4px rgba(0, 0, 0, 0.3);

    .product-title-3d {
      color: #ffffff;
      text-shadow: 0 0 12px rgba(212, 163, 115, 0.5);
    }
  }

  /* ── 3D Active/Click Press (كبسة ملموسة بالكامل إلى الداخل) ── */
  &:active {
    transform: translateY(6px);
    box-shadow:
      0 1px 0 #0c0704,
      0 2px 6px rgba(0, 0, 0, 0.4),
      inset 0 3px 6px rgba(0, 0, 0, 0.6);
    background: linear-gradient(180deg, #1c1008 0%, #2b1a10 100%);
  }

  /* ── Selected State (حالة التحديد عند الإضافة للسلة) ── */
  &.is-selected {
    background: linear-gradient(180deg, #3d2414 0%, #26160c 100%);
    border-color: #d4a373;
    border-top-color: #faedcd;
    box-shadow:
      0 7px 0 #120904,
      0 10px 20px rgba(212, 163, 115, 0.25),
      0 0 14px rgba(212, 163, 115, 0.3),
      inset 0 1px 2px rgba(250, 237, 205, 0.4);

    .product-title-3d {
      color: #faedcd;
      font-weight: 900;
    }
  }

  /* حالة نفاذ المخزون */
  &.is-out-of-stock {
    opacity: 0.55;
    filter: grayscale(0.5);
  }
}

/* ── محتوى البطاقة في المنتصف (اسم المنتج فقط) ── */
.card-center-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 4px;
}

.product-title-3d {
  font-size: 1.05rem;
  font-weight: 850;
  color: #f7ede2;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  letter-spacing: 0.2px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
  transition:
    color 0.15s ease,
    text-shadow 0.15s ease;
}

/* ── 3D Floating Cart Badge (شارة الكمية المجسمة) ── */
.cart-qty-3d-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 13px;
  background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
  color: #140d08;
  font-size: 0.82rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #faedcd;
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.5),
    0 0 8px rgba(212, 163, 115, 0.5);
  animation: badgePop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 5;
}

@keyframes badgePop {
  0% {
    transform: scale(0.5);
  }
  100% {
    transform: scale(1);
  }
}

/* ── مؤشر المخزون ── */
.card-stock-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
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

/* طبقة الانعكاس الضوئي */
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

.skeleton-3d-card {
  min-height: 105px;
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
</style>
