<template>
  <div class="pos-master-sales-page">
    <!-- ═══════════════════ TOP TERMINAL RIBBON ═══════════════════ -->
    <header class="pos-top-ribbon">
      <div class="ribbon-brand">
        <span class="coffee-badge">
          <img src="/logo-transparent.png" alt="" aria-hidden="true" />
        </span>
        <div class="brand-titles">
          <h2>بن العجوز ERP</h2>
          <span class="terminal-badge">نقطة البيع TRM-01</span>
        </div>
      </div>

      <!-- Live Shift Stats -->
      <div class="ribbon-stats">
        <div class="stat-item">
          <span class="stat-label">الكاشير:</span>
          <strong>{{ authStore.user?.full_name || 'الكاشير' }}</strong>
        </div>

        <div class="stat-item">
          <span class="stat-label">مبيعات الوردية:</span>
          <strong class="stat-money">{{ formatMoney(shiftStore.currentShift?.total_sales_amount || 0) }}</strong>
        </div>

        <div class="stat-item">
          <span class="stat-label">عدد الفواتير:</span>
          <strong class="stat-invoices">{{ shiftStore.currentShift?.invoices_count || 0 }}</strong>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="ribbon-actions">
        <!-- Cash Movement Button -->
        <button
          type="button"
          class="btn-ribbon-action"
          @click="showCashModal = true"
          title="سحب أو إيداع نقدية بالدرج أثناء الوردية"
        >
          <AppIcon name="banknote" :size="16" />
          <span>حركة نقدية</span>
        </button>

        <!-- Held Orders Button with Badge -->
        <button
          type="button"
          class="btn-ribbon-action held-btn"
          @click="showHeldModal = true"
          title="عرض واسترجاع الفواتير المعلقة"
        >
          <AppIcon name="clock" :size="16" />
          <span>المعلقات</span>
          <span v-if="heldOrdersCount > 0" class="held-badge">{{ heldOrdersCount }}</span>
        </button>

        <!-- Online / Sync Status Pill -->
        <button
          type="button"
          class="status-pill"
          :class="isOnline ? 'online' : 'offline'"
          @click="router.push('/sync')"
          :aria-label="isOnline ? 'متصل بالسيرفر - فتح المزامنة' : 'غير متصل - فتح المزامنة'"
          aria-live="polite"
          title="حالة المزامنة والاتصال"
        >
          <span class="status-dot"></span>
          <span>{{ isOnline ? 'متصل بالسيرفر' : 'أوفلاين (Offline)' }}</span>
          <span v-if="pendingSyncCount > 0" class="pending-count-badge">
            {{ pendingSyncCount }} معلقة
          </span>
        </button>

        <!-- Close Shift Button -->
        <button
          type="button"
          class="btn-close-shift"
          @click="router.push('/shift/close')"
          title="إغلاق الوردية ومطابقة النقدية"
        >
          <AppIcon name="logOut" :size="16" />
          <span>إغلاق الوردية</span>
        </button>
      </div>
    </header>

    <!-- ═══════════════════ MAIN WORKSPACE (CATALOG + CART) ═══════════════════ -->
    <main class="pos-main-workspace">
      <!-- 1. Categories-First Products Catalog (Left/Main Area) -->
      <section class="catalog-section">
        <ProductsPanel
          ref="productsPanelRef"
          :filtered-products="filteredProducts"
          :categories="categories"
          :loading-products="loadingProducts"
          :product-search="productSearch"
          :selected-category="selectedCategory"
          active-tab="products"
          :format-money="formatMoney"
          :has-low-ingredients="() => false"
          :get-product-stock-class="() => 'normal'"
          :get-product-stock-title="() => 'متوفر'"
          :is-in-cart="cartStore.isProductInCart"
          :get-cart-qty="cartStore.getItemQty"
          @add-to-cart="handleAddToCart"
          @update:product-search="productSearch = $event"
          @update:selected-category="selectedCategory = $event"
          @filter="handleFilter"
        />
      </section>

      <!-- 2. Interactive Cart & Checkout (Right Area) -->
      <aside class="cart-section">
        <CartPanel
          :submitting="submittingSale"
          @complete-sale="handleCompleteSale"
          @open-drawer="handleOpenDrawer"
          @hold-order="handleHoldOrder"
        />
      </aside>
    </main>

    <!-- ═══════════════════ MODALS ═══════════════════ -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import ProductsPanel from '../components/ProductsPanel.vue';
import CartPanel from '../components/CartPanel.vue';
import HeldOrdersModal from '../components/HeldOrdersModal.vue';
import CashMovementModal from '../components/CashMovementModal.vue';
import { usePosAuthStore } from '../stores/posAuth';
import { usePosShiftStore } from '../stores/posShift';
import { usePosCartStore } from '../stores/posCart';
import { usePosAudio } from '../composables/usePosAudio';
import { useBarcodeScanner } from '../composables/useBarcodeScanner';
import { api } from '../services/api';
import { formatMoney } from '../utils/currency';
import { checkoutPayloadKey, isRetryableNetworkError } from '../services/posReliability';

const router = useRouter();
const authStore = usePosAuthStore();
const shiftStore = usePosShiftStore();
const cartStore = usePosCartStore();
const { playScanBeep, playPaymentSuccess, playErrorBuzz } = usePosAudio();

const productsPanelRef = ref<any>(null);
const allProducts = ref<any[]>([]);
const categories = ref<any[]>([]);
const loadingProducts = ref(false);
const productSearch = ref('');
const selectedCategory = ref<any>('');
const submittingSale = ref(false);

const showHeldModal = ref(false);
const showCashModal = ref(false);
const heldOrdersCount = ref(0);

const isOnline = ref(navigator.onLine);
const pendingSyncCount = ref(0);
const pendingPrint = ref<{ key: string; sale: any } | null>(null);

const updateHeldCount = () => {
  try {
    const raw = localStorage.getItem('pos_held_orders');
    const list = raw ? JSON.parse(raw) : [];
    heldOrdersCount.value = list.length;
  } catch {
    heldOrdersCount.value = 0;
  }
};

// Filtered products based on search and category
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
        (p.barcode && p.barcode.includes(q))
    );
  }
  return list;
});

const loadCatalogData = async () => {
  loadingProducts.value = true;
  try {
    const [catsRes, prodsRes] = await Promise.all([
      api.get('/products/categories'),
      api.get('/products/branch'),
    ]);

    categories.value = catsRes.data?.data || catsRes.data || [];
    allProducts.value = prodsRes.data?.data || prodsRes.data || [];

    localStorage.setItem('pos_cached_categories', JSON.stringify(categories.value));
    localStorage.setItem('pos_cached_products', JSON.stringify(allProducts.value));
  } catch {
    const cachedCats = localStorage.getItem('pos_cached_categories');
    const cachedProds = localStorage.getItem('pos_cached_products');
    if (cachedCats) categories.value = JSON.parse(cachedCats);
    if (cachedProds) allProducts.value = JSON.parse(cachedProds);
  } finally {
    loadingProducts.value = false;
  }
};

const handleAddToCart = (product: any, customQty = 1, customNotes?: string) => {
  cartStore.addItem(product, customQty, customNotes);
  playScanBeep();
};

// ═══════════════════ HARDWARE BARCODE SCANNER ═══════════════════
useBarcodeScanner((barcode) => {
  console.log('[Scanner] Scanned barcode:', barcode);
  const found = allProducts.value.find(
    (p) =>
      p.barcode === barcode ||
      p.sku === barcode ||
      String(p.id) === barcode
  );

  if (found) {
    cartStore.addItem(found, 1);
    playScanBeep();
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
    console.log('Cash drawer trigger simulated (Web mode)');
  }
};

const handleHoldOrder = () => {
  if (!cartStore.items.length) return;
  const raw = localStorage.getItem('pos_held_orders');
  const held = raw ? JSON.parse(raw) : [];

  held.push({
    id: Date.now(),
    held_at: new Date().toISOString(),
    items: [...cartStore.items],
    total: cartStore.total,
    discountAmount: cartStore.discountAmount,
    paymentMethod: cartStore.paymentMethod,
  });

  localStorage.setItem('pos_held_orders', JSON.stringify(held));
  cartStore.clearCart();
  updateHeldCount();
  playScanBeep();
  alert('تم تعليق الفاتورة بنجاح. يمكنك استرجاعها من زر "المعلقات".');
};

const handleRestoreHeldOrder = (order: any) => {
  cartStore.clearCart();
  for (const itm of order.items || []) {
    cartStore.addItem(itm, itm.quantity, itm.custom_notes);
  }
  if (order.discountAmount) cartStore.discountAmount = order.discountAmount;
  if (order.paymentMethod) cartStore.paymentMethod = order.paymentMethod;
  updateHeldCount();
  playScanBeep();
};

const handleCashMovementSaved = async () => {
  await shiftStore.fetchCurrentShift();
};

const saveOfflineSale = async (salePayload: any) => {
  if ((window as any).electronAPI) {
    const saveRes = await (window as any).electronAPI.saveOfflineTransaction(salePayload);
    if (!saveRes || saveRes.success === false) {
      throw new Error(saveRes?.message || saveRes?.error || 'فشلت كتابة الفاتورة محلياً في التخزين الآمن');
    }
    return saveRes.transaction || salePayload;
  }

  const offlineSales = JSON.parse(localStorage.getItem('pos_offline_sales') || '[]');
  offlineSales.push(salePayload);
  localStorage.setItem('pos_offline_sales', JSON.stringify(offlineSales));
  return salePayload;
};

const handleCompleteSale = async (
  payment: { cashGiven: number | null; changeDue: number } = { cashGiven: null, changeDue: 0 },
) => {
  if (!cartStore.items.length || submittingSale.value) return;
  submittingSale.value = true;

  const syncId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : undefined;
  const salePayload = {
    sync_id: syncId,
    sale_type: 'branch',
    sale_date: new Date().toISOString().slice(0, 10),
    payment_method: cartStore.paymentMethod,
    payment_status: 'paid',
    discount_amount: cartStore.discountAmount,
    total_amount: cartStore.total,
    cash_given: payment.cashGiven ?? undefined,
    change_due: payment.changeDue,
    pos_shift_id: shiftStore.currentShift?.id || null,
    items: cartStore.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.name_ar,
      quantity: i.quantity,
      unit_price: i.unit_price,
      notes: i.custom_notes || undefined,
    })),
  };

  try {
    const currentKey = checkoutPayloadKey(salePayload);
    let saleRecord = pendingPrint.value?.key === currentKey ? pendingPrint.value.sale : null;
    let savedOffline = false;

    if (!saleRecord && navigator.onLine) {
      try {
        const res = await api.post('/sales', salePayload);
        saleRecord = res.data?.data || res.data;
      } catch (err) {
        if (!isRetryableNetworkError(err)) throw err;
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

    // Trigger Print & Drawer
    if ((window as any).electronAPI) {
      const printResult = await (window as any).electronAPI.printReceipt(saleRecord);
      if (!printResult?.success) {
        pendingPrint.value = { key: currentKey, sale: saleRecord };
        throw new Error(`تم حفظ الفاتورة لكن فشلت الطباعة: ${printResult?.error || 'خطأ غير معروف'}`);
      }
      await (window as any).electronAPI.openCashDrawer();
    }

    pendingPrint.value = null;
    cartStore.clearCart();
    await shiftStore.fetchCurrentShift();
  } catch (err: any) {
    playErrorBuzz();
    alert('فشل حفظ الفاتورة: ' + (err.response?.data?.message || err.message));
  } finally {
    submittingSale.value = false;
  }
};

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'F2' || e.key === 'F7') {
    e.preventDefault();
    productsPanelRef.value?.focusSearch();
  } else if (e.key === 'F9') {
    e.preventDefault();
    handleOpenDrawer();
  } else if (e.key === 'F10' || (e.key === 'Enter' && e.ctrlKey)) {
    e.preventDefault();
    handleCompleteSale();
  }
};

const updateOnlineStatus = () => {
  isOnline.value = navigator.onLine;
};

onMounted(async () => {
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('keydown', handleGlobalKeyDown);

  updateHeldCount();

  await shiftStore.fetchCurrentShift();
  if (!shiftStore.isShiftOpen) {
    router.push('/shift/open');
    return;
  }

  await loadCatalogData();
});

onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineStatus);
  window.removeEventListener('offline', updateOnlineStatus);
  window.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>

<style lang="scss" scoped>
.pos-master-sales-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-main, #f6f4f0);
  overflow: hidden;
}

.pos-top-ribbon {
  height: 60px;
  background:
    radial-gradient(circle at 14% 20%, rgba(209, 176, 107, 0.18), transparent 24%),
    linear-gradient(135deg, #1e130b 0%, #3b2418 60%, #5a3825 100%);
  border-bottom: 1.5px solid rgba(209, 176, 107, 0.4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  gap: 14px;
  z-index: 10;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.04));

  .ribbon-brand {
    display: flex;
    align-items: center;
    gap: 10px;

    .coffee-badge {
      width: 34px;
      height: 34px;
      display: inline-flex;
      background: var(--primary-soft, rgba(138, 87, 42, 0.08));
      padding: 6px;
      border-radius: var(--radius-sm, 6px);
      border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.2));

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    }

    .brand-titles {
      display: flex;
      align-items: center;
      gap: 8px;

      h2 {
        font-size: 1.12rem;
        font-weight: 900;
        color: #fffaf2;
        margin: 0;
      }

      .terminal-badge {
        background: rgba(209, 176, 107, 0.18);
        border: 1px solid rgba(209, 176, 107, 0.35);
        color: #f3d7a0;
        padding: 1px 7px;
        border-radius: 4px;
        font-size: 0.72rem;
        font-weight: 800;
      }
    }
  }

  .ribbon-stats {
    display: flex;
    align-items: center;
    gap: 20px;

    .stat-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      color: rgba(255, 250, 242, 0.9);

      .stat-label {
        color: rgba(255, 250, 242, 0.62);
        font-weight: 750;
      }

      .stat-money {
        color: #f3d7a0;
        font-size: 1rem;
        font-weight: 900;
      }

      .stat-invoices {
        color: #fffaf2;
        font-weight: 900;
      }
    }
  }

  .ribbon-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .btn-ribbon-action {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 10px;
      background: rgba(255, 255, 255, 0.08);
      border: 1.5px solid rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-sm, 6px);
      color: #fffaf2;
      font-size: 0.78rem;
      font-weight: 800;
      cursor: pointer;
      position: relative;
      transition: all 0.15s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: #f3d7a0;
        color: #f3d7a0;
      }

      &.held-btn .held-badge {
        background: var(--primary, #8a572a);
        color: #ffffff;
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 0.7rem;
        font-weight: 850;
      }
    }

    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 10px;
      border-radius: 20px;
      font-size: 0.76rem;
      font-weight: 800;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      &.online {
        background: var(--success-soft, rgba(22, 163, 74, 0.1));
        color: var(--success, #16a34a);
        border-color: var(--success-border, rgba(22, 163, 74, 0.25));
        .status-dot { background: #16a34a; }
      }

      &.offline {
        background: var(--danger-soft, rgba(220, 38, 38, 0.1));
        color: var(--danger, #dc2626);
        border-color: var(--danger-border, rgba(220, 38, 38, 0.25));
        .status-dot { background: #dc2626; }
      }

      .pending-count-badge {
        background: var(--danger, #dc2626);
        color: #ffffff;
        padding: 1px 5px;
        border-radius: 10px;
        font-size: 0.7rem;
      }
    }

    .btn-close-shift {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 12px;
      background: #f3d7a0;
      border: 1.5px solid #f3d7a0;
      border-radius: var(--radius-sm, 6px);
      color: #2a1b11;
      font-size: 0.8rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: #fff3d6;
        color: #2a1b11;
        border-color: #fff3d6;
      }
    }
  }
}

.pos-main-workspace {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(430px, 38vw);
  gap: 16px;
  padding: 16px;
  overflow: hidden;
  background: var(--bg-main, #f6f4f0);

  .catalog-section {
    height: 100%;
    overflow: hidden;
  }

  .cart-section {
    height: 100%;
    overflow: hidden;
  }
}

.pos-top-ribbon button:focus-visible {
  outline: 3px solid #fff3d6;
  outline-offset: 3px;
}

@media (max-width: 1100px) {
  .pos-top-ribbon {
    height: auto;
    min-height: 60px;
    flex-wrap: wrap;
    padding-block: 9px;

    .ribbon-stats {
      order: 3;
      width: 100%;
      justify-content: center;
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
    }
  }

  .pos-main-workspace {
    grid-template-columns: minmax(0, 1fr) 390px;
  }
}

@media (max-width: 820px) {
  .pos-top-ribbon {
    .ribbon-brand .brand-titles .terminal-badge,
    .ribbon-actions .btn-ribbon-action span:not(.held-badge),
    .ribbon-actions .status-pill > span:not(.status-dot):not(.pending-count-badge),
    .ribbon-actions .btn-close-shift span {
      display: none;
    }

    .ribbon-actions {
      gap: 6px;

      .btn-ribbon-action,
      .status-pill,
      .btn-close-shift {
        width: 36px;
        justify-content: center;
        padding: 0;
      }
    }
  }

  .pos-main-workspace {
    grid-template-columns: 1fr;
    overflow-y: auto;

    .catalog-section,
    .cart-section {
      min-height: 420px;
      height: auto;
      overflow: visible;
    }
  }
}
</style>
