<template>
  <div class="menu-builder-page">
    <!-- ═══════════════════ Header الرئيسي المتناسق مع النظام ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">📜</span>
        <div>
          <h2>إدارة وتصميم المنيو</h2>
          <p>تخصيص وتوزيع أصناف المنيو وتصديرها كملف PDF جاهز للطباعة (وش وظهر)</p>
        </div>
      </div>

      <div class="header-actions">
        <!-- اختيار الثيم -->
        <div class="theme-selector-wrap">
          <label class="theme-label">
            <AppIcon name="palette" :size="15" />
            <span>الثيم:</span>
          </label>
          <select v-model="menuForm.theme" class="form-select theme-select">
            <option value="coffee-gold">☕ بن العجوز الملكي (بني وذهبي)</option>
            <option value="modern-dark">🌙 دارك كافيه مودرن (فخم داكن)</option>
            <option value="warm-cream">📜 كريمي كلاسيك (دافئ عتيق)</option>
          </select>
        </div>

        <button
          type="button"
          class="btn btn-secondary"
          :disabled="isSaving"
          @click="openProductsModal"
        >
          <AppIcon name="add" :size="16" /> إضافة من المخزن
        </button>

        <button type="button" class="btn btn-primary" :disabled="isSaving" @click="handleSaveMenu">
          <AppIcon name="save" :size="16" />
          <span>{{ isSaving ? 'جاري الحفظ...' : 'حفظ المنيو' }}</span>
        </button>

        <button type="button" class="btn btn-outline" @click="handleDirectPrint">
          <AppIcon name="invoices" :size="16" /> طباعة فورية
        </button>

        <button
          type="button"
          class="btn btn-add"
          :disabled="isExportingPdf"
          @click="handleExportPdf"
        >
          <AppIcon name="download" :size="16" />
          <span>{{ isExportingPdf ? 'جاري التوليد...' : 'تصدير PDF عالي الدقة' }}</span>
        </button>
      </div>
    </div>

    <!-- رسائل التنبيه والنجاح -->
    <transition name="fade">
      <div v-if="feedbackMessage" :class="`feedback-alert ${feedbackType}`">
        <span class="alert-icon">{{ feedbackType === 'success' ? '✅' : '⚠️' }}</span>
        <span>{{ feedbackMessage }}</span>
      </div>
    </transition>

    <!-- ═══════════════════ مساحة العمل (Bento Layout) ═══════════════════ -->
    <div class="builder-layout">
      <!-- ─── الجانب الأيمن: لوحة التحكم والتعديل ─── -->
      <div class="control-panel-column">
        <div class="card panel-card">
          <!-- تبويبات التخصيص -->
          <div class="nav-tabs">
            <button
              type="button"
              class="tab-btn"
              :class="{ active: activeTab === 'content' }"
              @click="activeTab = 'content'"
            >
              <AppIcon name="clipboardList" :size="16" />
              <span>الأقسام والأصناف</span>
              <span class="badge-count">{{ menuForm.categories.length }}</span>
            </button>
            <button
              type="button"
              class="tab-btn"
              :class="{ active: activeTab === 'branding' }"
              @click="activeTab = 'branding'"
            >
              <AppIcon name="store" :size="16" />
              <span>الهوية والتواصل</span>
            </button>
          </div>

          <!-- 1. تبويب الأصناف والأقسام -->
          <div v-if="activeTab === 'content'" class="tab-content">
            <div class="section-top-bar">
              <span class="section-subtitle">توزيع الأقسام على صفحتي المنيو</span>
              <button type="button" class="btn btn-sm btn-outline" @click="addNewCategory">
                <AppIcon name="plus" :size="14" /> قسم جديد
              </button>
            </div>

            <!-- قائمة كروت الأقسام -->
            <div class="categories-list">
              <div
                v-for="(cat, cIdx) in menuForm.categories"
                :key="cIdx"
                class="category-editor-card"
              >
                <!-- رأس كارت القسم -->
                <div class="cat-head">
                  <div class="cat-head-main">
                    <span
                      class="page-indicator"
                      :class="cat.page_side === 'front' ? 'front' : 'back'"
                    >
                      {{ cat.page_side === 'front' ? 'الوجه (صفحة ١)' : 'الظهر (صفحة ٢)' }}
                    </span>
                    <input
                      v-model="cat.name_ar"
                      type="text"
                      placeholder="اسم القسم..."
                      class="cat-title-input"
                    />
                  </div>

                  <div class="cat-head-actions">
                    <button
                      type="button"
                      class="side-toggle-btn"
                      :title="
                        cat.page_side === 'front'
                          ? 'نقل إلى الصفحة الثانية (الظهر)'
                          : 'نقل إلى الصفحة الأولى (الوجه)'
                      "
                      @click="togglePageSide(cat)"
                    >
                      <AppIcon name="arrowRight" :size="14" />
                      <span>{{ cat.page_side === 'front' ? 'للظهر' : 'للوجه' }}</span>
                    </button>
                    <button
                      type="button"
                      class="icon-btn-delete"
                      title="حذف القسم"
                      @click="removeCategory(cIdx)"
                    >
                      <AppIcon name="delete" :size="15" />
                    </button>
                  </div>
                </div>

                <!-- تفاصيل وإعدادات القسم -->
                <div class="cat-body">
                  <div class="cat-meta-grid">
                    <input
                      v-model="cat.subtitle_ar"
                      type="text"
                      placeholder="وصف تسويقي مختصر للقسم..."
                      class="form-input text-xs"
                    />
                    <div class="flex gap-2">
                      <select v-model="cat.icon_name" class="form-select text-xs flex-1">
                        <option value="coffee">☕ قهوة وبن</option>
                        <option value="star">⭐ توليفة مميزة</option>
                        <option value="sparkles">✨ تحويجات وبهارات</option>
                        <option value="flame">🔥 مشروبات ساخنة</option>
                        <option value="snowflake">❄️ مشروبات مثلجة</option>
                        <option value="heart">❤️ إضافات وحلويات</option>
                      </select>
                      <select v-model="cat.column_span" class="form-select text-xs w-28">
                        <option :value="1">عمود واحد</option>
                        <option :value="2">عرض كامل</option>
                      </select>
                    </div>
                  </div>

                  <!-- أصناف القسم -->
                  <div class="items-editor-container">
                    <div class="items-head">
                      <span class="text-xs font-bold text-muted"
                        >الأصناف ({{ (cat.items || []).length }})</span
                      >
                      <button
                        type="button"
                        class="text-xs text-primary font-bold hover:underline"
                        @click="addNewItemToCat(cat)"
                      >
                        + إضافة صنف
                      </button>
                    </div>

                    <div class="items-list-wrap">
                      <div v-for="(item, iIdx) in cat.items" :key="iIdx" class="item-row-card">
                        <!-- السطر الأول: الاسم ونوع التسعير -->
                        <div class="item-row-primary">
                          <input
                            v-model="item.name_ar"
                            type="text"
                            placeholder="اسم الصنف..."
                            class="form-input item-input-name"
                          />
                          <select
                            v-model="item.pricing_type"
                            class="form-select item-pricing-type-select"
                          >
                            <option value="single">سعر موحد</option>
                            <option value="weights">⚖️ أوزان بن (ثمن/ربع/نص/كيلو)</option>
                            <option value="dual">حجمين (سنجل/دبل)</option>
                          </select>
                        </div>

                        <!-- السطر الثاني: خيارات الأسعار حسب نوع التسعير -->
                        <div class="item-pricing-fields">
                          <!-- 1. أوزان البن القياسية (ثمن، ربع، نصف، كيلو) -->
                          <div v-if="item.pricing_type === 'weights'" class="weights-editor-grid">
                            <div class="weight-input-box">
                              <span class="w-input-label">ثمن (١٢٥ج):</span>
                              <input
                                v-model.number="item.price_eighth"
                                type="number"
                                step="0.5"
                                placeholder="ثمن"
                                class="form-input text-center"
                              />
                            </div>
                            <div class="weight-input-box">
                              <span class="w-input-label">ربع (٢٥٠ج):</span>
                              <input
                                v-model.number="item.price_quarter"
                                type="number"
                                step="0.5"
                                placeholder="ربع"
                                class="form-input text-center"
                              />
                            </div>
                            <div class="weight-input-box">
                              <span class="w-input-label">نصف (٥٠٠ج):</span>
                              <input
                                v-model.number="item.price_half"
                                type="number"
                                step="0.5"
                                placeholder="نصف"
                                class="form-input text-center"
                              />
                            </div>
                            <div class="weight-input-box">
                              <span class="w-input-label">كيلو (١كج):</span>
                              <input
                                v-model.number="item.price_kilo"
                                type="number"
                                step="0.5"
                                placeholder="كيلو"
                                class="form-input text-center font-bold text-primary"
                                @input="onKiloPriceChange(item)"
                              />
                            </div>
                            <button
                              type="button"
                              class="btn-calc-weights"
                              title="حساب بقية الأوزان تلقائياً بناءً على سعر الكيلو"
                              @click="autoFillWeights(item)"
                            >
                              ⚡ حساب تلقائي
                            </button>
                          </div>

                          <!-- 2. حجمين (سنجل / دبل) -->
                          <div v-else-if="item.pricing_type === 'dual'" class="dual-editor-flex">
                            <div class="flex items-center gap-1">
                              <span class="text-xs text-muted">سنجل:</span>
                              <input
                                v-model.number="item.price"
                                type="number"
                                step="0.5"
                                placeholder="سنجل"
                                class="form-input w-20 text-center text-primary font-bold"
                              />
                            </div>
                            <div class="flex items-center gap-1">
                              <span class="text-xs text-muted">دبل:</span>
                              <input
                                v-model.number="item.price_secondary"
                                type="number"
                                step="0.5"
                                placeholder="دبل"
                                class="form-input w-20 text-center"
                              />
                            </div>
                            <span class="currency-tag">ج.م</span>
                          </div>

                          <!-- 3. سعر فردي موحد -->
                          <div v-else class="single-editor-flex">
                            <input
                              v-model.number="item.price"
                              type="number"
                              step="0.5"
                              placeholder="السعر"
                              class="form-input item-input-price"
                            />
                            <span class="currency-tag">ج.م</span>
                            <input
                              v-model="item.unit_label_ar"
                              type="text"
                              placeholder="الوحدة (كوب/قطعة)"
                              class="form-input w-28 text-xs text-muted"
                            />
                          </div>
                        </div>

                        <!-- السطر الثالث: الوصف والشارات والحذف -->
                        <div class="item-row-secondary">
                          <input
                            v-model="item.description_ar"
                            type="text"
                            placeholder="وصف ومكونات الصنف..."
                            class="form-input item-input-desc"
                          />
                          <button
                            type="button"
                            class="badge-toggle-btn"
                            :class="{ active: item.is_featured }"
                            :title="item.is_featured ? 'صنف مميز (انقر للإلغاء)' : 'تمييز الصنف'"
                            @click="item.is_featured = !item.is_featured"
                          >
                            {{ item.is_featured ? '⭐ مميز' : '☆ عادي' }}
                          </button>
                          <button
                            type="button"
                            class="badge-toggle-btn green"
                            :class="{ active: item.is_new }"
                            :title="item.is_new ? 'صنف جديد (انقر للإلغاء)' : 'تحديد كصنف جديد'"
                            @click="item.is_new = !item.is_new"
                          >
                            {{ item.is_new ? '✨ جديد' : 'قديم' }}
                          </button>
                          <button
                            type="button"
                            class="item-delete-btn"
                            title="حذف الصنف"
                            @click="removeItemFromCat(cat, iIdx)"
                          >
                            <AppIcon name="delete" :size="13" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. تبويب الهوية والتواصل -->
          <div v-if="activeTab === 'branding'" class="tab-content">
            <div class="form-section">
              <h3 class="form-section-title">
                <AppIcon name="coffee" :size="16" />
                <span>العلامة التجارية والشعار</span>
              </h3>
              <div class="form-group mb-3">
                <label class="form-label">شعار المحل (Logo):</label>
                <div class="flex items-center gap-3">
                  <div class="logo-preview-box">
                    <img
                      :src="menuForm.logo_url || '/logo-transparent.png'"
                      alt="Logo"
                      class="logo-thumb"
                    />
                  </div>
                  <div class="flex-1">
                    <input
                      v-model="menuForm.logo_url"
                      type="text"
                      placeholder="/logo-transparent.png أو رابط الشعار..."
                      class="form-input text-xs mb-1"
                    />
                    <div class="flex gap-1">
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        @click="menuForm.logo_url = '/logo-transparent.png'"
                      >
                        شعار شفاف
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        @click="menuForm.logo_url = '/logo.png'"
                      >
                        شعار رسمي
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        @click="menuForm.logo_url = '/logo.svg'"
                      >
                        شعار فكتور
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">عنوان المنيو:</label>
                <input v-model="menuForm.title_ar" type="text" class="form-input" />
              </div>
              <div class="form-group">
                <label class="form-label">الشعار والوصف التسويقي:</label>
                <input v-model="menuForm.subtitle_ar" type="text" class="form-input" />
              </div>
            </div>

            <div class="form-section">
              <h3 class="form-section-title">
                <AppIcon name="shop" :size="16" />
                <span>بيانات الاتصال والتوصيل</span>
              </h3>
              <div class="grid grid-2 gap-3">
                <div class="form-group">
                  <label class="form-label">الهاتف الأساسي:</label>
                  <input v-model="menuForm.phone_primary" type="text" class="form-input" />
                </div>
                <div class="form-group">
                  <label class="form-label">الهاتف الإضافي:</label>
                  <input v-model="menuForm.phone_secondary" type="text" class="form-input" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">العنوان وتفاصيل الفرع:</label>
                <input v-model="menuForm.address_ar" type="text" class="form-input" />
              </div>
            </div>

            <div class="form-section">
              <h3 class="form-section-title">
                <AppIcon name="copilot" :size="16" />
                <span>منصات التواصل الاجتماعي و QR Code</span>
              </h3>
              <div class="grid grid-2 gap-3">
                <div class="form-group">
                  <label class="form-label">فيسبوك:</label>
                  <input
                    v-model="menuForm.facebook_handle"
                    type="text"
                    placeholder="اسم الصفحة..."
                    class="form-input"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">انستجرام:</label>
                  <input
                    v-model="menuForm.instagram_handle"
                    type="text"
                    placeholder="اليوزر نيم..."
                    class="form-input"
                  />
                </div>
              </div>
              <div
                class="custom-toggle-row mt-3"
                @click="menuForm.show_qr_code = !menuForm.show_qr_code"
              >
                <div class="toggle-track" :class="{ 'is-on': menuForm.show_qr_code }">
                  <div class="toggle-knob"></div>
                </div>
                <span class="toggle-text font-bold text-xs"
                  >إظهار رمز الـ QR Code في تذييل المنيو</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── الجانب الأيسر: المعاينة الحية والتصدير ─── -->
      <div class="preview-column">
        <div class="card preview-card">
          <!-- شريط أدوات المعاينة -->
          <div class="preview-toolbar">
            <div class="preview-badge-status">
              <span class="status-dot"></span>
              <span>معاينة حية مقاس A4 للوجه والظهر</span>
            </div>

            <div class="zoom-controls">
              <span class="zoom-text">حجم العرض:</span>
              <button
                type="button"
                class="btn-zoom"
                :class="{ active: zoomLevel === 0.55 }"
                @click="zoomLevel = 0.55"
              >
                55%
              </button>
              <button
                type="button"
                class="btn-zoom"
                :class="{ active: zoomLevel === 0.75 }"
                @click="zoomLevel = 0.75"
              >
                75%
              </button>
              <button
                type="button"
                class="btn-zoom"
                :class="{ active: zoomLevel === 1 }"
                @click="zoomLevel = 1"
              >
                100%
              </button>
            </div>
          </div>

          <!-- مساحة عرض القالب الطباعي -->
          <div class="preview-viewport-scrollable">
            <div class="preview-scaling-container" :style="{ transform: `scale(${zoomLevel})` }">
              <div id="menu-pdf-export-node">
                <MenuPageLayout :menu-data="menuForm" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ مودال إضافة منتجات من المخزن ═══════════════════ -->
    <div v-if="showProductsModal" class="modal-overlay" @click.self="showProductsModal = false">
      <div class="modal-box products-modal">
        <div class="modal-header">
          <div class="modal-header-title">
            <AppIcon name="products" :size="20" />
            <h3>إضافة منتجات من المخزن إلى المنيو</h3>
          </div>
          <button type="button" class="btn-close" @click="showProductsModal = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group mb-3">
            <label class="form-label font-bold">القسم المستهدف في المنيو:</label>
            <select v-model="selectedTargetCatIdx" class="form-select">
              <option v-for="(cat, idx) in menuForm.categories" :key="idx" :value="idx">
                {{ cat.name_ar }} ({{ cat.page_side === 'front' ? 'الوجه' : 'الظهر' }})
              </option>
            </select>
          </div>

          <div class="search-input-wrap mb-3">
            <input
              v-model="productsSearch"
              type="text"
              placeholder="🔍 ابحث عن اسم المنتج أو الباركود..."
              class="form-input"
            />
          </div>

          <div class="products-pick-list custom-scrollbar">
            <div
              v-for="prod in filteredProducts"
              :key="prod.id"
              class="product-row-item"
              @click="addProductToMenu(prod)"
            >
              <div class="prod-details">
                <span class="prod-name font-bold">{{ prod.name_ar }}</span>
                <span class="prod-category text-muted text-xs"
                  >{{ prod.category_name || 'بدون تصنيف' }} · SKU: {{ prod.sku || '-' }}</span
                >
              </div>
              <div class="prod-action">
                <span class="prod-price font-extrabold">{{ prod.sale_price }} ج.م</span>
                <button type="button" class="btn btn-xs btn-primary">+ إضافة</button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showProductsModal = false">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { menu as menuApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';
import MenuPageLayout from '@/components/menu/MenuPageLayout.vue';

const activeTab = ref<'content' | 'branding'>('content');
const zoomLevel = ref(0.75);
const isSaving = ref(false);
const isExportingPdf = ref(false);
const showProductsModal = ref(false);
const selectedTargetCatIdx = ref(0);
const productsSearch = ref('');
const availableProducts = ref<any[]>([]);

const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

const menuForm = reactive({
  id: undefined as number | undefined,
  title_ar: 'بن العجوز',
  subtitle_ar: 'أصل القهوة والتوليفات الفاخرة منذ 1980',
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

onMounted(async () => {
  try {
    const res = await menuApi.getActive();
    if (res.data) {
      Object.assign(menuForm, res.data);
    }
  } catch {
    initDefaultCategories();
  }
});

const initDefaultCategories = () => {
  menuForm.categories = [
    {
      name_ar: 'توليفات بن العجوز الخاصة',
      subtitle_ar: 'توليفات معتقة ومحمصة بعناية فائقة',
      page_side: 'front',
      sort_order: 1,
      icon_name: 'star',
      column_span: 1,
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
      page_side: 'front',
      sort_order: 2,
      icon_name: 'coffee',
      column_span: 1,
      items: [
        {
          name_ar: 'بن كولومبي سوبريمو',
          description_ar: 'حموضة متوازنة وإيحاءات المكسرات والشوكولاتة',
          pricing_type: 'weights',
          price: 760,
          price_eighth: 95,
          price_quarter: 190,
          price_half: 380,
          price_kilo: 760,
          is_featured: true,
        },
        {
          name_ar: 'بن برازيلي سانتوس',
          description_ar: 'قوام كامل ونكهة كلاسيكية ناعمة وبدون مرارة',
          pricing_type: 'weights',
          price: 600,
          price_eighth: 75,
          price_quarter: 150,
          price_half: 300,
          price_kilo: 600,
          is_featured: false,
        },
      ],
    },
    {
      name_ar: 'مشروبات القهوة الساخنة',
      subtitle_ar: 'فناجين تُحضر طازجة عند الطلب',
      page_side: 'back',
      sort_order: 1,
      icon_name: 'flame',
      column_span: 1,
      items: [
        {
          name_ar: 'فنجان قهوة تركي سادة / محوج',
          description_ar: 'يُحضر على الرمالة بالطريقة التقليدية',
          pricing_type: 'dual',
          price: 35,
          price_secondary: 45,
          is_featured: true,
        },
        {
          name_ar: 'إسبريسو سينجل / دبل',
          description_ar: 'شوت مركز من حبوبنا الطازجة',
          pricing_type: 'dual',
          price: 40,
          price_secondary: 55,
          is_featured: false,
        },
      ],
    },
  ];
};

const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  setTimeout(() => {
    feedbackMessage.value = '';
  }, 4000);
};

const onKiloPriceChange = (item: any) => {
  if (item.price_kilo && !item.price_quarter) {
    autoFillWeights(item);
  }
};

const autoFillWeights = (item: any) => {
  const kPrice = Number(item.price_kilo || item.price || 0);
  if (kPrice > 0) {
    item.price_kilo = kPrice;
    item.price_half = Math.round(kPrice / 2);
    item.price_quarter = Math.round(kPrice / 4);
    item.price_eighth = Math.round(kPrice / 8);
    item.price = kPrice;
    showFeedback('تم احتساب أوزان (ثمن، ربع، نصف، كيلو) تلقائياً ⚡', 'success');
  }
};

const handleSaveMenu = async () => {
  isSaving.value = true;
  try {
    let res;
    if (menuForm.id) {
      res = await menuApi.update(menuForm.id, menuForm);
    } else {
      res = await menuApi.create(menuForm);
    }
    if (res.data) {
      Object.assign(menuForm, res.data);
      showFeedback('تم حفظ وتحديث المنيو بنجاح! 🎉', 'success');
    }
  } catch (err: any) {
    showFeedback(err.message || 'حدث خطأ أثناء حفظ المنيو', 'error');
  } finally {
    isSaving.value = false;
  }
};

const handleExportPdf = async () => {
  const element = document.getElementById('menu-pdf-export-node');
  if (!element) return;

  isExportingPdf.value = true;
  try {
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = (html2pdfModule.default || html2pdfModule) as any;

    const opt = {
      margin: 0,
      filename: `menu-${menuForm.title_ar || 'alagoouz'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        letterRendering: true,
        logging: false,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    await html2pdf().set(opt).from(element).save();
    showFeedback('تم تصدير ملف PDF عالي الجودة بنجاح! 📄', 'success');
  } catch (err: any) {
    console.error('PDF Export error:', err);
    showFeedback('تعذر تصدير PDF. يمكنك استخدام زر الطباعة المباشرة كبديل.', 'error');
  } finally {
    isExportingPdf.value = false;
  }
};

const handleDirectPrint = () => {
  window.print();
};

const addNewCategory = () => {
  menuForm.categories.push({
    name_ar: 'قسم جديد',
    subtitle_ar: '',
    page_side: 'front',
    sort_order: menuForm.categories.length + 1,
    icon_name: 'coffee',
    column_span: 1,
    items: [],
  });
};

const removeCategory = (index: number | string) => {
  menuForm.categories.splice(Number(index), 1);
};

const togglePageSide = (cat: any) => {
  cat.page_side = cat.page_side === 'front' ? 'back' : 'front';
};

const addNewItemToCat = (cat: any) => {
  if (!cat.items) cat.items = [];
  const isCoffeeCat =
    cat.name_ar?.includes('بن') || cat.name_ar?.includes('توليف') || cat.page_side === 'front';
  cat.items.push({
    name_ar: 'صنف جديد',
    description_ar: '',
    pricing_type: isCoffeeCat ? 'weights' : 'single',
    price: isCoffeeCat ? 600 : 50,
    price_kilo: isCoffeeCat ? 600 : null,
    price_half: isCoffeeCat ? 300 : null,
    price_quarter: isCoffeeCat ? 150 : null,
    price_eighth: isCoffeeCat ? 75 : null,
    price_secondary: null,
    is_featured: false,
    is_new: false,
  });
};

const removeItemFromCat = (cat: any, itemIdx: number | string) => {
  cat.items.splice(Number(itemIdx), 1);
};

const openProductsModal = async () => {
  showProductsModal.value = true;
  if (availableProducts.value.length === 0) {
    try {
      const res = await menuApi.getAvailableProducts();
      availableProducts.value = res.data || [];
    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }
};

const filteredProducts = computed(() => {
  if (!productsSearch.value.trim()) return availableProducts.value;
  const q = productsSearch.value.toLowerCase();
  return availableProducts.value.filter(
    (p) =>
      p.name_ar?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.category_name?.toLowerCase().includes(q),
  );
});

const addProductToMenu = (prod: any) => {
  if (!menuForm.categories.length) {
    addNewCategory();
  }
  const targetCat = menuForm.categories[selectedTargetCatIdx.value] || menuForm.categories[0];
  if (!targetCat.items) targetCat.items = [];

  const basePrice = Number(prod.sale_price || 0);
  const isCoffee =
    prod.unit?.includes('كجم') ||
    prod.unit?.includes('كيلو') ||
    prod.category_name?.includes('بن') ||
    prod.category_name?.includes('توليف') ||
    targetCat.name_ar?.includes('بن') ||
    targetCat.name_ar?.includes('توليف');

  targetCat.items.push({
    product_id: prod.id,
    name_ar: prod.name_ar,
    description_ar: '',
    pricing_type: isCoffee ? 'weights' : 'single',
    price: basePrice,
    price_kilo: isCoffee ? basePrice : null,
    price_half: isCoffee ? Math.round(basePrice / 2) : null,
    price_quarter: isCoffee ? Math.round(basePrice / 4) : null,
    price_eighth: isCoffee ? Math.round(basePrice / 8) : null,
    unit_label_ar: prod.unit || null,
    is_featured: false,
    is_new: false,
  });

  showFeedback(`تمت إضافة "${prod.name_ar}" إلى قسم "${targetCat.name_ar}"`, 'success');
};
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
   MENU BUILDER ERP UNIFIED DESIGN & SYSTEM TOKENS
   ═══════════════════════════════════════════════════════════════════ */

.menu-builder-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: calc(100vh - var(--navbar-height) - 40px);
}

/* الترويسة المتناسقة */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-title h2 {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text-strong);
  margin: 0;
}

.header-title p {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 2px 0 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.theme-selector-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--surface-2);
  padding: 4px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.theme-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

.theme-select {
  padding: 4px 10px;
  font-size: 0.82rem;
  font-weight: 700;
  border-radius: var(--radius-sm);
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-strong);
  outline: none;
  box-shadow: none;
  cursor: pointer;
}

.theme-select:focus,
.form-select:focus,
.form-input:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent);
}

.form-select {
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-strong);
  background-color: var(--bg-elevated);
  color: var(--text-strong);
  font-weight: 700;
  outline: none;
  box-shadow: none;
  cursor: pointer;
}

.item-pricing-type-select {
  font-size: 0.78rem;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-strong);
  font-weight: 700;
  max-width: 190px;
  outline: none;
  box-shadow: none;
  cursor: pointer;
}

.badge-toggle-btn {
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition);
  box-shadow: none;
}

.badge-toggle-btn.active {
  background: #fef3c7;
  color: #92400e;
  border-color: #f59e0b;
}

.badge-toggle-btn.green.active {
  background: #dcfce7;
  color: #166534;
  border-color: #22c55e;
}

.custom-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.toggle-track {
  width: 38px;
  height: 20px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  position: relative;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.toggle-track.is-on {
  background: var(--primary);
  border-color: var(--primary);
}

.toggle-knob {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  right: 3px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.toggle-track.is-on .toggle-knob {
  transform: translateX(-16px);
}

.toggle-text {
  color: var(--text-strong);
}

/* مساحة العمل (Layout) */
.builder-layout {
  display: grid;
  grid-template-columns: 460px 1fr;
  gap: var(--space-4);
  align-items: start;
}

@media (max-width: 1200px) {
  .builder-layout {
    grid-template-columns: 1fr;
  }
}

.panel-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
}

/* تبويبات التنقل */
.nav-tabs {
  display: flex;
  gap: var(--space-2);
  background: var(--surface-2);
  padding: 4px;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all var(--transition);
}

.tab-btn.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.badge-count {
  background: var(--surface-3);
  color: var(--primary-strong);
  padding: 1px 6px;
  border-radius: var(--radius-xl);
  font-size: 0.75rem;
}

.section-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.section-subtitle {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* كارت القسم */
.category-editor-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
  overflow: hidden;
  transition: border-color var(--transition);
}

.category-editor-card:hover {
  border-color: var(--border-strong);
}

.cat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--surface-3);
  border-bottom: 1px solid var(--border);
}

.cat-head-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
}

.page-indicator {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.page-indicator.front {
  background: #fef3c7;
  color: #92400e;
}

.page-indicator.back {
  background: #e0e7ff;
  color: #3730a3;
}

.cat-title-input {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-strong);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  padding: 2px 6px;
  width: 55%;
  outline: none;
}

.cat-title-input:focus {
  background: var(--bg-card);
  border-color: var(--border-strong);
}

.cat-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.side-toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
}

.icon-btn-delete {
  background: transparent;
  border: none;
  color: var(--danger);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-xs);
}

.cat-body {
  padding: var(--space-3);
}

.cat-meta-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

/* الأصناف */
.items-editor-container {
  border-top: 1px solid var(--border);
  padding-top: var(--space-2);
}

.items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.item-row-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  margin-bottom: 6px;
}

.item-row-primary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: 6px;
}

.item-input-name {
  flex: 1;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 4px 8px;
}

.item-pricing-type-select {
  font-size: 0.78rem;
  padding: 3px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-strong);
  font-weight: 700;
  max-width: 170px;
}

.item-pricing-fields {
  margin-bottom: 6px;
  background: var(--surface-2);
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  border: 1px dashed var(--border);
}

.weights-editor-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.weight-input-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.w-input-label {
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--text-muted);
}

.weight-input-box input {
  padding: 3px 4px;
  font-size: 0.8rem;
}

.btn-calc-weights {
  background: var(--bg-card);
  border: 1px solid var(--primary-soft);
  color: var(--primary);
  font-size: 0.72rem;
  font-weight: 800;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition);
  margin-top: 14px;
}

.btn-calc-weights:hover {
  background: var(--primary);
  color: #fff;
}

.dual-editor-flex,
.single-editor-flex {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.item-input-price {
  width: 70px;
  text-align: center;
  font-weight: 800;
  color: var(--primary);
  padding: 4px;
  font-size: 0.85rem;
}

.currency-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.item-row-secondary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.item-input-desc {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 2px 6px;
}

.featured-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
  cursor: pointer;
  white-space: nowrap;
}

.item-delete-btn {
  background: transparent;
  border: none;
  color: var(--danger);
  cursor: pointer;
  padding: 2px;
}

/* نموذج الهوية */
.form-section {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.form-section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-strong);
  margin-bottom: var(--space-3);
}

.form-group {
  margin-bottom: var(--space-2);
}

.form-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.logo-preview-box {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-strong);
  background: var(--surface-3);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* عمود المعاينة */
.preview-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--surface-2);
}

.preview-toolbar {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  margin-bottom: var(--space-4);
}

.preview-badge-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-strong);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.zoom-text {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

.btn-zoom {
  padding: 3px 8px;
  font-size: 0.78rem;
  font-weight: 800;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: all var(--transition);
}

.btn-zoom.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.preview-viewport-scrollable {
  width: 100%;
  overflow: auto;
  max-height: calc(100vh - 250px);
  display: flex;
  justify-content: center;
  padding: var(--space-2);
}

.preview-scaling-container {
  transform-origin: top center;
  transition: transform 0.2s ease-out;
}

/* المودال */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.products-modal {
  width: 520px;
  max-width: 90vw;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.modal-header-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 800;
  color: var(--text-strong);
}

.modal-body {
  padding: var(--space-4);
}

.products-pick-list {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.product-row-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--transition);
}

.product-row-item:hover {
  background: var(--surface-2);
}

.prod-details {
  display: flex;
  flex-direction: column;
}

.prod-name {
  font-size: 0.88rem;
  color: var(--text-strong);
}

.prod-action {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.prod-price {
  font-size: 0.95rem;
  color: var(--primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

/* التنبيهات */
.feedback-alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-weight: 700;
}

.feedback-alert.success {
  background: #dcfce7;
  color: var(--success);
  border: 1px solid #bbf7d0;
}

.feedback-alert.error {
  background: #fee2e2;
  color: var(--danger);
  border: 1px solid #fecaca;
}
</style>
