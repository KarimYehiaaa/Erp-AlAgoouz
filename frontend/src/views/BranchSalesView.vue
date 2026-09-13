<template>
  <div class="branch-sales-page">
    <!-- Header (Admin/Manager only) -->
    <div v-if="!authStore.isCashier" class="page-header card">
      <div class="header-title">
        <span class="header-icon"><AppIcon name="shop" :size="24" /></span>
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
          إدخال يدوي
        </button>
        <button
          class="btn btn-outline"
          @click="showMode = 'excel'"
          :class="{ active: showMode === 'excel' }"
        >
          رفع Excel
        </button>
        <button class="btn btn-outline" @click="openCountsModal">خصم من تعداد</button>
      </div>
    </div>

    <!-- Compact POS Ribbon for Cashier -->
    <div v-if="authStore.isCashier" class="cashier-compact-bar">
      <div class="stat-pill">
        <span class="pill-icon"><AppIcon name="coins" :size="16" /></span>
        <span class="pill-label">مبيعات اليوم:</span>
        <strong class="pill-val highlight">{{ formatMoney(todayTotal) }}</strong>
      </div>
      <div class="stat-pill">
        <span class="pill-icon"><AppIcon name="receipt" :size="16" /></span>
        <span class="pill-label">الفواتير:</span>
        <strong class="pill-val">{{ todayCount }}</strong>
      </div>
      <div v-if="lastSaleTime && lastSaleTime !== '—'" class="stat-pill">
        <span class="pill-icon"><AppIcon name="clock" :size="16" /></span>
        <span class="pill-label">آخر فاتورة:</span>
        <strong class="pill-val">{{ lastSaleTime }}</strong>
      </div>

      <!-- Quick Action Tools -->
      <div class="pos-quick-tools">
        <button
          type="button"
          class="tool-pill-btn"
          @click="returnsModal = true"
          title="استعراض فواتير اليوم وعمل المرتجعات السريعة"
        >
          <span>↩ فواتير ومرتجع اليوم</span>
        </button>

        <button
          v-if="lastSavedSale || salesHistory.length"
          type="button"
          class="tool-pill-btn"
          @click="reprintLastSale"
          title="إعادة طباعة آخر فاتورة تم حفظها (F8)"
        >
          <span> إعادة طباعة (F8)</span>
        </button>

        <button
          type="button"
          class="tool-pill-btn"
          @click="shortcutsModal = true"
          title="دليل اختصارات لوحة المفاتيح (F1)"
        >
          <span>⌨ الاختصارات (F1)</span>
        </button>
      </div>
    </div>

    <!-- Stats Row (Admin/Manager) -->
    <div v-else class="grid grid-3 stats-row">
      <StatCard label="مبيعات اليوم" :value="todayTotal" icon="coins" />
      <StatCard label="عدد الفواتير اليوم" :value="todayCount" icon="receipt" format="number" />
      <StatCard label="آخر عملية بيع" :value="lastSaleTime" icon="clock" format="text" />
    </div>

    <!-- ⏸ Held Orders Ribbon (شريط الطلبات المعلقة) -->
    <div v-if="heldOrders.length" class="held-orders-bar">
      <div class="held-bar-header">
        <span class="held-icon">⏸</span>
        <span class="held-title">الطلبات المعلقة ({{ heldOrders.length }}):</span>
      </div>
      <div class="held-orders-list">
        <div
          v-for="held in heldOrders"
          :key="held.id"
          class="held-card"
          @click="resumeHeldOrder(held)"
          title="اضغط لاستئناف هذا الطلب في السلة فوراً"
        >
          <div class="held-meta">
            <span class="held-time"> {{ held.time }}</span>
            <span class="held-count">{{ held.items_count }} صنف</span>
          </div>
          <strong class="held-total">{{ formatMoney(held.total) }}</strong>
          <button
            type="button"
            class="held-remove-btn"
            @click.stop="deleteHeldOrder(held.id)"
            title="حذف هذا الطلب المعلق نهائياً"
          ></button>
        </div>
      </div>
    </div>

    <!-- Manual Entry Mode (100% Screen Real Estate Redesign) -->
    <div v-if="showMode === 'manual'" class="manual-mode-layout">
      <!--  100% Full-Width Product Catalog View -->
      <div class="full-catalog-wrapper">
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
      </div>

      <!--  Floating Bottom Smart Action Bar (شريط المحاسبة الذكي العائم) -->
      <transition name="floating-bar-slide">
        <div v-if="cart.length > 0" class="pos-floating-action-bar">
          <div
            class="bar-cart-summary"
            @click="showCheckoutDrawer = true"
            title="انقر لفتح سلة ومحاسبة الفاتورة"
          >
            <div class="bar-badge-pill">
              <span class="bar-icon"><AppIcon name="coffee" :size="20" /></span>
              <span class="bar-items-count">{{ cart.length }} صنف في السلة</span>
            </div>
            <div class="bar-price-block">
              <span class="bar-total-label">الإجمالي المستحق:</span>
              <strong class="bar-total-amount">{{ formatMoney(cartTotal) }}</strong>
            </div>
          </div>

          <div class="bar-action-buttons">
            <button
              type="button"
              class="bar-btn-hold"
              @click="holdCurrentOrder"
              title="تعليق الطلب الحالي في قائمة الانتظار (F4)"
            >
              ⏸ تعليق (F4)
            </button>

            <button
              type="button"
              class="bar-btn-clear"
              @click="clearCart()"
              title="تفريغ السلة الحالية (F6)"
            >
              تفريغ (F6)
            </button>

            <button
              type="button"
              class="bar-btn-checkout"
              @click="showCheckoutDrawer = true"
              title="إتمام الطلب والدفع الفوري (Space أو F9)"
            >
              <span class="checkout-text">إتمام الطلب والدفع</span>
              <span class="checkout-key-hint">(Space / F9) </span>
            </button>
          </div>
        </div>
      </transition>

      <!--  On-Demand Slide-Over Checkout Layer (درج الدفع والمحاسبة المنزلق عند الطلب) -->
      <transition name="drawer-backdrop">
        <div
          v-if="showCheckoutDrawer"
          class="checkout-drawer-backdrop"
          @click.self="showCheckoutDrawer = false"
        >
          <div class="checkout-drawer-panel">
            <CartPanel
              ref="cartPanelRef"
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
              :customers-list="customersList"
              :selected-customer="selectedCustomer"
              :format-money="formatMoney"
              @increase-qty="increaseQty"
              @decrease-qty="decreaseQty"
              @validate-qty="validateQty"
              @remove-from-cart="removeFromCart"
              @add-recommended="addRecommendedToCart"
              @submit-sale="submitManualSale"
              @clear-cart="clearCart"
              @hold-order="holdCurrentOrder"
              @select-printer="selectPrinter"
              @print-last="printReceipt"
              @close-drawer="showCheckoutDrawer = false"
            />
          </div>
        </div>
      </transition>
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
        <h3>خصم من تعداد المنتجات</h3>
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

    <!-- ⌨ Shortcuts Help Modal (F1) -->
    <div v-if="shortcutsModal" class="modal" @click.self="shortcutsModal = false">
      <div class="card modal-content shortcuts-modal">
        <div class="modal-header-row">
          <h3><AppIcon name="keyboard" :size="18" /> دليل اختصارات لوحة المفاتيح للكاشير</h3>
          <button type="button" class="close-modal-btn" @click="shortcutsModal = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div class="shortcuts-grid">
          <div class="shortcut-item">
            <kbd class="key-badge">Space</kbd>
            <span>فتح / إغلاق درج الدفع والمحاسبة</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F1</kbd>
            <span>فتح وإغلاق دليل الاختصارات</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F2 / F7</kbd>
            <span>التركيز على بحث المنتجات أو مسح الباركود</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F4</kbd>
            <span>تعليق الطلب (Hold) / التركيز على الخصم</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F6</kbd>
            <span>تفريغ السلة الحالية بالكامل</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F8</kbd>
            <span>إعادة طباعة آخر فاتورة تم حفظها</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F9</kbd>
            <span>تفعيل الدفع النقدي (كاش) وحاسبة الباقي</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">F10</kbd>
            <span>تفعيل الدفع بالبطاقة (فيزا / شبكة)</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">Enter</kbd>
            <span>حفظ عملية البيع والطباعة الفورية</span>
          </div>
          <div class="shortcut-item">
            <kbd class="key-badge">Esc</kbd>
            <span>إغلاق درج الدفع أو النوافذ المنبثقة</span>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="shortcutsModal = false">فهمت، إغلاق (Esc)</button>
        </div>
      </div>
    </div>

    <!-- ↩ Returns & Today's Invoices Modal -->
    <div v-if="returnsModal" class="modal" @click.self="returnsModal = false">
      <div class="card modal-content returns-modal">
        <div class="modal-header-row">
          <h3>↩ فواتير اليوم والمرتجع السريع</h3>
          <button type="button" class="close-modal-btn" @click="returnsModal = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="returns-search-box">
          <span class="search-icon"><AppIcon name="search" :size="16" /></span>
          <input
            v-model="returnInvoiceSearch"
            type="text"
            placeholder="ابحث برقم الفاتورة أو المبلغ أو رقم البيع..."
            class="returns-search-input"
          />
        </div>

        <div class="returns-table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>رقم البيع</th>
                <th>الوقت</th>
                <th>الأصناف</th>
                <th>الإجمالي</th>
                <th>الدفع</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sale in filteredInvoicesForReturn" :key="sale.id">
                <td class="sale-number">{{ sale.sale_number || `#${sale.id}` }}</td>
                <td>{{ formatDate(sale.sale_date) }}</td>
                <td>{{ sale.items_count || 0 }} منتج</td>
                <td class="amount">{{ formatMoney(sale.total_amount) }}</td>
                <td>
                  <span :class="paymentBadge(sale.payment_status)">{{
                    paymentLabel(sale.payment_status)
                  }}</span>
                </td>
                <td>
                  <span :class="statusBadge(sale.status)">{{ statusLabel(sale.status) }}</span>
                </td>
                <td class="actions-cell">
                  <button
                    type="button"
                    class="btn-sm btn-outline"
                    @click="printReceipt(sale)"
                    title="طباعة إيصال الفاتورة"
                  >
                    طباعة
                  </button>
                  <button
                    v-if="sale.status === 'completed' && !sale.offline_id"
                    type="button"
                    class="btn-sm btn-danger"
                    @click="returnSale(sale)"
                    title="عمل استرداد / مرتجع وإعادة المخزون"
                  >
                    ↩ مرتجع
                  </button>
                </td>
              </tr>
              <tr v-if="!filteredInvoicesForReturn.length">
                <td colspan="7" class="empty">لا توجد فواتير مطابقة لبحثك</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-actions">
          <button class="btn btn-outline" @click="returnsModal = false">إغلاق</button>
        </div>
      </div>
    </div>

    <!-- Today's Sales History -->
    <div class="card sales-history">
      <div class="history-header">
        <h3>سجل مبيعات الفرع</h3>
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
                  ↩
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

    <!-- 📊 POS Shift Modals (فتح وردية / حركة نقدية / إغلاق وردية و Z-Report) -->
    <ShiftModals
      v-model:show-open-shift="showOpenShiftModal"
      v-model:show-close-shift="showCloseShiftModal"
      v-model:show-cash-movement="showCashMovementModal"
      :current-shift="currentShift"
      :shift-loading="shiftLoading"
      @open-shift="openShift"
      @close-shift="closeShift"
      @cash-movement="recordCashMovement"
    />

    <!-- 🔐 Manager PIN Override Modal -->
    <ManagerPinModal
      v-model:show="showPinModal"
      :action-description="pinActionDescription"
      :loading="pinLoading"
      :error-message="pinErrorMessage"
      @submit-pin="handlePinSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import StatCard from '@/components/StatCard.vue';
import AppIcon from '@/components/AppIcon.vue';
import SkeletonLoader from '@/components/SkeletonLoader.vue';
import ProductsPanel from '@/components/branch/ProductsPanel.vue';
import CartPanel from '@/components/branch/CartPanel.vue';
import ExcelMode from '@/components/branch/ExcelMode.vue';
import ShiftModals from '@/components/branch/ShiftModals.vue';
import ManagerPinModal from '@/components/branch/ManagerPinModal.vue';
import { formatMoney } from '@/utils/currency';
import { useBranchSales } from '@/composables/useBranchSales';
import { usePosShift } from '@/composables/usePosShift';

const {
  currentShift,
  isShiftOpen,
  shiftLoading,
  showOpenShiftModal,
  showCloseShiftModal,
  showCashMovementModal,
  checkActiveShift,
  openShift,
  closeShift,
  recordCashMovement,
} = usePosShift();

const {
  authStore,
  localTodayYmd,
  today,
  formatDate,
  showMode,
  showCheckoutDrawer,
  activeTab,
  loadingProducts,
  loadingHistory,
  saving,
  saleError,
  downloadingTemplate,
  todayStr,
  appStore,
  autoPrint,
  printerName,
  lastSavedSale,
  productsPanelRef,
  cartPanelRef,
  companySettings,
  playBeep,
  shortcutsModal,
  returnsModal,
  returnInvoiceSearch,
  HELD_ORDERS_KEY,
  heldOrders,
  loadHeldOrders,
  saveHeldOrders,
  holdCurrentOrder,
  resumeHeldOrder,
  deleteHeldOrder,
  filteredInvoicesForReturn,
  reprintLastSale,
  handleGlobalKeyDown,
  allProducts,
  filteredProducts,
  productSearch,
  selectedCategory,
  cart,
  saleForm,
  recommendedItems,
  loadingRecommendations,
  loadRecommendations,
  addRecommendedToCart,
  salesHistory,
  historyFilters,
  excelMsg,
  excelErr,
  excelDetails,
  countsModal,
  counts,
  cartSubtotal,
  effectiveDiscount,
  cartTotal,
  todayTotal,
  todayCount,
  lastSaleTime,
  hasLowIngredients,
  getProductStockClass,
  getProductStockTitle,
  isInCart,
  getCartQty,
  filterProducts,
  loadProducts,
  addToCart,
  increaseQty,
  decreaseQty,
  validateQty,
  removeFromCart,
  clearCart,
  selectPrinter,
  printReceipt,
  submitManualSale,
  selectMonth,
  loadHistory,
  returnSale,
  statusLabel,
  statusBadge,
  paymentLabel,
  paymentBadge,
  downloadBranchTemplate,
  onValidateExcel,
  onImportExcel,
  onInventoryUpdated,
  openCountsModal,
  submitCounts,
  categories,
  loadMeta,
  customersList,
  selectedCustomer,
  showPinModal,
  pinActionDescription,
  pinLoading,
  pinErrorMessage,
  handlePinSubmit,
} = useBranchSales();

onMounted(async () => {
  if (authStore.isCashier) {
    await checkActiveShift();
  }
});
</script>

<style lang="scss" scoped>
@use '../styles/views/BranchSalesView';
</style>
