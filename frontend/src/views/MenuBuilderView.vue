<template>
  <div class="menu-builder-page">
    <!-- ═══════════════════ Header الرئيسي المتناسق مع النظام ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">📜</span>
        <div>
          <h2>إدارة وتصميم المنيو</h2>
          <p>تخصيص وتوزيع أصناف المنيو وتصديرها كملف PDF جاهز للطباعة الفورية (وش وظهر)</p>
        </div>
      </div>

      <div class="header-actions">
        <!-- التبديل بين صفحة المحرر وصفحة المعاينة -->
        <div class="mode-nav-tabs">
          <button
            type="button"
            class="mode-nav-btn"
            :class="{ active: activeMainTab === 'builder' }"
            @click="activeMainTab = 'builder'"
          >
            <AppIcon name="receipt" :size="16" />
            <span>محرر المنيو</span>
          </button>
          <button
            type="button"
            class="mode-nav-btn"
            :class="{ active: activeMainTab === 'preview' }"
            @click="activeMainTab = 'preview'"
          >
            <AppIcon name="print" :size="16" />
            <span>المعاينة والطباعة 👁️</span>
          </button>
        </div>

        <button
          v-if="activeMainTab === 'builder'"
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

        <button
          v-if="activeMainTab === 'preview'"
          type="button"
          class="btn btn-outline"
          @click="handleDirectPrint"
        >
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

    <!-- ═══════════════════ الصفحة 1: محرر وتصميم المنيو (عرض كامل 100%) ═══════════════════ -->
    <div v-if="activeMainTab === 'builder'" class="builder-full-container">
      <div class="card full-panel-card">
        <!-- التبويبات الفرعية للمحرر -->
        <div class="sub-nav-tabs">
          <button
            type="button"
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'content' }"
            @click="activeSubTab = 'content'"
          >
            <AppIcon name="categories" :size="16" />
            <span>الأقسام والأصناف</span>
            <span class="badge-count">{{ menuForm.categories.length }} أقسام</span>
          </button>
          <button
            type="button"
            class="sub-tab-btn"
            :class="{ active: activeSubTab === 'branding' }"
            @click="activeSubTab = 'branding'"
          >
            <AppIcon name="coffee" :size="16" />
            <span>الهوية والشعار والبيانات</span>
          </button>

          <div class="tab-spacer"></div>

          <!-- زر سريع للانتقال للمعاينة -->
          <button
            type="button"
            class="btn btn-sm btn-outline preview-jump-btn"
            @click="activeMainTab = 'preview'"
          >
            <span>معاينة المنيو المباشرة</span>
            <AppIcon name="arrowRight" :size="14" />
          </button>
        </div>

        <!-- 1. تبويب الأصناف والأقسام -->
        <div v-if="activeSubTab === 'content'" class="tab-body-wrapper">
          <div class="section-top-bar">
            <div class="flex items-center gap-2">
              <span class="section-subtitle">توزيع الأقسام على صفحتي المنيو (الوجه والظهر):</span>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-sm btn-secondary" @click="openProductsModal">
                <AppIcon name="add" :size="14" /> جلب من المخزن
              </button>
              <button type="button" class="btn btn-sm btn-primary" @click="addNewCategory">
                <AppIcon name="plus" :size="14" /> قسم جديد
              </button>
            </div>
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
                    placeholder="اسم القسم (مثال: توليفات بن العجوز)..."
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
                    <span>{{ cat.page_side === 'front' ? 'تحويل للظهر' : 'تحويل للوجه' }}</span>
                  </button>
                  <button
                    type="button"
                    class="icon-btn-delete"
                    title="حذف القسم"
                    @click="removeCategory(cIdx)"
                  >
                    <AppIcon name="delete" :size="16" />
                  </button>
                </div>
              </div>

              <!-- تفاصيل وإعدادات القسم -->
              <div class="cat-body">
                <div class="cat-meta-grid">
                  <div class="flex-1">
                    <input
                      v-model="cat.subtitle_ar"
                      type="text"
                      placeholder="وصف تسويقي مختصر للقسم..."
                      class="form-input text-xs w-full"
                    />
                  </div>
                  <div class="flex gap-2">
                    <select v-model="cat.icon_name" class="form-select text-xs">
                      <option value="coffee">☕ قهوة وبن</option>
                      <option value="star">⭐ توليفة مميزة</option>
                      <option value="sparkles">✨ تحويجات وبهارات</option>
                      <option value="flame">🔥 مشروبات ساخنة</option>
                      <option value="snowflake">❄️ مشروبات مثلجة</option>
                      <option value="heart">❤️ إضافات وحلويات</option>
                    </select>
                    <select v-model="cat.column_span" class="form-select text-xs">
                      <option :value="1">عمود واحد (1 Col)</option>
                      <option :value="2">عرض كامل (2 Cols)</option>
                    </select>
                  </div>
                </div>

                <!-- أصناف القسم -->
                <div class="items-editor-container">
                  <div class="items-head">
                    <span class="text-xs font-extrabold text-muted">
                      الأصناف المدرجة في هذا القسم ({{ (cat.items || []).length }}):
                    </span>
                    <button
                      type="button"
                      class="btn btn-xs btn-outline"
                      @click="addItemToCategory(cat)"
                    >
                      + صنف يدوي
                    </button>
                  </div>

                  <!-- قائمة الأصناف -->
                  <div v-if="!cat.items || !cat.items.length" class="empty-items-notice">
                    لا توجد أصناف في هذا القسم بعد. اضغط على "+ صنف يدوي" أو "جلب من المخزن".
                  </div>

                  <div v-for="(item, iIdx) in cat.items" :key="iIdx" class="item-row-card">
                    <!-- السطر الأول: الاسم ونوع التسعير -->
                    <div class="item-row-primary">
                      <input
                        v-model="item.name_ar"
                        type="text"
                        placeholder="اسم الصنف (مثال: بن كولومبي)..."
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
                      <div v-if="item.pricing_type === 'weights'" class="weights-editor-box">
                        <div class="weights-editor-grid">
                          <div class="weight-input-box">
                            <span class="w-input-label">ثمن (١٢٥ج)</span>
                            <input
                              v-model.number="item.price_eighth"
                              type="number"
                              step="0.5"
                              placeholder="ثمن"
                              class="form-input text-center"
                            />
                          </div>
                          <div class="weight-input-box">
                            <span class="w-input-label">ربع (٢٥٠ج)</span>
                            <input
                              v-model.number="item.price_quarter"
                              type="number"
                              step="0.5"
                              placeholder="ربع"
                              class="form-input text-center"
                            />
                          </div>
                          <div class="weight-input-box">
                            <span class="w-input-label">نصف (٥٠٠ج)</span>
                            <input
                              v-model.number="item.price_half"
                              type="number"
                              step="0.5"
                              placeholder="نصف"
                              class="form-input text-center"
                            />
                          </div>
                          <div class="weight-input-box">
                            <span class="w-input-label">كيلو (١كج)</span>
                            <input
                              v-model.number="item.price_kilo"
                              type="number"
                              step="0.5"
                              placeholder="كيلو"
                              class="form-input text-center font-bold text-primary"
                              @input="onKiloPriceChange(item)"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          class="btn-calc-weights-full"
                          title="حساب بقية الأوزان تلقائياً بناءً على سعر الكيلو"
                          @click="autoFillWeights(item)"
                        >
                          ⚡ حساب تلقائي (ثمن، ربع، نصف) بناءً على سعر الكيلو
                        </button>
                      </div>

                      <!-- 2. حجمين (سنجل / دبل) -->
                      <div v-else-if="item.pricing_type === 'dual'" class="dual-editor-flex">
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-muted font-bold">سنجل:</span>
                          <input
                            v-model.number="item.price"
                            type="number"
                            step="0.5"
                            placeholder="سنجل"
                            class="form-input w-24 text-center text-primary font-bold"
                          />
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="text-xs text-muted font-bold">دبل:</span>
                          <input
                            v-model.number="item.price_secondary"
                            type="number"
                            step="0.5"
                            placeholder="دبل"
                            class="form-input w-24 text-center"
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
                          class="form-input w-36 text-xs text-muted"
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
                        <AppIcon name="delete" :size="15" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. تبويب الهوية والتواصل -->
        <div v-if="activeSubTab === 'branding'" class="tab-body-wrapper">
          <div class="branding-grid-layout">
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
                    <div class="flex gap-2">
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
                <label class="form-label">عنوان المنيو الأساسي:</label>
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
    </div>

    <!-- ═══════════════════ الصفحة 2: المعاينة الحية والطباعة (عرض كامل 100%) ═══════════════════ -->
    <div v-if="activeMainTab === 'preview'" class="preview-full-container">
      <div class="card preview-full-card">
        <!-- شريط أدوات المعاينة العريض -->
        <div class="preview-full-toolbar">
          <div class="preview-toolbar-left">
            <button type="button" class="btn btn-sm btn-outline" @click="activeMainTab = 'builder'">
              <AppIcon name="arrowLeft" :size="14" />
              <span>← العودة لمحرر المنيو</span>
            </button>
            <div class="preview-badge-status">
              <span class="status-dot"></span>
              <span>معاينة حية A4 فائقة الجودة (وش وظهر)</span>
            </div>
          </div>

          <div class="preview-toolbar-right">
            <!-- اختيار الثيم مباشرة من المعاينة -->
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

            <!-- أزرار التكبير والتصغير -->
            <div class="zoom-controls">
              <span class="zoom-text">التكبير:</span>
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

            <button type="button" class="btn btn-sm btn-outline" @click="handleDirectPrint">
              <AppIcon name="invoices" :size="14" /> طباعة فورية
            </button>
            <button
              type="button"
              class="btn btn-sm btn-add"
              :disabled="isExportingPdf"
              @click="handleExportPdf"
            >
              <AppIcon name="download" :size="14" />
              <span>{{ isExportingPdf ? 'جاري التوليد...' : 'تحميل PDF' }}</span>
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
              placeholder="🔍 ابحث بالاسم، الباركود، أو التصنيف..."
              class="form-input search-products-input"
            />
          </div>

          <div class="products-pick-grid custom-scrollbar">
            <div
              v-for="prod in filteredProducts"
              :key="prod.id"
              class="product-picker-card"
              @click="addProductToMenu(prod)"
            >
              <div class="prod-card-info">
                <span class="prod-title">{{ prod.name_ar }}</span>
                <div class="prod-tags">
                  <span class="prod-tag-cat">{{ prod.category_name || 'عام' }}</span>
                  <span v-if="prod.unit" class="prod-tag-unit">{{ prod.unit }}</span>
                </div>
              </div>
              <div class="prod-card-action">
                <span class="prod-price-text">{{ prod.sale_price }} <small>ج.م</small></span>
                <button type="button" class="btn-quick-add">+ إضافة</button>
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

const activeMainTab = ref<'builder' | 'preview'>('builder');
const activeSubTab = ref<'content' | 'branding'>('content');
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
          name_ar: 'بن حبشي يرجاشيفي',
          description_ar: 'نكهة زهرية فاكهية برائحة الياسمين',
          pricing_type: 'weights',
          price: 800,
          price_eighth: 100,
          price_quarter: 200,
          price_half: 400,
          price_kilo: 800,
          is_featured: false,
        },
      ],
    },
    {
      name_ar: 'مشروبات القهوة الساخنة',
      subtitle_ar: 'تُحضر طازجة بأيدي باريستا محترف',
      page_side: 'back',
      sort_order: 3,
      icon_name: 'flame',
      column_span: 1,
      items: [
        {
          name_ar: 'قهوة تركي بن العجوز',
          description_ar: 'توليفة خاصة مع وش ذهبي متماسك',
          pricing_type: 'dual',
          price: 35,
          price_secondary: 50,
          is_featured: true,
        },
        {
          name_ar: 'إسبريسو دبل ريستريتو',
          description_ar: 'استخلاص مركز وكثيف بالكريما',
          pricing_type: 'single',
          price: 45,
          unit_label_ar: 'كوب',
          is_featured: false,
        },
      ],
    },
    {
      name_ar: 'المثلجات والفرابيه',
      subtitle_ar: 'انتعاش بنكهات القهوة الغنية',
      page_side: 'back',
      sort_order: 4,
      icon_name: 'snowflake',
      column_span: 1,
      items: [
        {
          name_ar: 'آيس موكا شوكولاتة بلجيكي',
          description_ar: 'شوكولاتة داكنة مع حليب وإسبريسو مثلج',
          pricing_type: 'single',
          price: 65,
          unit_label_ar: 'كوب كبير',
          is_featured: true,
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

const removeCategory = (idx: number | string) => {
  if (confirm('هل أنت متأكد من حذف هذا القسم بجميع أصنافه؟')) {
    menuForm.categories.splice(Number(idx), 1);
  }
};

const togglePageSide = (cat: any) => {
  cat.page_side = cat.page_side === 'front' ? 'back' : 'front';
};

const addItemToCategory = (cat: any) => {
  if (!cat.items) cat.items = [];
  cat.items.push({
    name_ar: 'صنف جديد',
    description_ar: '',
    pricing_type: 'weights',
    price: 0,
    price_kilo: 0,
    price_half: 0,
    price_quarter: 0,
    price_eighth: 0,
    unit_label_ar: 'كجم',
    is_featured: false,
    is_new: false,
  });
};

const onKiloPriceChange = (item: any) => {
  if (item.pricing_type === 'weights' && item.price_kilo) {
    item.price = item.price_kilo;
  }
};

const autoFillWeights = (item: any) => {
  const kilo = Number(item.price_kilo || item.price || 0);
  if (kilo > 0) {
    item.price_kilo = kilo;
    item.price = kilo;
    item.price_half = Math.round(kilo / 2);
    item.price_quarter = Math.round(kilo / 4);
    item.price_eighth = Math.round(kilo / 8);
    showFeedback(
      `تم حساب أوزان (${item.name_ar}) تلقائياً: ثمن ${item.price_eighth} | ربع ${item.price_quarter} | نص ${item.price_half} ج.م`,
    );
  } else {
    showFeedback('يرجى كتابة سعر الكيلو أولاً لحساب بقية الأوزان', 'error');
  }
};

const removeItemFromCat = (cat: any, itemIdx: number | string) => {
  cat.items.splice(Number(itemIdx), 1);
};

const handleSaveMenu = async () => {
  try {
    isSaving.value = true;
    const payload = JSON.parse(JSON.stringify(menuForm));
    const res = await menuApi.save(payload);
    if (res.data?.id) {
      menuForm.id = res.data.id;
    }
    showFeedback('تم حفظ وتحديث المنيو بنجاح! 🎉');
  } catch (err: any) {
    showFeedback(err?.response?.data?.message || 'تعذر حفظ المنيو', 'error');
  } finally {
    isSaving.value = false;
  }
};

const handleExportPdf = async () => {
  try {
    isExportingPdf.value = true;
    showFeedback('جاري توليد ملف PDF عالي الجودة...');

    // Switch to preview tab if not currently on preview tab so the node is rendered
    if (activeMainTab.value !== 'preview') {
      activeMainTab.value = 'preview';
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const exportNode = document.getElementById('menu-pdf-export-node');
    if (!exportNode) {
      showFeedback('تعذر العثور على عنصر المنيو للتصدير', 'error');
      return;
    }

    const { default: html2pdf } = await import('html2pdf.js');

    const opt = {
      margin: 0,
      filename: `منيو_بن_العجوز_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#1b120c',
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    };

    await html2pdf().set(opt).from(exportNode).save();
    showFeedback('تم تصدير ملف الـ PDF بنجاح! 📥');
  } catch (err) {
    showFeedback('حدث خطأ أثناء تصدير الـ PDF', 'error');
  } finally {
    isExportingPdf.value = false;
  }
};

const handleDirectPrint = () => {
  if (activeMainTab.value !== 'preview') {
    activeMainTab.value = 'preview';
    setTimeout(() => {
      window.print();
    }, 400);
  } else {
    window.print();
  }
};

const openProductsModal = async () => {
  showProductsModal.value = true;
  if (!availableProducts.value.length) {
    try {
      const res = await fetch('/api/v1/products?limit=100');
      const data = await res.json();
      if (data.data?.products) {
        availableProducts.value = data.data.products;
      }
    } catch {
      // Fallback
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

.header-icon {
  font-size: 2rem;
  line-height: 1;
}

.header-title h2 {
  font-size: 1.35rem;
  font-weight: 900;
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

/* التبديل الأساسي بين المحرر والمعاينة */
.mode-nav-tabs {
  display: flex;
  gap: 4px;
  background: var(--surface-2);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.mode-nav-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text-muted);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all var(--transition);
}

.mode-nav-btn.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

/* اختيار الثيم */
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
  font-size: 0.8rem;
  padding: 5px 10px;
  border-radius: var(--radius-xs);
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-strong);
  font-weight: 700;
  max-width: 220px;
  outline: none;
  box-shadow: none;
  cursor: pointer;
}

/* ═══════════════════ حاوية المحرر عريض 100% ═══════════════════ */
.builder-full-container {
  width: 100%;
}

.full-panel-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  box-shadow: none !important;
}

.sub-nav-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--surface-2);
  padding: 6px;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
  border: 1px solid var(--border);
}

.sub-tab-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--text-muted);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all var(--transition);
}

.sub-tab-btn.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.tab-spacer {
  flex: 1;
}

.preview-jump-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  color: var(--primary);
  border-color: var(--primary-soft);
}

.tab-body-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px;
}

.section-subtitle {
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--text-strong);
}

/* كارت القسم عريض وواضح */
.category-editor-card {
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
  overflow: hidden;
  box-shadow: none !important;
  transition: border-color var(--transition);
}

.category-editor-card:hover {
  border-color: var(--primary);
}

.cat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.cat-head-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
}

.page-indicator {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: var(--radius-xs);
  white-space: nowrap;
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
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--text-strong);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 6px 12px;
  width: 50%;
  min-width: 260px;
  outline: none;
  box-shadow: none;
}

.cat-title-input:focus {
  border-color: var(--primary);
}

.cat-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.side-toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 800;
  padding: 6px 12px;
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  box-shadow: none;
}

.icon-btn-delete {
  background: transparent;
  border: none;
  color: var(--danger);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-xs);
}

.cat-body {
  padding: var(--space-4);
}

.cat-meta-grid {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  background: var(--surface-1);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

/* الأصناف */
.items-editor-container {
  border-top: 1px solid var(--border);
  padding-top: var(--space-3);
}

.items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.empty-items-notice {
  padding: 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.item-row-card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin-bottom: 10px;
  box-shadow: none !important;
}

.item-row-primary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 8px;
}

.item-input-name {
  flex: 1;
  font-weight: 800;
  font-size: 0.95rem;
  padding: 6px 12px;
  box-shadow: none !important;
}

.item-pricing-fields {
  margin-bottom: 8px;
}

.weights-editor-box {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 10px 12px;
}

.weights-editor-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 8px;
}

.weight-input-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.w-input-label {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-muted);
  text-align: center;
}

.weight-input-box input {
  padding: 6px;
  font-size: 0.9rem;
  box-shadow: none !important;
}

.btn-calc-weights-full {
  width: 100%;
  padding: 6px;
  font-size: 0.78rem;
  font-weight: 800;
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  border: 1px solid var(--primary-soft);
  color: var(--primary);
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: none;
}

.btn-calc-weights-full:hover {
  background: var(--primary);
  color: #fff;
}

.dual-editor-flex,
.single-editor-flex {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--surface-2);
  padding: 8px 12px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
}

.item-input-price {
  width: 90px;
  text-align: center;
  font-weight: 900;
  color: var(--primary);
  padding: 6px;
  font-size: 0.95rem;
  box-shadow: none !important;
}

.currency-tag {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-muted);
}

.item-row-secondary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.item-input-desc {
  flex: 1;
  font-size: 0.82rem;
  color: var(--text-muted);
  padding: 5px 10px;
  box-shadow: none !important;
}

.badge-toggle-btn {
  padding: 4px 10px;
  border-radius: var(--radius-xs);
  font-size: 0.78rem;
  font-weight: 800;
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

.item-delete-btn {
  background: transparent;
  border: none;
  color: var(--danger);
  cursor: pointer;
  padding: 4px;
}

/* نموذج الهوية */
.branding-grid-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--space-4);
}

.form-section {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-shadow: none !important;
}

.form-section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-strong);
  margin-bottom: var(--space-3);
}

.form-group {
  margin-bottom: var(--space-3);
}

.form-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.logo-preview-box {
  width: 58px;
  height: 58px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-strong);
  background: var(--surface-3);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.logo-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
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

/* ═══════════════════ الصفحة 2: المعاينة العريضة 100% ═══════════════════ */
.preview-full-container {
  width: 100%;
}

.preview-full-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--surface-2);
  box-shadow: none !important;
}

.preview-full-toolbar {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  background: var(--bg-card);
  padding: 10px 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  margin-bottom: var(--space-4);
  box-shadow: none;
}

.preview-toolbar-left,
.preview-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.preview-badge-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.88rem;
  font-weight: 800;
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
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
}

.btn-zoom {
  padding: 4px 10px;
  font-size: 0.8rem;
  font-weight: 800;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: all var(--transition);
  box-shadow: none;
}

.btn-zoom.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.preview-viewport-scrollable {
  width: 100%;
  overflow: auto;
  max-height: calc(100vh - 240px);
  display: flex;
  justify-content: center;
  padding: var(--space-2);
}

.preview-scaling-container {
  transform-origin: top center;
  transition: transform 0.2s ease-out;
}

/* المودال الشامل والمريح */
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
  width: 840px;
  max-width: 95vw;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
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

.search-products-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 0.9rem;
  box-shadow: none !important;
}

.products-pick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
}

@media (max-width: 680px) {
  .products-pick-grid {
    grid-template-columns: 1fr;
  }
}

.product-picker-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: none;
}

.product-picker-card:hover {
  background: var(--surface-2);
  border-color: var(--primary);
  transform: translateY(-1px);
}

.prod-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.prod-title {
  font-size: 0.92rem;
  font-weight: 800;
  color: var(--text-strong);
}

.prod-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prod-tag-cat {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--primary);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
}

.prod-tag-unit {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.prod-card-action {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prod-price-text {
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--primary);
}

.btn-quick-add {
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 800;
  border-radius: var(--radius-xs);
  background: var(--primary);
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background var(--transition);
}

.btn-quick-add:hover {
  background: var(--primary-strong);
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
