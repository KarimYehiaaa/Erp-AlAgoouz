<template>
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
          <button class="qty-btn" @click="emit('decreaseQty', idx)">−</button>
          <input
            v-model.number="item.quantity"
            type="number"
            min="0.1"
            step="0.1"
            class="qty-input"
            @change="emit('validateQty', idx)"
          />
          <button class="qty-btn" @click="emit('increaseQty', idx)">+</button>
          <button class="remove-btn" @click="emit('removeFromCart', idx)">🗑️</button>
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
    <form @submit.prevent="emit('submitSale')" class="sale-form">
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
        @click="emit('clearCart')"
        :disabled="!cart.length"
      >
        🗑️ مسح السلة
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * @props cart — عناصر السلة (كائنات reactable — الكميات تُعدَّل مباشرة)
 * @props saleForm — نموذج البيع (تاريخ/دفع/خصم)
 * @props recommendedItems — مقترحات Market Basket
 * @props cartSubtotal — المجموع الفرعي
 * @props cartTotal — الإجمالي بعد الخصم
 * @props saving — حالة الحفظ
 * @props saleError — رسالة خطأ البيع
 * @props autoPrint — الطباعة التلقائية (v-model)
 * @props printerName — اسم الطابعة المختارة
 * @props lastSavedSale — آخر فاتورة محفوظة
 * @props activeTab — التبويب النشط (للإخفاء على الموبايل)
 * @props formatMoney — تنسيق العملة
 * @emits increaseQty / decreaseQty / validateQty / removeFromCart
 * @emits addRecommended — إضافة مقترح
 * @emits submitSale — تسجيل البيع
 * @emits clearCart — مسح السلة
 * @emits selectPrinter — تحديد طابعة
 * @emits printLast — طباعة آخر فاتورة
 * @emits update:autoPrint — تبديل الطباعة التلقائية
 */
defineProps<{
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
  selectPrinter: [];
  printLast: [sale: any];
  'update:autoPrint': [v: boolean];
}>();
</script>

<style lang="scss" scoped>
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

@media (max-width: 768px) {
  .cart-panel {
    &.mobile-hidden {
      display: none !important;
    }
  }
}
</style>
