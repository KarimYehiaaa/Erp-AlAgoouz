<template>
  <div class="branch-sales-page">
    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">🏪</span>
        <div>
          <h2>شاشة مبيعات الفرع</h2>
          <p>إدخال مبيعات محل البيع مع خصم المخزون تلقائياً</p>
        </div>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-outline"
          @click="showMode = 'manual'"
          :class="{ active: showMode === 'manual' }"
        >
          ✏️ إدخال يدوي
        </button>
        <button
          class="btn btn-outline"
          @click="showMode = 'excel'"
          :class="{ active: showMode === 'excel' }"
        >
          📊 رفع Excel
        </button>
        <button class="btn btn-outline" @click="openCountsModal">🔢 خصم من تعداد</button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="grid grid-3 stats-row">
      <StatCard label="مبيعات اليوم" :value="todayTotal" icon="coins" />
      <StatCard label="عدد الفواتير اليوم" :value="todayCount" icon="receipt" format="number" />
      <StatCard label="آخر عملية بيع" :value="lastSaleTime" icon="clock" format="text" />
    </div>

    <!-- Manual Entry Mode -->
    <div v-if="showMode === 'manual'" class="manual-mode">
      <!-- Mobile Tabs Switcher -->
      <div class="mobile-tabs-bar">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'products' }"
          @click="activeTab = 'products'"
          type="button"
        >
          🛍️ قائمة المنتجات
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'cart' }"
          @click="activeTab = 'cart'"
          type="button"
          style="position: relative"
        >
          🛒 سلة المبيعات
          <span v-if="cart.length" class="cart-badge">{{ cart.length }}</span>
        </button>
      </div>

      <div class="grid grid-2 main-grid">
        <!-- Products Panel -->
        <div class="card products-panel" :class="{ 'mobile-hidden': activeTab !== 'products' }">
          <div class="panel-header">
            <h3>🛍️ منتجات الفرع</h3>
            <div class="panel-filters">
              <input
                ref="searchInputRef"
                v-model="productSearch"
                type="text"
                placeholder="بحث عن منتج... (F7)"
                class="search-input"
                @input="filterProducts"
              />
              <select v-model="selectedCategory" @change="filterProducts" class="category-select">
                <option value="">كل التصنيفات</option>
                <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                  {{ cat.name_ar }}
                </option>
              </select>
            </div>
          </div>

          <!-- Category Interactive Pills Bar -->
          <div v-if="categories.length" class="category-pills-bar">
            <button
              type="button"
              class="pill-btn"
              :class="{ active: !selectedCategory }"
              @click="
                selectedCategory = '';
                filterProducts();
              "
            >
              ✨ الكل
            </button>
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="pill-btn"
              :class="{ active: String(selectedCategory) === String(cat.id) }"
              @click="
                selectedCategory = cat.id;
                filterProducts();
              "
            >
              {{ cat.name_ar }}
            </button>
          </div>

          <!-- Premium Skeletons for Product Grid Loading -->
          <div v-if="loadingProducts" class="products-grid">
            <div
              v-for="i in 8"
              :key="'sk-prod-' + i"
              class="product-card"
              style="
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                min-height: 84px;
              "
            >
              <SkeletonLoader type="line" height="14px" width="80%" class="mb-2" />
              <SkeletonLoader type="line" height="12px" width="50%" />
            </div>
          </div>
          <div v-else-if="!filteredProducts.length" class="empty-state">
            <span>🔍</span>
            <p>لا توجد منتجات مطابقة</p>
          </div>
          <div v-else class="products-grid">
            <div
              v-for="product in filteredProducts"
              :key="product.id"
              class="product-card"
              :class="{
                'no-recipe': !product.has_recipe,
                'low-stock': hasLowIngredients(product) || getProductStockClass(product) === 'low',
                'is-out-of-stock': getProductStockClass(product) === 'out',
                selected: isInCart(product.id),
              }"
              @click="addToCart(product)"
            >
              <!-- 🟢 مؤشر المخزون المضيء -->
              <span
                class="stock-indicator-dot"
                :class="getProductStockClass(product)"
                :title="getProductStockTitle(product)"
              ></span>
              <div class="product-name">{{ product.name_ar }}</div>
              <div class="product-meta">
                <span class="product-price">{{ formatMoney(product.sale_price) }}</span>
                <span class="product-cat">{{ product.category_name || '—' }}</span>
              </div>
              <div class="product-status">
                <span
                  v-if="!product.has_recipe"
                  class="badge badge-info"
                  title="بدون وصفة - سيتم خصم المنتج نفسه من المخزون"
                  >خصم مباشر</span
                >
                <span v-else-if="hasLowIngredients(product)" class="badge badge-warning"
                  >⚠️ مخزون منخفض</span
                >
                <span v-else class="badge badge-success">✓ متاح</span>
              </div>
              <div v-if="isInCart(product.id)" class="cart-qty-badge">
                {{ getCartQty(product.id) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Cart & Form Panel -->
        <div class="card cart-panel" :class="{ 'mobile-hidden': activeTab !== 'cart' }">
          <h3>🛒 سلة المبيعات</h3>

          <!-- Cart Items -->
          <div v-if="!cart.length" class="empty-cart">
            <span>🛒</span>
            <p>اضغط على منتج لإضافته</p>
          </div>
          <div v-else class="cart-items">
            <div v-for="(item, idx) in cart" :key="item.product_id" class="cart-item">
              <div class="cart-item-info">
                <span class="cart-item-name">{{ item.name_ar }}</span>
                <span class="cart-item-price">{{ formatMoney(item.unit_price) }}</span>
              </div>
              <div class="cart-item-controls">
                <button class="qty-btn" @click="decreaseQty(idx)">−</button>
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="qty-input"
                  @change="validateQty(idx)"
                />
                <button class="qty-btn" @click="increaseQty(idx)">+</button>
                <button class="remove-btn" @click="removeFromCart(idx)">🗑️</button>
              </div>
              <div class="cart-item-total">{{ formatMoney(item.quantity * item.unit_price) }}</div>
            </div>
          </div>

          <!-- Suggested Complementary Items (Market Basket Analysis) -->
          <div v-if="cart.length && recommendedItems.length" class="cart-recommendations">
            <div class="rec-title">✨ مقترحات ذكية ترافق السلة:</div>
            <div class="rec-list">
              <div
                v-for="rec in recommendedItems"
                :key="rec.product_id"
                class="rec-item"
                @click="addRecommendedToCart(rec)"
                title="اضغط لإضافة هذا الصنف المقترح"
              >
                <div class="rec-name">
                  <span class="rec-name-text">{{ rec.name_ar }}</span>
                  <span class="rec-category">{{ rec.category_name }}</span>
                </div>
                <div class="rec-action">
                  <span class="rec-price">{{ formatMoney(rec.sale_price) }}</span>
                  <span class="rec-add-icon">➕</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Cart Summary -->
          <div v-if="cart.length" class="cart-summary">
            <div class="summary-row">
              <span>المجموع الفرعي</span>
              <span>{{ formatMoney(cartSubtotal) }}</span>
            </div>
            <div class="summary-row discount-row">
              <span>خصم (ج.م)</span>
              <input
                v-model.number="saleForm.discount_amount"
                type="number"
                min="0"
                step="0.01"
                class="discount-input"
              />
            </div>
            <div class="summary-row total-row">
              <span>الإجمالي</span>
              <span class="total-amount">{{ formatMoney(cartTotal) }}</span>
            </div>
          </div>

          <!-- Sale Form -->
          <form @submit.prevent="submitManualSale" class="sale-form">
            <div class="form-row">
              <div class="form-group">
                <label>تاريخ البيع *</label>
                <input v-model="saleForm.sale_date" type="date" required />
              </div>
              <div class="form-group">
                <label>طريقة الدفع</label>
                <select v-model="saleForm.payment_method">
                  <option value="cash">نقدي</option>
                  <option value="card">بطاقة</option>
                  <option value="transfer">تحويل</option>
                  <option value="credit">آجل</option>
                </select>
              </div>
            </div>
            <div class="form-group"></div>

            <!-- إعدادات الطباعة الحرارية المباشرة -->
            <div class="printer-settings-box">
              <div class="printer-header">
                <span>🖨️ الطباعة الحرارية المباشرة</span>
              </div>
              <div class="printer-controls">
                <div class="printer-info">
                  <span class="printer-status" :class="{ configured: printerName }">
                    {{ printerName ? `طابعة نشطة: ${printerName}` : 'لم يتم تحديد طابعة USB' }}
                  </span>
                  <button type="button" class="btn-sm btn-outline" @click="selectPrinter">
                    {{ printerName ? 'تغيير' : 'تحديد طابعة' }}
                  </button>
                </div>
                <div class="printer-options">
                  <label class="checkbox-label">
                    <input type="checkbox" v-model="autoPrint" />
                    <span>طباعة تلقائية عند البيع</span>
                  </label>
                  <button
                    v-if="lastSavedSale"
                    type="button"
                    class="btn-sm btn-outline print-last-btn"
                    @click="printReceipt(lastSavedSale)"
                  >
                    🖨️ طباعة الفاتورة الأخيرة
                  </button>
                </div>
              </div>
            </div>

            <div v-if="saleError" class="alert alert-danger">{{ saleError }}</div>

            <button
              v-permission="['pos.add', 'sales.add']"
              type="submit"
              class="btn btn-primary btn-submit"
              :class="{ 'btn-loading': saving }"
              :disabled="saving || !cart.length"
            >
              {{ saving ? '⏳ جاري الحفظ...' : `💾 تسجيل البيع (${formatMoney(cartTotal)})` }}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-clear"
              @click="clearCart"
              :disabled="!cart.length"
            >
              🗑️ مسح السلة
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- Excel Mode -->
    <div v-if="showMode === 'excel'" class="excel-mode card">
      <h3>📊 استيراد مبيعات الفرع من Excel</h3>
      <p class="excel-note">
        حمّل القالب — فيه كل منتجات الفرع جاهزة بالكود والاسم والسعر. اكتب الكمية فقط لكل منتج بيع،
        ثم ارفع الملف.
      </p>

      <div class="excel-actions">
        <button
          class="btn btn-primary"
          @click="downloadBranchTemplate"
          :disabled="downloadingTemplate"
        >
          {{ downloadingTemplate ? '⏳ جاري التحميل...' : '📥 تحميل القالب (منتجات جاهزة)' }}
        </button>
        <label class="btn btn-outline import-label">
          🔍 فحص الملف قبل الرفع
          <input type="file" accept=".xlsx,.xls" hidden @change="onValidateExcel" />
        </label>
        <label class="btn btn-outline import-label">
          📤 رفع واستيراد
          <input type="file" accept=".xlsx,.xls" hidden @change="onImportExcel" />
        </label>
      </div>

      <!-- نتيجة الفحص / الاستيراد -->
      <div v-if="excelMsg" class="import-result" :class="{ 'import-err': excelErr }">
        <p class="import-msg">{{ excelMsg }}</p>
        <ul v-if="excelDetails.length" class="import-details">
          <li v-for="(d, i) in excelDetails" :key="i">{{ d }}</li>
        </ul>
      </div>

      <!-- شرح الخطوات -->
      <div class="excel-steps">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-body">
            <strong>حمّل القالب</strong>
            <span>فيه كل منتجات الفرع جاهزة — كود + اسم + سعر</span>
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-body">
            <strong>اكتب الكمية</strong>
            <span>في عمود «الكمية» فقط للمنتجات التي بيعت — اترك الباقي فارغاً</span>
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-body">
            <strong>ارفع الملف</strong>
            <span>سيتم خصم المخزون تلقائياً بناءً على وصفة كل منتج</span>
          </div>
        </div>
      </div>

      <!-- معاينة المنتجات في القالب -->
      <details class="excel-guide" open>
        <summary>👁️ معاينة شكل القالب ({{ allProducts.length }} منتج)</summary>
        <div class="guide-table-wrap">
          <table class="guide-table">
            <thead>
              <tr>
                <th>تاريخ_البيع</th>
                <th>كود_المنتج</th>
                <th>اسم_المنتج</th>
                <th>التصنيف</th>
                <th>سعر_البيع</th>
                <th style="background: #2e7d4f">الكمية ← اكتبها هنا</th>
                <th>طريقة_الدفع</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in allProducts.slice(0, 8)" :key="p.id">
                <td class="muted">{{ todayStr }}</td>
                <td>
                  <code>{{ p.sku }}</code>
                </td>
                <td>{{ p.name_ar }}</td>
                <td class="muted">{{ p.category_name || '—' }}</td>
                <td>{{ formatMoney(p.sale_price) }}</td>
                <td class="qty-col">___</td>
                <td class="muted">cash</td>
              </tr>
              <tr v-if="allProducts.length > 8">
                <td colspan="7" class="more-row">
                  ... و {{ allProducts.length - 8 }} منتج آخر في القالب
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="guide-note">⚠️ لا تعدّل عمود «كود_المنتج» — هو المرجع الأساسي للاستيراد</p>
      </details>
    </div>

    <!-- Counts Modal -->
    <div v-if="countsModal" class="modal" @click.self="countsModal = false">
      <div class="card modal-content counts-modal">
        <h3>🔢 خصم من تعداد المنتجات</h3>
        <p class="muted">
          أدخل الكميات المباعة لكل منتج وسيتم خصم المخزون تلقائياً (بناءً على الوصفة إن وجدت).
        </p>
        <div class="counts-table-wrap">
          <table class="counts-table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>المنتج</th>
                <th>التصنيف</th>
                <th>سعر البيع</th>
                <th style="width: 120px">الكمية</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in allProducts" :key="p.id">
                <td>
                  <code>{{ p.sku }}</code>
                </td>
                <td>{{ p.name_ar }}</td>
                <td class="muted">{{ p.category_name || '—' }}</td>
                <td>{{ formatMoney(p.sale_price) }}</td>
                <td><input type="number" min="0" step="0.001" v-model.number="counts[p.id]" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="countsModal = false">إلغاء</button>
          <button class="btn btn-primary" @click="submitCounts">تنفيذ الخصم</button>
        </div>
      </div>
    </div>

    <!-- Today's Sales History -->
    <div class="card sales-history">
      <div class="history-header">
        <h3>📋 سجل مبيعات الفرع</h3>
        <div class="history-filters">
          <input v-model="historyFilters.from_date" type="date" @change="loadHistory" />
          <span>إلى</span>
          <input v-model="historyFilters.to_date" type="date" @change="loadHistory" />
          <div class="month-filter-btn" title="اختر الشهر بالكامل">
            <AppIcon name="calendar" :size="16" />
            <input type="month" class="month-picker-overlay" @change="selectMonth" />
          </div>
        </div>
      </div>

      <div v-if="loadingHistory" class="p-4" style="padding: 16px">
        <SkeletonLoader type="table" :rows="5" :cols="7" />
      </div>
      <div v-else class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>رقم البيع</th>
              <th>التاريخ</th>
              <th>المنتجات</th>
              <th>الإجمالي</th>
              <th>الدفع</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in salesHistory" :key="sale.id">
              <td class="sale-number">{{ sale.sale_number }}</td>
              <td>{{ formatDate(sale.sale_date) }}</td>
              <td>
                <span class="items-count">{{ sale.items_count || 0 }} منتج</span>
              </td>
              <td class="amount">{{ formatMoney(sale.total_amount) }}</td>
              <td>
                <span :class="paymentBadge(sale.payment_status)">{{
                  paymentLabel(sale.payment_status)
                }}</span>
              </td>
              <td>
                <span :class="statusBadge(sale.status)">{{ statusLabel(sale.status) }}</span>
              </td>
              <td>
                <button
                  v-permission="['pos.delete', 'sales.delete', 'pos.edit', 'sales.edit']"
                  v-if="sale.status === 'completed' && !sale.offline_id"
                  class="btn-sm btn-danger"
                  @click="returnSale(sale)"
                  title="استرداد"
                >
                  ↩️
                </button>
                <span v-else-if="sale.offline_id" class="badge badge-warning"
                  >بانتظار المزامنة</span
                >
              </td>
            </tr>
            <tr v-if="!salesHistory.length">
              <td colspan="7" class="empty">لا توجد مبيعات في هذه الفترة</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import StatCard from '@/components/StatCard.vue';
import AppIcon from '@/components/AppIcon.vue';
import {
  sales as salesApi,
  products as productsApi,
  forecasting as forecastingApi,
  users as userApi,
} from '@/api';
import { formatMoney } from '@/utils/currency';
import { parseLocalizedNumber } from '@/utils/numberParsing';
import { useProductMeta } from '@/composables/useProductMeta';
import { useAppStore } from '@/stores/app';
import { localDb } from '@/services/localDb';
import { directPrinter } from '@/services/directPrinter';

// ─── helpers ───────────────────────────────────────────────────────────────
const localTodayYmd = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const today = localTodayYmd();

const formatDate = (d) => {
  const val = d?.split?.('T')?.[0] || d;
  if (!val) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, day] = val.split('-');
    return `${day}/${m}/${y}`;
  }
  return new Date(val).toLocaleDateString('en-GB');
};

const { categories, loadMeta } = useProductMeta();

// ─── state ─────────────────────────────────────────────────────────────────
const showMode = ref('manual');
const activeTab = ref('products'); // 'products' or 'cart'
const loadingProducts = ref(false);
const loadingHistory = ref(false);
const saving = ref(false);
const saleError = ref('');
const downloadingTemplate = ref(false);
const todayStr = today;

// ─── PWA & Printing State ───
const appStore = useAppStore();
const autoPrint = ref(localStorage.getItem('auto_print_receipt') !== 'false');
const printerName = ref(directPrinter.getSelectedPrinterName() || '');
const lastSavedSale = ref(null);

const searchInputRef = ref(null);
const companySettings = ref({
  name_ar: 'بن العجوز',
  phone: '',
  address: '',
  tagline: 'للبن التركي',
});

const playBeep = (type = 'success') => {
  const soundEnabled = localStorage.getItem('sound_enabled') !== 'false';
  if (!soundEnabled) return;
  const soundVolume = parseFloat(localStorage.getItem('sound_volume') || '0.08');

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === 'success') {
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
      gain.gain.setValueAtTime(soundVolume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 0.25);
      osc2.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'warning') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      gain.gain.setValueAtTime(soundVolume * 1.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'error') {
      const gain = audioCtx.createGain();
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(soundVolume * 2, audioCtx.currentTime);
      const playTone = (freq, duration, delay) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        osc.connect(gain);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
      };
      playTone(130, 0.1, 0);
      playTone(130, 0.1, 0.12);
      playTone(130, 0.15, 0.24);
    } else if (type === 'click') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      gain.gain.setValueAtTime(soundVolume * 0.5, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    }
  } catch (err) {
    console.error('Audio play failed:', err);
  }
};

const handleGlobalKeyDown = (e) => {
  const shortcutsEnabled = localStorage.getItem('shortcuts_enabled') !== 'false';
  if (!shortcutsEnabled) return;

  if (e.key === 'F2') {
    e.preventDefault();
    submitManualSale();
  } else if (e.key === 'F4') {
    e.preventDefault();
    clearCart();
    playBeep('warning');
  } else if (e.key === 'F7') {
    e.preventDefault();
    if (searchInputRef.value) {
      searchInputRef.value.focus();
      searchInputRef.value.select();
    }
  }
};

watch(autoPrint, (val) => {
  localStorage.setItem('auto_print_receipt', String(val));
});

const allProducts = ref([]);
const filteredProducts = ref([]);
const productSearch = ref('');
const selectedCategory = ref('');

const cart = ref([]);
const saleForm = ref({
  sale_date: today,
  payment_method: 'cash',
  discount_amount: 0,
  warehouse_id: null,
  notes: '',
});

// AI complementary items states & actions
const recommendedItems = ref([]);
const loadingRecommendations = ref(false);

const loadRecommendations = async () => {
  if (!cart.value.length) {
    recommendedItems.value = [];
    return;
  }
  loadingRecommendations.value = true;
  try {
    const productIds = cart.value.map((i) => i.product_id);
    const res = await forecastingApi.getBasketAssociations({
      cart: productIds.join(','),
      warehouse_id: saleForm.value.warehouse_id || 1,
    });
    // Filter out recommendations that are already in the cart
    recommendedItems.value = (res.data || []).filter((r) => !productIds.includes(r.product_id));
  } catch (err) {
    console.error('Failed to load basket recommendations:', err);
    recommendedItems.value = [];
  } finally {
    loadingRecommendations.value = false;
  }
};

watch(
  cart,
  () => {
    loadRecommendations();
  },
  { deep: true },
);

const addRecommendedToCart = (rec) => {
  const product = allProducts.value.find((p) => p.id === rec.product_id) || {
    id: rec.product_id,
    name_ar: rec.name_ar,
    sale_price: rec.sale_price,
    has_recipe: true,
  };
  addToCart(product);
};

const salesHistory = ref([]);
const historyFilters = ref({ from_date: today.slice(0, 8) + '01', to_date: today });

// Excel state
const excelMsg = ref('');
const excelErr = ref(false);
const excelDetails = ref([]);
const countsModal = ref(false);
const counts = ref({});

// ─── computed ──────────────────────────────────────────────────────────────
const cartSubtotal = computed(() =>
  cart.value.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
);
const cartTotal = computed(() =>
  Math.max(0, cartSubtotal.value - (saleForm.value.discount_amount || 0)),
);

const todayTotal = computed(() =>
  salesHistory.value
    .filter((s) => s.status === 'completed' && (s.sale_date || '').startsWith(today))
    .reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0),
);
const todayCount = computed(
  () =>
    salesHistory.value.filter(
      (s) => s.status === 'completed' && (s.sale_date || '').startsWith(today),
    ).length,
);
const lastSaleTime = computed(() => {
  const todaySales = salesHistory.value.filter((s) => (s.sale_date || '').startsWith(today));
  if (!todaySales.length) return '—';
  const last = todaySales[0];
  const d = new Date(last.created_at);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
});

// ─── product helpers ────────────────────────────────────────────────────────
const hasLowIngredients = (product) => {
  if (!product.has_recipe || !Array.isArray(product.recipe_items)) return false;
  return product.recipe_items.some((ri) => {
    const needed = Number(ri.quantity);
    const available = Number(ri.stock_available || 0);
    return available < needed;
  });
};

const getProductStockClass = (product) => {
  if (!product.has_recipe) {
    const qty = Number(product.stock_quantity || 0);
    if (qty <= 0) return 'out';
    if (qty <= 10) return 'low';
    return 'good';
  } else {
    const isMissing = hasLowIngredients(product);
    if (isMissing) return 'out';

    // Check if any ingredient has less than 5 servings left
    const isClose = product.recipe_items?.some((ri) => {
      const needed = Number(ri.quantity);
      const available = Number(ri.stock_available || 0);
      return available < needed * 5;
    });
    if (isClose) return 'low';
    return 'good';
  }
};

const getProductStockTitle = (product) => {
  const status = getProductStockClass(product);
  if (status === 'out') return 'المخزون غير كافٍ لعمل المشروب ⚠️';
  if (status === 'low') return 'المخزون منخفض (أقل من 5 أكواب متبقية) ⚡';
  return 'متوفر بكثرة في المخزن ✓';
};

const isInCart = (productId) => cart.value.some((i) => i.product_id === productId);
const getCartQty = (productId) => {
  const item = cart.value.find((i) => i.product_id === productId);
  return item ? item.quantity : 0;
};

// ─── product actions ────────────────────────────────────────────────────────
const filterProducts = () => {
  let list = allProducts.value;
  if (selectedCategory.value) {
    list = list.filter((p) => p.category_id == selectedCategory.value);
  }
  if (productSearch.value.trim()) {
    const q = productSearch.value.trim().toLowerCase();
    list = list.filter(
      (p) => p.name_ar.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q),
    );
  }
  filteredProducts.value = list;
};

const loadProducts = async () => {
  loadingProducts.value = true;
  try {
    const params = {};
    if (saleForm.value.warehouse_id) params.warehouse_id = saleForm.value.warehouse_id;

    if (navigator.onLine) {
      const prodRes = await productsApi.branchProducts(params);
      allProducts.value = prodRes.data || [];
      try {
        await localDb.saveProducts(allProducts.value);
      } catch (dbErr) {
        console.warn('Failed to cache products to IndexedDB:', dbErr);
      }
    } else {
      const cached = await localDb.getProducts();
      allProducts.value = cached || [];
    }
    await loadMeta();
    filterProducts();
  } catch (e) {
    console.error('فشل تحميل المنتجات:', e.message);
    try {
      const cached = await localDb.getProducts();
      if (cached && cached.length) {
        allProducts.value = cached;
        filterProducts();
      }
    } catch (dbErr) {
      console.error('Failed to load products from IndexedDB fallback:', dbErr);
    }
  } finally {
    loadingProducts.value = false;
  }
};

// reload products when selected warehouse for the sale changes
watch(
  () => saleForm.value.warehouse_id,
  (v, o) => {
    if (v !== o) loadProducts();
  },
);

// ─── cart actions ───────────────────────────────────────────────────────────
const addToCart = (product) => {
  playBeep('success');
  const existing = cart.value.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity = parseFloat((existing.quantity + 1).toFixed(3));
  } else {
    // set sale warehouse from product primary_warehouse_id if not set
    if (!saleForm.value.warehouse_id && product.primary_warehouse_id) {
      saleForm.value.warehouse_id = product.primary_warehouse_id;
    }
    cart.value.push({
      product_id: product.id,
      name_ar: product.name_ar,
      unit_price: parseFloat(product.sale_price || 0),
      quantity: 1,
      has_recipe: product.has_recipe,
    });
  }
};

const increaseQty = (idx) => {
  playBeep('click');
  cart.value[idx].quantity = parseFloat((cart.value[idx].quantity + 1).toFixed(3));
};
const decreaseQty = (idx) => {
  playBeep('click');
  if (cart.value[idx].quantity > 0.1) {
    cart.value[idx].quantity = parseFloat((cart.value[idx].quantity - 1).toFixed(3));
  } else {
    cart.value.splice(idx, 1);
  }
};
const validateQty = (idx) => {
  const qty = parseFloat(cart.value[idx].quantity);
  if (!qty || qty <= 0) cart.value.splice(idx, 1);
};
const removeFromCart = (idx) => {
  playBeep('click');
  cart.value.splice(idx, 1);
};
const clearCart = () => {
  playBeep('click');
  cart.value = [];
  saleForm.value.discount_amount = 0;
  saleForm.value.notes = '';
  saleForm.value.warehouse_id = null;
  saleError.value = '';
};

// ─── submit sale ────────────────────────────────────────────────────────────
const selectPrinter = async () => {
  try {
    await directPrinter.selectPrinter();
    printerName.value = directPrinter.getSelectedPrinterName() || 'USB Printer';
    alert('تم تحديد الطابعة بنجاح: ' + printerName.value);
  } catch (err) {
    alert('فشل تحديد الطابعة: ' + err.message);
  }
};

const printReceipt = async (saleRecord) => {
  if (!saleRecord) return;
  try {
    const invoiceData = {
      ...saleRecord,
      invoice_number: saleRecord.sale_number,
      created_at: saleRecord.created_at || saleRecord.sale_date,
      subtotal: (saleRecord.items || []).reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0,
      ),
      total_amount: saleRecord.total_amount,
      discount_amount: saleRecord.discount_amount,
      user_name: 'كاشير الفرع',
      company: companySettings.value,
      items: saleRecord.items.map((item) => ({
        product_name:
          item.product_name ||
          item.name_ar ||
          allProducts.value.find((p) => p.id === item.product_id)?.name_ar ||
          'منتج',
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: item.quantity * item.unit_price,
      })),
    };
    await directPrinter.print(invoiceData);
  } catch (err) {
    console.error('Print failed:', err);
    alert('فشل الطباعة: ' + err.message);
  }
};

const submitManualSale = async () => {
  if (!cart.value.length) return;
  saleError.value = '';
  saving.value = true;

  const payload = {
    sale_type: 'branch',
    sale_date: saleForm.value.sale_date,
    warehouse_id: saleForm.value.warehouse_id || null,
    payment_method: saleForm.value.payment_method,
    payment_status: 'paid',
    discount_amount: Number(saleForm.value.discount_amount || 0),
    notes: saleForm.value.notes || null,
    total_amount: Number(cartTotal.value),
    items: cart.value
      .filter((i) => i.product_id && parseLocalizedNumber(i.quantity) > 0)
      .map((i) => ({
        product_id: i.product_id,
        product_name: i.name_ar,
        quantity: parseLocalizedNumber(i.quantity),
        unit_price: parseLocalizedNumber(i.unit_price),
        discount_amount: 0,
      })),
  };

  try {
    let saleRecord = null;
    if (navigator.onLine) {
      const res = await salesApi.create(payload);
      saleRecord = res.data;
      lastSavedSale.value = saleRecord;
      playBeep('success');
      clearCart();
      await Promise.all([loadHistory(), loadProducts()]);
    } else {
      saleRecord = await localDb.saveOfflineSale(payload);
      lastSavedSale.value = saleRecord;

      const offlineSales = await localDb.getOfflineSales();
      appStore.pendingSyncCount = offlineSales.length;

      playBeep('success');
      clearCart();
      salesHistory.value.unshift(saleRecord);
      alert(
        '⚠️ تم حفظ الفاتورة محلياً بسبب انقطاع الاتصال. سيتم مزامنتها تلقائياً عند عودة الشبكة.',
      );
    }

    if (autoPrint.value && saleRecord) {
      await printReceipt(saleRecord);
    }
  } catch (e) {
    // التفريق بين أخطاء الشبكة (حفظ أوفلاين) وأخطاء التحقق (عرض للمستخدم)
    const isNetworkError = !navigator.onLine || !e.status || e.code === 'ERR_NETWORK';

    if (isNetworkError) {
      console.warn('Network error — saving offline fallback...', e);
      try {
        const saleRecord = await localDb.saveOfflineSale(payload);
        lastSavedSale.value = saleRecord;

        const offlineSales = await localDb.getOfflineSales();
        appStore.pendingSyncCount = offlineSales.length;

        playBeep('success');
        clearCart();
        salesHistory.value.unshift(saleRecord);
        alert('⚠️ تم حفظ الفاتورة محلياً (فشل الاتصال بالخادم). سيتم مزامنتها تلقائياً.');

        if (autoPrint.value) {
          await printReceipt(saleRecord);
        }
      } catch (offlineErr) {
        playBeep('error');
        saleError.value = 'فشل تسجيل البيع: ' + (e.message || offlineErr.message);
      }
    } else {
      // خطأ تحقق أو سيرفر — عرضه للمستخدم بدون حفظ أوفلاين
      playBeep('error');
      saleError.value = e.message || 'فشل تسجيل البيع — تحقق من البيانات وحاول مرة أخرى';
    }
  } finally {
    saving.value = false;
  }
};

// ─── history ────────────────────────────────────────────────────────────────
const selectMonth = (event) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  historyFilters.value.from_date = fromDate;
  historyFilters.value.to_date = toDate;
  loadHistory();
};

const loadHistory = async () => {
  loadingHistory.value = true;
  try {
    let historyData = [];
    if (navigator.onLine) {
      const res = await salesApi.list({
        sale_type: 'branch',
        entry_mode: 'pos',
        from_date: historyFilters.value.from_date,
        to_date: historyFilters.value.to_date,
        limit: 100,
      });
      historyData = res.data || [];
    }
    const offlineSales = await localDb.getOfflineSales();
    salesHistory.value = [...offlineSales, ...historyData];
  } catch (e) {
    console.error('فشل تحميل السجل:', e.message);
    try {
      const offlineSales = await localDb.getOfflineSales();
      salesHistory.value = offlineSales;
    } catch (dbErr) {
      console.error('Failed to load offline sales for history:', dbErr);
    }
  } finally {
    loadingHistory.value = false;
  }
};

const returnSale = async (sale) => {
  if (!confirm(`تأكيد استرداد البيع ${sale.sale_number}؟ سيتم إرجاع المخزون.`)) return;
  try {
    await salesApi.return(sale.id, { notes: 'استرداد من شاشة مبيعات الفرع' });
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (e) {
    alert(e.message || 'فشل الاسترداد');
  }
};

// ─── badge helpers ──────────────────────────────────────────────────────────
const statusLabel = (s) => ({ completed: 'مكتمل', returned: 'مسترد', cancelled: 'ملغي' })[s] || s;
const statusBadge = (s) => [
  'badge',
  s === 'completed' ? 'badge-success' : s === 'returned' ? 'badge-danger' : 'badge-warning',
];
const paymentLabel = (s) =>
  ({ paid: 'مدفوع', unpaid: 'غير مدفوع', partial: 'جزئي', refunded: 'مسترد' })[s] || s;
const paymentBadge = (s) => [
  'badge',
  s === 'paid' ? 'badge-success' : s === 'unpaid' ? 'badge-danger' : 'badge-warning',
];

// ─── Excel ──────────────────────────────────────────────────────────────────
const downloadBranchTemplate = async () => {
  downloadingTemplate.value = true;
  try {
    const blob = await salesApi.downloadBranchTemplate();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'branch-sales-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || 'فشل تحميل القالب');
  } finally {
    downloadingTemplate.value = false;
  }
};

const onValidateExcel = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  excelMsg.value = 'جاري فحص الملف...';
  excelErr.value = false;
  excelDetails.value = [];
  try {
    const res = await salesApi.branchValidateExcel(file);
    const d = res.data;
    excelMsg.value = d.ok
      ? `✅ الملف سليم: ${d.itemCount} منتج في ${d.groupCount} فاتورة جاهزة للاستيراد`
      : '❌ الملف فيه أخطاء — راجع القائمة أدناه';
    excelErr.value = !d.ok;
    excelDetails.value = [
      ...(d.parseErrors || []).map((err) => `سطر ${err.row}: ${err.message}`),
      ...(d.preview || []).map((p) => `✓ ${p.sale_date} — ${p.items_count} منتج: ${p.sample}`),
    ];
  } catch (err) {
    excelErr.value = true;
    excelMsg.value = err.message || 'فشل فحص الملف';
  }
  e.target.value = '';
};

const onImportExcel = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  excelMsg.value = 'جاري الاستيراد...';
  excelErr.value = false;
  excelDetails.value = [];
  try {
    const res = await salesApi.branchImportExcel(file);
    const d = res.data;
    excelMsg.value =
      `✅ تم استيراد ${d.success} فاتورة (${d.itemsImported || 0} منتج)` +
      (d.failed?.length ? ` — فشل ${d.failed.length}` : '');
    excelDetails.value = [
      ...(d.parseErrors || []).map((err) => `تحذير سطر ${err.row}: ${err.message}`),
      ...(d.failed || []).map((err) => `❌ ${err.sale_date}: ${err.message}`),
    ];
    excelErr.value = d.success === 0;
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (err) {
    excelErr.value = true;
    excelMsg.value = err.message || 'فشل الاستيراد';
  }
  e.target.value = '';
};

// ─── lifecycle & events ───
const onInventoryUpdated = (e) => {
  try {
    loadProducts();
  } catch (err) {
    console.warn('inventory-updated handler error', err);
  }
};

onMounted(async () => {
  loadProducts();
  loadHistory();
  window.addEventListener('inventory-updated', onInventoryUpdated);
  window.addEventListener('keydown', handleGlobalKeyDown);

  // Load company settings
  try {
    const res = await userApi.settings();
    if (res.data?.company) {
      companySettings.value = res.data.company;
      localStorage.setItem('company_settings', JSON.stringify(res.data.company));
    }
  } catch (e) {
    const cached = localStorage.getItem('company_settings');
    if (cached) companySettings.value = JSON.parse(cached);
  }

  // Watch for global WebSocket/sync data refreshes
  watch(
    () => appStore.dataRefreshTrigger,
    () => {
      loadProducts();
      loadHistory();
    },
  );
});

onBeforeUnmount(() => {
  window.removeEventListener('inventory-updated', onInventoryUpdated);
  window.removeEventListener('keydown', handleGlobalKeyDown);
});

const openCountsModal = () => {
  counts.value = {};
  for (const p of allProducts.value) counts.value[p.id] = 0;
  countsModal.value = true;
};

const submitCounts = async () => {
  const items = [];
  for (const [pid, qty] of Object.entries(counts.value || {})) {
    const q = Number(qty || 0);
    if (q > 0) {
      const prod = allProducts.value.find((x) => String(x.id) === String(pid));
      items.push({
        product_id: Number(pid),
        quantity: q,
        unit_price: prod ? Number(prod.sale_price || 0) : 0,
      });
    }
  }
  if (!items.length) {
    alert('أدخل كميات على الأقل لمنتج واحد.');
    return;
  }

  countsModal.value = false;
  try {
    saving.value = true;
    await salesApi.create({
      sale_type: 'branch',
      sale_date: saleForm.value.sale_date,
      warehouse_id: saleForm.value.warehouse_id || null,
      payment_method: saleForm.value.payment_method || 'cash',
      payment_status: 'paid',
      discount_amount: 0,
      notes: 'خصم حسب تعداد المنتجات',
      items,
    });
    counts.value = {};
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (e) {
    alert(e.message || 'فشل تنفيذ الخصم من التعداد');
  } finally {
    saving.value = false;
  }
};
</script>

<style lang="scss" scoped>
.branch-sales-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  .header-title {
    display: flex;
    align-items: center;
    gap: 14px;
    .header-icon {
      font-size: 2rem;
    }
    h2 {
      margin: 0;
      font-size: 1.3rem;
      color: var(--primary-dark);
    }
    p {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  }
  .header-actions {
    display: flex;
    gap: 8px;
  }
}

/* Mode toggle */
.btn-outline {
  padding: 8px 18px;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  cursor: pointer;
  font-weight: 600;
  transition: var(--transition);
  &.active,
  &:hover {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }
}

/* Stats */
.stats-row {
  margin-bottom: 4px;
}

/* Main grid */
.main-grid {
  align-items: start;
}

/* Products Panel */
.products-panel {
  .panel-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
    h3 {
      margin: 0;
      color: var(--primary-dark);
    }
    .panel-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  }
  .search-input,
  .category-select {
    flex: 1;
    min-width: 120px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    font-size: 0.9rem;
  }
}

/* Category Pills Bar */
.category-pills-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px 10px 2px;
  margin-bottom: 12px;
  scrollbar-width: thin;

  .pill-btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--bg-card, var(--bg));
    color: var(--text);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--primary);
      color: var(--primary);
    }

    &.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 2px 6px color-mix(in srgb, var(--primary) 30%, transparent);
    }
  }
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  max-height: 520px;
  overflow-y: auto;
  padding: 4px;
}

.product-card {
  position: relative;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.25s ease,
    border-color 0.25s ease,
    background 0.25s ease;
  background: var(--bg-card);
  text-align: center;
  animation: card-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;

  @for $i from 1 through 24 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 15}ms;
    }
  }

  &:hover {
    border-color: var(--accent);
    transform: translateY(-4px);
    box-shadow: 0 8px 20px rgba(161, 98, 7, 0.1);
  }

  &:active {
    transform: translateY(-1px) scale(0.96);
  }

  &.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  &.no-recipe {
    border-style: dashed;
  }
  &.low-stock {
    border-color: #f59e0b;
  }

  .product-name {
    font-weight: 700;
    font-size: 0.88rem;
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .product-meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .product-price {
    font-weight: 700;
    color: var(--primary-dark);
  }
  .product-status {
    margin-top: 4px;
  }

  .cart-qty-badge {
    position: absolute;
    top: -8px;
    left: -8px;
    background: var(--accent);
    color: #fff;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 800;
    box-shadow: var(--shadow-xs);
  }

  /* 🟢 مؤشر المخزون المضيء */
  .stock-indicator-dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;

    &.good {
      color: #10b981;
      background-color: #10b981;
    }
    &.low {
      color: #f97316;
      background-color: #f97316;
    }
    &.out {
      color: #ef4444;
      background-color: #ef4444;
    }
  }

  &.is-out-of-stock {
    opacity: 0.58;
    cursor: not-allowed;
    pointer-events: none;
    border-color: rgba(239, 68, 68, 0.22) !important;
    background: color-mix(in srgb, var(--danger) 2%, var(--bg-card)) !important;

    &:hover {
      transform: none !important;
      box-shadow: none !important;
    }
  }
}

@keyframes card-fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Cart Panel */
.cart-panel {
  h3 {
    margin-bottom: 16px;
    color: var(--primary-dark);
  }
  .empty-cart {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
    span {
      font-size: 3rem;
      display: inline-block;
      margin-bottom: 8px;
      animation: cart-bounce 2s ease-in-out infinite;
    }
  }
}

@keyframes cart-bounce {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-8px) rotate(4deg);
  }
}

.cart-items {
  max-height: 280px;
  overflow-y: auto;
  margin-bottom: 12px;
}
.cart-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 8px;
  background: var(--bg);
  .cart-item-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    .cart-item-name {
      font-weight: 600;
      font-size: 0.9rem;
    }
    .cart-item-price {
      color: var(--text-muted);
      font-size: 0.85rem;
    }
  }
  .cart-item-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .qty-btn {
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-card);
    cursor: pointer;
    font-size: 1rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover {
      background: var(--primary);
      color: #fff;
    }
  }
  .qty-input {
    width: 60px;
    text-align: center;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    margin-right: auto;
  }
  .cart-item-total {
    font-weight: 700;
    color: var(--primary-dark);
    text-align: left;
    font-size: 0.95rem;
  }
}

.cart-summary {
  border-top: 2px solid var(--border);
  padding-top: 12px;
  margin-bottom: 16px;
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 0.9rem;
  }
  .discount-row .discount-input {
    width: 90px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    text-align: center;
  }
  .total-row {
    font-weight: 800;
    font-size: 1.05rem;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    margin-top: 4px;
  }
  .total-amount {
    color: var(--primary-dark);
    font-size: 1.15rem;
  }
}

.sale-form {
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .btn-submit {
    width: 100%;
    margin-bottom: 8px;
    padding: 12px;
    font-size: 1rem;
  }
  .btn-clear {
    width: 100%;
  }
}

.alert-danger {
  background: rgba(180, 35, 24, 0.08);
  border: 1px solid rgba(180, 35, 24, 0.3);
  color: #b42318;
  padding: 10px 14px;
  border-radius: var(--radius);
  margin-bottom: 12px;
  font-size: 0.9rem;
}

/* Excel Mode */
.excel-mode {
  h3 {
    margin-bottom: 8px;
    color: var(--primary-dark);
  }
  .excel-note {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-bottom: 16px;
  }
  .excel-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .import-label {
    cursor: pointer;
  }
}

/* Steps */
.excel-steps {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  .step {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-left: 1px solid var(--border);
    &:last-child {
      border-left: none;
    }
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.9rem;
      flex-shrink: 0;
    }
    .step-body {
      display: flex;
      flex-direction: column;
      gap: 3px;
      strong {
        font-size: 0.9rem;
        color: var(--primary-dark);
      }
      span {
        font-size: 0.8rem;
        color: var(--text-muted);
      }
    }
  }
}

.import-result {
  padding: 12px;
  border-radius: var(--radius);
  background: rgba(46, 125, 79, 0.08);
  border: 1px solid rgba(46, 125, 79, 0.3);
  &.import-err {
    background: rgba(180, 35, 24, 0.08);
    border-color: rgba(180, 35, 24, 0.3);
  }
  .import-msg {
    margin: 0 0 8px;
    font-weight: 700;
  }
  .import-details {
    margin: 0;
    padding-right: 20px;
    font-size: 0.88rem;
    li {
      margin: 3px 0;
    }
  }
}

.excel-guide {
  margin-top: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--primary-dark);
    margin-bottom: 8px;
  }
  .guide-note {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin-top: 10px;
  }
  .guide-table-wrap {
    overflow-x: auto;
    margin-top: 10px;
  }
  .guide-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    th,
    td {
      border: 1px solid var(--border);
      padding: 7px 10px;
      text-align: right;
    }
    th {
      background: var(--primary);
      color: #fff;
    }
    .muted {
      color: var(--text-muted);
    }
    .qty-col {
      background: rgba(46, 125, 79, 0.08);
      font-weight: 700;
      color: #2e7d4f;
      text-align: center;
    }
    .more-row {
      text-align: center;
      color: var(--text-muted);
      font-style: italic;
    }
    code {
      background: var(--bg);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.8rem;
    }
  }
}

/* History */
.sales-history {
  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
    h3 {
      margin: 0;
      color: var(--primary-dark);
    }
    .history-filters {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9rem;
      input {
        padding: 6px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .month-filter-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--bg-card);
        cursor: pointer;
        transition: all 0.2s;
      }
      .month-filter-btn:hover {
        background: var(--bg-hover);
        border-color: var(--primary);
        color: var(--primary);
      }
      .month-picker-overlay {
        position: absolute;
        inset: 0;
        opacity: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
      }
    }
  }
  .history-table-wrap {
    overflow-x: auto;
  }
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  th,
  td {
    padding: 10px 12px;
    text-align: right;
    border-bottom: 1px solid var(--border);
  }
  th {
    background: var(--bg);
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .sale-number {
    font-family: monospace;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .amount {
    font-weight: 700;
    color: var(--primary-dark);
  }
  .items-count {
    background: var(--bg);
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 0.8rem;
  }
  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 24px;
  }
}

.btn-sm {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
}
.btn-danger {
  background: rgba(180, 35, 24, 0.1);
  color: #b42318;
  border: 1px solid rgba(180, 35, 24, 0.3);
  &:hover {
    background: #b42318;
    color: #fff;
  }
}

.loading-state {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
  font-size: 1rem;
}
.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
  span {
    font-size: 2.5rem;
    display: inline-block;
    margin-bottom: 8px;
    animation: search-sway 2.2s ease-in-out infinite;
  }
}

@keyframes search-sway {
  0%,
  100% {
    transform: rotate(-6deg) scale(1);
  }
  50% {
    transform: rotate(12deg) scale(1.08);
  }
}

@media (max-width: 900px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}

/* Printer Settings Styling */
.printer-settings-box {
  margin: 16px 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  box-shadow: var(--shadow-sm);

  .printer-header {
    font-weight: 700;
    font-size: 0.88rem;
    color: var(--primary-dark);
    margin-bottom: 10px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
  }

  .printer-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .printer-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;

    .printer-status {
      font-size: 0.8rem;
      color: var(--text-muted);

      &.configured {
        color: var(--success);
        font-weight: 700;
      }
    }
  }

  .printer-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    cursor: pointer;
    color: var(--text);

    input {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: var(--primary);
    }
  }

  .print-last-btn {
    font-size: 0.78rem;
    padding: 6px 12px;
  }
}

/* AI Recommendations styling */
.cart-recommendations {
  margin: 12px 14px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px dashed var(--primary-soft);
  border-radius: var(--radius-md);

  .rec-title {
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--primary-dark);
    margin-bottom: 8px;
  }

  .rec-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rec-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition);

    &:hover {
      background: var(--primary-soft);
      border-color: var(--primary-strong);
      transform: translateX(-2px);
    }

    .rec-name {
      display: flex;
      flex-direction: column;
      text-align: right;

      .rec-name-text {
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--text-strong);
      }

      .rec-category {
        font-size: 0.7rem;
        color: var(--text-muted);
      }
    }

    .rec-action {
      display: flex;
      align-items: center;
      gap: 6px;

      .rec-price {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--accent);
      }

      .rec-add-icon {
        font-size: 0.72rem;
        color: var(--primary);
      }
    }
  }
}

.mobile-tabs-bar {
  display: none;
}

@media (max-width: 768px) {
  .mobile-tabs-bar {
    display: flex;
    gap: 8px;
    margin-bottom: var(--space-4);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    padding: 6px;
    border-radius: var(--radius-lg);

    .tab-btn {
      flex: 1;
      min-height: 40px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-weight: 800;
      font-size: 0.86rem;
      border-radius: var(--radius-md);
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;

      &.active {
        background: var(--primary);
        color: #ffffff;
        box-shadow: var(--shadow-sm);
      }
    }
  }

  .products-panel,
  .cart-panel {
    &.mobile-hidden {
      display: none !important;
    }
  }

  .cart-badge {
    position: absolute;
    top: -4px;
    left: 8px;
    background: var(--accent);
    color: #ffffff;
    font-size: 0.68rem;
    font-weight: 900;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    padding: 0 4px;
  }
}
</style>
