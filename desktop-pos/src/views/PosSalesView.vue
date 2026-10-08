<template>
  <div class="pos-master-sales-page">
    <!-- ═══════════════════ TOP TERMINAL RIBBON (PREMIUM REDESIGN) ═══════════════════ -->
    <header class="pos-top-ribbon">
      <!-- 1. Right Section: Brand & Terminal Context -->
      <div class="ribbon-brand-section">
        <div class="brand-badge-wrapper">
          <div class="coffee-logo-circle" aria-hidden="true">
            <img src="/logo-transparent.png" alt="بن العجوز" @error="handleLogoError" />
          </div>
          <div class="brand-meta">
            <div class="brand-title-row">
              <h1 class="brand-name">بن العجوز ERP</h1>
              <span class="pos-role-tag">نقطة البيع</span>
            </div>
            <div class="terminal-info-chips">
              <span class="chip chip-terminal" title="معرف محطة الكاشير">
                <AppIcon name="monitor" :size="11" />
                <span>TRM-01</span>
              </span>
              <span class="chip chip-store" title="موقع التشغيل الحالي">
                <AppIcon name="shop" :size="11" />
                <span>المحل الرئيسي</span>
              </span>
              <span class="chip chip-shift-status" title="حالة الوردية">
                <span class="live-pulse-dot"></span>
                <span>الوردية #{{ shiftStore.currentShift?.shift_number || '1' }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Center Section: Live Real-Time Cashier Metrics & Digital Clock -->
      <div class="ribbon-metrics-center">
        <!-- Cashier Card -->
        <div class="metric-card cashier-card" title="الكاشير الحالي المسؤول عن نقطة البيع">
          <div class="card-icon-wrap user-avatar">
            <AppIcon name="user" :size="15" />
          </div>
          <div class="card-content">
            <span class="metric-label">الكاشير النشط</span>
            <strong class="metric-val cashier-name">{{
              authStore.user?.full_name || 'الكاشير'
            }}</strong>
          </div>
        </div>

        <!-- Shift Sales Card -->
        <div class="metric-card sales-card" title="إجمالي مبيعات الوردية الحالية">
          <div class="card-icon-wrap sales-icon">
            <AppIcon name="coins" :size="16" />
          </div>
          <div class="card-content">
            <span class="metric-label">مبيعات الوردية</span>
            <strong class="metric-val sales-amount">
              {{ formatMoney(shiftStore.currentShift?.total_sales_amount || 0) }}
            </strong>
          </div>
        </div>

        <!-- Invoices Count Card -->
        <div class="metric-card invoices-card" title="عدد الفواتير المنفذة في هذه الوردية">
          <div class="card-icon-wrap invoices-icon">
            <AppIcon name="receipt" :size="15" />
          </div>
          <div class="card-content">
            <span class="metric-label">الفواتير</span>
            <strong class="metric-val invoices-count">
              {{ shiftStore.currentShift?.invoices_count || 0 }}
            </strong>
          </div>
        </div>

        <!-- Live Clock & Date Card -->
        <div class="metric-card clock-card" title="الوقت والتاريخ المباشر بتوقيت القاهرة">
          <div class="card-icon-wrap clock-icon">
            <AppIcon name="clock" :size="15" />
          </div>
          <div class="card-content">
            <span class="metric-label">{{ currentDateString }}</span>
            <strong class="metric-val live-time">{{ currentTimeString }}</strong>
          </div>
        </div>
      </div>

      <!-- 3. Left Section: Operational Tools & Terminal Controls -->
      <div class="ribbon-tools-section">
        <!-- Action Buttons Group -->
        <div class="tools-segmented-group">
          <!-- Today's Invoices & Returns -->
          <button
            type="button"
            class="ribbon-btn tool-invoices"
            @click="openReturnsModal"
            title="استعراض فواتير اليوم وعمل المرتجعات السريعة"
          >
            <AppIcon name="history" :size="15" />
            <span class="btn-label">فواتير اليوم</span>
            <span v-if="todaysInvoices.length > 0" class="badge-count">{{
              todaysInvoices.length
            }}</span>
          </button>

          <!-- Cash Movement -->
          <button
            type="button"
            class="ribbon-btn tool-cash"
            @click="showCashModal = true"
            title="تسجيل حركة نقدية (سحب أو إيداع فكة بالدرج)"
          >
            <AppIcon name="banknote" :size="15" />
            <span class="btn-label">حركة درج</span>
          </button>

          <!-- Open Drawer (F9) -->
          <button
            type="button"
            class="ribbon-btn tool-drawer"
            @click="handleOpenDrawer"
            title="فتح درج النقدية يدويًا (F9)"
          >
            <AppIcon name="key" :size="15" />
            <span class="btn-label">فتح الدرج</span>
            <kbd class="shortcut-tag">F9</kbd>
          </button>

          <!-- Reprint Last Invoice (F8) -->
          <button
            v-if="lastSavedSale || todaysInvoices.length"
            type="button"
            class="ribbon-btn tool-reprint"
            @click="reprintLastSale"
            title="إعادة طباعة إيصال آخر فاتورة (F8)"
          >
            <AppIcon name="printer" :size="15" />
            <span class="btn-label">طباعة</span>
            <kbd class="shortcut-tag">F8</kbd>
          </button>

          <!-- Shortcuts Guide (F1) -->
          <button
            type="button"
            class="ribbon-btn tool-shortcuts"
            @click="showShortcutsModal = true"
            title="دليل اختصارات لوحة المفاتيح الشامل (F1)"
          >
            <AppIcon name="keyboard" :size="15" />
            <span class="btn-label">الاختصارات</span>
            <kbd class="shortcut-tag">F1</kbd>
          </button>
        </div>

        <!-- Smart In-App Update Trigger Button (Always accessible) -->
        <button
          type="button"
          class="ribbon-btn update-btn"
          :class="{
            ready: isDownloaded,
            downloading: isDownloading,
            available: isAvailable,
            checking: isChecking,
          }"
          :title="
            isDownloaded
              ? 'تحديث جديد جاهز للتثبيت الفوري — انقر للتطبيق'
              : isDownloading
                ? `جاري تنزيل التحديث (${downloadPercent}%)`
                : isAvailable
                  ? 'يوجد إصدار جديد ويتم تنزيله'
                  : 'فحص وتحديث البرنامج'
          "
          @click="openUpdateModal"
        >
          <AppIcon
            :name="
              isDownloaded
                ? 'download'
                : isDownloading
                  ? 'refreshCw'
                  : isAvailable
                    ? 'download'
                    : 'refreshCw'
            "
            :size="15"
            :class="{ 'spin-anim': isChecking || isDownloading }"
          />
          <span class="btn-label">
            {{
              isDownloaded
                ? 'تحديث جاهز'
                : isDownloading
                  ? `تنزيل ${downloadPercent}%`
                  : isAvailable
                    ? 'تحديث متاح'
                    : 'تحديث البرنامج'
            }}
          </span>
          <span v-if="isDownloaded" class="update-pulse-dot"></span>
        </button>

        <!-- System Status & Sync Pill -->
        <button
          type="button"
          class="ribbon-sync-pill"
          :class="isOnline ? 'online' : 'offline'"
          @click="router.push('/sync')"
          :title="
            isOnline
              ? 'الاتصال بالخادم المركزي نشط ومستقر'
              : 'وضع بدون اتصال - انقر لعرض طابور المزامنة'
          "
        >
          <span class="sync-status-indicator">
            <span class="pulse-ring"></span>
            <span class="pulse-core"></span>
          </span>
          <span class="sync-text">{{ isOnline ? 'متصل' : 'أوفلاين' }}</span>
          <span v-if="pendingSyncCount > 0" class="pending-sync-badge">
            {{ pendingSyncCount }} معلقة
          </span>
        </button>

        <!-- Fullscreen Toggle (F11) -->
        <button
          type="button"
          class="ribbon-btn btn-fullscreen"
          @click="toggleFullscreen"
          :title="isFullscreen ? 'إنهاء وضع الشاشة الكاملة (F11)' : 'وضع الشاشة الكاملة (F11)'"
        >
          <AppIcon :name="isFullscreen ? 'minimize' : 'maximize'" :size="16" />
        </button>

        <!-- Close Shift Button -->
        <button
          type="button"
          class="ribbon-btn btn-close-shift-action"
          @click="router.push('/shift/close')"
          title="إنهاء وردية الكاشير ومطابقة النقدية"
        >
          <AppIcon name="logout" :size="16" />
          <span>إغلاق الوردية</span>
        </button>
      </div>
    </header>

    <div v-if="isDownloaded" class="pos-update-banner" role="status">
      <div class="banner-text">
        <AppIcon name="download" :size="16" />
        <strong>تحديث جديد جاهز للتطبيق الفوري (v{{ updateState.version }})</strong>
        <span
          >تم تنزيل الحزمة بنجاح. انقر لتطبيق التحديث وإعادة التشغيل دون الحاجة لإعادة التثبيت
          يدوياً.</span
        >
      </div>
      <div class="banner-actions">
        <button type="button" class="btn-banner-apply" @click="installUpdate">
          تحديث وتثبيت الآن
        </button>
        <button type="button" class="btn-banner-info" @click="openUpdateModal">التفاصيل</button>
      </div>
    </div>

    <!-- ═══════════════════ HELD ORDERS RIBBON ═══════════════════ -->
    <div v-if="heldOrders.length" class="held-orders-bar">
      <div class="held-bar-header">
        <span class="held-icon"><AppIcon name="timer" :size="16" /></span>
        <span class="held-title">الطلبات المعلقة ({{ heldOrders.length }}):</span>
      </div>
      <div class="held-orders-list">
        <div
          v-for="held in heldOrders"
          :key="held.id"
          class="held-card"
          @click="handleRestoreHeldOrder(held)"
          title="اضغط لاستئناف هذا الطلب في السلة فوراً"
        >
          <div class="held-meta">
            <span class="held-time"
              ><AppIcon name="clock" :size="12" /> {{ held.time || 'معلق' }}</span
            >
            <span class="held-count">{{ held.items?.length || 0 }} صنف</span>
          </div>
          <strong class="held-total">{{ formatMoney(held.total) }}</strong>
          <button
            type="button"
            class="held-remove-btn"
            @click.stop="deleteHeldOrder(held.id)"
            title="حذف هذا الطلب المعلق نهائياً"
          >
            <AppIcon name="close" :size="12" />
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ MAIN WORKSPACE (100% FULL-WIDTH CATALOG) ═══════════════════ -->
    <main class="pos-main-workspace manual-mode-layout">
      <!-- 100% Full-Width Product Catalog View -->
      <div class="full-catalog-wrapper">
        <ProductsPanel
          ref="productsPanelRef"
          :filtered-products="filteredProducts"
          :categories="categories"
          :loading-products="loadingProducts"
          :product-search="productSearch"
          :selected-category="selectedCategory"
          active-tab="products"
          :format-money="formatMoney"
          :has-low-ingredients="hasLowIngredients"
          :get-product-stock-class="getProductStockClass"
          :get-product-stock-title="getProductStockTitle"
          :is-in-cart="cartStore.isProductInCart"
          :get-cart-qty="cartStore.getItemQty"
          @add-to-cart="handleAddToCart"
          @update:product-search="productSearch = $event"
          @update:selected-category="selectedCategory = $event"
          @filter="handleFilter"
        />
      </div>

      <!-- Floating Bottom Smart Action Bar (شريط المحاسبة الذكي العائم) -->
      <Transition name="floating-bar-slide">
        <div v-if="cartStore.items.length > 0" class="pos-floating-action-bar">
          <div
            class="bar-cart-summary"
            @click="showCheckoutDrawer = true"
            title="انقر لفتح سلة ومحاسبة الفاتورة"
          >
            <div class="bar-badge-pill">
              <span class="bar-icon"><AppIcon name="shoppingBag" :size="20" /></span>
              <span class="bar-items-count">{{ cartStore.items.length }} صنف في السلة</span>
            </div>
            <div class="bar-price-block">
              <span class="bar-total-label">الإجمالي المستحق:</span>
              <strong class="bar-total-amount">{{ formatMoney(cartStore.total) }}</strong>
            </div>
          </div>

          <div class="bar-action-buttons">
            <button
              type="button"
              class="bar-btn-hold"
              @click="handleHoldOrder"
              title="تعليق الطلب الحالي في قائمة الانتظار (F4)"
            >
              <AppIcon name="timer" :size="16" />
              <span>تعليق (F4)</span>
            </button>

            <button
              type="button"
              class="bar-btn-clear"
              @click="handleClearCart"
              title="تفريغ السلة الحالية (F6)"
            >
              <AppIcon name="trash2" :size="16" />
              <span>تفريغ (F6)</span>
            </button>

            <button
              type="button"
              class="bar-btn-checkout"
              @click="showCheckoutDrawer = true"
              title="إتمام الطلب والدفع الفوري (Space أو F9)"
            >
              <AppIcon name="creditCard" :size="18" />
              <span class="checkout-text">إتمام الطلب والدفع</span>
              <span class="checkout-key-hint">(Space / F9)</span>
            </button>
          </div>
        </div>
      </Transition>

      <!-- On-Demand Slide-Over Checkout Layer (درج الدفع والمحاسبة المنزلق عند الطلب) -->
      <Transition name="drawer-backdrop">
        <div
          v-if="showCheckoutDrawer"
          class="checkout-drawer-backdrop"
          @click.self="showCheckoutDrawer = false"
        >
          <div class="checkout-drawer-panel">
            <CartPanel
              ref="cartPanelRef"
              :submitting="submittingSale"
              :customers-list="customersList"
              :recommended-items="recommendedItems"
              :auto-print="autoPrint"
              :last-saved-sale="lastSavedSale"
              :sale-error="saleError"
              @update:auto-print="autoPrint = $event"
              @complete-sale="handleCompleteSale"
              @open-drawer="handleOpenDrawer"
              @hold-order="handleHoldOrder"
              @clear-cart="handleClearCart"
              @close-drawer="showCheckoutDrawer = false"
              @add-recommended="handleAddRecommended"
              @print-last="handlePrintLast"
            />
          </div>
        </div>
      </Transition>
    </main>

    <!-- ═══════════════════ MODALS ═══════════════════ -->
    <ShortcutsModal :is-open="showShortcutsModal" @close="showShortcutsModal = false" />

    <ReturnsModal
      :is-open="showReturnsModal"
      :invoices="todaysInvoices"
      :loading="loadingInvoices"
      @close="showReturnsModal = false"
      @print="handlePrintInvoice"
      @return="promptReturnInvoice"
    />

    <HeldOrdersModal
      :is-open="showHeldModal"
      @close="showHeldModal = false"
      @restore="handleRestoreHeldOrder"
    />

    <CashMovementModal
      :is-open="showCashModal"
      @close="showCashModal = false"
      @saved="handleCashMovementSaved"
    />

    <ManagerPinModal
      :show="showPinModal"
      :action-description="pinActionDescription"
      :loading="pinLoading"
      :error-message="pinErrorMessage"
      @update:show="setPinModalVisibility"
      @submit-pin="handlePinSubmit"
      @cancel="cancelManagerPin"
    />

    <!-- Smart In-App Update Modal -->
    <UpdateModal :is-open="showUpdateModal" @close="closeUpdateModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import ProductsPanel from '../components/ProductsPanel.vue';
import CartPanel from '../components/CartPanel.vue';
import ShortcutsModal from '../components/ShortcutsModal.vue';
import ReturnsModal from '../components/ReturnsModal.vue';
import HeldOrdersModal from '../components/HeldOrdersModal.vue';
import CashMovementModal from '../components/CashMovementModal.vue';
import ManagerPinModal from '../components/ManagerPinModal.vue';
import UpdateModal from '../components/UpdateModal.vue';
import { usePosAuthStore } from '../stores/posAuth';
import { usePosShiftStore } from '../stores/posShift';
import { usePosCartStore } from '../stores/posCart';
import { usePosAudio } from '../composables/usePosAudio';
import { useBarcodeScanner } from '../composables/useBarcodeScanner';
import { useAppUpdater } from '../composables/useAppUpdater';
import { api } from '../services/api';
import {
  getBrowserQueueContext,
  readBrowserQueue,
  saveBrowserSale,
} from '../services/browserQueue';
import { readBrowserCache, writeBrowserCache } from '../services/browserCache';
import { formatMoney } from '../utils/currency';
import { checkoutPayloadKey, isRetryableNetworkError } from '../services/posReliability';
import {
  clearManagerOverrideToken,
  setManagerOverrideToken,
  type ManagerOverrideTarget,
} from '../services/managerOverride';
import { requiresCashierDiscountOverride } from '../../../shared/managerOverridePolicy';
import { businessCalendarDate } from '../../../shared/businessDate';
import { resolveSaleSettlement } from '../../../shared/saleSettlement';

const router = useRouter();
const authStore = usePosAuthStore();
const shiftStore = usePosShiftStore();
const cartStore = usePosCartStore();
const { playScanBeep, playPaymentSuccess, playErrorBuzz } = usePosAudio();

const productsPanelRef = ref<any>(null);
const cartPanelRef = ref<any>(null);
const allProducts = ref<any[]>([]);
const categories = ref<any[]>([]);
const loadingProducts = ref(false);
const productSearch = ref('');
const selectedCategory = ref<any>('');
const submittingSale = ref(false);
const saleError = ref('');

// Slide-Over Drawer
const showCheckoutDrawer = ref(false);

// Modals
const showShortcutsModal = ref(false);
const showReturnsModal = ref(false);
const showHeldModal = ref(false);
const showCashModal = ref(false);
const showPinModal = ref(false);
const pinActionDescription = ref('');
const pinLoading = ref(false);
const pinErrorMessage = ref('');
let pendingPinAction: (() => Promise<void> | void) | null = null;
let pendingPinTarget: ManagerOverrideTarget | null = null;

const heldOrders = ref<any[]>([]);
const customersList = ref<any[]>([]);
const recommendedItems = ref<any[]>([]);
const todaysInvoices = ref<any[]>([]);
const loadingInvoices = ref(false);
const lastSavedSale = ref<any>(null);
const lastSaleTime = ref('—');

const autoPrint = ref(localStorage.getItem('auto_print_receipt') !== 'false');
watch(autoPrint, (val) => {
  localStorage.setItem('auto_print_receipt', String(val));
});

const isOnline = ref(navigator.onLine);
const pendingSyncCount = ref(0);
const pendingPrint = ref<{ key: string; sale: any } | null>(null);
const {
  updateState,
  showUpdateModal,
  isAvailable,
  isDownloading,
  isDownloaded,
  isChecking,
  downloadPercent,
  initUpdater,
  installUpdate,
  openUpdateModal,
  closeUpdateModal,
} = useAppUpdater();

// ─── Live Clock & Real-time Date ───
const currentTimeString = ref('');
const currentDateString = ref('');
let clockTimer: any = null;

const updateLiveClock = () => {
  const now = new Date();
  currentTimeString.value = now.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  currentDateString.value = now.toLocaleDateString('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// ─── Fullscreen Control (F11) ───
const isFullscreen = ref(typeof document !== 'undefined' && !!document.fullscreenElement);
const toggleFullscreen = async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  } catch (err) {
    console.warn('Fullscreen toggle failed:', err);
  }
};

const handleFullscreenChange = () => {
  isFullscreen.value = typeof document !== 'undefined' && !!document.fullscreenElement;
};

// ─── Fallback Logo Handler ───
const handleLogoError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  if (target) {
    target.style.display = 'none';
  }
};

// ─── Held Orders ───
const loadHeldOrders = () => {
  try {
    const raw = localStorage.getItem('pos_held_orders');
    heldOrders.value = raw ? JSON.parse(raw) : [];
  } catch {
    heldOrders.value = [];
  }
};

const saveHeldOrdersToStorage = () => {
  localStorage.setItem('pos_held_orders', JSON.stringify(heldOrders.value));
};

const handleHoldOrder = () => {
  if (!cartStore.items.length) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  heldOrders.value.push({
    id: Date.now(),
    time: timeStr,
    held_at: now.toISOString(),
    items: JSON.parse(JSON.stringify(cartStore.items)),
    total: cartStore.total,
    discountAmount: cartStore.discountAmount,
    loyaltyPointsRedeemed: cartStore.loyaltyPointsRedeemed,
    paymentMethod: cartStore.paymentMethod,
    customerId: cartStore.customerId,
    selectedCustomer: cartStore.selectedCustomer,
    orderType: cartStore.orderType,
  });

  saveHeldOrdersToStorage();
  cartStore.clearCart();
  showCheckoutDrawer.value = false;
  playScanBeep();
};

const handleRestoreHeldOrder = (order: any) => {
  cartStore.clearCart();
  for (const itm of order.items || []) {
    cartStore.addItem(itm, itm.quantity, itm.custom_notes);
  }
  if (order.discountAmount) cartStore.discountAmount = order.discountAmount;
  if (order.loyaltyPointsRedeemed) cartStore.loyaltyPointsRedeemed = order.loyaltyPointsRedeemed;
  if (order.paymentMethod) cartStore.paymentMethod = order.paymentMethod;
  if (order.customerId) cartStore.customerId = order.customerId;
  if (order.selectedCustomer) cartStore.selectedCustomer = order.selectedCustomer;
  if (order.orderType) cartStore.orderType = order.orderType;

  // Remove from held list
  heldOrders.value = heldOrders.value.filter((h) => h.id !== order.id);
  saveHeldOrdersToStorage();
  showHeldModal.value = false;
  showCheckoutDrawer.value = true;
  playScanBeep();
};

const deleteHeldOrder = (orderId: number) => {
  heldOrders.value = heldOrders.value.filter((h) => h.id !== orderId);
  saveHeldOrdersToStorage();
};

// ─── Filtered Products ───
const filteredProducts = computed(() => {
  let list = allProducts.value;
  if (selectedCategory.value) {
    list = list.filter((p) => String(p.category_id) === String(selectedCategory.value));
  }
  if (productSearch.value && productSearch.value.trim()) {
    const q = productSearch.value.toLowerCase().trim();
    list = list.filter(
      (p) =>
        (p.name_ar && p.name_ar.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.includes(q)),
    );
  }
  return list;
});

const getNumericStock = (product: any) => {
  const value = product?.store_stock ?? product?.stock_quantity ?? product?.quantity;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getRecipeStockState = (product: any) => {
  const ingredients = Array.isArray(product?.recipe_items) ? product.recipe_items : [];
  if (!product?.has_recipe || ingredients.length === 0) return null;

  const states = ingredients.map((ingredient: any) => {
    const available = Number(ingredient?.stock_available);
    const required = Number(ingredient?.quantity);
    if (!Number.isFinite(available)) return 'unknown';
    if (available <= 0 || (Number.isFinite(required) && required > 0 && available < required)) {
      return 'out';
    }
    if (Number.isFinite(required) && required > 0 && available <= required * 3) return 'low';
    return 'normal';
  });

  if (states.includes('out')) return 'out';
  if (states.includes('low')) return 'low';
  return 'normal';
};

const getProductStockClass = (product: any) => {
  if (product?.is_active === false) return 'out';

  const recipeState = getRecipeStockState(product);
  if (recipeState) return recipeState;

  const stock = getNumericStock(product);
  if (stock === null) return 'normal';
  if (stock <= 0) return 'out';

  const minimum = Number(product?.min_stock ?? product?.min_quantity ?? 5);
  return stock <= (Number.isFinite(minimum) ? minimum : 5) ? 'low' : 'normal';
};

const hasLowIngredients = (product: any) =>
  product?.has_recipe && getProductStockClass(product) === 'low';

const getProductStockTitle = (product: any) => {
  const state = getProductStockClass(product);
  if (state === 'out') return 'غير متوفر حاليًا';
  if (state === 'low') return 'المخزون منخفض';
  const stock = getNumericStock(product);
  return stock === null ? 'متوفر للبيع' : `متوفر: ${stock} ${product?.unit || ''}`.trim();
};

const loadCatalogData = async () => {
  const context = getBrowserQueueContext();
  loadingProducts.value = true;
  categories.value = [];
  allProducts.value = [];
  try {
    const [catsRes, prodsRes] = await Promise.all([
      api.get('/products/categories'),
      api.get('/products/shop'),
    ]);
    if (context !== getBrowserQueueContext()) return;

    categories.value = catsRes.data?.data || catsRes.data || [];
    allProducts.value = prodsRes.data?.data || prodsRes.data || [];

    writeBrowserCache('categories', categories.value, context);
    writeBrowserCache('products', allProducts.value, context);
  } catch {
    if (context !== getBrowserQueueContext()) return;
    categories.value = readBrowserCache('categories', context);
    allProducts.value = readBrowserCache('products', context);
  } finally {
    loadingProducts.value = false;
  }
};

const loadCustomers = async () => {
  const context = getBrowserQueueContext();
  customersList.value = [];
  try {
    const res = await api.get('/customers');
    if (context !== getBrowserQueueContext()) return;
    customersList.value = res.data?.data || res.data || [];
    writeBrowserCache('customers', customersList.value, context);
  } catch {
    if (context !== getBrowserQueueContext()) return;
    customersList.value = readBrowserCache('customers', context);
  }
};

const loadTodaysInvoices = async () => {
  loadingInvoices.value = true;
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const res = await api.get(`/sales?from_date=${todayStr}&to_date=${todayStr}&limit=50`);
    todaysInvoices.value = res.data?.data || res.data || [];
  } catch {
    // Offline sales fallback
    const offlineSales = readBrowserQueue();
    todaysInvoices.value = offlineSales;
  } finally {
    loadingInvoices.value = false;
  }
};

const loadRecommendations = async () => {
  if (!cartStore.items.length) {
    recommendedItems.value = [];
    return;
  }
  try {
    const productIds = cartStore.items.map((i) => i.product_id).join(',');
    const res = await api.get(`/forecasting/basket-associations?cart=${productIds}`);
    const recs = res.data?.data || res.data || [];
    const inCartIds = new Set(cartStore.items.map((i) => i.product_id));
    recommendedItems.value = recs.filter((r: any) => !inCartIds.has(r.product_id));
  } catch {
    recommendedItems.value = [];
  }
};

watch(
  () => cartStore.items.map((i) => i.product_id).join(','),
  () => {
    loadRecommendations();
  },
);

const handleAddToCart = (product: any, customQty = 1, customNotes?: string) => {
  if (getProductStockClass(product) === 'out') {
    playErrorBuzz();
    alert('هذا الصنف غير متوفر حاليًا.');
    return;
  }
  cartStore.addItem(product, customQty, customNotes);
  playScanBeep();
};

const handleAddRecommended = (rec: any) => {
  const prod = allProducts.value.find((p) => p.id === rec.product_id) || {
    id: rec.product_id,
    name_ar: rec.name_ar,
    sale_price: rec.sale_price,
  };
  handleAddToCart(prod);
};

// ═══════════════════ HARDWARE BARCODE SCANNER ═══════════════════
useBarcodeScanner((barcode) => {
  const found = allProducts.value.find(
    (p) => p.barcode === barcode || p.sku === barcode || String(p.id) === barcode,
  );

  if (found) {
    handleAddToCart(found, 1);
  } else {
    playErrorBuzz();
    alert(`لم يتم العثور على صنف بالباركود: ${barcode}`);
  }
});

const handleFilter = () => {};

const handleOpenDrawer = async () => {
  if ((window as any).electronAPI) {
    await (window as any).electronAPI.openCashDrawer();
  } else {
    console.warn('Cash drawer simulated (Web mode)');
  }
};

const handleClearCart = () => {
  cartStore.clearCart();
  showCheckoutDrawer.value = false;
};

const handleCashMovementSaved = async () => {
  await shiftStore.fetchCurrentShift();
};

const saveOfflineSale = async (salePayload: any) => {
  if ((window as any).electronAPI) {
    const saveRes = await (window as any).electronAPI.saveOfflineTransaction(salePayload);
    if (!saveRes || saveRes.success === false) {
      throw new Error(
        saveRes?.message || saveRes?.error || 'فشلت كتابة الفاتورة محلياً في التخزين الآمن',
      );
    }
    return saveRes.transaction || salePayload;
  }

  return saveBrowserSale(salePayload);
};

const handleCompleteSale = async (
  payment: {
    cashGiven: number | null;
    changeDue: number;
    customerId?: number | null;
    payments?: any[] | null;
  } = { cashGiven: null, changeDue: 0 },
) => {
  if (!cartStore.items.length || submittingSale.value) return;
  submittingSale.value = true;
  saleError.value = '';

  const syncId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined;

  let settlement: ReturnType<typeof resolveSaleSettlement>;
  try {
    settlement = resolveSaleSettlement({
      total_amount: cartStore.total,
      payment_method: cartStore.paymentMethod,
      payments: payment.payments || cartStore.payments || undefined,
    });
  } catch (error) {
    saleError.value = error instanceof Error ? error.message : 'بيانات الدفع غير صالحة';
    submittingSale.value = false;
    return;
  }

  const salePayload = {
    sync_id: syncId,
    sale_type: 'retail',
    sale_date: businessCalendarDate(),
    payment_method: cartStore.paymentMethod,
    payment_status: settlement.payment_status,
    paid_amount: settlement.paid_amount,
    discount_amount: cartStore.effectiveDiscount,
    loyalty_points_redeemed: cartStore.loyaltyPointsRedeemed || 0,
    customer_id: payment.customerId ?? cartStore.customerId ?? null,
    total_amount: cartStore.total,
    cash_given: payment.cashGiven ?? undefined,
    change_due: payment.changeDue,
    pos_shift_id: shiftStore.currentShift?.id || null,
    payments: settlement.payments,
    notes: cartStore.notes || undefined,
    items: cartStore.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.name_ar,
      quantity: i.quantity,
      unit_price: i.unit_price,
      notes: i.custom_notes || undefined,
    })),
  };
  const needsManagerOverride = requiresCashierDiscountOverride({
    items: cartStore.items.map((item) => ({
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
    totalAmount: cartStore.total,
    discountAmount: cartStore.effectiveDiscount,
    loyaltyPointsRedeemed: cartStore.loyaltyPointsRedeemed || 0,
  });

  try {
    if (needsManagerOverride && !navigator.onLine) {
      throw new Error(
        'هذا الخصم يتطلب موافقة مدير عبر اتصال الخادم؛ لن تُحفظ الفاتورة دون موافقة.',
      );
    }

    const currentKey = checkoutPayloadKey(salePayload);
    let saleRecord = pendingPrint.value?.key === currentKey ? pendingPrint.value.sale : null;
    let savedOffline = false;

    if (!saleRecord && navigator.onLine) {
      try {
        const res = await api.post('/sales', salePayload);
        saleRecord = res.data?.data || res.data;
      } catch (err) {
        if (!isRetryableNetworkError(err)) throw err;
        if (needsManagerOverride) {
          throw new Error(
            'تعذر الاتصال بالخادم للتحقق من موافقة المدير؛ لم تُحفظ الفاتورة محليًا.',
            { cause: err },
          );
        }
        saleRecord = await saveOfflineSale(salePayload);
        savedOffline = true;
      }
    } else if (!saleRecord) {
      saleRecord = await saveOfflineSale(salePayload);
      savedOffline = true;
    }

    if (savedOffline) {
      pendingSyncCount.value++;
    }

    // Sound effect
    playPaymentSuccess();

    // Auto print & Drawer
    if (autoPrint.value && (window as any).electronAPI) {
      try {
        const printResult = await (window as any).electronAPI.printReceipt(saleRecord);
        if (!printResult?.success) {
          pendingPrint.value = { key: currentKey, sale: saleRecord };
          console.warn('Print warning:', printResult?.error);
        }
        await (window as any).electronAPI.openCashDrawer();
      } catch (printErr) {
        console.error('Print exception:', printErr);
      }
    }

    lastSavedSale.value = saleRecord;
    lastSaleTime.value = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });

    todaysInvoices.value.unshift(saleRecord);

    pendingPrint.value = null;
    cartStore.clearCart();
    showCheckoutDrawer.value = false;
    await shiftStore.fetchCurrentShift();
  } catch (err: any) {
    if (err.response?.data?.code === 'MANAGER_OVERRIDE_REQUIRED') {
      pendingPinTarget = { method: 'POST', path: '/sales' };
      pendingPinAction = () => handleCompleteSale(payment);
      pinActionDescription.value = 'اعتماد الخصم اليدوي لهذه الفاتورة';
      showPinModal.value = true;
      return;
    }
    playErrorBuzz();
    saleError.value = err.response?.data?.message || err.message || 'فشل حفظ الفاتورة';
    alert('فشل حفظ الفاتورة: ' + saleError.value);
  } finally {
    submittingSale.value = false;
  }
};

const reprintLastSale = async () => {
  const sale = lastSavedSale.value || todaysInvoices.value[0];
  if (!sale) {
    alert('لا توجد فواتير تم حفظها مؤخراً لإعادة طباعتها');
    return;
  }
  handlePrintInvoice(sale);
};

const handlePrintLast = (sale: any) => {
  handlePrintInvoice(sale);
};

const handlePrintInvoice = async (sale: any) => {
  if ((window as any).electronAPI) {
    const res = await (window as any).electronAPI.printReceipt(sale);
    if (res?.success) {
      playPaymentSuccess();
    } else {
      playErrorBuzz();
      alert(`فشلت الطباعة: ${res?.error || 'خطأ غير معروف'}`);
    }
  } else {
    window.print();
  }
};

const openReturnsModal = () => {
  loadTodaysInvoices();
  showReturnsModal.value = true;
};

// ─── Returns & Manager PIN ───
const promptReturnInvoice = (sale: any) => {
  pinActionDescription.value = `إرجاع فاتورة البيع رقم ${sale.sale_number || `#${sale.id}`} واسترداد مبلغ ${formatMoney(sale.total_amount)}`;
  pendingPinTarget = { method: 'POST', path: `/sales/${sale.id}/return` };
  pendingPinAction = async () => {
    await executeReturn(sale);
  };
  showPinModal.value = true;
};

const setPinModalVisibility = (visible: boolean) => {
  if (visible) showPinModal.value = true;
  else cancelManagerPin();
};

const cancelManagerPin = () => {
  showPinModal.value = false;
  pendingPinAction = null;
  pendingPinTarget = null;
  clearManagerOverrideToken();
};

const handlePinSubmit = async (pin: string) => {
  pinLoading.value = true;
  pinErrorMessage.value = '';
  try {
    if (!pendingPinTarget || !pendingPinAction) {
      throw new Error('انتهت صلاحية العملية؛ أعد طلب موافقة المدير.');
    }
    const target = pendingPinTarget;
    const response = await api.post('/pos/verify-pin', {
      pin,
      action: target.path === '/sales' ? 'اعتماد خصم فاتورة' : 'إرجاع فاتورة بيع',
    });
    const overrideToken = response.data?.override_token;
    if (typeof overrideToken !== 'string' || !overrideToken) {
      throw new Error('لم يصدر الخادم موافقة مدير صالحة؛ أعد المحاولة.');
    }
    setManagerOverrideToken(overrideToken, target);
    showPinModal.value = false;
    const action = pendingPinAction;
    pendingPinAction = null;
    pendingPinTarget = null;
    await action();
  } catch (err: any) {
    clearManagerOverrideToken();
    pinErrorMessage.value =
      err.response?.data?.message || err.message || 'رمز المرور غير صحيح أو ليس لديك صلاحية مدير';
    playErrorBuzz();
  } finally {
    pinLoading.value = false;
  }
};

const executeReturn = async (sale: any) => {
  try {
    await api.post(`/sales/${sale.id}/return`, {
      reason: 'طلب العميل / مرتجع كاشير',
    });
    sale.status = 'returned';
    playScanBeep();
    alert('تم عمل المرتجع واستعادة المخزون بنجاح');
    await shiftStore.fetchCurrentShift();
  } catch (err: any) {
    playErrorBuzz();
    alert('تعذر استرداد الفاتورة: ' + (err.response?.data?.message || err.message));
  }
};

// ─── Global Keyboard Shortcuts ───
const handleGlobalKeyDown = (e: KeyboardEvent) => {
  const activeTag = (document.activeElement?.tagName || '').toLowerCase();
  const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

  if (e.key === ' ' && !isInput && !showShortcutsModal.value && !showReturnsModal.value) {
    e.preventDefault();
    if (cartStore.items.length > 0) {
      showCheckoutDrawer.value = !showCheckoutDrawer.value;
    }
  } else if (e.key === 'F1') {
    e.preventDefault();
    showShortcutsModal.value = !showShortcutsModal.value;
  } else if (e.key === 'F2' || e.key === 'F7') {
    e.preventDefault();
    productsPanelRef.value?.focusSearch();
  } else if (e.key === 'F4') {
    e.preventDefault();
    if (showCheckoutDrawer.value) {
      cartPanelRef.value?.focusDiscount();
    } else if (cartStore.items.length > 0) {
      handleHoldOrder();
    }
  } else if (e.key === 'F6') {
    e.preventDefault();
    if (cartStore.items.length > 0) {
      handleClearCart();
    }
  } else if (e.key === 'F8') {
    e.preventDefault();
    reprintLastSale();
  } else if (e.key === 'F9') {
    e.preventDefault();
    if (cartStore.items.length > 0) {
      showCheckoutDrawer.value = true;
      cartStore.paymentMethod = 'cash';
      cartPanelRef.value?.focusReceived();
    } else {
      handleOpenDrawer();
    }
  } else if (e.key === 'F10') {
    e.preventDefault();
    if (cartStore.items.length > 0) {
      showCheckoutDrawer.value = true;
      cartStore.paymentMethod = 'card';
    }
  } else if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === 'Escape') {
    if (showCheckoutDrawer.value) {
      showCheckoutDrawer.value = false;
    } else if (showShortcutsModal.value) {
      showShortcutsModal.value = false;
    } else if (showReturnsModal.value) {
      showReturnsModal.value = false;
    } else if (showHeldModal.value) {
      showHeldModal.value = false;
    } else if (showCashModal.value) {
      showCashModal.value = false;
    } else if (showPinModal.value) {
      showPinModal.value = false;
    }
  } else if (e.key === 'Enter' && (e.ctrlKey || showCheckoutDrawer.value)) {
    if (showCheckoutDrawer.value && cartStore.items.length > 0) {
      e.preventDefault();
      handleCompleteSale();
    }
  }
};

const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine;
};

onMounted(async () => {
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('keydown', handleGlobalKeyDown);
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  updateLiveClock();
  clockTimer = setInterval(updateLiveClock, 1000);

  loadHeldOrders();

  await initUpdater();

  await shiftStore.fetchCurrentShift();
  if (!shiftStore.isShiftOpen) {
    router.push('/shift/open');
    return;
  }

  await Promise.all([loadCatalogData(), loadCustomers(), loadTodaysInvoices()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
  window.removeEventListener('keydown', handleGlobalKeyDown);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);

  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
});
</script>

<style lang="scss" scoped>
.pos-master-sales-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-main, #f6f4f0);
  overflow: hidden;
  position: relative;
}

/* ═══════════════════ TOP RIBBON (PREMIUM REDESIGN) ═══════════════════ */
.pos-top-ribbon {
  height: 64px;
  min-height: 64px;
  background:
    radial-gradient(circle at 10% 20%, rgba(212, 163, 89, 0.14), transparent 26%),
    radial-gradient(circle at 90% 80%, rgba(212, 163, 89, 0.08), transparent 30%),
    linear-gradient(135deg, #180f08 0%, #26160d 50%, #361f13 100%);
  border-bottom: 1.5px solid rgba(212, 163, 89, 0.32);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 12px;
  z-index: 30;
  user-select: none;

  /* 1. Right: Brand & Terminal Context */
  .ribbon-brand-section {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;

    .brand-badge-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;

      .coffee-logo-circle {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(212, 163, 89, 0.22), rgba(138, 87, 42, 0.35));
        border: 1.5px solid rgba(212, 163, 89, 0.45);
        border-radius: 10px;
        padding: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

        img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
        }
      }

      .brand-meta {
        display: flex;
        flex-direction: column;
        gap: 3px;

        .brand-title-row {
          display: flex;
          align-items: center;
          gap: 8px;

          .brand-name {
            font-size: 1.08rem;
            font-weight: 900;
            color: #fffaf0;
            margin: 0;
            letter-spacing: -0.3px;
          }

          .pos-role-tag {
            font-size: 0.65rem;
            font-weight: 800;
            background: rgba(212, 163, 89, 0.2);
            color: #f7d794;
            border: 1px solid rgba(212, 163, 89, 0.35);
            padding: 1px 7px;
            border-radius: 4px;
          }
        }

        .terminal-info-chips {
          display: flex;
          align-items: center;
          gap: 6px;

          .chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.67rem;
            font-weight: 750;
            padding: 1px 7px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.07);
            color: rgba(255, 250, 240, 0.78);
            border: 1px solid rgba(255, 255, 255, 0.12);
            white-space: nowrap;

            &.chip-terminal {
              color: #fce79a;
              border-color: rgba(212, 163, 89, 0.25);
            }

            &.chip-shift-status {
              background: rgba(34, 197, 94, 0.14);
              color: #86efac;
              border-color: rgba(34, 197, 94, 0.32);

              .live-pulse-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #22c55e;
                box-shadow: 0 0 6px #22c55e;
                animation: pulse-dot 2s infinite;
              }
            }
          }
        }
      }
    }
  }

  /* 2. Center: Live Real-Time Metrics & Digital Clock */
  .ribbon-metrics-center {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex: 1;
    max-width: 680px;
    margin: 0 auto;

    .metric-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 8px;
      backdrop-filter: blur(8px);
      transition: all 0.2s ease;
      min-width: 90px;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(212, 163, 89, 0.3);
      }

      .card-icon-wrap {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.user-avatar {
          background: rgba(59, 130, 246, 0.18);
          color: #93c5fd;
        }

        &.sales-icon {
          background: rgba(234, 179, 8, 0.18);
          color: #fde047;
        }

        &.invoices-icon {
          background: rgba(168, 85, 247, 0.18);
          color: #d8b4fe;
        }

        &.clock-icon {
          background: rgba(34, 197, 94, 0.18);
          color: #86efac;
        }
      }

      .card-content {
        display: flex;
        flex-direction: column;
        line-height: 1.25;

        .metric-label {
          font-size: 0.64rem;
          color: rgba(255, 250, 240, 0.58);
          font-weight: 750;
          white-space: nowrap;
        }

        .metric-val {
          font-size: 0.85rem;
          font-weight: 850;
          color: #fffaf0;
          white-space: nowrap;

          &.sales-amount {
            color: #fce79a;
            font-weight: 900;
            font-family: inherit;
          }

          &.live-time {
            font-family: monospace, system-ui;
            font-size: 0.83rem;
            color: #e2e8f0;
            letter-spacing: 0.3px;
          }
        }
      }
    }
  }

  /* 3. Left: Operational Tools & Terminal Controls */
  .ribbon-tools-section {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    .tools-segmented-group {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.3);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      gap: 2px;
    }

    .ribbon-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 10px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: rgba(255, 250, 240, 0.85);
      font-size: 0.76rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      &:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #fffaf0;
        border-color: rgba(212, 163, 89, 0.3);
      }

      &:active {
        transform: scale(0.98);
      }

      .shortcut-tag {
        font-family: monospace, system-ui;
        font-size: 0.62rem;
        font-weight: 800;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0, 0, 0, 0.4);
        color: rgba(255, 250, 240, 0.65);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }

      .badge-count {
        font-size: 0.65rem;
        font-weight: 900;
        background: #d97706;
        color: #ffffff;
        padding: 0 5px;
        border-radius: 8px;
        line-height: 16px;
      }

      &.update-btn {
        background: rgba(245, 158, 11, 0.15);
        color: #fef3c7;
        border: 1px solid rgba(245, 158, 11, 0.35);
        position: relative;
        gap: 6px;

        &:hover {
          background: rgba(245, 158, 11, 0.25);
          border-color: rgba(245, 158, 11, 0.55);
        }

        &.checking,
        &.downloading {
          background: rgba(59, 130, 246, 0.18);
          color: #bfdbfe;
          border-color: rgba(59, 130, 246, 0.45);
        }

        &.available {
          background: rgba(245, 158, 11, 0.25);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.6);
        }

        &.ready {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.35));
          color: #6ee7b7;
          border-color: #10b981;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
          animation: pulse-update-btn 2s infinite ease-in-out;
        }

        .update-pulse-dot {
          width: 7px;
          height: 7px;
          background: #10b981;
          border-radius: 50%;
          box-shadow: 0 0 8px #10b981;
          margin-right: 2px;
        }

        .spin-anim {
          animation: spin-icon 1.2s linear infinite;
        }
      }

      &.btn-fullscreen {
        width: 34px;
        height: 34px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        color: rgba(255, 250, 240, 0.8);

        &:hover {
          background: rgba(255, 255, 255, 0.14);
          color: #fffaf0;
          border-color: rgba(212, 163, 89, 0.35);
        }
      }

      &.btn-close-shift-action {
        background: linear-gradient(135deg, #d4a359 0%, #b8863b 100%);
        color: #1e130b;
        border: 1px solid #f3d7a0;
        box-shadow: 0 2px 8px rgba(212, 163, 89, 0.25);
        padding: 0 13px;

        &:hover {
          background: linear-gradient(135deg, #e3b56c 0%, #c9964a 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(212, 163, 89, 0.4);
        }

        &:active {
          transform: translateY(0);
        }
      }
    }

    .ribbon-sync-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 34px;
      padding: 0 11px;
      border-radius: 20px;
      font-size: 0.74rem;
      font-weight: 800;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s ease;
      white-space: nowrap;

      .sync-status-indicator {
        position: relative;
        width: 8px;
        height: 8px;
        display: flex;
        align-items: center;
        justify-content: center;

        .pulse-core {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .pulse-ring {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          opacity: 0;
          animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
      }

      &.online {
        background: rgba(34, 197, 94, 0.12);
        color: #86efac;
        border-color: rgba(34, 197, 94, 0.3);

        .pulse-core {
          background: #22c55e;
        }

        .pulse-ring {
          border: 2px solid #22c55e;
        }
      }

      &.offline {
        background: rgba(239, 68, 68, 0.15);
        color: #fca5a5;
        border-color: rgba(239, 68, 68, 0.35);

        .pulse-core {
          background: #ef4444;
        }

        .pulse-ring {
          border: 2px solid #ef4444;
        }
      }

      .pending-sync-badge {
        background: #dc2626;
        color: #ffffff;
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 0.65rem;
        font-weight: 900;
        margin-right: 4px;
      }
    }
  }
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.5);
    opacity: 0.8;
  }
  80%,
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}

@keyframes pulse-dot {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.25);
    opacity: 0.7;
  }
}

.pos-update-banner {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 20px;
  background: linear-gradient(90deg, #064e3b, #047857);
  border-bottom: 1px solid #10b981;
  color: #ecfdf5;

  .banner-text {
    display: flex;
    align-items: center;
    gap: 10px;

    strong {
      color: #a7f3d0;
      font-weight: 700;
    }

    span {
      font-size: 0.85rem;
      color: #d1fae5;
    }
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .btn-banner-apply {
      padding: 6px 14px;
      border: none;
      border-radius: 8px;
      background: #10b981;
      color: #ffffff;
      font-weight: 800;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: #059669;
        box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
      }
    }

    .btn-banner-info {
      padding: 6px 12px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      color: #ecfdf5;
      font-size: 0.82rem;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }
  }
}

@keyframes pulse-update-btn {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
  }
  50% {
    transform: scale(1.03);
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.6);
  }
}

@keyframes spin-icon {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* ═══════════════════ HELD ORDERS RIBBON ═══════════════════ */
.held-orders-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(245, 158, 11, 0.1);
  border-bottom: 1px dashed rgba(245, 158, 11, 0.35);
  padding: 6px 16px;
  z-index: 10;

  .held-bar-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 850;
    color: #f59e0b;
    white-space: nowrap;
  }

  .held-orders-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: thin;
    padding: 2px 0;

    .held-card {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1e130b;
      border: 1px solid rgba(245, 158, 11, 0.35);
      padding: 4px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;

      &:hover {
        border-color: #f59e0b;
        background: rgba(245, 158, 11, 0.15);
        transform: translateY(-1px);
      }

      .held-meta {
        display: flex;
        flex-direction: column;
        font-size: 0.72rem;
        color: #a89f91;

        .held-time {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 3px;
        }
      }

      .held-total {
        font-size: 0.88rem;
        font-weight: 850;
        color: #f3d7a0;
      }

      .held-remove-btn {
        background: none;
        border: none;
        color: #a89f91;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;

        &:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.2);
        }
      }
    }
  }
}

/* ═══════════════════ MAIN WORKSPACE & FULL CATALOG ═══════════════════ */
.pos-main-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  padding: 12px 16px 85px 16px; /* Extra bottom padding for floating bar */
}

.full-catalog-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ═══════════════════ FLOATING SMART ACTION BAR ═══════════════════ */
.pos-floating-action-bar {
  position: fixed;
  bottom: 16px;
  left: 20px;
  right: 20px;
  max-width: 1200px;
  margin: 0 auto;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, rgba(27, 18, 12, 0.96) 0%, rgba(20, 13, 8, 0.98) 100%);
  border: 1.5px solid #d4a373;
  border-radius: 20px;
  padding: 10px 18px;
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(212, 163, 115, 0.25);
  backdrop-filter: blur(12px);
  animation: floatingPulse 3s infinite ease-in-out;
}

@keyframes floatingPulse {
  0%,
  100% {
    box-shadow:
      0 12px 36px rgba(0, 0, 0, 0.6),
      0 0 16px rgba(212, 163, 115, 0.2);
  }
  50% {
    box-shadow:
      0 14px 42px rgba(0, 0, 0, 0.7),
      0 0 28px rgba(212, 163, 115, 0.4);
  }
}

.bar-cart-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  user-select: none;

  .bar-badge-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(212, 163, 115, 0.18);
    border: 1px solid rgba(212, 163, 115, 0.35);
    padding: 6px 14px;
    border-radius: 20px;

    .bar-icon {
      color: #faedcd;
    }
    .bar-items-count {
      color: #faedcd;
      font-size: 0.88rem;
      font-weight: 800;
    }
  }

  .bar-price-block {
    display: flex;
    align-items: baseline;
    gap: 6px;

    .bar-total-label {
      color: #d4a373;
      font-size: 0.85rem;
      font-weight: 750;
    }

    .bar-total-amount {
      font-size: 1.45rem;
      font-weight: 950;
      color: #ffffff;
      letter-spacing: 0.4px;
      text-shadow: 0 0 10px rgba(212, 163, 115, 0.4);
    }
  }
}

.bar-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;

  .bar-btn-hold,
  .bar-btn-clear {
    padding: 9px 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    color: #faedcd;
    font-size: 0.84rem;
    font-weight: 750;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
  }

  .bar-btn-clear:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.4);
  }

  .bar-btn-checkout {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
    border: 1.5px solid #faedcd;
    border-radius: 14px;
    color: #140d08;
    font-size: 0.95rem;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 0 4px 18px rgba(212, 163, 115, 0.4);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

    .checkout-key-hint {
      font-size: 0.76rem;
      opacity: 0.85;
      font-weight: 750;
    }

    &:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 6px 24px rgba(212, 163, 115, 0.6);
      background: linear-gradient(135deg, #faedcd 0%, #d4a373 100%);
    }
  }
}

/* ═══════════════════ SLIDE-OVER CHECKOUT DRAWER ═══════════════════ */
.checkout-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  z-index: 150;
  display: flex;
  justify-content: flex-start;
}

.checkout-drawer-panel {
  width: 100%;
  max-width: 480px;
  height: 100%;
  background: #1e130b;
  border-left: 2px solid #d4a373;
  box-shadow: -10px 0 40px rgba(0, 0, 0, 0.75);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Transitions ── */
.floating-bar-slide-enter-active,
.floating-bar-slide-leave-active {
  transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.floating-bar-slide-enter-from,
.floating-bar-slide-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.95);
}

.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
  transition: opacity 0.25s ease;

  .checkout-drawer-panel {
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
}
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;

  .checkout-drawer-panel {
    transform: translateX(100%);
  }
}

@media (max-width: 1350px) {
  .pos-top-ribbon {
    padding: 0 10px;
    gap: 8px;

    .ribbon-metrics-center {
      gap: 5px;
      .metric-card {
        padding: 4px 8px;
        min-width: unset;
      }
    }

    .ribbon-tools-section {
      gap: 6px;
      .tools-segmented-group .ribbon-btn {
        padding: 0 8px;
        .shortcut-tag {
          display: none;
        }
      }
    }
  }
}

@media (max-width: 1120px) {
  .pos-top-ribbon {
    height: auto;
    min-height: 60px;
    flex-wrap: wrap;
    padding: 8px 12px;
    gap: 8px;

    .ribbon-metrics-center {
      order: 3;
      width: 100%;
      max-width: 100%;
      justify-content: space-around;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
  }
}

@media (max-width: 820px) {
  .pos-top-ribbon {
    .ribbon-brand-section {
      .chip-store,
      .chip-terminal {
        display: none;
      }
    }

    .ribbon-tools-section {
      .tools-segmented-group .ribbon-btn .btn-label,
      .btn-close-shift-action span {
        display: none;
      }

      .ribbon-sync-pill .sync-text {
        display: none;
      }
    }
  }

  .pos-floating-action-bar {
    left: 8px;
    right: 8px;
    bottom: 8px;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;

    .bar-cart-summary {
      width: 100%;
      justify-content: space-between;
    }

    .bar-action-buttons {
      width: 100%;
      justify-content: space-between;

      .bar-btn-checkout {
        flex: 1;
        justify-content: center;
      }
    }
  }

  .checkout-drawer-panel {
    max-width: 100%;
  }
}
</style>
