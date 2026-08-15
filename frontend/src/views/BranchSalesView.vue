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
        <ProductsPanel
          ref="productsPanelRef"
          :filtered-products="filteredProducts"
          :categories="categories"
          :loading-products="loadingProducts"
          v-model:product-search="productSearch"
          v-model:selected-category="selectedCategory"
          :active-tab="activeTab"
          :format-money="formatMoney"
          :has-low-ingredients="hasLowIngredients"
          :get-product-stock-class="getProductStockClass"
          :get-product-stock-title="getProductStockTitle"
          :is-in-cart="isInCart"
          :get-cart-qty="getCartQty"
          @add-to-cart="addToCart"
          @filter="filterProducts"
        />

        <!-- Cart & Form Panel -->
        <CartPanel
          :cart="cart"
          :sale-form="saleForm"
          :recommended-items="recommendedItems"
          :cart-subtotal="cartSubtotal"
          :cart-total="cartTotal"
          :saving="saving"
          :sale-error="saleError"
          v-model:auto-print="autoPrint"
          :printer-name="printerName"
          :last-saved-sale="lastSavedSale"
          :active-tab="activeTab"
          :format-money="formatMoney"
          @increase-qty="increaseQty"
          @decrease-qty="decreaseQty"
          @validate-qty="validateQty"
          @remove-from-cart="removeFromCart"
          @add-recommended="addRecommendedToCart"
          @submit-sale="submitManualSale"
          @clear-cart="clearCart"
          @select-printer="selectPrinter"
          @print-last="printReceipt"
        />
      </div>
    </div>

    <!-- Excel Mode -->
    <ExcelMode
      v-if="showMode === 'excel'"
      :all-products="allProducts"
      :downloading-template="downloadingTemplate"
      :excel-msg="excelMsg"
      :excel-err="excelErr"
      :excel-details="excelDetails"
      :today-str="todayStr"
      :format-money="formatMoney"
      @download="downloadBranchTemplate"
      @validate="onValidateExcel"
      @import="onImportExcel"
    />

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

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import StatCard from '@/components/StatCard.vue';
import AppIcon from '@/components/AppIcon.vue';
import SkeletonLoader from '@/components/SkeletonLoader.vue';
import ProductsPanel from '@/components/branch/ProductsPanel.vue';
import CartPanel from '@/components/branch/CartPanel.vue';
import ExcelMode from '@/components/branch/ExcelMode.vue';
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

const formatDate = (d: any) => {
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
const lastSavedSale = ref<any>(null);

const productsPanelRef = ref<InstanceType<typeof ProductsPanel> | null>(null);
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
    const AudioCtx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
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
      const playTone = (freq: any, duration: any, delay: any) => {
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
  } catch (err: any) {
    console.error('Audio play failed:', err);
  }
};

const handleGlobalKeyDown = (e: any) => {
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
    productsPanelRef.value?.focusSearch();
  }
};

watch(autoPrint, (val: any) => {
  localStorage.setItem('auto_print_receipt', String(val));
});

const allProducts = ref<any[]>([]);
const filteredProducts = ref<any[]>([]);
const productSearch = ref('');
const selectedCategory = ref('');

const cart = ref<any[]>([]);
const saleForm = ref({
  sale_date: today,
  payment_method: 'cash',
  discount_amount: 0,
  warehouse_id: null,
  notes: '',
});

// AI complementary items states & actions
const recommendedItems = ref<any[]>([]);
const loadingRecommendations = ref(false);

const loadRecommendations = async () => {
  if (!cart.value.length) {
    recommendedItems.value = [];
    return;
  }
  loadingRecommendations.value = true;
  try {
    const productIds = cart.value.map((i: any) => i.product_id);
    const res = await forecastingApi.getBasketAssociations({
      cart: productIds.join(','),
      warehouse_id: saleForm.value.warehouse_id || 1,
    });
    // Filter out recommendations that are already in the cart
    recommendedItems.value = (res.data || []).filter(
      (r: any) => !productIds.includes(r.product_id),
    );
  } catch (err: any) {
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

const addRecommendedToCart = (rec: any) => {
  const product = allProducts.value.find((p: any) => p.id === rec.product_id) || {
    id: rec.product_id,
    name_ar: rec.name_ar,
    sale_price: rec.sale_price,
    has_recipe: true,
  };
  addToCart(product);
};

const salesHistory = ref<any[]>([]);
const historyFilters = ref({ from_date: today.slice(0, 8) + '01', to_date: today });

// Excel state
const excelMsg = ref('');
const excelErr = ref(false);
const excelDetails = ref<any[]>([]);
const countsModal = ref(false);
const counts = ref<Record<string, any>>({});

// ─── computed ──────────────────────────────────────────────────────────────
const cartSubtotal = computed(() =>
  cart.value.reduce((sum: any, item: any) => sum + item.quantity * item.unit_price, 0),
);
const cartTotal = computed(() =>
  Math.max(0, cartSubtotal.value - (saleForm.value.discount_amount || 0)),
);

const todayTotal = computed(() =>
  salesHistory.value
    .filter((s: any) => s.status === 'completed' && (s.sale_date || '').startsWith(today))
    .reduce((sum: any, s: any) => sum + parseFloat(s.total_amount || 0), 0),
);
const todayCount = computed(
  () =>
    salesHistory.value.filter(
      (s: any) => s.status === 'completed' && (s.sale_date || '').startsWith(today),
    ).length,
);
const lastSaleTime = computed(() => {
  const todaySales = salesHistory.value.filter((s: any) => (s.sale_date || '').startsWith(today));
  if (!todaySales.length) return '—';
  const last = todaySales[0];
  const d = new Date(last.created_at);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
});

// ─── product helpers ────────────────────────────────────────────────────────
const hasLowIngredients = (product: any) => {
  if (!product.has_recipe || !Array.isArray(product.recipe_items)) return false;
  return product.recipe_items.some((ri: any) => {
    const needed = Number(ri.quantity);
    const available = Number(ri.stock_available || 0);
    return available < needed;
  });
};

const getProductStockClass = (product: any) => {
  if (!product.has_recipe) {
    const qty = Number(product.stock_quantity || 0);
    if (qty <= 0) return 'out';
    if (qty <= 10) return 'low';
    return 'good';
  } else {
    const isMissing = hasLowIngredients(product);
    if (isMissing) return 'out';

    // Check if any ingredient has less than 5 servings left
    const isClose = product.recipe_items?.some((ri: any) => {
      const needed = Number(ri.quantity);
      const available = Number(ri.stock_available || 0);
      return available < needed * 5;
    });
    if (isClose) return 'low';
    return 'good';
  }
};

const getProductStockTitle = (product: any) => {
  const status = getProductStockClass(product);
  if (status === 'out') return 'المخزون غير كافٍ لعمل المشروب ⚠️';
  if (status === 'low') return 'المخزون منخفض (أقل من 5 أكواب متبقية) ⚡';
  return 'متوفر بكثرة في المخزن ✓';
};

const isInCart = (productId: any) => cart.value.some((i: any) => i.product_id === productId);
const getCartQty = (productId: any) => {
  const item = cart.value.find((i: any) => i.product_id === productId);
  return item ? item.quantity : 0;
};

// ─── product actions ────────────────────────────────────────────────────────
const filterProducts = () => {
  let list = allProducts.value;
  if (selectedCategory.value) {
    list = list.filter((p: any) => p.category_id == selectedCategory.value);
  }
  if (productSearch.value.trim()) {
    const q = productSearch.value.trim().toLowerCase();
    list = list.filter(
      (p: any) => p.name_ar.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q),
    );
  }
  filteredProducts.value = list;
};

const loadProducts = async () => {
  loadingProducts.value = true;
  try {
    const params: Record<string, any> = {};
    if (saleForm.value.warehouse_id) params.warehouse_id = saleForm.value.warehouse_id;

    if (navigator.onLine) {
      const prodRes = await productsApi.branchProducts(params);
      allProducts.value = prodRes.data || [];
      try {
        await localDb.saveProducts(allProducts.value);
      } catch (dbErr: any) {
        console.warn('Failed to cache products to IndexedDB:', dbErr);
      }
    } else {
      const cached = await localDb.getProducts();
      allProducts.value = cached || [];
    }
    await loadMeta();
    filterProducts();
  } catch (e: any) {
    console.error('فشل تحميل المنتجات:', e.message);
    try {
      const cached = await localDb.getProducts();
      if (cached && cached.length) {
        allProducts.value = cached;
        filterProducts();
      }
    } catch (dbErr: any) {
      console.error('Failed to load products from IndexedDB fallback:', dbErr);
    }
  } finally {
    loadingProducts.value = false;
  }
};

// reload products when selected warehouse for the sale changes
watch(
  () => saleForm.value.warehouse_id,
  (v: any, o: any) => {
    if (v !== o) loadProducts();
  },
);

// ─── cart actions ───────────────────────────────────────────────────────────
const addToCart = (product: any) => {
  playBeep('success');
  const existing = cart.value.find((i: any) => i.product_id === product.id);
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

const increaseQty = (idx: any) => {
  playBeep('click');
  cart.value[idx].quantity = parseFloat((cart.value[idx].quantity + 1).toFixed(3));
};
const decreaseQty = (idx: any) => {
  playBeep('click');
  if (cart.value[idx].quantity > 0.1) {
    cart.value[idx].quantity = parseFloat((cart.value[idx].quantity - 1).toFixed(3));
  } else {
    cart.value.splice(idx, 1);
  }
};
const validateQty = (idx: any) => {
  const qty = parseFloat(cart.value[idx].quantity);
  if (!qty || qty <= 0) cart.value.splice(idx, 1);
};
const removeFromCart = (idx: any) => {
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
  } catch (err: any) {
    alert('فشل تحديد الطابعة: ' + err.message);
  }
};

const printReceipt = async (saleRecord: any) => {
  if (!saleRecord) return;
  try {
    const invoiceData = {
      ...saleRecord,
      invoice_number: saleRecord.sale_number,
      created_at: saleRecord.created_at || saleRecord.sale_date,
      subtotal: (saleRecord.items || []).reduce(
        (sum: any, item: any) => sum + item.quantity * item.unit_price,
        0,
      ),
      total_amount: saleRecord.total_amount,
      discount_amount: saleRecord.discount_amount,
      user_name: 'كاشير الفرع',
      company: companySettings.value,
      items: saleRecord.items.map((item: any) => ({
        product_name:
          item.product_name ||
          item.name_ar ||
          allProducts.value.find((p: any) => p.id === item.product_id)?.name_ar ||
          'منتج',
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_amount: item.quantity * item.unit_price,
      })),
    };
    await directPrinter.print(invoiceData);
  } catch (err: any) {
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
      .filter((i: any) => i.product_id && parseLocalizedNumber(i.quantity) > 0)
      .map((i: any) => ({
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
  } catch (e: any) {
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
      } catch (offlineErr: any) {
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
const selectMonth = (event: any) => {
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
  } catch (e: any) {
    console.error('فشل تحميل السجل:', e.message);
    try {
      const offlineSales = await localDb.getOfflineSales();
      salesHistory.value = offlineSales;
    } catch (dbErr: any) {
      console.error('Failed to load offline sales for history:', dbErr);
    }
  } finally {
    loadingHistory.value = false;
  }
};

const returnSale = async (sale: any) => {
  if (!confirm(`تأكيد استرداد البيع ${sale.sale_number}؟ سيتم إرجاع المخزون.`)) return;
  try {
    await salesApi.return(sale.id, { notes: 'استرداد من شاشة مبيعات الفرع' });
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (e: any) {
    alert(e.message || 'فشل الاسترداد');
  }
};

// ─── badge helpers ──────────────────────────────────────────────────────────
const statusLabel = (s: any) =>
  (({ completed: 'مكتمل', returned: 'مسترد', cancelled: 'ملغي' }) as Record<string, string>)[s] ||
  s;
const statusBadge = (s: any) => [
  'badge',
  s === 'completed' ? 'badge-success' : s === 'returned' ? 'badge-danger' : 'badge-warning',
];
const paymentLabel = (s: any) =>
  (
    ({ paid: 'مدفوع', unpaid: 'غير مدفوع', partial: 'جزئي', refunded: 'مسترد' }) as Record<
      string,
      string
    >
  )[s] || s;
const paymentBadge = (s: any) => [
  'badge',
  s === 'paid' ? 'badge-success' : s === 'unpaid' ? 'badge-danger' : 'badge-warning',
];

// ─── Excel ──────────────────────────────────────────────────────────────────
const downloadBranchTemplate = async () => {
  downloadingTemplate.value = true;
  try {
    const blob = (await salesApi.downloadBranchTemplate()) as unknown as Blob;
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'branch-sales-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    alert(e.message || 'فشل تحميل القالب');
  } finally {
    downloadingTemplate.value = false;
  }
};

const onValidateExcel = async (file: File) => {
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
      ...(d.parseErrors || []).map((err: any) => `سطر ${err.row}: ${err.message}`),
      ...(d.preview || []).map((p: any) => `✓ ${p.sale_date} — ${p.items_count} منتج: ${p.sample}`),
    ];
  } catch (err: any) {
    excelErr.value = true;
    excelMsg.value = err.message || 'فشل فحص الملف';
  }
};

const onImportExcel = async (file: File) => {
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
      ...(d.parseErrors || []).map((err: any) => `تحذير سطر ${err.row}: ${err.message}`),
      ...(d.failed || []).map((err: any) => `❌ ${err.sale_date}: ${err.message}`),
    ];
    excelErr.value = d.success === 0;
    await Promise.all([loadHistory(), loadProducts()]);
  } catch (err: any) {
    excelErr.value = true;
    excelMsg.value = err.message || 'فشل الاستيراد';
  }
};

// ─── lifecycle & events ───
const onInventoryUpdated = (_e: any) => {
  try {
    loadProducts();
  } catch (err: any) {
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
  } catch {
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
      const prod = allProducts.value.find((x: any) => String(x.id) === String(pid));
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
  } catch (e: any) {
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

/* Counts Modal */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-content {
  max-width: 720px;
  width: 90%;
}
.counts-table-wrap {
  overflow-x: auto;
  max-height: 55vh;
  overflow-y: auto;
}
.counts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th,
  td {
    padding: 8px 10px;
    text-align: right;
    border-bottom: 1px solid var(--border);
  }
  th {
    background: var(--bg);
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  code {
    background: var(--bg);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  input[type='number'] {
    width: 90px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    text-align: center;
  }
}
.modal-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
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

@media (max-width: 900px) {
  .main-grid {
    grid-template-columns: 1fr;
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
