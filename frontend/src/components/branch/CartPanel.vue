<template>
  <div class="card cart-panel" :class="{ 'mobile-hidden': activeTab !== 'cart' }">
    <div class="cart-title-row">
      <h3>🛒 سلة المبيعات</h3>
      <span v-if="cart.length" class="cart-items-count">{{ cart.length }} صنف</span>
    </div>

    <!-- Cart Items -->
    <div v-if="!cart.length" class="empty-cart">
      <span>🛒</span>
      <p>اضغط على منتج لإضافته للسلة</p>
      <span class="empty-hint">أو استخدم البحث السريع (F7)</span>
    </div>
    <div v-else class="cart-items">
      <div v-for="(item, idx) in cart" :key="item.product_id" class="cart-item">
        <div class="cart-item-info">
          <span class="cart-item-name">{{ item.name_ar }}</span>
          <span class="cart-item-price">{{ formatMoney(item.unit_price) }}</span>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" @click="emit('decreaseQty', idx)" title="تقليل الكمية">−</button>

          <!-- 🔢 زر تعديل الكمية التفاعلي لفتح لوحة الأرقام (Numpad) -->
          <button
            type="button"
            class="qty-display-btn"
            @click="openNumpad(idx)"
            title="انقر لتعديل الكمية أو الوزن بالجرام عبر لوحة الأرقام"
          >
            <span class="qty-num">{{ item.quantity }}</span>
            <span class="qty-unit">{{ getWeightLabel(item.quantity) }}</span>
            <span class="qty-edit-icon">✏️</span>
          </button>

          <button class="qty-btn" @click="emit('increaseQty', idx)" title="زيادة الكمية">+</button>
          <button
            class="remove-btn"
            @click="emit('removeFromCart', idx)"
            title="حذف الصنف من السلة"
          >
            🗑️
          </button>
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
    <div v-if="cart.length" class="cart-summary">
      <div class="summary-row">
        <span>المجموع الفرعي</span>
        <span>{{ formatMoney(cartSubtotal) }}</span>
      </div>
      <div class="summary-row discount-row">
        <span>خصم (ج.م) [F4]</span>
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
      <div class="summary-row total-row">
        <span>الإجمالي المستحق</span>
        <span class="total-amount">{{ formatMoney(cartTotal) }}</span>
      </div>
    </div>

    <!-- Sale Form & Payments -->
    <form @submit.prevent="emit('submitSale')" class="sale-form">
      <div class="form-row">
        <div class="form-group">
          <label>طريقة الدفع</label>
          <select v-model="saleForm.payment_method" class="payment-select">
            <option value="cash">💵 نقدي (كاش) [F9]</option>
            <option value="card">💳 بطاقة (فيزا / مدى) [F10]</option>
            <option value="transfer">📱 تحويل بنكي / محفظة</option>
            <option value="credit">📝 آجل / على الحساب</option>
          </select>
        </div>
        <div class="form-group">
          <label>تاريخ البيع</label>
          <input v-model="saleForm.sale_date" type="date" required class="date-input" />
        </div>
      </div>

      <!-- 💵 حاسبة الباقي وفئات النقود السريعة عند الدفع كاش -->
      <div v-if="cart.length && saleForm.payment_method === 'cash'" class="cash-calc-box">
        <div class="calc-header">
          <span class="calc-title">💵 حساب النقدية والباقي:</span>
        </div>

        <div class="preset-bills">
          <button
            type="button"
            class="bill-btn exact-bill"
            @click="receivedAmount = cartTotal"
            title="المبلغ بالضبط بدون باقي"
          >
            المبلغ بالضبط
          </button>
          <button
            v-for="preset in quickBills"
            :key="preset"
            type="button"
            class="bill-btn"
            :class="{ active: receivedAmount === preset }"
            @click="receivedAmount = preset"
          >
            {{ preset }} ج.م
          </button>
        </div>

        <div class="received-row">
          <label>المستلم من الزبون:</label>
          <div class="received-input-wrap">
            <input
              ref="receivedInputRef"
              v-model.number="receivedAmount"
              type="number"
              min="0"
              step="1"
              placeholder="0.00"
              class="received-input"
            />
            <span class="curr-tag">ج.م</span>
          </div>
        </div>

        <div
          v-if="Boolean(receivedAmount && receivedAmount > 0)"
          class="change-row"
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
      <div class="printer-settings-box">
        <div class="printer-header">
          <span>🖨️ الطباعة الحرارية المباشرة</span>
        </div>
        <div class="printer-controls">
          <div class="printer-info">
            <span class="printer-status" :class="{ configured: printerName }">
              {{ printerName ? `طابعة نشطة: ${printerName}` : 'لم يتم تحديد طابعة USB' }}
            </span>
            <button type="button" class="btn-sm btn-outline" @click="emit('selectPrinter')">
              {{ printerName ? 'تغيير' : 'تحديد طابعة' }}
            </button>
          </div>
          <div class="printer-options">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="autoPrint"
                @change="emit('update:autoPrint', ($event.target as HTMLInputElement).checked)"
              />
              <span>طباعة تلقائية عند البيع</span>
            </label>
            <button
              v-if="lastSavedSale"
              type="button"
              class="btn-sm btn-outline print-last-btn"
              @click="emit('printLast', lastSavedSale)"
              title="إعادة طباعة آخر فاتورة تم حفظها (F8)"
            >
              🖨️ إعادة طباعة (F8)
            </button>
          </div>
        </div>
      </div>

      <div v-if="saleError" class="alert alert-danger">{{ saleError }}</div>

      <!-- Action Buttons -->
      <div class="cart-action-buttons">
        <button
          v-permission="['pos.add', 'sales.add']"
          type="submit"
          class="btn btn-primary btn-submit"
          :class="{ 'btn-loading': saving }"
          :disabled="saving || !cart.length"
        >
          {{ saving ? '⏳ جاري الحفظ...' : `💾 تسجيل البيع (${formatMoney(cartTotal)})` }}
        </button>

        <div class="secondary-cart-actions">
          <!-- Hold Order Button -->
          <button
            type="button"
            class="btn btn-warning btn-hold"
            @click="emit('holdOrder')"
            :disabled="!cart.length"
            title="تعليق الطلب الحالي في قائمة الانتظار وخدمة عميل آخر (F2)"
          >
            ⏸️ تعليق (F2)
          </button>

          <!-- Clear Cart Button -->
          <button
            type="button"
            class="btn btn-outline btn-clear"
            @click="emit('clearCart')"
            :disabled="!cart.length"
            title="تفريغ السلة الحالية بالكامل"
          >
            🗑️ مسح
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
    // Avoid unrealistically long decimals
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
    // Round to max 3 decimal places (grams)
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

/** حساب فئات النقود السريعة المقترحة تلقائياً */
const quickBills = computed(() => {
  const total = Number(props.cartTotal) || 0;
  if (total <= 0) return [50, 100, 200];
  const bills = new Set<number>();

  const next50 = Math.ceil(total / 50) * 50;
  const next100 = Math.ceil(total / 100) * 100;
  const next200 = Math.ceil(total / 200) * 200;

  if (next50 > total) bills.add(next50);
  if (next100 > total) bills.add(next100);
  if (next200 > total) bills.add(next200);

  if (total < 50) bills.add(50);
  if (total < 100) bills.add(100);
  if (total < 200) bills.add(200);
  if (total < 500) bills.add(500);

  return Array.from(bills)
    .sort((a, b) => a - b)
    .slice(0, 3);
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
/* Cart Panel */
.cart-panel {
  position: sticky;
  top: 70px;
  max-height: calc(100vh - 90px);
  overflow-y: auto;
  padding: 14px;
}

.cart-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    color: var(--primary-dark);
    font-size: 1.05rem;
    font-weight: 850;
  }

  .cart-items-count {
    background: rgba(16, 185, 129, 0.1);
    color: var(--primary, #10b981);
    border: 1px solid rgba(16, 185, 129, 0.25);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.76rem;
    font-weight: 750;
  }
}

.empty-cart {
  text-align: center;
  padding: 30px 14px;
  color: var(--text-muted);

  span {
    font-size: 2.4rem;
    display: inline-block;
    margin-bottom: 6px;
    animation: cart-bounce 2.5s ease-in-out infinite;
  }

  p {
    margin: 0 0 4px 0;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .empty-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.8;
  }
}

@keyframes cart-bounce {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-6px) rotate(3deg);
  }
}

.cart-items {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.cart-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  margin-bottom: 6px;
  background: var(--bg);

  .cart-item-info {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .cart-item-name {
      font-weight: 700;
      font-size: 0.88rem;
    }
    .cart-item-price {
      color: var(--text-muted);
      font-size: 0.8rem;
    }
  }

  .cart-item-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .qty-btn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-card);
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);

    &:hover {
      background: var(--primary);
      color: #fff;
    }
  }

  /* 🔢 Interactive Quantity Button that opens Numpad */
  .qty-display-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(16, 185, 129, 0.2);
      border-color: var(--primary, #10b981);
      transform: scale(1.03);
    }

    .qty-num {
      font-weight: 850;
      font-size: 0.92rem;
      color: var(--primary, #10b981);
    }

    .qty-unit {
      font-size: 0.7rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .qty-edit-icon {
      font-size: 0.68rem;
      opacity: 0.7;
    }
  }

  .remove-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    margin-right: auto;
    opacity: 0.7;

    &:hover {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  .cart-item-total {
    font-weight: 800;
    color: var(--primary-dark);
    text-align: left;
    font-size: 0.9rem;
  }
}

/* ── Cart Summary ── */
.cart-summary {
  border-top: 2px solid var(--border);
  padding-top: 10px;
  margin-bottom: 12px;

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 0.86rem;
  }

  .discount-row .discount-input {
    width: 80px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    text-align: center;
    font-size: 0.85rem;
    background: var(--bg);
    color: var(--text);
  }

  .total-row {
    font-size: 1rem;
    font-weight: 850;
    padding-top: 6px;
    border-top: 1px dashed var(--border);
    margin-top: 4px;

    .total-amount {
      color: var(--primary, #10b981);
      font-size: 1.15rem;
    }
  }
}

/* ── Form Inputs ── */
.sale-form {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;

    label {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    select,
    input {
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--text);
      font-size: 0.85rem;
    }
  }
}

/* ── 💵 Cash Calculator Box ── */
.cash-calc-box {
  background: rgba(16, 185, 129, 0.04);
  border: 1px solid rgba(16, 185, 129, 0.18);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .calc-header {
    .calc-title {
      font-size: 0.8rem;
      font-weight: 800;
      color: var(--primary, #10b981);
    }
  }

  .preset-bills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;

    .bill-btn {
      flex: 1;
      padding: 5px 8px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 750;
      color: var(--text);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--primary);
        color: var(--primary);
      }

      &.exact-bill {
        background: rgba(16, 185, 129, 0.12);
        color: var(--primary, #10b981);
        border-color: rgba(16, 185, 129, 0.3);
      }

      &.active {
        background: var(--primary, #10b981);
        color: #ffffff;
        border-color: var(--primary);
      }
    }
  }

  .received-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;

    label {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      white-space: nowrap;
    }

    .received-input-wrap {
      position: relative;
      flex: 1;

      .received-input {
        width: 100%;
        padding: 5px 28px 5px 8px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg-card);
        color: var(--text);
        font-weight: 800;
        font-size: 0.92rem;
        text-align: left;
        direction: ltr;

        &:focus {
          border-color: var(--primary);
          outline: none;
        }
      }

      .curr-tag {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.75rem;
        color: var(--text-muted);
      }
    }
  }

  .change-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--bg-card);

    .change-label {
      font-size: 0.82rem;
      font-weight: 750;
    }

    .change-val {
      font-size: 1.05rem;
      font-weight: 900;
      direction: ltr;
    }

    &.has-change {
      border: 1px solid rgba(16, 185, 129, 0.3);
      background: rgba(16, 185, 129, 0.08);

      .change-label,
      .change-val {
        color: #10b981;
      }
    }

    &.has-shortage {
      border: 1px solid rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.08);

      .change-label,
      .change-val {
        color: #ef4444;
      }
    }
  }
}

/* ── Printer Box ── */
.printer-settings-box {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;

  .printer-header {
    font-size: 0.78rem;
    font-weight: 750;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .printer-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .printer-info {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .printer-status {
      font-size: 0.75rem;
      color: var(--text-muted);

      &.configured {
        color: var(--primary, #10b981);
        font-weight: 750;
      }
    }
  }

  .printer-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    cursor: pointer;
  }

  .print-last-btn {
    font-size: 0.74rem;
    padding: 3px 8px;
  }
}

/* ── Action Buttons ── */
.cart-action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;

  .btn-submit {
    width: 100%;
    padding: 11px;
    font-size: 0.95rem;
    font-weight: 850;
    border-radius: 10px;
  }

  .secondary-cart-actions {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 8px;

    .btn-hold {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #f59e0b;
      font-weight: 750;
      font-size: 0.82rem;
      padding: 7px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        background: #f59e0b;
        color: #ffffff;
      }
    }

    .btn-clear {
      font-size: 0.82rem;
      padding: 7px 10px;
      border-radius: 8px;
    }
  }
}

/* Recommendations */
.cart-recommendations {
  margin: 8px 0;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px dashed var(--primary);
  border-radius: 8px;

  .rec-title {
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--primary-dark);
    margin-bottom: 6px;
  }

  .rec-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rec-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;

    &:hover {
      border-color: var(--primary);
    }

    .rec-name-text {
      font-size: 0.78rem;
      font-weight: 700;
    }
    .rec-category {
      font-size: 0.68rem;
      color: var(--text-muted);
    }
    .rec-price {
      font-size: 0.76rem;
      font-weight: 750;
      color: var(--accent);
    }
  }
}

/* ── 🔢 Numpad Modal ── */
.numpad-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.numpad-modal-card {
  width: 90%;
  max-width: 420px;
  background: var(--bg-card, #1e1e2d);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.numpad-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;

  .numpad-title-wrap {
    display: flex;
    gap: 10px;
    align-items: center;

    .numpad-icon {
      font-size: 1.5rem;
    }

    h4 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 850;
      color: var(--text-strong, #ffffff);
    }

    .numpad-prod-name {
      margin: 2px 0 0 0;
      font-size: 0.84rem;
      color: var(--primary, #10b981);
      font-weight: 750;

      .unit-price-tag {
        color: var(--text-muted);
        font-size: 0.78rem;
        font-weight: 600;
      }
    }
  }

  .close-numpad-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 6px;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
    }
  }
}

.numpad-display-screen {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .display-val-row {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 8px;

    .display-qty {
      font-size: 2.2rem;
      font-weight: 900;
      color: var(--primary, #10b981);
      font-family: monospace;
      letter-spacing: 1px;
    }

    .display-unit {
      font-size: 0.95rem;
      color: var(--text-muted);
      font-weight: 700;
    }
  }

  .display-helper-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
    padding-top: 6px;
    font-size: 0.82rem;

    .weight-meaning {
      color: #f59e0b;
      font-weight: 750;
    }

    .live-calculated-total {
      color: var(--text-muted);

      strong {
        color: #ffffff;
        font-weight: 800;
      }
    }
  }
}

.numpad-presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;

  .preset-btn {
    padding: 8px 4px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: var(--text, #e2e8f0);
    font-size: 0.78rem;
    font-weight: 750;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(16, 185, 129, 0.15);
      border-color: var(--primary, #10b981);
      color: var(--primary, #10b981);
    }

    &.highlight {
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--primary, #10b981);
    }
  }
}

.numpad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  .num-key {
    height: 48px;
    background: var(--bg, #171723);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    font-size: 1.3rem;
    font-weight: 850;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.1s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(1px);
      background: var(--primary, #10b981);
      color: #ffffff;
    }

    &.clear-key {
      color: #ef4444;
      background: rgba(239, 68, 68, 0.08);
      border-color: rgba(239, 68, 68, 0.2);
    }

    &.backspace-key {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.08);
      border-color: rgba(245, 158, 11, 0.2);
    }

    &.dot-key {
      font-weight: 900;
    }
  }
}

.numpad-actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 10px;
  margin-top: 4px;

  .confirm-btn {
    padding: 12px;
    font-size: 0.95rem;
    font-weight: 850;
    border-radius: 10px;
  }
}

@media (max-width: 768px) {
  .cart-panel {
    &.mobile-hidden {
      display: none !important;
    }
  }
}
</style>
