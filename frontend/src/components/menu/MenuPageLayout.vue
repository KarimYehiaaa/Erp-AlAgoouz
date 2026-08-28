<template>
  <div class="menu-print-document" :class="`theme-${menuData.theme || 'coffee-gold'}`">
    <!-- ═══════════════════════════════════════════════════════════════════════
         الصفحة الأولى: الوجه (FRONT PAGE - ROASTERY & BLENDS)
         ═══════════════════════════════════════════════════════════════════════ -->
    <div class="menu-sheet page-front">
      <!-- خلفية زخرفية لحبوب القهوة والأرابيسك -->
      <div class="sheet-bg-decorations">
        <!-- حبوب قهوة في الخلفية (SVG Watermark) -->
        <svg class="bg-bean-watermark bean-top-left" viewBox="0 0 100 100" fill="currentColor">
          <path
            d="M50 10 C25 10 10 30 10 55 C10 80 30 95 55 95 C80 95 95 75 95 50 C95 25 75 10 50 10 Z M50 20 C68 20 80 32 80 50 C80 68 65 82 50 82 C48 82 45 70 52 50 C58 32 50 20 50 20 Z"
            opacity="0.06"
          />
        </svg>
        <svg class="bg-bean-watermark bean-bottom-right" viewBox="0 0 100 100" fill="currentColor">
          <path
            d="M50 10 C25 10 10 30 10 55 C10 80 30 95 55 95 C80 95 95 75 95 50 C95 25 75 10 50 10 Z M50 20 C68 20 80 32 80 50 C80 68 65 82 50 82 C48 82 45 70 52 50 C58 32 50 20 50 20 Z"
            opacity="0.06"
          />
        </svg>
      </div>

      <!-- الإطار الخارجي والداخلي الملكي المزدوج -->
      <div class="sheet-outer-frame">
        <div class="sheet-inner-frame">
          <!-- زوايا الأرابيسك الذهبية -->
          <div class="vintage-corner top-right"></div>
          <div class="vintage-corner top-left"></div>
          <div class="vintage-corner bottom-right"></div>
          <div class="vintage-corner bottom-left"></div>

          <!-- ─── ترويسة المنيو الملكية مع اللوجو وحبوب القهوة ─── -->
          <header class="luxury-menu-header">
            <!-- الشعار الرسمي لبن العجوز في ميدالية ذهبية -->
            <div class="logo-medal-wrapper">
              <div class="medal-gold-ring">
                <img
                  :src="menuData.logo_url || '/logo-transparent.png'"
                  class="brand-logo-img"
                  alt="شعار بن العجوز"
                  @error="onLogoError"
                />
              </div>
            </div>

            <!-- اسم البراند والشعار -->
            <div class="brand-headings">
              <div class="brand-crest-tag">
                <span class="bean-icon"><AppIcon name="coffee" :size="12" /></span>
                <span>تأسس عام 1980 • تحميص طازج يومياً</span>
                <span class="bean-icon"><AppIcon name="coffee" :size="12" /></span>
              </div>
              <h1 class="brand-main-title">{{ menuData.title_ar || 'بن العجوز' }}</h1>
              <p class="brand-tagline">
                {{ menuData.subtitle_ar || 'أصل القهوة والتوليفات الفاخرة والمحمصة الإيطالية' }}
              </p>
            </div>

            <!-- شريط الزخرفة الفاصل مع حبتي بن -->
            <div class="luxury-ornament-divider">
              <div class="divider-line"></div>
              <div class="coffee-bean-crest">
                <svg class="bean-svg" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.55.45-1 1-1s1 .45 1 1c0 3.31 2.69 6 6 6s6-2.69 6-6c0-.55.45-1 1-1s1 .45 1 1c0 4.41-3.59 8-8 8zm-2.5-9.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 1.5-1 2.5-1.5 3.5-.5-1-1.5-2-1.5-3.5z"
                  />
                </svg>
              </div>
              <div class="divider-line"></div>
            </div>

            <!-- شريط عنوان الوجه -->
            <div class="front-title-ribbon">
              <span> قائمة توليفات البن الفاخر وحبوب التحميص الخاصة </span>
            </div>
          </header>

          <!-- ─── شبكة التصنيفات والأصناف (Front Categories) ─── -->
          <main class="menu-categories-grid">
            <div
              v-for="cat in frontCategories"
              :key="cat.id || cat.name_ar"
              class="category-card-box"
              :class="{ 'span-full': cat.column_span === 2 }"
            >
              <!-- رأس القسم الفاخر -->
              <div class="cat-header-ribbon">
                <div class="cat-ribbon-content">
                  <span class="cat-svg-icon">{{ getCatIcon(cat.icon_name) }}</span>
                  <h2 class="cat-heading-text">{{ cat.name_ar }}</h2>
                </div>
                <div class="cat-line-flourish"></div>
                <p v-if="cat.subtitle_ar" class="cat-subheading-text">{{ cat.subtitle_ar }}</p>
              </div>

              <!-- قائمة الأصناف -->
              <div class="cat-items-list">
                <div
                  v-for="item in cat.items"
                  :key="item.id || item.name_ar"
                  class="menu-item-card"
                  :class="{ 'is-featured': item.is_featured }"
                >
                  <div class="item-primary-info">
                    <div class="item-title-row">
                      <span class="item-name-text">{{ item.name_ar }}</span>
                      <span v-if="item.is_featured" class="special-badge gold"> خلطة خاصة</span>
                      <span v-if="item.is_new" class="special-badge green"> محصول جديد</span>
                    </div>
                    <p v-if="item.description_ar" class="item-desc-text">
                      {{ item.description_ar }}
                    </p>
                  </div>

                  <!-- خط النقاط الواصل الفاخر -->
                  <div class="luxury-dotted-leader"></div>

                  <!-- عرض الأسعار (مصفوفة الأوزان أو السعر الفردي) -->
                  <div class="item-pricing-container">
                    <!-- 1. مصفوفة أوزان البن (ثمن / ربع / نص / كيلو) -->
                    <template
                      v-if="
                        item.pricing_type === 'weights' ||
                        item.price_eighth ||
                        item.price_quarter ||
                        item.price_half ||
                        item.price_kilo
                      "
                    >
                      <div class="weights-ribbon-matrix">
                        <div
                          v-if="item.price_eighth"
                          class="weight-cell"
                          title="ثمن كيلو (125 جرام)"
                        >
                          <span class="w-name">ثمن:</span>
                          <span class="w-price">{{ formatPrice(item.price_eighth) }}</span>
                        </div>
                        <div
                          v-if="item.price_quarter"
                          class="weight-cell"
                          title="ربع كيلو (250 جرام)"
                        >
                          <span class="w-name">ربع:</span>
                          <span class="w-price">{{ formatPrice(item.price_quarter) }}</span>
                        </div>
                        <div v-if="item.price_half" class="weight-cell" title="نصف كيلو (500 جرام)">
                          <span class="w-name">نصف:</span>
                          <span class="w-price">{{ formatPrice(item.price_half) }}</span>
                        </div>
                        <div
                          v-if="item.price_kilo"
                          class="weight-cell kilo"
                          title="كيلو كامل (1000 جرام)"
                        >
                          <span class="w-name">كيلو:</span>
                          <span class="w-price">{{ formatPrice(item.price_kilo) }}</span>
                        </div>
                        <span class="currency-label">ج.م</span>
                      </div>
                    </template>

                    <!-- 2. السعر المزدوج (سنجل / دبل) -->
                    <template v-else-if="item.price_secondary">
                      <div class="dual-price-tag">
                        <span class="single-val">{{ formatPrice(item.price) }}</span>
                        <span class="slash-separator">/</span>
                        <span class="double-val">{{ formatPrice(item.price_secondary) }}</span>
                        <span class="currency-label">ج.م</span>
                      </div>
                    </template>

                    <!-- 3. السعر الفردي الموحد -->
                    <template v-else>
                      <div class="single-price-tag">
                        <span class="price-number">{{ formatPrice(item.price) }}</span>
                        <span class="currency-label">ج.م</span>
                        <span v-if="item.unit_label_ar" class="unit-text"
                          >/ {{ item.unit_label_ar }}</span
                        >
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <!-- شريط سفلي جمالي للصفحة الأولى -->
          <footer class="front-luxury-footer">
            <div class="footer-guarantee">
              <AppIcon name="sparkles" :size="12" class="seal-star" />
              <span
                >نضمن لك حبوب بن نقية 100% منتقاة من أفضل مزارع البرازيل وكولومبيا وإثيوبيا</span
              >
              <AppIcon name="sparkles" :size="12" class="seal-star" />
            </div>
            <div class="page-count-badge">الصفحة ١ من ٢</div>
          </footer>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════════
         الصفحة الثانية: الظهر (BACK PAGE - HOT & COLD DRINKS & CONTACT)
         ═══════════════════════════════════════════════════════════════════════ -->
    <div class="menu-sheet page-back">
      <!-- خلفية زخرفية للظهر -->
      <div class="sheet-bg-decorations">
        <svg class="bg-bean-watermark bean-top-right" viewBox="0 0 100 100" fill="currentColor">
          <path
            d="M50 10 C25 10 10 30 10 55 C10 80 30 95 55 95 C80 95 95 75 95 50 C95 25 75 10 50 10 Z M50 20 C68 20 80 32 80 50 C80 68 65 82 50 82 C48 82 45 70 52 50 C58 32 50 20 50 20 Z"
            opacity="0.06"
          />
        </svg>
      </div>

      <div class="sheet-outer-frame">
        <div class="sheet-inner-frame">
          <div class="vintage-corner top-right"></div>
          <div class="vintage-corner top-left"></div>
          <div class="vintage-corner bottom-right"></div>
          <div class="vintage-corner bottom-left"></div>

          <!-- ترويسة الصفحة الثانية المصغرة -->
          <header class="luxury-menu-header mini">
            <div class="mini-brand-header">
              <div class="mini-logo-wrap">
                <img
                  :src="menuData.logo_url || '/logo-transparent.png'"
                  class="mini-logo-img"
                  alt="بن العجوز"
                  @error="onLogoError"
                />
              </div>
              <div>
                <h2 class="brand-mini-title">{{ menuData.title_ar || 'بن العجوز' }}</h2>
                <span class="brand-mini-sub"
                  >قائمة المشروبات الساخنة والمثلجة والإضافات الخاصة</span
                >
              </div>
            </div>
            <div class="mini-divider"></div>
          </header>

          <!-- شبكة تصنيفات الظهر (Back Categories) -->
          <main class="menu-categories-grid back-layout">
            <div
              v-for="cat in backCategories"
              :key="cat.id || cat.name_ar"
              class="category-card-box"
              :class="{ 'span-full': cat.column_span === 2 }"
            >
              <div class="cat-header-ribbon">
                <div class="cat-ribbon-content">
                  <span class="cat-svg-icon">{{ getCatIcon(cat.icon_name) }}</span>
                  <h2 class="cat-heading-text">{{ cat.name_ar }}</h2>
                </div>
                <div class="cat-line-flourish"></div>
                <p v-if="cat.subtitle_ar" class="cat-subheading-text">{{ cat.subtitle_ar }}</p>
              </div>

              <div class="cat-items-list">
                <div
                  v-for="item in cat.items"
                  :key="item.id || item.name_ar"
                  class="menu-item-card"
                  :class="{ 'is-featured': item.is_featured }"
                >
                  <div class="item-primary-info">
                    <div class="item-title-row">
                      <span class="item-name-text">{{ item.name_ar }}</span>
                      <span v-if="item.is_featured" class="special-badge gold"> الأكثر طلباً</span>
                    </div>
                    <p v-if="item.description_ar" class="item-desc-text">
                      {{ item.description_ar }}
                    </p>
                  </div>

                  <div class="luxury-dotted-leader"></div>

                  <div class="item-pricing-container">
                    <template v-if="item.price_secondary">
                      <div class="dual-price-tag">
                        <div class="dual-slot">
                          <span class="slot-label">سنجل:</span>
                          <span class="slot-val">{{ formatPrice(item.price) }}</span>
                        </div>
                        <span class="slash-separator">|</span>
                        <div class="dual-slot">
                          <span class="slot-label">دبل:</span>
                          <span class="slot-val">{{ formatPrice(item.price_secondary) }}</span>
                        </div>
                        <span class="currency-label">ج.م</span>
                      </div>
                    </template>
                    <template v-else>
                      <div class="single-price-tag">
                        <span class="price-number">{{ formatPrice(item.price) }}</span>
                        <span class="currency-label">ج.م</span>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <!-- ─── التذييل الملكي الشامل لبيانات التواصل والعنوان والـ QR ─── -->
          <footer class="master-luxury-footer">
            <div class="footer-roastery-seal">
              <div class="seal-badge-box">
                <span class="seal-icon"><AppIcon name="badge" :size="14" /></span>
                <span class="seal-title">تحميص إيطالي عالي الجودة</span>
              </div>
            </div>

            <div class="footer-columns-grid">
              <!-- عمود العنوان والتوصيل -->
              <div class="footer-card-col">
                <h4 class="col-heading">الفرع والتوصيل للمنازل</h4>
                <p class="col-text">
                  {{ menuData.address_ar || 'الفرع الرئيسي - جمهورية مصر العربية' }}
                </p>
                <div class="phone-pills-wrap">
                  <span class="phone-pill"> {{ menuData.phone_primary || '01012345678' }}</span>
                  <span v-if="menuData.phone_secondary" class="phone-pill">
                    {{ menuData.phone_secondary }}</span
                  >
                </div>
              </div>

              <!-- عمود السوشيال ميديا -->
              <div class="footer-card-col center">
                <h4 class="col-heading">تواصل معنا</h4>
                <div class="social-tags-list">
                  <div v-if="menuData.facebook_handle" class="social-pill fb">
                    <span class="soc-icon">f</span>
                    <span>/{{ menuData.facebook_handle }}</span>
                  </div>
                  <div v-if="menuData.instagram_handle" class="social-pill insta">
                    <span class="soc-icon"><AppIcon name="camera" :size="12" /></span>
                    <span>@{{ menuData.instagram_handle }}</span>
                  </div>
                </div>
              </div>

              <!-- عمود الـ QR Code مع إطار الهاتف الفاخر -->
              <div v-if="menuData.show_qr_code !== false" class="footer-card-col qr-col">
                <div class="qr-luxury-frame">
                  <div class="qr-box">
                    <img
                      v-if="qrCodeDataUrl"
                      :src="qrCodeDataUrl"
                      class="real-qr-img"
                      alt="QR Code"
                    />
                    <!-- أيقونة QR ديكورية ذكية احتياطية -->
                    <div v-else class="qr-matrix-mock">
                      <div class="qr-corner top-l"></div>
                      <div class="qr-corner top-r"></div>
                      <div class="qr-corner bot-l"></div>
                      <div class="qr-center-bean"></div>
                    </div>
                  </div>
                  <span class="qr-caption-text">امسح للطلب أونلاين</span>
                </div>
              </div>
            </div>

            <!-- الشريط الختامي -->
            <div class="footer-bottom-statement">
              <span>جميع أسعارنا تشمل الخدمة والضريبة • شكراً لاختياركم بن العجوز</span>
              <span class="page-count-badge">الصفحة ٢ من ٢</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { generateQrDataUrl } from '@/utils/qrCode';

const qrCodeDataUrl = ref('');

const updateQr = async () => {
  try {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/menu`
        : 'https://binalagoouz.com/menu';
    qrCodeDataUrl.value = await generateQrDataUrl(url, {
      width: 250,
      margin: 1,
      darkColor: '#1b120c',
      lightColor: '#ffffff',
    });
  } catch (err) {
    console.error('Error generating QR in MenuPageLayout:', err);
  }
};

onMounted(() => {
  updateQr();
});

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

const onLogoError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  if (target && !target.src.endsWith('/logo.svg')) {
    target.src = '/logo.svg';
  }
};

const getCatIcon = (iconName?: string) => {
  switch (iconName) {
    case 'star':
      return '';
    case 'coffee':
      return '';
    case 'sparkles':
      return '';
    case 'flame':
      return '';
    case 'snowflake':
      return '';
    case 'heart':
      return '';
    default:
      return '';
  }
};
</script>

<style scoped>
/* ULTRA-LUXURY COFFEE ROASTERY MENU DESIGN SYSTEM (A4 210mm x 297mm) */

.menu-print-document {
  font-family: 'Cairo', 'Outfit', 'Segoe UI', Tahoma, sans-serif;
  direction: rtl;
  color: var(--m-text);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

/*  THEME 1: COFFEE GOLD (رويال إسبريسو وذهب ملكي) */
.theme-coffee-gold {
  --m-bg: #1a0f0a;
  --m-sheet-bg: radial-gradient(circle at 50% 30%, #2e1911 0%, #170d08 100%);
  --m-gold-1: #f3e5ab;
  --m-gold-2: #d4af37;
  --m-gold-3: #aa7c11;
  --m-gold-gradient: linear-gradient(135deg, #f7e7b4 0%, #d4af37 50%, #8c6a2d 100%);
  --m-gold-border: #c5a059;
  --m-primary-dark: #120905;
  --m-text: #fbf4ec;
  --m-text-muted: #c9b4a4;
  --m-box-bg: rgba(25, 13, 8, 0.65);
  --m-box-border: rgba(197, 160, 89, 0.35);
  --m-badge-bg: rgba(212, 175, 55, 0.15);
}

/*  THEME 2: WARM CREAM (بردي ومحمصة تراثية فاخرة) */
.theme-warm-cream {
  --m-bg: #e6dac8;
  --m-sheet-bg: radial-gradient(circle at 50% 20%, #fefcf8 0%, #f4eae0 100%);
  --m-gold-1: #6b3e26;
  --m-gold-2: #8a572a;
  --m-gold-3: #5c3d2e;
  --m-gold-gradient: linear-gradient(135deg, #8a572a 0%, #5c3d2e 100%);
  --m-gold-border: #b47b48;
  --m-primary-dark: #3a2216;
  --m-text: #2a160d;
  --m-text-muted: #6e5548;
  --m-box-bg: rgba(255, 255, 255, 0.7);
  --m-box-border: rgba(180, 123, 72, 0.3);
  --m-badge-bg: #ebe0d2;
}

/*  THEME 3: MODERN DARK (دارك كافيه مودرن) */
.theme-modern-dark {
  --m-bg: #09090b;
  --m-sheet-bg: radial-gradient(circle at 50% 30%, #1f1f23 0%, #0d0d0f 100%);
  --m-gold-1: #fbbf24;
  --m-gold-2: #f59e0b;
  --m-gold-3: #b45309;
  --m-gold-gradient: linear-gradient(135deg, #fde68a 0%, #f59e0b 50%, #b45309 100%);
  --m-gold-border: #f59e0b;
  --m-primary-dark: #000000;
  --m-text: #fafafa;
  --m-text-muted: #a1a1aa;
  --m-box-bg: rgba(24, 24, 27, 0.8);
  --m-box-border: rgba(245, 158, 11, 0.3);
  --m-badge-bg: rgba(245, 158, 11, 0.15);
}

/* هيكل ورقة A4 للطباعة عالية الدقة */
.menu-sheet {
  width: 210mm;
  min-height: 297mm;
  max-height: 297mm;
  padding: 6mm;
  margin: 0 auto 30px auto;
  box-sizing: border-box;
  background: var(--m-sheet-bg);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5);
  position: relative;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* عناصر الزخرفة الخلفية */
.sheet-bg-decorations {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.bg-bean-watermark {
  position: absolute;
  width: 220px;
  height: 220px;
  color: var(--m-gold-2);
}

.bean-top-left {
  top: -40px;
  left: -40px;
  transform: rotate(-25deg);
}

.bean-bottom-right {
  bottom: -40px;
  right: -40px;
  transform: rotate(35deg);
}

.bean-top-right {
  top: -30px;
  right: -30px;
  transform: rotate(45deg);
}

/* الإطارات الملكية المزدوجة */
.sheet-outer-frame {
  border: 2px solid var(--m-gold-border);
  padding: 3px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
  z-index: 1;
}

.sheet-inner-frame {
  border: 1px solid var(--m-gold-border);
  padding: 10px 14px;
  height: 100%;
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
  background: rgba(0, 0, 0, 0.05);
}

/* زوايا الأرابيسك الكلاسيكية */
.vintage-corner {
  position: absolute;
  width: 18px;
  height: 18px;
}
.vintage-corner.top-right {
  top: 3px;
  right: 3px;
  border-top: 3px double var(--m-gold-border);
  border-right: 3px double var(--m-gold-border);
}
.vintage-corner.top-left {
  top: 3px;
  left: 3px;
  border-top: 3px double var(--m-gold-border);
  border-left: 3px double var(--m-gold-border);
}
.vintage-corner.bottom-right {
  bottom: 3px;
  right: 3px;
  border-bottom: 3px double var(--m-gold-border);
  border-right: 3px double var(--m-gold-border);
}
.vintage-corner.bottom-left {
  bottom: 3px;
  left: 3px;
  border-bottom: 3px double var(--m-gold-border);
  border-left: 3px double var(--m-gold-border);
}

/* ─── ترويسة المنيو الملكية ─── */
.luxury-menu-header {
  text-align: center;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.luxury-menu-header.mini {
  margin-bottom: 8px;
}

.logo-medal-wrapper {
  margin-bottom: 4px;
}

.medal-gold-ring {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 2px solid var(--m-gold-2);
  padding: 3px;
  background: var(--m-primary-dark);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

.brand-crest-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 9.5px;
  font-weight: 800;
  color: var(--m-gold-2);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.brand-main-title {
  font-family: 'Aref Ruqaa', 'Cairo', serif;
  font-size: 34px;
  font-weight: 700;
  color: var(--m-gold-1);
  margin: 0;
  line-height: 1.1;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.brand-tagline {
  font-size: 11px;
  font-weight: 600;
  color: var(--m-text-muted);
  margin: 1px 0 4px 0;
}

.luxury-ornament-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 65%;
  margin: 3px auto;
}

.divider-line {
  flex: 1;
  height: 1.5px;
  background: linear-gradient(to right, transparent, var(--m-gold-2), transparent);
}

.coffee-bean-crest {
  width: 16px;
  height: 16px;
  color: var(--m-gold-2);
}

.bean-svg {
  width: 100%;
  height: 100%;
}

.front-title-ribbon {
  background: var(--m-gold-gradient);
  color: var(--m-primary-dark);
  font-size: 11px;
  font-weight: 900;
  padding: 3px 18px;
  border-radius: 20px;
  margin-top: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

/* ترويسة الصفحة الثانية المصغرة */
.mini-brand-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.mini-logo-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid var(--m-gold-2);
  background: var(--m-primary-dark);
  padding: 2px;
}

.mini-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-mini-title {
  font-family: 'Aref Ruqaa', 'Cairo', serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--m-gold-1);
  margin: 0;
  line-height: 1;
}

.brand-mini-sub {
  font-size: 10px;
  color: var(--m-gold-2);
  font-weight: 700;
}

.mini-divider {
  width: 50%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--m-gold-2), transparent);
  margin: 4px auto 0 auto;
}

/* ─── شبكة التصنيفات (Categories Grid) ─── */
.menu-categories-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 16px;
  flex: 1;
  align-content: start;
}

.category-card-box {
  background: var(--m-box-bg);
  border: 1px solid var(--m-box-border);
  border-radius: 8px;
  padding: 8px 10px;
  backdrop-filter: blur(4px);
  break-inside: avoid;
}

.category-card-box.span-full {
  grid-column: span 2;
}

.cat-header-ribbon {
  margin-bottom: 6px;
}

.cat-ribbon-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cat-svg-icon {
  font-size: 14px;
}

.cat-heading-text {
  font-family: 'Cairo', sans-serif;
  font-size: 14.5px;
  font-weight: 800;
  color: var(--m-gold-1);
  margin: 0;
  letter-spacing: -0.2px;
}

.cat-line-flourish {
  height: 1.5px;
  background: linear-gradient(to left, var(--m-gold-2), transparent);
  margin: 2px 0;
}

.cat-subheading-text {
  font-size: 9.5px;
  color: var(--m-text-muted);
  margin: 0;
}

/* ─── سطور الأصناف (Items Rows) ─── */
.cat-items-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item-card {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px 0;
}

.menu-item-card.is-featured {
  background: var(--m-badge-bg);
  padding: 2px 6px;
  border-radius: 4px;
  border-right: 2px solid var(--m-gold-2);
}

.item-primary-info {
  flex: 0 1 auto;
  max-width: 58%;
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.item-name-text {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--m-text);
}

.special-badge {
  font-size: 8px;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 4px;
}

.special-badge.gold {
  background: var(--m-gold-gradient);
  color: var(--m-primary-dark);
}

.special-badge.green {
  background: #15803d;
  color: #fff;
}

.item-desc-text {
  font-size: 9px;
  color: var(--m-text-muted);
  margin: 0;
  line-height: 1.25;
}

/* النقاط الفاصلة */
.luxury-dotted-leader {
  flex: 1;
  border-bottom: 1.5px dotted var(--m-gold-border);
  opacity: 0.4;
  margin-bottom: 3px;
}

/* ─── تنسيق أسعار أوزان البن (Multi-Weight Matrix) ─── */
.item-pricing-container {
  display: flex;
  align-items: baseline;
  white-space: nowrap;
}

.weights-ribbon-matrix {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--m-gold-border);
  padding: 1px 4px;
  border-radius: 4px;
}

.weight-cell {
  display: flex;
  align-items: baseline;
  gap: 1.5px;
  font-size: 10px;
}

.weight-cell .w-name {
  font-size: 8px;
  font-weight: 700;
  color: var(--m-text-muted);
}

.weight-cell .w-price {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--m-gold-1);
}

.weight-cell.kilo {
  background: var(--m-badge-bg);
  padding: 0 3px;
  border-radius: 3px;
}

.weight-cell.kilo .w-price {
  color: var(--m-gold-2);
  font-weight: 900;
}

.currency-label {
  font-size: 8.5px;
  font-weight: 700;
  color: var(--m-gold-2);
  margin-right: 2px;
}

/* السعر المزدوج والمفرد */
.dual-price-tag {
  display: flex;
  align-items: baseline;
  gap: 3px;
  background: rgba(0, 0, 0, 0.2);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--m-gold-border);
}

.dual-slot {
  display: flex;
  align-items: baseline;
  gap: 1.5px;
}

.slot-label {
  font-size: 8px;
  color: var(--m-text-muted);
}

.slot-val {
  font-size: 11.5px;
  font-weight: 800;
  color: var(--m-gold-1);
}

.slash-separator {
  color: var(--m-gold-2);
  font-size: 10px;
}

.single-price-tag {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.price-number {
  font-size: 13px;
  font-weight: 800;
  color: var(--m-gold-1);
}

.unit-text {
  font-size: 8.5px;
  color: var(--m-text-muted);
}

/* ─── التذييل الملكي (Footers) ─── */
.front-luxury-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px dashed var(--m-gold-border);
  padding-top: 5px;
  margin-top: auto;
  font-size: 9.5px;
  color: var(--m-text-muted);
}

.footer-guarantee {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  color: var(--m-gold-1);
}

.page-count-badge {
  font-size: 9px;
  font-weight: 800;
  color: var(--m-gold-2);
  background: rgba(0, 0, 0, 0.25);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--m-gold-border);
}

/* التذييل الرئيسي الشامل للصفحة الثانية */
.master-luxury-footer {
  margin-top: auto;
  border-top: 2px solid var(--m-gold-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.footer-roastery-seal {
  display: flex;
  justify-content: center;
  margin-bottom: 2px;
}

.seal-badge-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--m-gold-gradient);
  color: var(--m-primary-dark);
  padding: 2px 14px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 800;
}

.footer-columns-grid {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.6fr;
  gap: 10px;
  align-items: center;
  background: var(--m-box-bg);
  border: 1px solid var(--m-box-border);
  border-radius: 8px;
  padding: 8px 12px;
}

.col-heading {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--m-gold-1);
  margin: 0 0 2px 0;
}

.col-text {
  font-size: 9px;
  color: var(--m-text-muted);
  margin: 0 0 4px 0;
}

.phone-pills-wrap {
  display: flex;
  gap: 6px;
  direction: ltr;
  justify-content: flex-end;
}

.phone-pill {
  font-size: 10px;
  font-weight: 800;
  color: var(--m-gold-1);
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--m-gold-border);
}

.social-tags-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.social-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--m-text);
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
}

.soc-icon {
  font-weight: 900;
  color: var(--m-gold-2);
}

.qr-luxury-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.qr-box {
  width: 44px;
  height: 44px;
  border: 1.5px solid var(--m-gold-2);
  border-radius: 6px;
  background: #ffffff;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.real-qr-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.qr-matrix-mock {
  width: 100%;
  height: 100%;
  background: #fdf8f3;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-corner {
  position: absolute;
  width: 9px;
  height: 9px;
  background: #170d08;
}
.qr-corner.top-l {
  top: 2px;
  left: 2px;
}
.qr-corner.top-r {
  top: 2px;
  right: 2px;
}
.qr-corner.bot-l {
  bottom: 2px;
  left: 2px;
}

.qr-center-bean {
  font-size: 13px;
  color: #8a572a;
}

.qr-caption-text {
  font-size: 8px;
  font-weight: 800;
  color: var(--m-gold-2);
}

.footer-bottom-statement {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8.5px;
  color: var(--m-text-muted);
  border-top: 1px solid var(--m-box-border);
  padding-top: 4px;
}

/* PRINT MEDIA STYLES FOR DIRECT PRINT & A4 RENDERING */
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  body {
    background: transparent !important;
    margin: 0 !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .menu-sheet {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 5mm !important;
    width: 100vw !important;
    height: 100vh !important;
    min-height: 100vh !important;
    max-height: 100vh !important;
    page-break-after: always !important;
    break-after: page !important;
  }
}
</style>
