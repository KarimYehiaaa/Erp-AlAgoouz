<template>
  <div class="menu-print-document" :class="`theme-${menuData.theme || 'coffee-gold'}`">
    <!-- ═══════════════════ الصفحة الأولى: الوجه (FRONT PAGE) ═══════════════════ -->
    <div class="menu-sheet page-front">
      <div class="sheet-frame-outer">
        <div class="sheet-frame-inner">
          <!-- زوايا زخرفية ملكية -->
          <div class="corner-flourish top-right"></div>
          <div class="corner-flourish top-left"></div>
          <div class="corner-flourish bottom-right"></div>
          <div class="corner-flourish bottom-left"></div>

          <!-- الترويسة الرئيسية للوجه -->
          <header class="menu-header">
            <div class="brand-crest">
              <div class="coffee-emblem">☕</div>
              <h1 class="brand-title">{{ menuData.title_ar || 'بن العجوز' }}</h1>
              <p class="brand-subtitle">
                {{ menuData.subtitle_ar || 'أصل القهوة والتوليفات الفاخرة منذ 1980' }}
              </p>
              <div class="ornament-divider">
                <span class="line"></span>
                <span class="diamond">◆</span>
                <span class="star">★</span>
                <span class="diamond">◆</span>
                <span class="line"></span>
              </div>
            </div>
            <div class="page-badge-ribbon">
              <span>قائمة توليفات وأصناف البن الفاخر</span>
            </div>
          </header>

          <!-- شبكة تصنيفات الوجه (Front Categories) -->
          <main class="menu-content-grid">
            <div
              v-for="cat in frontCategories"
              :key="cat.id || cat.name_ar"
              class="category-block"
              :class="{ 'full-width': cat.column_span === 2 }"
            >
              <div class="category-header">
                <div class="cat-title-wrap">
                  <span class="cat-icon">{{ getCatIcon(cat.icon_name) }}</span>
                  <h2 class="cat-title">{{ cat.name_ar }}</h2>
                </div>
                <p v-if="cat.subtitle_ar" class="cat-subtitle">{{ cat.subtitle_ar }}</p>
                <div class="cat-divider"></div>
              </div>

              <div class="items-list">
                <div
                  v-for="item in cat.items"
                  :key="item.id || item.name_ar"
                  class="menu-item-row"
                  :class="{ 'featured-item': item.is_featured }"
                >
                  <div class="item-info">
                    <div class="item-name-line">
                      <span class="item-name">{{ item.name_ar }}</span>
                      <span v-if="item.is_featured" class="badge-featured">⭐ مميز</span>
                      <span v-if="item.is_new" class="badge-new">جديد</span>
                    </div>
                    <p v-if="item.description_ar" class="item-desc">{{ item.description_ar }}</p>
                  </div>

                  <div class="item-leader-dots"></div>

                  <div class="item-price-box">
                    <template
                      v-if="
                        item.pricing_type === 'weights' ||
                        item.price_eighth ||
                        item.price_quarter ||
                        item.price_half ||
                        item.price_kilo
                      "
                    >
                      <div class="weights-pricing-matrix">
                        <div
                          v-if="item.price_eighth"
                          class="weight-chip"
                          title="سعر ثمن كيلو (125 جرام)"
                        >
                          <span class="w-label">ثمن:</span>
                          <span class="w-val">{{ formatPrice(item.price_eighth) }}</span>
                        </div>
                        <div
                          v-if="item.price_quarter"
                          class="weight-chip"
                          title="سعر ربع كيلو (250 جرام)"
                        >
                          <span class="w-label">ربع:</span>
                          <span class="w-val">{{ formatPrice(item.price_quarter) }}</span>
                        </div>
                        <div
                          v-if="item.price_half"
                          class="weight-chip"
                          title="سعر نصف كيلو (500 جرام)"
                        >
                          <span class="w-label">نصف:</span>
                          <span class="w-val">{{ formatPrice(item.price_half) }}</span>
                        </div>
                        <div
                          v-if="item.price_kilo"
                          class="weight-chip highlight"
                          title="سعر كيلو كامل (1000 جرام)"
                        >
                          <span class="w-label">كيلو:</span>
                          <span class="w-val">{{ formatPrice(item.price_kilo) }}</span>
                        </div>
                        <span class="price-currency">ج.م</span>
                      </div>
                    </template>
                    <template v-else-if="item.price_secondary">
                      <div class="dual-price">
                        <span class="price-val">{{ formatPrice(item.price) }}</span>
                        <span class="price-slash">/</span>
                        <span class="price-val secondary">{{
                          formatPrice(item.price_secondary)
                        }}</span>
                        <span class="price-currency">ج.م</span>
                      </div>
                    </template>
                    <template v-else>
                      <span class="item-price">{{ formatPrice(item.price) }}</span>
                      <span class="price-currency">ج.م</span>
                      <span v-if="item.unit_label_ar" class="unit-label"
                        >/ {{ item.unit_label_ar }}</span
                      >
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <!-- شريط سفلي جمالي للصفحة الأولى -->
          <footer class="front-mini-footer">
            <span class="seal-text">✨ تحميص طازج يومياً بأحدث التقنيات الإيطالية ✨</span>
            <span class="page-num">الصفحة ١ من ٢</span>
          </footer>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ الصفحة الثانية: الظهر (BACK PAGE) ═══════════════════ -->
    <div class="menu-sheet page-back">
      <div class="sheet-frame-outer">
        <div class="sheet-frame-inner">
          <!-- زوايا زخرفية ملكية -->
          <div class="corner-flourish top-right"></div>
          <div class="corner-flourish top-left"></div>
          <div class="corner-flourish bottom-right"></div>
          <div class="corner-flourish bottom-left"></div>

          <!-- ترويسة الصفحة الثانية -->
          <header class="menu-header back-header">
            <div class="brand-crest mini">
              <h2 class="brand-title mini">{{ menuData.title_ar || 'بن العجوز' }}</h2>
              <div class="page-badge-ribbon secondary">
                <span>المشروبات الساخنة والباردة والإضافات الخاصة</span>
              </div>
            </div>
          </header>

          <!-- شبكة تصنيفات الظهر (Back Categories) -->
          <main class="menu-content-grid back-grid">
            <div
              v-for="cat in backCategories"
              :key="cat.id || cat.name_ar"
              class="category-block"
              :class="{ 'full-width': cat.column_span === 2 }"
            >
              <div class="category-header">
                <div class="cat-title-wrap">
                  <span class="cat-icon">{{ getCatIcon(cat.icon_name) }}</span>
                  <h2 class="cat-title">{{ cat.name_ar }}</h2>
                </div>
                <p v-if="cat.subtitle_ar" class="cat-subtitle">{{ cat.subtitle_ar }}</p>
                <div class="cat-divider"></div>
              </div>

              <div class="items-list">
                <div
                  v-for="item in cat.items"
                  :key="item.id || item.name_ar"
                  class="menu-item-row"
                  :class="{ 'featured-item': item.is_featured }"
                >
                  <div class="item-info">
                    <div class="item-name-line">
                      <span class="item-name">{{ item.name_ar }}</span>
                      <span v-if="item.is_featured" class="badge-featured">⭐ الأكثر طلباً</span>
                    </div>
                    <p v-if="item.description_ar" class="item-desc">{{ item.description_ar }}</p>
                  </div>

                  <div class="item-leader-dots"></div>

                  <div class="item-price-box">
                    <template
                      v-if="
                        item.pricing_type === 'weights' ||
                        item.price_eighth ||
                        item.price_quarter ||
                        item.price_half ||
                        item.price_kilo
                      "
                    >
                      <div class="weights-pricing-matrix">
                        <div v-if="item.price_eighth" class="weight-chip">
                          <span class="w-label">ثمن:</span>
                          <span class="w-val">{{ formatPrice(item.price_eighth) }}</span>
                        </div>
                        <div v-if="item.price_quarter" class="weight-chip">
                          <span class="w-label">ربع:</span>
                          <span class="w-val">{{ formatPrice(item.price_quarter) }}</span>
                        </div>
                        <div v-if="item.price_half" class="weight-chip">
                          <span class="w-label">نصف:</span>
                          <span class="w-val">{{ formatPrice(item.price_half) }}</span>
                        </div>
                        <div v-if="item.price_kilo" class="weight-chip highlight">
                          <span class="w-label">كيلو:</span>
                          <span class="w-val">{{ formatPrice(item.price_kilo) }}</span>
                        </div>
                        <span class="price-currency">ج.م</span>
                      </div>
                    </template>
                    <template v-else-if="item.price_secondary">
                      <div class="dual-price">
                        <span class="price-val">{{ formatPrice(item.price) }}</span>
                        <span class="price-slash">/</span>
                        <span class="price-val secondary">{{
                          formatPrice(item.price_secondary)
                        }}</span>
                        <span class="price-currency">ج.م</span>
                      </div>
                    </template>
                    <template v-else>
                      <span class="item-price">{{ formatPrice(item.price) }}</span>
                      <span class="price-currency">ج.م</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <!-- التذييل الكامل لبيانات التواصل والعنوان -->
          <footer class="menu-master-footer">
            <div class="footer-columns">
              <div class="footer-contact-info">
                <h4 class="footer-heading">📍 زيارتكم تسعدنا</h4>
                <p class="footer-text">{{ menuData.address_ar || 'الفرع الرئيسي - مصر' }}</p>
                <div class="phones-wrap">
                  <span class="phone-item">📞 {{ menuData.phone_primary || '01000000000' }}</span>
                  <span v-if="menuData.phone_secondary" class="phone-item">
                    | 📱 {{ menuData.phone_secondary }}</span
                  >
                </div>
              </div>

              <div class="footer-social-wrap">
                <h4 class="footer-heading">🌐 تابعنا على السوشيال ميديا</h4>
                <div class="social-tags">
                  <span v-if="menuData.facebook_handle" class="social-badge"
                    >f /{{ menuData.facebook_handle }}</span
                  >
                  <span v-if="menuData.instagram_handle" class="social-badge"
                    >📸 @{{ menuData.instagram_handle }}</span
                  >
                </div>
              </div>

              <div v-if="menuData.show_qr_code !== false" class="footer-qr-col">
                <div class="qr-mockup">
                  <div class="qr-pattern">
                    <span class="qr-icon">📱</span>
                  </div>
                  <span class="qr-caption">امسح للطلب</span>
                </div>
              </div>
            </div>

            <div class="footer-bottom-bar">
              <span>جميع أسعارنا شاملة الخدمة والضريبة • نضمن جودة البن الفاخر 100%</span>
              <span class="page-num">الصفحة ٢ من ٢</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  menuData: {
    title_ar?: string;
    subtitle_ar?: string;
    theme?: string;
    logo_url?: string;
    phone_primary?: string;
    phone_secondary?: string;
    address_ar?: string;
    facebook_handle?: string;
    instagram_handle?: string;
    show_qr_code?: boolean;
    categories?: Array<{
      id?: number;
      name_ar: string;
      subtitle_ar?: string;
      page_side: 'front' | 'back';
      sort_order?: number;
      icon_name?: string;
      column_span?: number;
      items?: Array<{
        id?: number;
        name_ar: string;
        description_ar?: string;
        price: number;
        price_secondary?: number | null;
        pricing_type?: 'single' | 'weights' | 'dual';
        price_eighth?: number | null;
        price_quarter?: number | null;
        price_half?: number | null;
        price_kilo?: number | null;
        unit_label_ar?: string;
        is_featured?: boolean;
        is_new?: boolean;
      }>;
    }>;
  };
}>();

const frontCategories = computed(() => {
  return (props.menuData.categories || []).filter((c) => c.page_side === 'front');
});

const backCategories = computed(() => {
  return (props.menuData.categories || []).filter((c) => c.page_side === 'back');
});

const formatPrice = (val: number) => {
  return Number(val || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const getCatIcon = (iconName?: string) => {
  switch (iconName) {
    case 'star':
      return '⭐';
    case 'coffee':
      return '☕';
    case 'sparkles':
      return '✨';
    case 'flame':
      return '🔥';
    case 'snowflake':
      return '❄️';
    case 'heart':
      return '❤️';
    default:
      return '☕';
  }
};
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
   THEME STYLING & A4 PRINT READY LAYOUT (210mm x 297mm)
   ═══════════════════════════════════════════════════════════════════ */

.menu-print-document {
  font-family: var(--font-ui);
  direction: rtl;
  color: var(--menu-text);
  background-color: var(--menu-bg);
  box-sizing: border-box;
}

/* 🎨 THEME 1: COFFEE GOLD (بن العجوز الملكي) */
.theme-coffee-gold {
  --menu-bg: #fdfaf6;
  --menu-sheet-bg: #ffffff;
  --menu-primary: #5c3d2e;
  --menu-accent: #c8956e;
  --menu-accent-dark: #8a572a;
  --menu-text: #2c1810;
  --menu-text-muted: #8a786a;
  --menu-border-outer: #c8956e;
  --menu-border-inner: #5c3d2e;
  --menu-badge-bg: #faf3eb;
}

/* 🎨 THEME 2: MODERN DARK (دارك كافيه مودرن) */
.theme-modern-dark {
  --menu-bg: #121214;
  --menu-sheet-bg: #1a1614;
  --menu-primary: #f5ebe0;
  --menu-accent: #d4a373;
  --menu-accent-dark: #c8956e;
  --menu-text: #faedcd;
  --menu-text-muted: #b7a192;
  --menu-border-outer: #d4a373;
  --menu-border-inner: #3d2a20;
  --menu-badge-bg: #2b1f1a;
}

/* 🎨 THEME 3: WARM CREAM (كريمي كلاسيك) */
.theme-warm-cream {
  --menu-bg: #f5ebe0;
  --menu-sheet-bg: #fefae0;
  --menu-primary: #4a3427;
  --menu-accent: #b47b48;
  --menu-accent-dark: #84532b;
  --menu-text: #36251b;
  --menu-text-muted: #755f52;
  --menu-border-outer: #b47b48;
  --menu-border-inner: #5c4033;
  --menu-badge-bg: #ede4d8;
}

/* هيكل ورقة A4 */
.menu-sheet {
  width: 210mm;
  min-height: 297mm;
  max-height: 297mm;
  padding: 8mm;
  margin: 0 auto 24px auto;
  box-sizing: border-box;
  background-color: var(--menu-sheet-bg);
  box-shadow: 0 10px 30px rgba(44, 24, 16, 0.12);
  position: relative;
  page-break-after: always;
  display: flex;
  flex-direction: column;
}

/* الإطارات الزخرفية المزدوجة المتناسقة */
.sheet-frame-outer {
  border: 2px solid var(--menu-border-outer);
  padding: 4px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
}

.sheet-frame-inner {
  border: 1px solid var(--menu-border-inner);
  padding: 14px 18px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
}

/* زوايا زخرفية */
.corner-flourish {
  position: absolute;
  width: 14px;
  height: 14px;
  border-color: var(--menu-accent);
}
.corner-flourish.top-right {
  top: 4px;
  right: 4px;
  border-top: 2px solid var(--menu-accent);
  border-right: 2px solid var(--menu-accent);
}
.corner-flourish.top-left {
  top: 4px;
  left: 4px;
  border-top: 2px solid var(--menu-accent);
  border-left: 2px solid var(--menu-accent);
}
.corner-flourish.bottom-right {
  bottom: 4px;
  right: 4px;
  border-bottom: 2px solid var(--menu-accent);
  border-right: 2px solid var(--menu-accent);
}
.corner-flourish.bottom-left {
  bottom: 4px;
  left: 4px;
  border-bottom: 2px solid var(--menu-accent);
  border-left: 2px solid var(--menu-accent);
}

/* ترويسة المنيو */
.menu-header {
  text-align: center;
  margin-bottom: 12px;
}

.coffee-emblem {
  font-size: 26px;
  margin-bottom: 2px;
}

.brand-title {
  font-family: var(--font-calligraphy), var(--font-ui);
  font-size: 32px;
  font-weight: 700;
  color: var(--menu-primary);
  margin: 0;
  line-height: 1.1;
}

.brand-title.mini {
  font-size: 22px;
}

.brand-subtitle {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--menu-accent-dark);
  margin: 3px 0 6px 0;
}

.ornament-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 4px auto 8px auto;
  width: 55%;
}

.ornament-divider .line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--menu-accent), transparent);
}

.ornament-divider .diamond {
  font-size: 9px;
  color: var(--menu-accent);
}

.ornament-divider .star {
  font-size: 13px;
  color: var(--menu-accent);
}

.page-badge-ribbon {
  display: inline-block;
  background: var(--menu-primary);
  color: #fff;
  padding: 4px 18px;
  border-radius: var(--radius-xl);
  font-size: 11.5px;
  font-weight: 700;
  border: 1px solid var(--menu-accent);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.page-badge-ribbon.secondary {
  background: var(--menu-badge-bg);
  color: var(--menu-primary);
  border-color: var(--menu-accent);
}

/* شبكة التصنيفات */
.menu-content-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 18px;
  flex: 1;
  align-content: start;
}

.category-block {
  break-inside: avoid;
}

.category-block.full-width {
  grid-column: span 2;
}

.category-header {
  margin-bottom: 6px;
}

.cat-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cat-icon {
  font-size: 15px;
}

.cat-title {
  font-size: 15.5px;
  font-weight: 800;
  color: var(--menu-primary);
  margin: 0;
}

.cat-subtitle {
  font-size: 10px;
  color: var(--menu-text-muted);
  margin: 2px 0 0 0;
}

.cat-divider {
  height: 1.5px;
  background: linear-gradient(to left, var(--menu-accent), transparent);
  margin-top: 3px;
}

/* سطور الأصناف */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.menu-item-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 0;
}

.menu-item-row.featured-item {
  background: linear-gradient(to left, rgba(200, 149, 110, 0.12), transparent);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.item-info {
  flex: 0 1 auto;
  max-width: 65%;
}

.item-name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--menu-text);
}

.item-desc {
  font-size: 9.5px;
  color: var(--menu-text-muted);
  margin: 1px 0 0 0;
  line-height: 1.3;
}

.badge-featured,
.badge-new {
  font-size: 8.5px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
}

.badge-featured {
  background: var(--menu-accent);
  color: #fff;
}

.badge-new {
  background: #15803d;
  color: #fff;
}

/* النقاط الواصلة بين الاسم والسعر (Leader Dots) */
.item-leader-dots {
  flex: 1;
  border-bottom: 1.5px dotted var(--menu-accent);
  opacity: 0.45;
  margin-bottom: 3px;
}

/* مربع السعر */
.item-price-box {
  display: flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
}

.item-price {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--menu-primary);
}

.price-currency {
  font-size: 10px;
  font-weight: 700;
  color: var(--menu-accent-dark);
}

.unit-label {
  font-size: 9px;
  color: var(--menu-text-muted);
}

.dual-price {
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--menu-primary);
}

.dual-price .price-slash {
  color: var(--menu-accent);
  margin: 0 1px;
}

.weights-pricing-matrix {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--menu-badge-bg);
  padding: 1.5px 5px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--menu-border-outer);
}

.weight-chip {
  display: flex;
  align-items: baseline;
  gap: 1.5px;
}

.weight-chip .w-label {
  font-size: 8px;
  font-weight: 700;
  color: var(--menu-text-muted);
}

.weight-chip .w-val {
  font-size: 11px;
  font-weight: 800;
  color: var(--menu-primary);
}

.weight-chip.highlight .w-val {
  color: var(--menu-accent-dark);
  font-weight: 900;
}

/* شريط سفلي للصفحة الأولى */
.front-mini-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px dashed var(--menu-border-outer);
  padding-top: 6px;
  margin-top: auto;
  font-size: 9.5px;
  color: var(--menu-text-muted);
  font-weight: 600;
}

/* التذييل الرئيسي الشامل للصفحة الثانية */
.menu-master-footer {
  margin-top: auto;
  border-top: 2px solid var(--menu-border-outer);
  padding-top: 8px;
}

.footer-columns {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.6fr;
  gap: 12px;
  align-items: center;
}

.footer-heading {
  font-size: 11px;
  font-weight: 800;
  color: var(--menu-primary);
  margin: 0 0 2px 0;
}

.footer-text {
  font-size: 9.5px;
  color: var(--menu-text-muted);
  margin: 0 0 3px 0;
}

.phones-wrap {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--menu-accent-dark);
  direction: ltr;
  text-align: right;
}

.social-tags {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.social-badge {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--menu-text);
  background: var(--menu-badge-bg);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  display: inline-block;
  width: fit-content;
}

.footer-qr-col {
  display: flex;
  justify-content: center;
}

.qr-mockup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.qr-pattern {
  width: 40px;
  height: 40px;
  border: 1.5px solid var(--menu-border-inner);
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: var(--menu-primary);
  font-size: 18px;
}

.qr-caption {
  font-size: 8px;
  font-weight: 700;
  color: var(--menu-text-muted);
}

.footer-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--menu-border-outer);
  font-size: 9px;
  color: var(--menu-text-muted);
  font-weight: 600;
}

/* ═══════════════════════════════════════════════════════════════════
   PRINT MEDIA RULES
   ═══════════════════════════════════════════════════════════════════ */
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  body {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .menu-sheet {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 6mm !important;
    width: 100vw !important;
    height: 100vh !important;
    min-height: 100vh !important;
    max-height: 100vh !important;
    page-break-after: always !important;
    break-after: page !important;
  }
}
</style>
