<template>
  <div class="card checkout-cart-panel" :class="{ 'mobile-hidden': activeTab !== 'cart' }">
    <div class="cart-title-row">
      <div class="title-with-badge">
        <span class="cart-icon">🛒</span>
        <h3>سلة ومحاسبة الفاتورة</h3>
      </div>
      <div class="cart-header-actions">
        <span v-if="cart.length" class="cart-items-count">{{ cart.length }} صنف</span>
        <button
          type="button"
          class="btn-close-cart"
          @click="emit('closeDrawer')"
          title="إغلاق والعودة للكتالوج (Esc)"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Cart Items -->
    <div v-if="!cart.length" class="empty-cart">
      <span class="empty-cart-icon">🛒</span>
      <p>السلة فارغة حالياً</p>
      <span class="empty-hint">اختر أصنافاً من الكتالوج لإضافتها للسلة</span>
    </div>

    <div v-else class="cart-items-scrollable">
      <div v-for="(item, idx) in cart" :key="item.product_id || idx" class="checkout-item-row">
        <div class="item-main-details">
          <span class="item-name">{{ item.name_ar }}</span>
          <span class="item-unit-price">{{ formatMoney(item.unit_price) }} / للوحدة</span>
        </div>

        <div class="item-touch-controls">
          <button
            type="button"
            class="touch-qty-btn decrease"
            @click="emit('decreaseQty', idx)"
            title="تقليل الكمية"
          >
            −
          </button>

          <!-- 🔢 زر تعديل الكمية والوزن بالنقر لفتح لوحة الأرقام -->
          <button
            type="button"
            class="touch-qty-display"
            @click="openNumpad(idx)"
            title="انقر لتعديل الكمية أو الوزن بالجرامات"
          >
            <span class="qty-val">{{ item.quantity }}</span>
            <span class="qty-unit-label">{{ getWeightLabel(item.quantity) }}</span>
            <span class="qty-pencil">✏️</span>
          </button>

          <button
            type="button"
            class="touch-qty-btn increase"
            @click="emit('increaseQty', idx)"
            title="زيادة الكمية"
          >
            +
          </button>

          <button
            type="button"
            class="touch-delete-btn"
            @click="emit('removeFromCart', idx)"
            title="حذف من السلة"
          >
            🗑️
          </button>
        </div>

        <div class="item-line-total">
          {{ formatMoney(item.quantity * item.unit_price) }}
        </div>
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
          @click="emit('addRecommended', rec)"
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
    <div v-if="cart.length" class="cart-summary-box">
      <div class="summary-row">
        <span>المجموع الفرعي:</span>
        <strong class="subtotal-val">{{ formatMoney(cartSubtotal) }}</strong>
      </div>
      <div class="summary-row discount-row">
        <span>خصم الفاتورة (ج.م) [F4]:</span>
        <input
          ref="discountInputRef"
          v-model.number="saleForm.discount_amount"
          type="number"
          min="0"
          step="0.01"
          class="discount-input"
          placeholder="0.00"
        />
      </div>
      <div class="summary-row total-highlight-row">
        <span class="total-label">الإجمالي المستحق للدفع:</span>
        <span class="total-amount-glow">{{ formatMoney(cartTotal) }}</span>
      </div>
    </div>

    <!-- Sale Form & Payments -->
    <form v-if="cart.length" @submit.prevent="emit('submitSale')" class="checkout-payment-form">
      <!-- 💳 شبكة أزرار طرق الدفع السريعة (Payment Methods Grid) -->
      <div class="payment-section-box">
        <label class="section-title">طريقة الدفع (اضغط للاختيار):</label>
        <div class="payment-tiles-grid">
          <button
            type="button"
            class="pay-tile"
            :class="{ selected: saleForm.payment_method === 'cash' }"
            @click="saleForm.payment_method = 'cash'"
          >
            <span class="tile-icon">💵</span>
            <span class="tile-title">نقدي (كاش)</span>
          </button>

          <button
            type="button"
            class="pay-tile"
            :class="{ selected: saleForm.payment_method === 'card' }"
            @click="saleForm.payment_method = 'card'"
          >
            <span class="tile-icon">💳</span>
            <span class="tile-title">فيزا / مدى</span>
          </button>

          <button
            type="button"
            class="pay-tile"
            :class="{ selected: saleForm.payment_method === 'transfer' }"
            @click="saleForm.payment_method = 'transfer'"
          >
            <span class="tile-icon">📱</span>
            <span class="tile-title">إنستاباي / محفظة</span>
          </button>

          <button
            type="button"
            class="pay-tile"
            :class="{ selected: saleForm.payment_method === 'credit' }"
            @click="saleForm.payment_method = 'credit'"
          >
            <span class="tile-icon">⏳</span>
            <span class="tile-title">آجل / ذمم</span>
          </button>
        </div>
      </div>

      <!-- 💵 حاسبة الباقي وفئات النقود السريعة عند الدفع كاش -->
      <div v-if="saleForm.payment_method === 'cash'" class="cash-calc-box">
        <div class="calc-header">
          <span class="calc-title">💵 أزرار النقدية السريعة:</span>
        </div>

        <div class="preset-bills-row">
          <button
            type="button"
            class="bill-chip exact"
            @click="receivedAmount = cartTotal"
            title="المبلغ بالضبط بدون باقي"
          >
            المبلغ بالضبط
          </button>
          <button
            v-for="preset in [50, 100, 200, 500]"
            :key="preset"
            type="button"
            class="bill-chip"
            :class="{ active: receivedAmount === preset }"
            @click="receivedAmount = preset"
          >
            {{ preset }} ج.م
          </button>
        </div>

        <div class="received-row">
          <label>المبلغ المستلم نقدياً:</label>
          <div class="received-input-wrap">
            <input
              ref="receivedInputRef"
              v-model.number="receivedAmount"
              type="number"
              min="0"
              step="1"
              placeholder="أدخل المبلغ..."
              class="received-input"
            />
            <span class="curr-tag">ج.م</span>
          </div>
        </div>

        <div
          v-if="Boolean(receivedAmount && receivedAmount > 0)"
          class="change-statement-row"
          :class="{
            'has-change': changeAmount >= 0,
            'has-shortage': changeAmount < 0,
          }"
        >
          <span class="change-label">{{
            changeAmount >= 0 ? '🟢 الباقي المستحق للعميل:' : '⚠️ المبلغ المتبقي للدفع:'
          }}</span>
          <strong class="change-val">{{ formatMoney(Math.abs(changeAmount)) }}</strong>
        </div>
      </div>

      <!-- إعدادات الطباعة الحرارية المباشرة -->
      <div class="printer-settings-bar">
        <label class="auto-print-checkbox">
          <input
            type="checkbox"
            :checked="autoPrint"
            @change="emit('update:autoPrint', ($event.target as HTMLInputElement).checked)"
          />
          <span>🖨️ طباعة إيصال فوري تلقائياً عند الحفظ</span>
        </label>

        <button
          v-if="lastSavedSale"
          type="button"
          class="btn-reprint-link"
          @click="emit('printLast', lastSavedSale)"
          title="إعادة طباعة آخر فاتورة تم حفظها (F8)"
        >
          <span>إعادة طباعة الأخيرة (F8)</span>
        </button>
      </div>

      <div v-if="saleError" class="alert alert-danger">{{ saleError }}</div>

      <!-- Action Buttons -->
      <div class="checkout-final-actions">
        <button
          v-permission="['pos.add', 'sales.add']"
          type="submit"
          class="btn-finalize-submit"
          :class="{ 'btn-loading': saving }"
          :disabled="saving || !cart.length"
        >
          <span class="btn-icon">🖨️</span>
          <div class="btn-text-col">
            <span class="btn-title">{{
              saving ? 'جاري الحفظ والتجهيز...' : 'حفظ وطباعة الفاتورة الفورية'
            }}</span>
            <span class="btn-sub">اختصار Enter • {{ formatMoney(cartTotal) }}</span>
          </div>
        </button>

        <div class="drawer-secondary-actions">
          <button
            type="button"
            class="btn-drawer-hold"
            @click="emit('holdOrder')"
            title="تعليق الطلب في الانتظار (F4)"
          >
            ⏸️ تعليق الطلب (F4)
          </button>

          <button
            type="button"
            class="btn-drawer-clear"
            @click="emit('clearCart')"
            title="إفراغ السلة"
          >
            🗑️ مسح السلة
          </button>
        </div>
      </div>
    </form>

    <!-- 🔢 On-Screen Numeric Keypad Modal (لوحة أرقام اللمس السريعة للوزن والجرامات) -->
    <div v-if="numpadModal" class="modal numpad-modal-backdrop" @click.self="closeNumpad">
      <div class="card modal-content numpad-modal-card">
        <!-- Header -->
        <div class="numpad-header">
          <div class="numpad-title-wrap">
            <span class="numpad-icon">⚖️</span>
            <div>
              <h4>تعديل الكمية والوزن</h4>
              <p v-if="activeNumpadItem" class="numpad-prod-name">
                {{ activeNumpadItem.name_ar }}
                <span class="unit-price-tag"
                  >({{ formatMoney(activeNumpadItem.unit_price) }} / كجم)</span
                >
              </p>
            </div>
          </div>
          <button type="button" class="close-numpad-btn" @click="closeNumpad">✕</button>
        </div>

        <!-- Live Display Screen -->
        <div class="numpad-display-screen">
          <div class="display-val-row">
            <span class="display-qty">{{ numpadValue || '0' }}</span>
            <span class="display-unit">كجم</span>
          </div>
          <div class="display-helper-row">
            <span class="weight-meaning">{{ getDetailedWeightMeaning(Number(numpadValue)) }}</span>
            <span class="live-calculated-total">
              الإجمالي:
              <strong>{{
                formatMoney((Number(numpadValue) || 0) * (activeNumpadItem?.unit_price || 0))
              }}</strong>
            </span>
          </div>
        </div>

        <!-- Quick Weight Presets (أزرار أوزان البن الشائعة) -->
        <div class="numpad-presets">
          <button type="button" class="preset-btn" @click="setPresetWeight(0.125)">
            1/8 كجم (125g)
          </button>
          <button type="button" class="preset-btn" @click="setPresetWeight(0.25)">
            1/4 كجم (250g)
          </button>
          <button type="button" class="preset-btn" @click="setPresetWeight(0.5)">
            1/2 كجم (500g)
          </button>
          <button type="button" class="preset-btn" @click="setPresetWeight(0.75)">
            3/4 كجم (750g)
          </button>
          <button type="button" class="preset-btn highlight" @click="setPresetWeight(1)">
            1 كجم (1000g)
          </button>
          <button type="button" class="preset-btn" @click="setPresetWeight(2)">2 كجم</button>
        </div>

        <!-- Numeric Keypad Grid (3x4) -->
        <div class="numpad-grid">
          <button type="button" class="num-key" @click="numpadPress('7')">7</button>
          <button type="button" class="num-key" @click="numpadPress('8')">8</button>
          <button type="button" class="num-key" @click="numpadPress('9')">9</button>

          <button type="button" class="num-key" @click="numpadPress('4')">4</button>
          <button type="button" class="num-key" @click="numpadPress('5')">5</button>
          <button type="button" class="num-key" @click="numpadPress('6')">6</button>

          <button type="button" class="num-key" @click="numpadPress('1')">1</button>
          <button type="button" class="num-key" @click="numpadPress('2')">2</button>
          <button type="button" class="num-key" @click="numpadPress('3')">3</button>

          <button type="button" class="num-key clear-key" @click="numpadPress('C')" title="مسح">
            C
          </button>
          <button type="button" class="num-key" @click="numpadPress('0')">0</button>
          <button type="button" class="num-key dot-key" @click="numpadPress('.')">.</button>
          <button
            type="button"
            class="num-key backspace-key"
            @click="numpadPress('⌫')"
            title="حذف رقم"
          >
            ⌫
          </button>
        </div>

        <!-- Confirmation Actions -->
        <div class="numpad-actions">
          <button type="button" class="btn btn-outline" @click="closeNumpad">إلغاء (Esc)</button>
          <button type="button" class="btn btn-primary confirm-btn" @click="confirmNumpad">
            ✓ تأكيد الكمية (Enter)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  cart: any[];
  saleForm: any;
  recommendedItems: any[];
  cartSubtotal: number;
  cartTotal: number;
  saving: boolean;
  saleError: string;
  autoPrint: boolean;
  printerName: string;
  lastSavedSale: any;
  activeTab: string;
  formatMoney: (_v: any) => string;
}>();

const emit = defineEmits<{
  increaseQty: [idx: number];
  decreaseQty: [idx: number];
  validateQty: [idx: number];
  removeFromCart: [idx: number];
  addRecommended: [rec: any];
  submitSale: [];
  clearCart: [];
  holdOrder: [];
  selectPrinter: [];
  printLast: [sale: any];
  closeDrawer: [];
  'update:autoPrint': [v: boolean];
}>();

const discountInputRef = ref<HTMLInputElement | null>(null);
const receivedInputRef = ref<HTMLInputElement | null>(null);
const receivedAmount = ref<number | null>(null);

// ─── 🔢 Numpad State & Logic ───
const numpadModal = ref(false);
const editingIndex = ref<number | null>(null);
const numpadValue = ref('1');

const activeNumpadItem = computed(() => {
  if (editingIndex.value === null || !props.cart[editingIndex.value]) return null;
  return props.cart[editingIndex.value];
});

const openNumpad = (idx: number) => {
  editingIndex.value = idx;
  numpadValue.value = String(props.cart[idx].quantity || 1);
  numpadModal.value = true;
};

const closeNumpad = () => {
  numpadModal.value = false;
  editingIndex.value = null;
};

const numpadPress = (char: string) => {
  if (char === 'C') {
    numpadValue.value = '0';
    return;
  }
  if (char === '⌫') {
    if (numpadValue.value.length <= 1) {
      numpadValue.value = '0';
    } else {
      numpadValue.value = numpadValue.value.slice(0, -1);
    }
    return;
  }
  if (char === '.') {
    if (!numpadValue.value.includes('.')) {
      numpadValue.value += '.';
    }
    return;
  }
  // Numbers 0-9
  if (numpadValue.value === '0') {
    numpadValue.value = char;
  } else {
    if (numpadValue.value.length < 8) {
      numpadValue.value += char;
    }
  }
};

const setPresetWeight = (qty: number) => {
  numpadValue.value = String(qty);
};

const confirmNumpad = () => {
  if (editingIndex.value !== null && props.cart[editingIndex.value]) {
    const val = Math.max(0.001, parseFloat(numpadValue.value) || 1);
    const rounded = Math.round(val * 1000) / 1000;
    props.cart[editingIndex.value].quantity = rounded;
    emit('validateQty', editingIndex.value);
  }
  closeNumpad();
};

const getWeightLabel = (qty: number) => {
  if (!qty) return 'وحدة';
  if (qty < 1) {
    const grams = Math.round(qty * 1000);
    return `${grams} جم`;
  }
  return 'كجم/عدد';
};

const getDetailedWeightMeaning = (val: number) => {
  if (!val || isNaN(val)) return '—';
  if (val === 0.125) return '⚖️ 125 جرام (ثمن كيلو)';
  if (val === 0.25) return '⚖️ 250 جرام (ربع كيلو)';
  if (val === 0.5) return '⚖️ 500 جرام (نصف كيلو)';
  if (val === 0.75) return '⚖️ 750 جرام (ثلاثة أرباع كيلو)';
  if (val < 1) return `⚖️ ${Math.round(val * 1000)} جرام`;
  return `⚖️ ${val} كجم`;
};

const handleNumpadKey = (e: KeyboardEvent) => {
  if (!numpadModal.value) return;
  if (e.key >= '0' && e.key <= '9') {
    numpadPress(e.key);
  } else if (e.key === '.' || e.key === ',') {
    numpadPress('.');
  } else if (e.key === 'Backspace') {
    numpadPress('⌫');
  } else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
    numpadPress('C');
  } else if (e.key === 'Enter') {
    e.preventDefault();
    confirmNumpad();
  } else if (e.key === 'Escape') {
    closeNumpad();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleNumpadKey);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleNumpadKey);
});

/** حساب الباقي المستحق */
const changeAmount = computed(() => {
  const received = Number(receivedAmount.value) || 0;
  const total = Number(props.cartTotal) || 0;
  if (!received) return 0;
  return received - total;
});

defineExpose({
  focusDiscount: () => {
    discountInputRef.value?.focus();
    discountInputRef.value?.select();
  },
  focusReceived: () => {
    receivedInputRef.value?.focus();
    receivedInputRef.value?.select();
  },
  resetReceived: () => {
    receivedAmount.value = null;
  },
});
</script>

<style lang="scss" scoped>
/* ═══════════════════════════════════════════════════════════════════
   CHECKOUT CART PANEL (ON-DEMAND SLIDE-OVER LAYER STYLES)
   ═══════════════════════════════════════════════════════════════════ */

.checkout-cart-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: var(--surface, #1e130b);
  border: none;
  box-shadow: none;
  overflow-y: auto;
}

.cart-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);

  .title-with-badge {
    display: flex;
    align-items: center;
    gap: 8px;

    .cart-icon {
      font-size: 1.2rem;
    }

    h3 {
      margin: 0;
      color: #faedcd;
      font-size: 1.15rem;
      font-weight: 800;
    }
  }

  .cart-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .cart-items-count {
      background: rgba(212, 163, 115, 0.15);
      color: #d4a373;
      border: 1px solid rgba(212, 163, 115, 0.3);
      padding: 2px 10px;
      border-radius: 14px;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .btn-close-cart {
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: #f7ede2;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
      }
    }
  }
}

.empty-cart {
  text-align: center;
  padding: 40px 14px;
  color: var(--text-muted, #a89f91);

  .empty-cart-icon {
    font-size: 3rem;
    display: inline-block;
    margin-bottom: 8px;
    opacity: 0.8;
  }

  p {
    margin: 0 0 4px 0;
    font-weight: 700;
    font-size: 1rem;
    color: #faedcd;
  }

  .empty-hint {
    font-size: 0.8rem;
    color: #d4a373;
  }
}

/* ── Cart Items List ── */
.cart-items-scrollable {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  max-height: 260px;
  overflow-y: auto;
  padding-right: 2px;
}

.checkout-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(212, 163, 115, 0.15);
  border-radius: 10px;
  gap: 8px;
}

.item-main-details {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 100px;

  .item-name {
    font-size: 0.88rem;
    font-weight: 700;
    color: #faedcd;
  }
  .item-unit-price {
    font-size: 0.72rem;
    color: #a89f91;
  }
}

.item-touch-controls {
  display: flex;
  align-items: center;
  gap: 4px;

  .touch-qty-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: rgba(212, 163, 115, 0.18);
    border: 1px solid rgba(212, 163, 115, 0.35);
    color: #faedcd;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: #d4a373;
      color: #140d08;
    }
  }

  .touch-qty-display {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 6px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px dashed rgba(212, 163, 115, 0.3);
    border-radius: 6px;
    cursor: pointer;

    .qty-val {
      font-size: 0.88rem;
      font-weight: 800;
      color: #fff;
    }
    .qty-unit-label {
      font-size: 0.68rem;
      color: #d4a373;
    }
    .qty-pencil {
      font-size: 0.65rem;
      opacity: 0.7;
    }
  }

  .touch-delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    opacity: 0.6;
    padding: 2px 4px;

    &:hover {
      opacity: 1;
    }
  }
}

.item-line-total {
  font-size: 0.95rem;
  font-weight: 800;
  color: #ffffff;
  white-space: nowrap;
  min-width: 60px;
  text-align: left;
}

/* ── Recommendations ── */
.cart-recommendations {
  margin-bottom: 12px;
  padding: 8px 10px;
  background: rgba(212, 163, 115, 0.08);
  border: 1px dashed rgba(212, 163, 115, 0.25);
  border-radius: 10px;

  .rec-title {
    font-size: 0.76rem;
    font-weight: 700;
    color: #d4a373;
    margin-bottom: 6px;
  }

  .rec-list {
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }

  .rec-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(212, 163, 115, 0.2);
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;

    .rec-name-text {
      font-size: 0.78rem;
      font-weight: 700;
      color: #faedcd;
    }
    .rec-category {
      font-size: 0.68rem;
      color: #a89f91;
    }
    .rec-price {
      font-size: 0.78rem;
      font-weight: 800;
      color: #d4a373;
    }
  }
}

/* ── Cart Summary ── */
.cart-summary-box {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.84rem;
  color: #d4a373;
  margin-bottom: 4px;

  &.discount-row {
    .discount-input {
      width: 90px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(212, 163, 115, 0.3);
      border-radius: 6px;
      color: #faedcd;
      font-size: 0.82rem;
      text-align: center;
    }
  }

  &.total-highlight-row {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed rgba(212, 163, 115, 0.25);

    .total-label {
      font-size: 0.95rem;
      font-weight: 800;
      color: #faedcd;
    }
    .total-amount-glow {
      font-size: 1.3rem;
      font-weight: 900;
      color: #faedcd;
      text-shadow: 0 0 10px rgba(212, 163, 115, 0.3);
    }
  }
}

/* ── Payment Section ── */
.payment-section-box {
  margin-bottom: 12px;

  .section-title {
    display: block;
    font-size: 0.78rem;
    font-weight: 700;
    color: #d4a373;
    margin-bottom: 6px;
  }
}

.payment-tiles-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.pay-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 163, 115, 0.25);
  border-radius: 10px;
  color: #f7ede2;
  cursor: pointer;
  transition: all 0.15s ease;

  .tile-icon {
    font-size: 1.2rem;
    margin-bottom: 2px;
  }
  .tile-title {
    font-size: 0.72rem;
    font-weight: 700;
    color: #d4a373;
  }

  &:hover {
    background: rgba(212, 163, 115, 0.15);
    border-color: #d4a373;
  }

  &.selected {
    background: linear-gradient(135deg, rgba(212, 163, 115, 0.25) 0%, rgba(140, 83, 43, 0.25) 100%);
    border-color: #d4a373;
    box-shadow: 0 0 10px rgba(212, 163, 115, 0.2);

    .tile-title {
      color: #faedcd;
      font-weight: 800;
    }
  }
}

/* ── Cash Calculator ── */
.cash-calc-box {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 12px;

  .calc-header {
    margin-bottom: 6px;
    .calc-title {
      font-size: 0.74rem;
      font-weight: 700;
      color: #d4a373;
    }
  }
}

.preset-bills-row {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  flex-wrap: wrap;

  .bill-chip {
    padding: 5px 8px;
    background: rgba(212, 163, 115, 0.1);
    border: 1px solid rgba(212, 163, 115, 0.25);
    border-radius: 6px;
    color: #faedcd;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;

    &:hover,
    &.active {
      background: #d4a373;
      color: #140d08;
    }

    &.exact {
      background: rgba(34, 197, 94, 0.15);
      border-color: rgba(34, 197, 94, 0.4);
      color: #86efac;

      &:hover {
        background: #22c55e;
        color: #fff;
      }
    }
  }
}

.received-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  label {
    font-size: 0.78rem;
    color: #d4a373;
  }

  .received-input-wrap {
    position: relative;
    width: 120px;

    .received-input {
      width: 100%;
      padding: 6px 26px 6px 8px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(212, 163, 115, 0.3);
      border-radius: 6px;
      color: #faedcd;
      font-size: 0.88rem;
      font-weight: 800;
      text-align: center;
    }

    .curr-tag {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.7rem;
      color: #d4a373;
    }
  }
}

.change-statement-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(212, 163, 115, 0.2);
  font-size: 0.85rem;

  .change-label {
    color: #d4a373;
  }
  .change-val {
    font-size: 1.05rem;
    font-weight: 900;
    color: #86efac;
  }

  &.has-shortage .change-val {
    color: #fca5a5;
  }
}

/* ── Printer & Actions ── */
.printer-settings-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 0.76rem;
  color: #a89f91;

  .auto-print-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .btn-reprint-link {
    background: none;
    border: none;
    color: #d4a373;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.74rem;
  }
}

.checkout-final-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-finalize-submit {
  width: 100%;
  padding: 12px 16px;
  background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
  border: 1px solid #faedcd;
  border-radius: 12px;
  color: #140d08;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(212, 163, 115, 0.35);
  transition: all 0.2s ease;

  .btn-icon {
    font-size: 1.4rem;
  }

  .btn-text-col {
    display: flex;
    flex-direction: column;
    text-align: right;
  }

  .btn-title {
    font-size: 0.96rem;
    font-weight: 900;
  }
  .btn-sub {
    font-size: 0.72rem;
    opacity: 0.85;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(212, 163, 115, 0.5);
  }
}

.drawer-secondary-actions {
  display: flex;
  gap: 6px;

  .btn-drawer-hold,
  .btn-drawer-clear {
    flex: 1;
    padding: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    color: #d4a373;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #faedcd;
    }
  }

  .btn-drawer-clear:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.3);
  }
}

/* ── Numpad Modal ── */
.numpad-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.numpad-modal-card {
  width: 100%;
  max-width: 360px;
  background: #1b120c;
  border: 1px solid #d4a373;
  border-radius: 16px;
  padding: 16px;
}

.numpad-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;

  .numpad-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;

    h4 {
      margin: 0;
      color: #faedcd;
      font-size: 1rem;
    }
    .numpad-prod-name {
      margin: 0;
      font-size: 0.75rem;
      color: #d4a373;
    }
  }

  .close-numpad-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 1.1rem;
    cursor: pointer;
  }
}

.numpad-display-screen {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 10px;

  .display-val-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;

    .display-qty {
      font-size: 1.5rem;
      font-weight: 900;
      color: #fff;
    }
    .display-unit {
      color: #d4a373;
      font-size: 0.85rem;
    }
  }

  .display-helper-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.74rem;
    color: #a89f91;
    margin-top: 4px;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
    padding-top: 4px;
  }
}

.numpad-presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 10px;

  .preset-btn {
    padding: 6px 2px;
    background: rgba(212, 163, 115, 0.1);
    border: 1px solid rgba(212, 163, 115, 0.25);
    border-radius: 6px;
    color: #faedcd;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;

    &.highlight {
      background: rgba(212, 163, 115, 0.25);
      border-color: #d4a373;
    }

    &:hover {
      background: #d4a373;
      color: #140d08;
    }
  }
}

.numpad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 12px;

  .num-key {
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(212, 163, 115, 0.2);
    border-radius: 8px;
    color: #faedcd;
    font-size: 1.15rem;
    font-weight: 800;
    cursor: pointer;

    &:hover {
      background: rgba(212, 163, 115, 0.2);
    }

    &.clear-key {
      color: #f87171;
    }
    &.backspace-key {
      color: #fde047;
    }
  }
}

.numpad-actions {
  display: flex;
  gap: 8px;

  .confirm-btn {
    flex: 1;
    background: #d4a373;
    color: #140d08;
    font-weight: 800;
  }
}
</style>
