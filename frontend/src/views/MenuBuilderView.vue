<template>
  <div class="menu-builder-container">
    <!-- ═══════════════════ شريط الأدوات العلوي ═══════════════════ -->
    <header class="builder-navbar">
      <div class="navbar-title-wrap">
        <div class="module-icon">📜</div>
        <div>
          <h1 class="text-xl font-black text-gray-900 dark:text-white">
            مصمم ومنشئ المنيو الاحترافي
          </h1>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            تخصيص وتوزيع أصناف المنيو وتصديره بجودة طباعة (وش وظهر)
          </p>
        </div>
      </div>

      <div class="navbar-actions">
        <!-- اختيار الثيم -->
        <div class="theme-picker">
          <span class="text-xs font-bold text-gray-600 dark:text-gray-300">الثيم:</span>
          <select v-model="menuForm.theme" class="select-input">
            <option value="coffee-gold">☕ بن العجوز الملكي (بني وذهبي)</option>
            <option value="modern-dark">🌙 دارك كافيه مودرن (فخم داكن)</option>
            <option value="warm-cream">📜 كريمي كلاسيك (دافئ عتيق)</option>
          </select>
        </div>

        <!-- أزرار الإجراءات -->
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="isSaving"
          @click="openProductsModal"
        >
          ➕ إضافة منتجات من المخزن
        </button>

        <button type="button" class="btn btn-primary" :disabled="isSaving" @click="handleSaveMenu">
          <span v-if="isSaving" class="spinner"></span>
          <span>{{ isSaving ? 'جاري الحفظ...' : '💾 حفظ المنيو' }}</span>
        </button>

        <button type="button" class="btn btn-outline" @click="handleDirectPrint">
          🖨️ طباعة فورية
        </button>

        <button
          type="button"
          class="btn btn-gold"
          :disabled="isExportingPdf"
          @click="handleExportPdf"
        >
          <span v-if="isExportingPdf" class="spinner"></span>
          <span>{{ isExportingPdf ? 'جاري التوليد...' : '📄 تصدير PDF عالي الدقة' }}</span>
        </button>
      </div>
    </header>

    <!-- رسائل التنبيه والنجاح -->
    <div v-if="feedbackMessage" :class="`feedback-banner ${feedbackType}`">
      {{ feedbackMessage }}
    </div>

    <!-- ═══════════════════ مساحة العمل الرئيسية (Bento Split) ═══════════════════ -->
    <div class="builder-workspace">
      <!-- ─── الجانب الأيمن: لوحة التحكم والتعديل ─── -->
      <aside class="control-panel custom-scrollbar">
        <!-- تبويبات التحكم -->
        <div class="panel-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeTab === 'content' }"
            @click="activeTab = 'content'"
          >
            📋 التصنيفات والأصناف
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeTab === 'branding' }"
            @click="activeTab = 'branding'"
          >
            🏢 الهوية والتواصل
          </button>
        </div>

        <!-- 1. تبويب التصنيفات والأصناف -->
        <div v-if="activeTab === 'content'" class="tab-pane">
          <!-- زر إضافة قسم جديد -->
          <div class="flex justify-between items-center mb-4">
            <span class="text-sm font-bold text-gray-700 dark:text-gray-300"
              >أقسام المنيو ({{ menuForm.categories.length }})</span
            >
            <button type="button" class="btn btn-xs btn-primary" @click="addNewCategory">
              ➕ قسم جديد
            </button>
          </div>

          <!-- قائمة الأقسام مع السحب والطي -->
          <div class="categories-accordion">
            <div v-for="(cat, cIdx) in menuForm.categories" :key="cIdx" class="category-card">
              <!-- رأس كارت القسم -->
              <div class="cat-card-header">
                <div class="cat-meta-left">
                  <span
                    class="cat-badge"
                    :class="cat.page_side === 'front' ? 'badge-front' : 'badge-back'"
                  >
                    {{ cat.page_side === 'front' ? 'الوجه (صفحة ١)' : 'الظهر (صفحة ٢)' }}
                  </span>
                  <input
                    v-model="cat.name_ar"
                    type="text"
                    placeholder="اسم القسم..."
                    class="cat-name-input"
                  />
                </div>

                <div class="cat-actions-right">
                  <button
                    type="button"
                    class="action-btn text-blue-600"
                    title="تغيير الصفحة"
                    @click="togglePageSide(cat)"
                  >
                    🔄 نقل لـ {{ cat.page_side === 'front' ? 'الظهر' : 'الوجه' }}
                  </button>
                  <button
                    type="button"
                    class="action-btn text-red-500"
                    title="حذف القسم"
                    @click="removeCategory(cIdx)"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <!-- تفاصيل القسم (الوصف المختصر والأيقونة) -->
              <div class="cat-card-body">
                <div class="grid grid-cols-2 gap-2 mb-3">
                  <input
                    v-model="cat.subtitle_ar"
                    type="text"
                    placeholder="وصف تسويقي للقسم (اختياري)..."
                    class="input-sm col-span-2"
                  />
                  <select v-model="cat.icon_name" class="select-sm">
                    <option value="coffee">☕ قهوة وبن</option>
                    <option value="star">⭐ توليفة مميزة</option>
                    <option value="sparkles">✨ بهارات وتحويجات</option>
                    <option value="flame">🔥 مشروبات ساخنة</option>
                    <option value="snowflake">❄️ مشروبات مثلجة</option>
                    <option value="heart">❤️ إضافات وحلويات</option>
                  </select>
                  <select v-model="cat.column_span" class="select-sm">
                    <option :value="1">عرض عادي (عمود)</option>
                    <option :value="2">عرض كامل (عمودين)</option>
                  </select>
                </div>

                <!-- أصناف القسم -->
                <div class="items-management">
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-semibold text-gray-500"
                      >الأصناف ({{ (cat.items || []).length }})</span
                    >
                    <button
                      type="button"
                      class="text-xs text-amber-600 hover:underline font-bold"
                      @click="addNewItemToCat(cat)"
                    >
                      + صنف جديد
                    </button>
                  </div>

                  <div class="items-table-wrapper">
                    <div v-for="(item, iIdx) in cat.items" :key="iIdx" class="item-edit-row">
                      <div class="item-edit-inputs">
                        <input
                          v-model="item.name_ar"
                          type="text"
                          placeholder="اسم الصنف..."
                          class="input-xs font-bold"
                        />
                        <div class="flex gap-1 items-center">
                          <input
                            v-model.number="item.price"
                            type="number"
                            step="0.5"
                            placeholder="السعر..."
                            class="input-xs w-20 text-center text-amber-700 font-bold"
                          />
                          <span class="text-xs text-gray-400">ج.م</span>
                          <input
                            v-if="cat.page_side === 'back'"
                            v-model.number="item.price_secondary"
                            type="number"
                            step="0.5"
                            placeholder="سعر 2..."
                            class="input-xs w-16 text-center text-gray-600"
                            title="سعر الحجم المضاعف / الدبل"
                          />
                        </div>
                      </div>

                      <div class="item-sub-options">
                        <input
                          v-model="item.description_ar"
                          type="text"
                          placeholder="وصف ومكونات الصنف..."
                          class="input-xs flex-1 text-gray-500"
                        />
                        <label class="checkbox-tag">
                          <input v-model="item.is_featured" type="checkbox" />
                          <span>مميز</span>
                        </label>
                        <button
                          type="button"
                          class="delete-item-btn"
                          @click="removeItemFromCat(cat, iIdx)"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. تبويب الهوية وبيانات التواصل -->
        <div v-if="activeTab === 'branding'" class="tab-pane">
          <div class="form-section">
            <h3 class="section-title">🏢 بيانات المحل والعلامة التجارية</h3>
            <div class="form-group">
              <label>عنوان المنيو الرئيسي:</label>
              <input v-model="menuForm.title_ar" type="text" class="input-field" />
            </div>
            <div class="form-group">
              <label>الشعار والوصف التسويقي:</label>
              <input v-model="menuForm.subtitle_ar" type="text" class="input-field" />
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">📞 أرقام الهواتف والتوصيل</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label>الهاتف الأساسي:</label>
                <input v-model="menuForm.phone_primary" type="text" class="input-field" />
              </div>
              <div class="form-group">
                <label>الهاتف الثانوي:</label>
                <input v-model="menuForm.phone_secondary" type="text" class="input-field" />
              </div>
            </div>
            <div class="form-group">
              <label>العنوان وتفاصيل الفرع:</label>
              <input v-model="menuForm.address_ar" type="text" class="input-field" />
            </div>
          </div>

          <div class="form-section">
            <h3 class="section-title">🌐 منصات التواصل الاجتماعي والـ QR</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label>حساب الفيسبوك:</label>
                <input
                  v-model="menuForm.facebook_handle"
                  type="text"
                  placeholder="اسم الصفحة..."
                  class="input-field"
                />
              </div>
              <div class="form-group">
                <label>حساب الانستجرام:</label>
                <input
                  v-model="menuForm.instagram_handle"
                  type="text"
                  placeholder="اليوزر نيم..."
                  class="input-field"
                />
              </div>
            </div>
            <div class="form-check mt-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="menuForm.show_qr_code" type="checkbox" class="checkbox" />
                <span class="text-sm font-semibold">إظهار رمز الـ QR Code في التذييل</span>
              </label>
            </div>
          </div>
        </div>
      </aside>

      <!-- ─── الجانب الأيسر: المعاينة الحية والتصدير ─── -->
      <main class="preview-viewport custom-scrollbar">
        <!-- شريط تحكم التكبير والمعاينة -->
        <div class="preview-zoom-bar">
          <span class="zoom-label">🔍 المعاينة الحية (مقاس الطباعة A4):</span>
          <div class="zoom-buttons">
            <button
              type="button"
              class="zoom-btn"
              :class="{ active: zoomLevel === 0.55 }"
              @click="zoomLevel = 0.55"
            >
              55%
            </button>
            <button
              type="button"
              class="zoom-btn"
              :class="{ active: zoomLevel === 0.75 }"
              @click="zoomLevel = 0.75"
            >
              75%
            </button>
            <button
              type="button"
              class="zoom-btn"
              :class="{ active: zoomLevel === 1 }"
              @click="zoomLevel = 1"
            >
              100%
            </button>
          </div>
        </div>

        <!-- حاوية المعاينة المطابقة للطباعة -->
        <div class="preview-canvas-wrapper" :style="{ transform: `scale(${zoomLevel})` }">
          <div id="menu-pdf-export-node">
            <MenuPageLayout :menu-data="menuForm" />
          </div>
        </div>
      </main>
    </div>

    <!-- ═══════════════════ مودال اختيار المنتجات من المخزن ═══════════════════ -->
    <div v-if="showProductsModal" class="modal-overlay" @click.self="showProductsModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="text-lg font-black text-gray-900 dark:text-white">
            📦 إضافة منتجات من المخزن إلى المنيو
          </h3>
          <button type="button" class="close-btn" @click="showProductsModal = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="mb-4">
            <label class="block text-xs font-bold text-gray-600 mb-1"
              >القسم المستهدف في المنيو:</label
            >
            <select v-model="selectedTargetCatIdx" class="select-input w-full">
              <option v-for="(cat, idx) in menuForm.categories" :key="idx" :value="idx">
                {{ cat.name_ar }} ({{ cat.page_side === 'front' ? 'الوجه' : 'الظهر' }})
              </option>
            </select>
          </div>

          <div class="mb-3">
            <input
              v-model="productsSearch"
              type="text"
              placeholder="🔍 ابحث عن اسم المنتج أو الباركود..."
              class="input-field"
            />
          </div>

          <div class="products-selection-list custom-scrollbar">
            <div
              v-for="prod in filteredProducts"
              :key="prod.id"
              class="product-choice-row"
              @click="addProductToMenu(prod)"
            >
              <div class="prod-info">
                <span class="prod-name font-bold">{{ prod.name_ar }}</span>
                <span class="prod-cat text-xs text-gray-400">{{
                  prod.category_name || 'بدون تصنيف'
                }}</span>
              </div>
              <div class="prod-price-add">
                <span class="prod-price font-extrabold text-amber-600"
                  >{{ prod.sale_price }} ج.م</span
                >
                <button type="button" class="btn-add-item">+ إضافة</button>
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
  phone_primary: '01012345678',
  phone_secondary: '01234567890',
  address_ar: 'الفرع الرئيسي - مصر',
  facebook_handle: 'BinAlAgoouz',
  instagram_handle: 'binalagoouz',
  show_qr_code: true,
  categories: [] as any[],
});

// جلب المنيو النشط والمنتجات عند تحميل الصفحة
onMounted(async () => {
  try {
    const res = await menuApi.getActive();
    if (res.data) {
      Object.assign(menuForm, res.data);
    }
  } catch {
    // إذا لم يوجد منيو مسجل، ننشئ تصنيفات افتراضية
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
          description_ar: 'خلطة أرابيكا ممتازة مع روبوستا معتقة',
          price: 180,
          is_featured: true,
        },
        {
          name_ar: 'توليفة السلطان الفاخرة',
          description_ar: 'مزيج كولومبي برازيلي غني بالكريما',
          price: 160,
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
          description_ar: 'حموضة متوازنة وإيحاءات المكسرات',
          price: 190,
          is_featured: true,
        },
        {
          name_ar: 'بن برازيلي سانتوس',
          description_ar: 'قوام كامل ونكهة كلاسيكية ناعمة',
          price: 150,
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
          price: 35,
          price_secondary: 45,
          is_featured: true,
        },
        {
          name_ar: 'إسبريسو سينجل / دبل',
          description_ar: 'شوت مركز من حبوبنا الطازجة',
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

// حفظ المنيو
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

// التصدير عالي الدقة لـ PDF
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

// الطباعة الفورية
const handleDirectPrint = () => {
  window.print();
};

// إدارة الأقسام
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

// إدارة الأصناف داخل القسم
const addNewItemToCat = (cat: any) => {
  if (!cat.items) cat.items = [];
  cat.items.push({
    name_ar: 'صنف جديد',
    description_ar: '',
    price: 50,
    price_secondary: null,
    is_featured: false,
    is_new: false,
  });
};

const removeItemFromCat = (cat: any, itemIdx: number | string) => {
  cat.items.splice(Number(itemIdx), 1);
};

// فتح مودال إضافة منتجات من المخزن
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

  targetCat.items.push({
    product_id: prod.id,
    name_ar: prod.name_ar,
    description_ar: '',
    price: prod.sale_price || 0,
    unit_label_ar: prod.unit || null,
    is_featured: false,
    is_new: false,
  });

  showFeedback(`تمت إضافة "${prod.name_ar}" إلى قسم "${targetCat.name_ar}"`, 'success');
};
</script>

<style scoped>
.menu-builder-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  background-color: #f8fafc;
  overflow: hidden;
}

.builder-navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  z-index: 10;
}

.navbar-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.module-icon {
  font-size: 26px;
  background: #fef3c7;
  padding: 6px;
  border-radius: 10px;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme-picker {
  display: flex;
  align-items: center;
  gap: 6px;
}

.select-input,
.input-field {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  font-weight: 600;
  background: #fff;
  outline: none;
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: #2563eb;
  color: #fff;
}
.btn-primary:hover {
  background: #1d4ed8;
}

.btn-secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.btn-secondary:hover {
  background: #e2e8f0;
}

.btn-outline {
  background: #fff;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.btn-outline:hover {
  background: #f8fafc;
}

.btn-gold {
  background: linear-gradient(135deg, #c5a059, #8c6a2d);
  color: #fff;
  box-shadow: 0 2px 6px rgba(197, 160, 89, 0.3);
}
.btn-gold:hover {
  filter: brightness(1.1);
}

.btn-xs {
  padding: 4px 8px;
  font-size: 11px;
}

.builder-workspace {
  display: grid;
  grid-template-columns: 420px 1fr;
  flex: 1;
  overflow: hidden;
}

.control-panel {
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  padding: 16px;
  overflow-y: auto;
}

.panel-tabs {
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 10px;
  margin-bottom: 16px;
}

.tab-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.category-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 12px;
  overflow: hidden;
}

.cat-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.cat-meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.cat-badge {
  font-size: 9.5px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 6px;
}
.badge-front {
  background: #fef3c7;
  color: #92400e;
}
.badge-back {
  background: #e0e7ff;
  color: #3730a3;
}

.cat-name-input {
  font-size: 13px;
  font-weight: 800;
  background: transparent;
  border: 1px solid transparent;
  outline: none;
  border-radius: 4px;
  padding: 2px 4px;
  width: 60%;
}
.cat-name-input:focus {
  background: #fff;
  border-color: #cbd5e1;
}

.cat-actions-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
  font-size: 11px;
  font-weight: 700;
  background: transparent;
  border: none;
  cursor: pointer;
}

.cat-card-body {
  padding: 10px;
}

.input-sm,
.select-sm {
  width: 100%;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #fff;
}

.item-edit-row {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 8px;
  margin-bottom: 6px;
}

.item-edit-inputs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.item-sub-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-xs {
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}

.checkbox-tag {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #b45309;
  cursor: pointer;
}

.delete-item-btn {
  font-size: 11px;
  color: #ef4444;
  border: none;
  background: transparent;
  cursor: pointer;
}

.preview-viewport {
  background: #334155;
  padding: 24px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.preview-zoom-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(8px);
  padding: 6px 16px;
  border-radius: 20px;
  margin-bottom: 20px;
  color: #fff;
  z-index: 5;
}

.zoom-label {
  font-size: 12px;
  font-weight: 700;
}

.zoom-btn {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 800;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
}
.zoom-btn.active {
  background: #2563eb;
}

.preview-canvas-wrapper {
  transform-origin: top center;
  transition: transform 0.2s ease-out;
}

/* التنبيهات */
.feedback-banner {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}
.feedback-banner.success {
  background: #dcfce7;
  color: #166534;
}
.feedback-banner.error {
  background: #fee2e2;
  color: #991b1b;
}

/* المودال */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal-card {
  background: #fff;
  border-radius: 14px;
  width: 520px;
  max-width: 90vw;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.close-btn {
  font-size: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.modal-body {
  padding: 16px 20px;
}

.products-selection-list {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.product-choice-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s;
}
.product-choice-row:hover {
  background: #f8fafc;
}

.btn-add-item {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.modal-footer {
  padding: 12px 20px;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #e2e8f0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
