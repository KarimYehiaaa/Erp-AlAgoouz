<template>
  <div class="digital-menu-container" :class="`theme-${menuData.theme || 'coffee-gold'}`">
    <!-- ═══════════════════ شريط الترويسة الفاخر (Branding Header) ═══════════════════ -->
    <header class="digital-menu-header">
      <div class="header-bg-glow"></div>

      <div class="brand-badge-top">
        <span class="bean-icon"><AppIcon name="coffee" :size="14" /></span>
        <span>تأسس عام 1980 • تحميص طازج يومياً</span>
        <span class="bean-icon"><AppIcon name="coffee" :size="14" /></span>
      </div>

      <!-- شعار بن العجوز في ميدالية ذهبية -->
      <div class="brand-avatar-box">
        <div class="brand-avatar-ring">
          <img
            :src="menuData.logo_url || '/logo-transparent.png'"
            alt="شعار بن العجوز"
            class="brand-logo"
            @error="onLogoError"
          />
        </div>
      </div>

      <h1 class="brand-title">{{ menuData.title_ar || 'بن العجوز' }}</h1>
      <p class="brand-subtitle">
        {{ menuData.subtitle_ar || 'أصل القهوة والتوليفات الفاخرة والمحمصة الإيطالية' }}
      </p>

      <!-- روابط الاتصال السريع والواتساب والعنوان -->
      <div class="quick-contact-actions">
        <a
          v-if="menuData.phone_primary"
          :href="`tel:${menuData.phone_primary}`"
          class="contact-chip"
        >
          <span class="chip-icon"><AppIcon name="send" :size="14" /></span>
          <span>اتصال: {{ menuData.phone_primary }}</span>
        </a>

        <a
          v-if="menuData.phone_primary"
          :href="`https://wa.me/2${cleanPhone(menuData.phone_primary)}`"
          target="_blank"
          class="contact-chip wa"
        >
          <span class="chip-icon"><AppIcon name="send" :size="14" /></span>
          <span>واتساب المحمصة</span>
        </a>

        <button type="button" class="contact-chip share-btn" @click="openShareModal">
          <span class="chip-icon"><AppIcon name="monitor" :size="14" /></span>
          <span>مشاركة المنيو / QR</span>
        </button>
      </div>

      <!-- حقل البحث السريع في المنيو -->
      <div class="menu-search-bar">
        <span class="search-icon"><AppIcon name="search" :size="16" /></span>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="ابحث عن توليفة، نوع بن، مشروب، مثلجات..."
        />
        <button v-if="searchQuery" type="button" class="clear-search-btn" @click="searchQuery = ''">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </header>

    <!-- ═══════════════════ شريط التصنيفات المثبت (Sticky Categories) ═══════════════════ -->
    <nav class="sticky-category-nav">
      <div class="categories-scroll-wrapper">
        <button
          v-for="(cat, idx) in visibleCategories"
          :key="cat.id || idx"
          type="button"
          class="cat-nav-pill"
          :class="{ active: activeCategoryIdx === idx }"
          @click="scrollToCategory(idx)"
        >
          <span class="cat-pill-icon"
            ><AppIcon :name="getCatIcon(cat.icon_name)" :size="16"
          /></span>
          <span class="cat-pill-title">{{ cat.name_ar }}</span>
          <span class="cat-pill-count">{{ (cat.items || []).length }}</span>
        </button>
      </div>
    </nav>

    <!-- ═══════════════════ محتوى المنيو وقائمة الأصناف ═══════════════════ -->
    <main class="digital-menu-body">
      <!-- حالة التحميل -->
      <div v-if="isLoading" class="menu-loading-state">
        <div class="coffee-cup-loader"></div>
        <p>جاري تحضير قائمة بن العجوز الفاخرة...</p>
      </div>

      <!-- حالة الخطأ أو عدم وجود أصناف -->
      <div v-else-if="!visibleCategories.length" class="menu-empty-state">
        <span class="empty-icon"><AppIcon name="coffee" :size="48" /></span>
        <h3>لا توجد أصناف تطابق بحثك حالياً</h3>
        <p>جرب البحث بكلمة أخرى أو تصفح القائمة كاملة</p>
        <button type="button" class="btn-reset-search" @click="searchQuery = ''">
          عرض كل المنيو
        </button>
      </div>

      <!-- أقسام المنيو -->
      <div v-else class="menu-sections-wrapper">
        <section
          v-for="(cat, catIdx) in visibleCategories"
          :id="`category-section-${catIdx}`"
          :key="cat.id || catIdx"
          class="menu-category-section"
        >
          <!-- رأس القسم الفاخر -->
          <div class="category-section-header">
            <div class="cat-header-title-box">
              <span class="cat-header-icon"
                ><AppIcon :name="getCatIcon(cat.icon_name)" :size="20"
              /></span>
              <div>
                <h2 class="cat-title">{{ cat.name_ar }}</h2>
                <p v-if="cat.subtitle_ar" class="cat-subtitle">{{ cat.subtitle_ar }}</p>
              </div>
            </div>
            <div class="cat-header-divider"></div>
          </div>

          <!-- شبكة الأصناف داخل القسم -->
          <div class="category-items-grid">
            <article
              v-for="item in cat.items"
              :key="item.id || item.name_ar"
              class="digital-item-card"
              :class="{ 'is-featured': item.is_featured }"
            >
              <div class="item-card-header">
                <div class="item-title-col">
                  <h3 class="item-name">{{ item.name_ar }}</h3>
                  <div class="item-badges-wrap">
                    <span v-if="item.is_featured" class="badge-featured">
                      <AppIcon name="sparkles" :size="12" /> الأكثر طلباً
                    </span>
                    <span v-if="item.is_new" class="badge-new">
                      <AppIcon name="sparkles" :size="12" /> جديد
                    </span>
                  </div>
                </div>
              </div>

              <p v-if="item.description_ar" class="item-description">
                {{ item.description_ar }}
              </p>

              <!-- ─── حالة 1: تسعير الأوزان (توليفات وحبوب البن) ─── -->
              <div v-if="item.pricing_type === 'weights'" class="weights-pricing-matrix">
                <div class="weights-selector-label">اختر الوزن المطلوب:</div>
                <div class="weights-chips-grid">
                  <button
                    v-if="item.price_eighth"
                    type="button"
                    class="weight-chip"
                    :class="{ selected: getItemWeight(item) === 'eighth' }"
                    @click="setItemWeight(item, 'eighth')"
                  >
                    <span class="weight-label">ثمن كجم (125g)</span>
                    <span class="weight-price">{{ item.price_eighth }} ج.م</span>
                  </button>

                  <button
                    v-if="item.price_quarter"
                    type="button"
                    class="weight-chip"
                    :class="{ selected: getItemWeight(item) === 'quarter' }"
                    @click="setItemWeight(item, 'quarter')"
                  >
                    <span class="weight-label">ربع كجم (250g)</span>
                    <span class="weight-price">{{ item.price_quarter }} ج.م</span>
                  </button>

                  <button
                    v-if="item.price_half"
                    type="button"
                    class="weight-chip"
                    :class="{ selected: getItemWeight(item) === 'half' }"
                    @click="setItemWeight(item, 'half')"
                  >
                    <span class="weight-label">نصف كجم (500g)</span>
                    <span class="weight-price">{{ item.price_half }} ج.م</span>
                  </button>

                  <button
                    v-if="item.price_kilo || item.price"
                    type="button"
                    class="weight-chip"
                    :class="{ selected: getItemWeight(item) === 'kilo' }"
                    @click="setItemWeight(item, 'kilo')"
                  >
                    <span class="weight-label">كيلو كامل (1000g)</span>
                    <span class="weight-price">{{ item.price_kilo || item.price }} ج.م</span>
                  </button>
                </div>
              </div>

              <!-- ─── حالة 2: تسعير مزدوج (سنجل / دبل للمشروبات) ─── -->
              <div v-else-if="item.price_secondary" class="dual-pricing-matrix">
                <div class="weights-selector-label">اختر الحجم:</div>
                <div class="dual-chips-grid">
                  <button
                    type="button"
                    class="weight-chip"
                    :class="{ selected: getItemSize(item) === 'single' }"
                    @click="setItemSize(item, 'single')"
                  >
                    <span class="weight-label">سنجل (Single)</span>
                    <span class="weight-price">{{ item.price }} ج.م</span>
                  </button>
                  <button
                    type="button"
                    class="weight-chip"
                    :class="{ selected: getItemSize(item) === 'double' }"
                    @click="setItemSize(item, 'double')"
                  >
                    <span class="weight-label">دبل (Double)</span>
                    <span class="weight-price">{{ item.price_secondary }} ج.م</span>
                  </button>
                </div>
              </div>

              <!-- ─── حالة 3: تسعير فردي عادي ─── -->
              <div v-else class="single-pricing-row">
                <div class="single-price-box">
                  <span class="price-val">{{ item.price }}</span>
                  <span class="currency">ج.م</span>
                  <span v-if="item.unit_label_ar" class="unit-text"
                    >/ {{ item.unit_label_ar }}</span
                  >
                </div>
              </div>

              <!-- زر الإضافة للطلب -->
              <div class="item-card-footer">
                <button
                  type="button"
                  class="btn-add-to-tray"
                  @click="addItemToTray(item, cat.name_ar)"
                >
                  <AppIcon name="coffee" :size="16" />
                  <span>إضافة لطلبي</span>
                  <span class="calculated-price-tag">{{ getCurrentItemPrice(item) }} ج.م</span>
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>

    <!-- ═══════════════════ التذييل ومعلومات المحمصة ═══════════════════ -->
    <footer class="digital-menu-footer">
      <div class="footer-gold-emblem">
        <AppIcon name="coffee" :size="16" /> بن العجوز <AppIcon name="coffee" :size="16" />
      </div>
      <p class="footer-address">
        <AppIcon name="building" :size="14" />
        {{ menuData.address_ar || 'الفرع الرئيسي - جمهورية مصر العربية' }}
      </p>
      <div class="footer-social-links">
        <a
          v-if="menuData.facebook_handle"
          :href="`https://facebook.com/${menuData.facebook_handle}`"
          target="_blank"
          class="social-link fb"
        >
          <span>فيسبوك</span>
        </a>
        <a
          v-if="menuData.instagram_handle"
          :href="`https://instagram.com/${menuData.instagram_handle}`"
          target="_blank"
          class="social-link ig"
        >
          <span>إنستغرام</span>
        </a>
      </div>
      <div class="footer-copyright">
        جميع الأسعار تشمل ضريبة القيمة المضافة • صُمم بنظام بن العجوز ERP
      </div>
    </footer>

    <!-- ═══════════════════ صينية الطلبات العائمة (Floating Order Tray) ═══════════════════ -->
    <div v-if="trayItems.length > 0" class="floating-order-bar">
      <div class="tray-summary-col" @click="showTrayDrawer = true">
        <div class="tray-badge-count">{{ totalTrayCount }}</div>
        <div class="tray-text-info">
          <span class="tray-label">طلباتك الحالية</span>
          <span class="tray-total-price">{{ totalTrayPrice }} ج.م</span>
        </div>
      </div>
      <button type="button" class="btn-open-tray" @click="showTrayDrawer = true">
        <span>مراجعة وإرسال الطلب</span>
        <AppIcon name="arrowLeft" :size="14" />
      </button>
    </div>

    <!-- ═══════════════════ درج الطلب (Order Tray Drawer Modal) ═══════════════════ -->
    <transition name="tray-slide">
      <div v-if="showTrayDrawer" class="tray-drawer-overlay" @click.self="showTrayDrawer = false">
        <div class="tray-drawer-card">
          <div class="drawer-header">
            <div class="drawer-title-box">
              <span class="drawer-icon"><AppIcon name="shoppingBag" :size="20" /></span>
              <div>
                <h3>صينية طلباتك</h3>
                <p>مراجعة الأصناف قبل الإرسال للفرع أو الكاشير</p>
              </div>
            </div>
            <button type="button" class="btn-close-drawer" @click="showTrayDrawer = false">
              <AppIcon name="close" :size="16" />
            </button>
          </div>

          <div class="drawer-body">
            <!-- قائمة بنود الطلب -->
            <div class="tray-items-list">
              <div v-for="(tItem, tIdx) in trayItems" :key="tIdx" class="tray-item-row">
                <div class="titem-info">
                  <span class="titem-name">{{ tItem.name_ar }}</span>
                  <span v-if="tItem.variant_label" class="titem-variant">{{
                    tItem.variant_label
                  }}</span>
                  <span class="titem-unit-price">{{ tItem.unit_price }} ج.م / للواحد</span>
                </div>

                <div class="titem-qty-controls">
                  <button type="button" class="qty-btn" @click="decreaseTrayQty(tIdx)">−</button>
                  <span class="qty-number">{{ tItem.quantity }}</span>
                  <button type="button" class="qty-btn" @click="increaseTrayQty(tIdx)">+</button>
                </div>

                <div class="titem-total-col">
                  <span class="titem-total">{{ tItem.unit_price * tItem.quantity }} ج.م</span>
                  <button type="button" class="titem-del-btn" @click="removeTrayItem(tIdx)">
                    <AppIcon name="trash" :size="14" />
                  </button>
                </div>
              </div>
            </div>

            <!-- بيانات الطاولة والملاحظات -->
            <div class="drawer-form-box">
              <div class="form-row">
                <label>رقم الطاولة أو اسم العميل (اختياري):</label>
                <input
                  v-model="orderCustomerInfo"
                  type="text"
                  class="tray-input"
                  placeholder="مثال: طاولة رقم 4 / أو اسمك للتجهيز السريع"
                />
              </div>

              <div class="form-row">
                <label>ملاحظات إضافية (التحميص / السكر / الإضافات):</label>
                <textarea
                  v-model="orderNotes"
                  rows="2"
                  class="tray-input textarea"
                  placeholder="مثال: تحميص فاتح، سكر زيادة، بدون حبهان..."
                ></textarea>
              </div>
            </div>

            <!-- الإجمالي النهائي -->
            <div class="tray-grand-total-card">
              <div class="total-row">
                <span>إجمالي الأصناف:</span>
                <span>{{ totalTrayCount }} صنف</span>
              </div>
              <div class="total-row highlight">
                <span>المجموع النهائي:</span>
                <span class="amount">{{ totalTrayPrice }} ج.م</span>
              </div>
            </div>
          </div>

          <div class="drawer-footer">
            <button type="button" class="btn-send-whatsapp" @click="sendOrderViaWhatsApp">
              <AppIcon name="send" :size="16" />
              <span>إرسال الطلب عبر واتساب المحمصة</span>
            </button>

            <button type="button" class="btn-clear-tray" @click="clearTray">مسح السلة</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ═══════════════════ نافذة الـ QR Code والمشاركة ═══════════════════ -->
    <transition name="fade">
      <div v-if="showShareModal" class="share-modal-overlay" @click.self="showShareModal = false">
        <div class="share-modal-card">
          <div class="share-modal-header">
            <h3><AppIcon name="monitor" :size="18" /> رمز الـ QR Code للمنيو</h3>
            <button type="button" class="btn-close-modal" @click="showShareModal = false">
              <AppIcon name="close" :size="16" />
            </button>
          </div>

          <div class="share-modal-body">
            <div class="qr-preview-box">
              <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" class="qr-image" />
              <div v-else class="qr-loading">جاري توليد الرمز...</div>
            </div>

            <p class="qr-hint">امسح الرمز بكاميرا الهاتف لفتح المنيو التفاعلي مباشرة</p>

            <div class="share-url-box">
              <input :value="currentMenuUrl" type="text" readonly class="share-url-input" />
              <button type="button" class="btn-copy-url" @click="copyMenuUrl">
                <AppIcon v-if="isCopied" name="check" :size="14" />
                <span>{{ isCopied ? 'تم النسخ!' : 'نسخ الرابط' }}</span>
              </button>
            </div>
          </div>

          <div class="share-modal-footer">
            <button type="button" class="btn-download-qr" @click="downloadQr">
              <AppIcon name="download" :size="16" /> تحميل الـ QR كصورة
            </button>
            <button type="button" class="btn-secondary" @click="showShareModal = false">
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { menu as menuApi } from '@/api';
import { generateQrDataUrl, downloadQrImage } from '@/utils/qrCode';

const isLoading = ref(true);
const searchQuery = ref('');
const activeCategoryIdx = ref(0);
const showTrayDrawer = ref(false);
const showShareModal = ref(false);
const qrDataUrl = ref('');
const isCopied = ref(false);

const orderCustomerInfo = ref('');
const orderNotes = ref('');

// تتبع الأوزان والأحجام المختارة لكل صنف
const selectedItemWeights = reactive<Record<string, string>>({});
const selectedItemSizes = reactive<Record<string, string>>({});

// صينية الطلبات
interface TrayItem {
  id?: number;
  name_ar: string;
  category_name: string;
  variant_label: string;
  unit_price: number;
  quantity: number;
}
const trayItems = ref<TrayItem[]>([]);

const menuData = reactive({
  title_ar: 'بن العجوز',
  subtitle_ar: 'أصل القهوة والتوليفات الفاخرة والمحمصة الإيطالية',
  theme: 'coffee-gold',
  logo_url: '/logo-transparent.png',
  phone_primary: '01012345678',
  phone_secondary: '01234567890',
  address_ar: 'الفرع الرئيسي - مصر',
  facebook_handle: 'BinAlAgoouz',
  instagram_handle: 'binalagoouz',
  show_qr_code: true,
  categories: [] as any[],
});

const currentMenuUrl = computed(() => {
  return window.location.origin + '/menu';
});

onMounted(async () => {
  try {
    isLoading.value = true;
    const res = await menuApi.getPublicActive();
    if (res.data) {
      Object.assign(menuData, res.data);
    }
  } catch {
    // Fallback default menu
    initFallbackMenu();
  } finally {
    isLoading.value = false;
  }

  // Generate QR code for the current URL
  generateQr();
});

const generateQr = async () => {
  try {
    qrDataUrl.value = await generateQrDataUrl(currentMenuUrl.value, {
      width: 400,
      margin: 2,
      darkColor: '#1b120c',
      lightColor: '#ffffff',
    });
  } catch (err) {
    console.error('QR generation error:', err);
  }
};

const cleanPhone = (phone: string) => {
  return phone.replace(/[^0-9]/g, '');
};

const onLogoError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  target.src = '/logo.png';
};

const getCatIcon = (iconName?: string) => {
  switch (iconName) {
    case 'star':
      return 'sparkles';
    case 'coffee':
      return 'coffee';
    case 'sparkles':
      return 'sparkles';
    case 'cup':
      return 'coffee';
    case 'snowflake':
      return 'zap';
    case 'cake':
      return 'shoppingBag';
    default:
      return iconName || 'coffee';
  }
};

const initFallbackMenu = () => {
  menuData.categories = [
    {
      name_ar: 'توليفات بن العجوز الخاصة',
      subtitle_ar: 'توليفات معتقة ومحمصة بعناية فائقة',
      icon_name: 'star',
      items: [
        {
          name_ar: 'توليفة العجوز الملكية',
          description_ar: 'خلطة أرابيكا ممتازة مع روبوستا معتقة وحبهان فستقي',
          pricing_type: 'weights',
          price: 720,
          price_eighth: 90,
          price_quarter: 180,
          price_half: 360,
          price_kilo: 720,
          is_featured: true,
        },
        {
          name_ar: 'توليفة السلطان الفاخرة',
          description_ar: 'مزيج كولومبي برازيلي غني بالكريما',
          pricing_type: 'weights',
          price: 640,
          price_eighth: 80,
          price_quarter: 160,
          price_half: 320,
          price_kilo: 640,
          is_featured: false,
        },
      ],
    },
    {
      name_ar: 'أصناف البن الفاخر',
      subtitle_ar: 'أفضل حبوب البن المختارة عالمياً',
      icon_name: 'coffee',
      items: [
        {
          name_ar: 'بن كولومبي سوبريمو',
          description_ar: 'حمضية متوازنة مع إيحاءات الكراميل والمكسرات',
          pricing_type: 'weights',
          price: 600,
          price_eighth: 75,
          price_quarter: 150,
          price_half: 300,
          price_kilo: 600,
          is_featured: true,
        },
        {
          name_ar: 'بن برازيلي سانتوس',
          description_ar: 'قوام غني ونكهة الشوكولاتة الكلاسيكية',
          pricing_type: 'weights',
          price: 520,
          price_eighth: 65,
          price_quarter: 130,
          price_half: 260,
          price_kilo: 520,
        },
      ],
    },
    {
      name_ar: 'المشروبات الساخنة والإسبريسو',
      subtitle_ar: 'مشروبات القهوة المحضرة على البار الإيطالي',
      icon_name: 'cup',
      items: [
        {
          name_ar: 'إسبريسو كلاسيك إيطالي',
          description_ar: 'شوت إسبريسو مركز مع كريما ذهبية كثيفة',
          pricing_type: 'dual',
          price: 35,
          price_secondary: 45,
          is_featured: true,
        },
        {
          name_ar: 'كابتشينو بن العجوز',
          description_ar: 'إسبريسو مع رغوة حليب ناعمة ورشة كاكاو',
          pricing_type: 'single',
          price: 50,
        },
      ],
    },
  ];
};

// الفلترة بناءً على البحث
const visibleCategories = computed(() => {
  if (!searchQuery.value.trim()) {
    return menuData.categories || [];
  }
  const q = searchQuery.value.toLowerCase();
  return (menuData.categories || [])
    .map((cat: any) => {
      const matchedItems = (cat.items || []).filter(
        (item: any) =>
          item.name_ar?.toLowerCase().includes(q) ||
          item.description_ar?.toLowerCase().includes(q) ||
          cat.name_ar?.toLowerCase().includes(q),
      );
      return {
        ...cat,
        items: matchedItems,
      };
    })
    .filter((cat: any) => cat.items.length > 0);
});

const scrollToCategory = (idx: number) => {
  activeCategoryIdx.value = idx;
  const el = document.getElementById(`category-section-${idx}`);
  if (el) {
    const yOffset = -80;
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
};

// Weight Management
const getItemWeightKey = (item: any) => item.id || item.name_ar;

const getItemWeight = (item: any) => {
  const key = getItemWeightKey(item);
  if (!selectedItemWeights[key]) {
    if (item.price_eighth) selectedItemWeights[key] = 'eighth';
    else if (item.price_quarter) selectedItemWeights[key] = 'quarter';
    else if (item.price_half) selectedItemWeights[key] = 'half';
    else selectedItemWeights[key] = 'kilo';
  }
  return selectedItemWeights[key];
};

const setItemWeight = (item: any, weight: string) => {
  selectedItemWeights[getItemWeightKey(item)] = weight;
};

// Size Management (Single/Double)
const getItemSize = (item: any) => {
  const key = getItemWeightKey(item);
  if (!selectedItemSizes[key]) {
    selectedItemSizes[key] = 'single';
  }
  return selectedItemSizes[key];
};

const setItemSize = (item: any, size: string) => {
  selectedItemSizes[getItemWeightKey(item)] = size;
};

// Calculated Item Price
const getCurrentItemPrice = (item: any): number => {
  if (item.pricing_type === 'weights') {
    const w = getItemWeight(item);
    if (w === 'eighth') return Number(item.price_eighth || 0);
    if (w === 'quarter') return Number(item.price_quarter || 0);
    if (w === 'half') return Number(item.price_half || 0);
    return Number(item.price_kilo || item.price || 0);
  }
  if (item.pricing_type === 'dual' || item.price_secondary) {
    const s = getItemSize(item);
    return s === 'double' ? Number(item.price_secondary || 0) : Number(item.price || 0);
  }
  return Number(item.price || 0);
};

const getWeightLabelAr = (weight: string) => {
  switch (weight) {
    case 'eighth':
      return 'ثمن كجم (125g)';
    case 'quarter':
      return 'ربع كجم (250g)';
    case 'half':
      return 'نصف كجم (500g)';
    case 'kilo':
      return 'كيلو (1000g)';
    default:
      return '';
  }
};

// Tray / Cart Actions
const addItemToTray = (item: any, categoryName: string) => {
  let variantLabel = '';
  const unitPrice = getCurrentItemPrice(item);

  if (item.pricing_type === 'weights') {
    variantLabel = getWeightLabelAr(getItemWeight(item));
  } else if (item.pricing_type === 'dual' || item.price_secondary) {
    variantLabel = getItemSize(item) === 'double' ? 'دبل (Double)' : 'سنجل (Single)';
  } else if (item.unit_label_ar) {
    variantLabel = item.unit_label_ar;
  }

  const existingIdx = trayItems.value.findIndex(
    (t) => t.name_ar === item.name_ar && t.variant_label === variantLabel,
  );

  if (existingIdx >= 0 && trayItems.value[existingIdx]) {
    trayItems.value[existingIdx]!.quantity += 1;
  } else {
    trayItems.value.push({
      id: item.id,
      name_ar: item.name_ar,
      category_name: categoryName,
      variant_label: variantLabel,
      unit_price: unitPrice,
      quantity: 1,
    });
  }

  // Animation trigger / feedback
  showTrayDrawer.value = false;
};

const increaseTrayQty = (idx: number) => {
  const item = trayItems.value[idx];
  if (item) {
    item.quantity += 1;
  }
};

const decreaseTrayQty = (idx: number) => {
  const item = trayItems.value[idx];
  if (item) {
    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      trayItems.value.splice(idx, 1);
    }
  }
};

const removeTrayItem = (idx: number) => {
  trayItems.value.splice(idx, 1);
};

const clearTray = () => {
  trayItems.value = [];
  showTrayDrawer.value = false;
};

const totalTrayCount = computed(() => {
  return trayItems.value.reduce((sum, item) => sum + item.quantity, 0);
});

const totalTrayPrice = computed(() => {
  return trayItems.value.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
});

// WhatsApp Order Formatting
const sendOrderViaWhatsApp = () => {
  if (!trayItems.value.length) return;

  const phone = cleanPhone(menuData.phone_primary || '01012345678');
  let msg = ` *طلب جديد من المنيو الرقمي (بن العجوز)* \n\n`;

  if (orderCustomerInfo.value.trim()) {
    msg += ` *العميل / الطاولة:* ${orderCustomerInfo.value.trim()}\n`;
  }
  msg += `─────────────────────\n`;

  trayItems.value.forEach((item, idx) => {
    msg += `${idx + 1}. *${item.name_ar}*`;
    if (item.variant_label) msg += ` (${item.variant_label})`;
    msg += `\n   الكمية: ${item.quantity} × ${item.unit_price} = ${item.quantity * item.unit_price} ج.م\n`;
  });

  msg += `─────────────────────\n`;
  msg += ` *المجموع النهائي:* ${totalTrayPrice.value} ج.م\n`;

  if (orderNotes.value.trim()) {
    msg += ` *ملاحظات خاصة:* ${orderNotes.value.trim()}\n`;
  }

  msg += `\nتم إرسال الطلب عبر المنيو الإلكتروني لبن العجوز `;

  const url = `https://wa.me/2${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
};

const openShareModal = () => {
  showShareModal.value = true;
  generateQr();
};

const copyMenuUrl = async () => {
  try {
    await navigator.clipboard.writeText(currentMenuUrl.value);
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2500);
  } catch {
    // Fallback
  }
};

const downloadQr = () => {
  downloadQrImage(qrDataUrl.value, `bin-alagoouz-menu-qr.png`);
};
</script>

<style scoped>
/* DIGITAL QR MENU — LUXURY RESPONSIVE MOBILE-FIRST STYLES */

.digital-menu-container {
  min-height: 100vh;
  background-color: #140d08;
  background-image: radial-gradient(circle at top, #2b180d 0%, #140d08 70%);
  color: #f7ede2;
  font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
  direction: rtl;
  padding-bottom: 100px;
}

/* الترويسة الرئيسية */
.digital-menu-header {
  position: relative;
  text-align: center;
  padding: 30px 16px 20px;
  background: linear-gradient(180deg, rgba(35, 20, 12, 0.9) 0%, rgba(20, 13, 8, 0.95) 100%);
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  overflow: hidden;
}

.brand-badge-top {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(212, 163, 115, 0.1);
  border: 1px solid rgba(212, 163, 115, 0.3);
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 0.75rem;
  color: #e5b98a;
  margin-bottom: 16px;
}

.brand-avatar-box {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.brand-avatar-ring {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  padding: 4px;
  background: linear-gradient(135deg, #d4a373 0%, #faedcd 50%, #8c532b 100%);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(212, 163, 115, 0.25);
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  background: #1b120c;
}

.brand-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: #faedcd;
  margin: 0 0 6px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  letter-spacing: 0.5px;
}

.brand-subtitle {
  font-size: 0.9rem;
  color: #d4a373;
  margin: 0 auto 16px;
  max-width: 480px;
  line-height: 1.5;
}

/* روابط الاتصال السريع */
.quick-contact-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 20px;
  font-size: 0.8rem;
  color: #f7ede2;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.contact-chip:hover {
  background: rgba(212, 163, 115, 0.2);
  border-color: #d4a373;
}

.contact-chip.wa {
  background: rgba(37, 211, 102, 0.15);
  border-color: rgba(37, 211, 102, 0.4);
  color: #a8f5c4;
}

.contact-chip.wa:hover {
  background: rgba(37, 211, 102, 0.25);
}

/* شريط البحث */
.menu-search-bar {
  position: relative;
  max-width: 480px;
  margin: 0 auto;
}

.search-input {
  width: 100%;
  padding: 10px 40px 10px 36px;
  background: rgba(20, 13, 8, 0.8);
  border: 1px solid rgba(212, 163, 115, 0.35);
  border-radius: 24px;
  color: #f7ede2;
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.search-input:focus {
  border-color: #d4a373;
  box-shadow: 0 0 12px rgba(212, 163, 115, 0.3);
}

.search-icon {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.9rem;
  color: #d4a373;
}

.clear-search-btn {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #a89f91;
  font-size: 0.9rem;
  cursor: pointer;
}

/* ═══════════════════ شريط التصنيفات المثبت ═══════════════════ */
.sticky-category-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(20, 13, 8, 0.96);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  padding: 8px 12px;
}

.categories-scroll-wrapper {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.categories-scroll-wrapper::-webkit-scrollbar {
  display: none;
}

.cat-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 163, 115, 0.2);
  color: #d4a373;
  font-size: 0.82rem;
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cat-nav-pill.active {
  background: linear-gradient(135deg, #d4a373 0%, #b07d4b 100%);
  color: #140d08;
  border-color: #faedcd;
  box-shadow: 0 4px 12px rgba(212, 163, 115, 0.3);
}

.cat-pill-count {
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 0.7rem;
}

.cat-nav-pill.active .cat-pill-count {
  background: rgba(20, 13, 8, 0.3);
  color: #140d08;
}

/* ═══════════════════ محتوى المنيو ═══════════════════ */
.digital-menu-body {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px 16px;
}

.menu-loading-state,
.menu-empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #d4a373;
}

.coffee-cup-loader {
  font-size: 3rem;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

.menu-category-section {
  margin-bottom: 36px;
  scroll-margin-top: 70px;
}

.category-section-header {
  margin-bottom: 16px;
}

.cat-header-title-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cat-header-icon {
  font-size: 1.4rem;
}

.cat-title {
  font-size: 1.25rem;
  font-weight: 800;
  color: #faedcd;
  margin: 0;
}

.cat-subtitle {
  font-size: 0.8rem;
  color: #d4a373;
  margin: 2px 0 0;
}

.cat-header-divider {
  height: 2px;
  background: linear-gradient(90deg, #d4a373 0%, rgba(212, 163, 115, 0.1) 100%);
  margin-top: 8px;
  border-radius: 2px;
}

/* شبكة كروت الأصناف */
.category-items-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

@media (min-width: 600px) {
  .category-items-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.digital-item-card {
  background: rgba(35, 20, 12, 0.7);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.digital-item-card:hover {
  transform: translateY(-2px);
  border-color: rgba(212, 163, 115, 0.45);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}

.digital-item-card.is-featured {
  border-color: rgba(212, 163, 115, 0.5);
  background: linear-gradient(145deg, rgba(45, 26, 15, 0.8) 0%, rgba(25, 15, 9, 0.8) 100%);
}

.item-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.item-name {
  font-size: 1rem;
  font-weight: 700;
  color: #faedcd;
  margin: 0 0 4px;
}

.item-badges-wrap {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.badge-featured {
  background: rgba(212, 163, 115, 0.2);
  color: #faedcd;
  border: 1px solid rgba(212, 163, 115, 0.4);
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.badge-new {
  background: rgba(56, 161, 105, 0.2);
  color: #9ae6b4;
  border: 1px solid rgba(56, 161, 105, 0.4);
  font-size: 0.68rem;
  padding: 1px 6px;
  border-radius: 8px;
}

.item-description {
  font-size: 0.78rem;
  color: #d4a373;
  margin: 0 0 10px;
  line-height: 1.4;
}

/* مصفوفة الأوزان */
.weights-pricing-matrix,
.dual-pricing-matrix {
  margin: 8px 0 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px;
  border-radius: 10px;
  border: 1px dashed rgba(212, 163, 115, 0.2);
}

.weights-selector-label {
  font-size: 0.72rem;
  color: #e5b98a;
  margin-bottom: 6px;
}

.weights-chips-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.dual-chips-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.weight-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 163, 115, 0.25);
  border-radius: 8px;
  color: #f7ede2;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.weight-chip.selected {
  background: rgba(212, 163, 115, 0.25);
  border-color: #d4a373;
  box-shadow: 0 0 8px rgba(212, 163, 115, 0.2);
}

.weight-chip .weight-label {
  font-size: 0.68rem;
  color: #d4a373;
}

.weight-chip.selected .weight-label {
  color: #faedcd;
  font-weight: 700;
}

.weight-chip .weight-price {
  font-size: 0.78rem;
  font-weight: 700;
  color: #ffffff;
}

/* التسعير الفردي */
.single-pricing-row {
  margin: 8px 0 12px;
}

.single-price-box {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.single-price-box .price-val {
  font-size: 1.2rem;
  font-weight: 800;
  color: #faedcd;
}

.single-price-box .currency {
  font-size: 0.8rem;
  color: #d4a373;
}

.single-price-box .unit-text {
  font-size: 0.75rem;
  color: #a89f91;
}

/* زر إضافة للطلب */
.item-card-footer {
  margin-top: 8px;
}

.btn-add-to-tray {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(212, 163, 115, 0.2) 0%, rgba(140, 83, 43, 0.2) 100%);
  border: 1px solid rgba(212, 163, 115, 0.35);
  border-radius: 10px;
  color: #faedcd;
  font-size: 0.82rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-to-tray:hover {
  background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
  color: #140d08;
  border-color: #faedcd;
  box-shadow: 0 4px 12px rgba(212, 163, 115, 0.3);
}

.calculated-price-tag {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.8rem;
}

.btn-add-to-tray:hover .calculated-price-tag {
  background: rgba(20, 13, 8, 0.3);
  color: #140d08;
}

/* التذييل */
.digital-menu-footer {
  text-align: center;
  padding: 30px 16px;
  border-top: 1px solid rgba(212, 163, 115, 0.2);
  background: rgba(15, 10, 6, 0.9);
}

.footer-gold-emblem {
  font-size: 1.1rem;
  font-weight: 800;
  color: #faedcd;
  margin-bottom: 8px;
}

.footer-address {
  font-size: 0.82rem;
  color: #d4a373;
  margin: 0 0 12px;
}

.footer-social-links {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
}

.social-link {
  color: #d4a373;
  text-decoration: none;
  font-size: 0.8rem;
  border: 1px solid rgba(212, 163, 115, 0.3);
  padding: 4px 12px;
  border-radius: 14px;
  transition: all 0.2s ease;
}

.social-link:hover {
  background: rgba(212, 163, 115, 0.2);
  color: #faedcd;
}

.footer-copyright {
  font-size: 0.72rem;
  color: #7d7265;
}

/* ═══════════════════ شريط الطلبات العائم ═══════════════════ */
.floating-order-bar {
  position: fixed;
  bottom: 16px;
  left: 16px;
  right: 16px;
  max-width: 600px;
  margin: 0 auto;
  z-index: 50;
  background: linear-gradient(135deg, #2b180d 0%, #1b1008 100%);
  border: 1px solid #d4a373;
  border-radius: 16px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.7),
    0 0 20px rgba(212, 163, 115, 0.3);
}

.tray-summary-col {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.tray-badge-count {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #d4a373 0%, #8c532b 100%);
  color: #140d08;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

.tray-text-info {
  display: flex;
  flex-direction: column;
}

.tray-label {
  font-size: 0.72rem;
  color: #d4a373;
}

.tray-total-price {
  font-size: 1.05rem;
  font-weight: 800;
  color: #faedcd;
}

.btn-open-tray {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #d4a373 0%, #b07d4b 100%);
  color: #140d08;
  border: none;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-open-tray:hover {
  box-shadow: 0 4px 14px rgba(212, 163, 115, 0.4);
}

/* ═══════════════════ درج الطلب (Drawer) ═══════════════════ */
.tray-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

@media (min-width: 600px) {
  .tray-drawer-overlay {
    align-items: center;
  }
}

.tray-drawer-card {
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  background: #1e130b;
  border: 1px solid #d4a373;
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.8);
}

@media (min-width: 600px) {
  .tray-drawer-card {
    border-radius: 20px;
    max-height: 80vh;
  }
}

.drawer-header {
  padding: 16px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-title-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drawer-title-box h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #faedcd;
}

.drawer-title-box p {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: #d4a373;
}

.btn-close-drawer,
.btn-close-modal {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #f7ede2;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 0.9rem;
  cursor: pointer;
}

.drawer-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.tray-items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.tray-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(212, 163, 115, 0.15);
  border-radius: 10px;
}

.titem-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.titem-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: #faedcd;
}

.titem-variant {
  font-size: 0.72rem;
  color: #d4a373;
}

.titem-unit-price {
  font-size: 0.7rem;
  color: #8c8275;
}

.titem-qty-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 10px;
}

.qty-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: rgba(212, 163, 115, 0.2);
  border: 1px solid rgba(212, 163, 115, 0.35);
  color: #faedcd;
  font-size: 0.9rem;
  cursor: pointer;
}

.qty-number {
  font-size: 0.9rem;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

.titem-total-col {
  display: flex;
  align-items: center;
  gap: 8px;
}

.titem-total {
  font-size: 0.9rem;
  font-weight: 800;
  color: #faedcd;
  white-space: nowrap;
}

.titem-del-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  opacity: 0.7;
}

.titem-del-btn:hover {
  opacity: 1;
}

.drawer-form-box {
  background: rgba(0, 0, 0, 0.2);
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 16px;
}

.form-row {
  margin-bottom: 10px;
}

.form-row label {
  display: block;
  font-size: 0.75rem;
  color: #d4a373;
  margin-bottom: 4px;
}

.tray-input {
  width: 100%;
  padding: 8px 12px;
  background: rgba(20, 13, 8, 0.9);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 8px;
  color: #f7ede2;
  font-size: 0.85rem;
  font-family: inherit;
}

.tray-input.textarea {
  resize: vertical;
}

.tray-grand-total-card {
  background: rgba(212, 163, 115, 0.1);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 10px;
  padding: 12px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #d4a373;
  margin-bottom: 4px;
}

.total-row.highlight {
  font-size: 1.1rem;
  font-weight: 800;
  color: #faedcd;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(212, 163, 115, 0.25);
}

.total-row.highlight .amount {
  color: #d4a373;
}

.drawer-footer {
  padding: 14px 16px;
  border-top: 1px solid rgba(212, 163, 115, 0.2);
  display: flex;
  gap: 10px;
}

.btn-send-whatsapp {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: linear-gradient(135deg, #25d366 0%, #128c7e 100%);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  font-size: 0.92rem;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(37, 211, 102, 0.3);
}

.btn-clear-tray {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #a89f91;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
}

/* ═══════════════════ نافذة المشاركة والـ QR ═══════════════════ */
.share-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.share-modal-card {
  width: 100%;
  max-width: 400px;
  background: #1e130b;
  border: 1px solid #d4a373;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.9);
}

.share-modal-header {
  padding: 16px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.share-modal-header h3 {
  margin: 0;
  color: #faedcd;
  font-size: 1.05rem;
}

.share-modal-body {
  padding: 20px 16px;
  text-align: center;
}

.qr-preview-box {
  width: 220px;
  height: 220px;
  margin: 0 auto 12px;
  background: #ffffff;
  padding: 10px;
  border-radius: 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-hint {
  font-size: 0.8rem;
  color: #d4a373;
  margin: 0 0 16px;
}

.share-url-box {
  display: flex;
  gap: 6px;
}

.share-url-input {
  flex: 1;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 8px;
  color: #faedcd;
  font-size: 0.78rem;
  direction: ltr;
}

.btn-copy-url {
  padding: 8px 12px;
  background: #d4a373;
  color: #140d08;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
}

.share-modal-footer {
  padding: 12px 16px;
  border-top: 1px solid rgba(212, 163, 115, 0.2);
  display: flex;
  gap: 8px;
}

.btn-download-qr {
  flex: 1;
  padding: 10px;
  background: linear-gradient(135deg, #d4a373 0%, #b07d4b 100%);
  color: #140d08;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-secondary {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f7ede2;
  border-radius: 10px;
  cursor: pointer;
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.tray-slide-enter-active,
.tray-slide-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.tray-slide-enter-from,
.tray-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
