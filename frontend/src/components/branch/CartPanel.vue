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
          <input
            v-model.number="item.quantity"
            type="number"
            min="0.1"
            step="0.1"
            class="qty-input"
            @change="emit('validateQty', idx)"
          />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

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

  .qty-input {
    width: 54px;
    text-align: center;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.85rem;
    background: var(--bg-card);
    color: var(--text);
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

@media (max-width: 768px) {
  .cart-panel {
    &.mobile-hidden {
      display: none !important;
    }
  }
}
</style>
