<template>
  <div class="pos-receipt-container">
    <!-- ═══════════════════ RECEIPT HEADER ═══════════════════ -->
    <header class="receipt-header">
      <div class="header-main-info">
        <div class="receipt-brand-badge">
          <AppIcon name="receipt" :size="20" />
        </div>
        <div class="header-text">
          <div class="title-with-badge">
            <h3>فاتورة الطلب</h3>
            <span class="live-clock">{{ currentTime }}</span>
          </div>
          <span class="invoice-subtitle">نقطة بيع بن العجوز</span>
        </div>
      </div>

      <div class="header-actions">
        <span v-if="cartStore.items.length" class="items-count-tag">
          {{ cartStore.itemsCount }} عنصر
        </span>
        <button
          v-if="cartStore.items.length"
          type="button"
          class="btn-clear-all"
          @click="confirmClearCart"
          title="إفراغ السلة بالكامل"
        >
          <AppIcon name="trash2" :size="15" />
          <span>مسح</span>
        </button>
      </div>
    </header>

    <!-- ═══════════════════ ORDER TYPE TOGGLE ═══════════════════ -->
    <div class="order-type-tabs">
      <button
        type="button"
        class="type-tab"
        :class="{ active: orderType === 'takeaway' }"
        @click="orderType = 'takeaway'"
      >
        <AppIcon name="shoppingBag" :size="15" />
        <span>تيك أواي</span>
      </button>

      <button
        type="button"
        class="type-tab"
        :class="{ active: orderType === 'dinein' }"
        @click="orderType = 'dinein'"
      >
        <AppIcon name="coffee" :size="15" />
        <span>صالة</span>
      </button>

      <button
        type="button"
        class="type-tab"
        :class="{ active: orderType === 'delivery' }"
        @click="orderType = 'delivery'"
      >
        <AppIcon name="truck" :size="15" />
        <span>توصيل</span>
      </button>
    </div>

    <!-- ═══════════════════ RECEIPT ITEMS LIST ═══════════════════ -->
    <div class="receipt-body">
      <!-- Empty State -->
      <div v-if="!cartStore.items.length" class="receipt-empty-view">
        <div class="empty-receipt-graphic">
          <AppIcon name="coffee" :size="38" />
        </div>
        <h4 class="empty-title">الفاتورة فارغة</h4>
        <p class="empty-desc">اضغط على أي صنف من القائمة لإضافته للطلب</p>
        <div class="empty-tip-pill">
          <AppIcon name="zap" :size="13" />
          <span>استخدم قارئ الباركود أو مفتاح F2 للبحث</span>
        </div>
      </div>

      <!-- Items List -->
      <div v-else class="receipt-items-scroll">
        <div
          v-for="(item, idx) in cartStore.items"
          :key="item.id"
          class="receipt-item-card"
        >
          <!-- Item Top Line: Index + Name + Remove -->
          <div class="item-card-top">
            <div class="item-title-wrap">
              <span class="item-index-badge">{{ idx + 1 }}</span>
              <strong class="item-name">{{ item.name_ar }}</strong>
            </div>

            <button
              type="button"
              class="btn-delete-item"
              @click="cartStore.removeItem(idx)"
              title="حذف الصنف"
            >
              <AppIcon name="close" :size="13" />
            </button>
          </div>

          <!-- Custom Specs Tag (if custom coffee) -->
          <div v-if="item.custom_notes" class="item-custom-tags">
            <span class="custom-note-chip">
              <AppIcon name="sparkles" :size="12" />
              <span>{{ item.custom_notes }}</span>
            </span>
          </div>

          <!-- Item Bottom Line: Stepper + Price Breakdown -->
          <div class="item-card-bottom">
            <div class="unit-price-label">
              <span>{{ formatMoney(item.unit_price) }}</span>
              <small>/ {{ item.unit }}</small>
            </div>

            <!-- Touch Stepper -->
            <div class="item-stepper">
              <button
                type="button"
                class="step-btn minus"
                @click="cartStore.updateQty(idx, item.quantity - 1)"
                title="تقليل الكمية"
              >
                -
              </button>
              <span class="step-qty">{{ item.quantity }}</span>
              <button
                type="button"
                class="step-btn plus"
                @click="cartStore.updateQty(idx, item.quantity + 1)"
                title="زيادة الكمية"
              >
                +
              </button>
            </div>

            <!-- Total Price for row -->
            <div class="item-total-price">
              <span>{{ formatMoney(item.unit_price * item.quantity) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ RECEIPT FOOTER / BILLING ═══════════════════ -->
    <footer class="receipt-footer">
      <!-- Perforated Zigzag Divider -->
      <div class="receipt-perforation"></div>

      <!-- Financial Calculation Summary -->
      <div class="billing-summary-box">
        <div class="summary-line">
          <span class="line-label">المجموع الفرعي:</span>
          <span class="line-val subtotal">{{ formatMoney(cartStore.subtotal) }}</span>
        </div>

        <!-- Quick Discount Section -->
        <div class="summary-line discount-line">
          <div class="discount-label-group">
            <span class="line-label">الخصم:</span>
            <div class="discount-quick-pills">
              <button
                type="button"
                class="disc-pill"
                :class="{ active: cartStore.discountAmount === 0 }"
                @click="applyPercentDiscount(0)"
              >
                0%
              </button>
              <button
                type="button"
                class="disc-pill"
                @click="applyPercentDiscount(5)"
              >
                5%
              </button>
              <button
                type="button"
                class="disc-pill"
                @click="applyPercentDiscount(10)"
              >
                10%
              </button>
              <button
                type="button"
                class="disc-pill"
                @click="applyPercentDiscount(15)"
              >
                15%
              </button>
              <button
                type="button"
                class="disc-pill"
                @click="applyPercentDiscount(20)"
              >
                20%
              </button>
              <button
                type="button"
                class="disc-pill"
                @click="applyPercentDiscount(25)"
              >
                25%
              </button>
              <button
                type="button"
                class="disc-pill"
                @click="applyPercentDiscount(30)"
              >
                30%
              </button>
            </div>
          </div>

          <div class="discount-input-wrap">
            <input
              v-model.number="cartStore.discountAmount"
              type="number"
              min="0"
              :max="cartStore.subtotal"
              class="disc-input"
              placeholder="0"
            />
            <span class="input-curr">ج.م</span>
          </div>
        </div>

        <!-- Grand Total Highlight Card -->
        <div class="grand-total-banner">
          <div class="total-caption">
            <span class="caption-title">الإجمالي النهائي</span>
            <span class="caption-sub">شامل الضريبة والخصومات</span>
          </div>
          <div class="total-figure">
            <span class="figure-digits">{{ formatMoney(cartStore.total) }}</span>
          </div>
        </div>
      </div>

      <!-- Payment Method Switcher -->
      <div class="payment-method-selector">
        <button
          type="button"
          class="pay-btn"
          :class="{ active: cartStore.paymentMethod === 'cash' }"
          @click="cartStore.paymentMethod = 'cash'"
        >
          <div class="btn-icon-wrap cash"><AppIcon name="banknote" :size="16" /></div>
          <span>نقدي</span>
        </button>

        <button
          type="button"
          class="pay-btn"
          :class="{ active: cartStore.paymentMethod === 'card' }"
          @click="cartStore.paymentMethod = 'card'"
        >
          <div class="btn-icon-wrap card"><AppIcon name="creditCard" :size="16" /></div>
          <span>بطاقة</span>
        </button>

        <button
          type="button"
          class="pay-btn"
          :class="{ active: cartStore.paymentMethod === 'instapay' }"
          @click="cartStore.paymentMethod = 'instapay'"
        >
          <div class="btn-icon-wrap instapay"><AppIcon name="zap" :size="16" /></div>
          <span>إنستاباي</span>
        </button>

        <button
          type="button"
          class="pay-btn"
          :class="{ active: cartStore.paymentMethod === 'credit' }"
          @click="cartStore.paymentMethod = 'credit'"
        >
          <div class="btn-icon-wrap credit"><AppIcon name="receipt" :size="16" /></div>
          <span>آجل</span>
        </button>
      </div>

      <!-- Cash Change Calculator (When Cash is selected) -->
      <div v-if="cartStore.paymentMethod === 'cash' && cartStore.total > 0" class="cash-change-calculator">
        <div class="cash-calc-row">
          <div class="received-input-group">
            <label>المبلغ المستلم من العميل:</label>
            <input
              v-model.number="cashGiven"
              type="number"
              class="cash-given-input"
              :placeholder="String(cartStore.total)"
            />
          </div>

          <div class="change-due-group" :class="{ 'has-change': changeDue > 0 }">
            <label>المتبقي للعميل (الباقي):</label>
            <strong class="change-val">{{ formatMoney(changeDue) }}</strong>
          </div>
        </div>

        <!-- Quick Cash Presets -->
        <div class="cash-presets-row">
          <button type="button" class="preset-btn" @click="setCashGiven(cartStore.total)">بالضبط</button>
          <button type="button" class="preset-btn" @click="setCashGiven(roundUpToNext(cartStore.total, 50))">
            {{ roundUpToNext(cartStore.total, 50) }} ج.م
          </button>
          <button type="button" class="preset-btn" @click="setCashGiven(roundUpToNext(cartStore.total, 100))">
            {{ roundUpToNext(cartStore.total, 100) }} ج.م
          </button>
          <button type="button" class="preset-btn" @click="setCashGiven(roundUpToNext(cartStore.total, 200))">
            {{ roundUpToNext(cartStore.total, 200) }} ج.م
          </button>
        </div>
      </div>

      <!-- Quick Hardware Action Buttons -->
      <div class="hardware-actions-grid">
        <button
          type="button"
          class="btn-hardware drawer"
          @click="emit('openDrawer')"
          title="فتح درج النقدية يدويًا (F9)"
        >
          <AppIcon name="key" :size="15" />
          <span>فتح الدرج (F9)</span>
        </button>

        <button
          type="button"
          class="btn-hardware hold"
          :disabled="!cartStore.items.length"
          @click="emit('holdOrder')"
          title="تعليق الفاتورة للرجوع إليها لاحقاً"
        >
          <AppIcon name="clock" :size="15" />
          <span>تعليق الطلب</span>
        </button>
      </div>

      <!-- BIG CHECKOUT & PRINT BUTTON -->
      <button
        type="button"
        class="btn-checkout-master"
        :disabled="!cartStore.items.length || submitting"
        @click="emit('completeSale', { cashGiven, changeDue })"
      >
        <div class="checkout-content">
          <span v-if="submitting" class="checkout-spinner"></span>
          <AppIcon v-else name="check" :size="22" />
          <div class="btn-labels">
            <strong class="main-label">
              {{ submitting ? 'جاري الحفظ وإرسال أمر الطباعة...' : 'إتمام الدفع وطباعة الفاتورة' }}
            </strong>
            <small class="sub-label">اضغط Enter أو F10 للإنهاء الفوري</small>
          </div>
        </div>
        <div class="checkout-badge">
          {{ formatMoney(cartStore.total) }}
        </div>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import AppIcon from './AppIcon.vue';
import { usePosCartStore } from '../stores/posCart';
import { formatMoney } from '../utils/currency';

defineProps<{
  submitting?: boolean;
}>();

const emit = defineEmits<{
  completeSale: [payload: { cashGiven: number | null; changeDue: number }];
  openDrawer: [];
  holdOrder: [];
}>();

const cartStore = usePosCartStore();

const orderType = ref<'takeaway' | 'dinein' | 'delivery'>('takeaway');
const cashGiven = ref<number | null>(null);
const currentTime = ref('');

let timerInterval: any = null;

const updateTime = () => {
  currentTime.value = new Date().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

onMounted(() => {
  updateTime();
  timerInterval = setInterval(updateTime, 1000);
});

onBeforeUnmount(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const changeDue = computed(() => {
  if (!cashGiven.value || cashGiven.value <= cartStore.total) return 0;
  return Math.round((cashGiven.value - cartStore.total) * 100) / 100;
});

const setCashGiven = (val: number) => {
  cashGiven.value = val;
};

const roundUpToNext = (amount: number, step: number) => {
  if (amount <= 0) return step;
  return Math.ceil(amount / step) * step;
};

const applyPercentDiscount = (percent: number) => {
  if (percent <= 0) {
    cartStore.discountAmount = 0;
  } else {
    cartStore.discountAmount = Math.round(((cartStore.subtotal * percent) / 100) * 100) / 100;
  }
};

const confirmClearCart = () => {
  if (confirm('هل أنت متأكد من إفراغ سلة الطلب الحالية؟')) {
    cartStore.clearCart();
    cashGiven.value = null;
  }
};
</script>

<style lang="scss" scoped>
.pos-receipt-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface, #ffffff);
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-md, 0 4px 12px rgba(41, 37, 36, 0.06));
  overflow: hidden;
  position: relative;
}

/* ═══════════════════ HEADER ═══════════════════ */
.receipt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #ffffff;
  border-bottom: 1.5px solid var(--border-soft, #f0ebe1);

  .header-main-info {
    display: flex;
    align-items: center;
    gap: 10px;

    .receipt-brand-badge {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-md, 10px);
      background: var(--primary-soft, rgba(138, 87, 42, 0.08));
      color: var(--primary, #8a572a);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.2));
    }

    .header-text {
      display: flex;
      flex-direction: column;
      gap: 1px;

      .title-with-badge {
        display: flex;
        align-items: center;
        gap: 8px;

        h3 {
          font-size: 1.1rem;
          font-weight: 900;
          color: var(--text-strong, #0c0a09);
          margin: 0;
        }

        .live-clock {
          font-size: 0.72rem;
          font-weight: 750;
          color: var(--text-muted, #78716c);
          background: var(--bg-soft, #fbf9f6);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid var(--border-soft, #f0ebe1);
        }
      }

      .invoice-subtitle {
        font-size: 0.76rem;
        color: var(--primary, #8a572a);
        font-weight: 700;
      }
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;

    .items-count-tag {
      font-size: 0.76rem;
      font-weight: 800;
      background: #f4efe6;
      color: var(--primary, #8a572a);
      padding: 3px 9px;
      border-radius: 12px;
      border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.2));
    }

    .btn-clear-all {
      display: flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted, #78716c);
      padding: 4px 8px;
      border-radius: var(--radius-sm, 6px);
      font-size: 0.76rem;
      font-weight: 750;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--danger-soft, rgba(220, 38, 38, 0.1));
        color: var(--danger, #dc2626);
        border-color: var(--danger-border, rgba(220, 38, 38, 0.25));
      }
    }
  }
}

/* ═══════════════════ ORDER TYPE TABS ═══════════════════ */
.order-type-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-soft, #fbf9f6);
  border-bottom: 1px solid var(--border-soft, #f0ebe1);

  .type-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    background: #ffffff;
    border: 1px solid var(--border-soft, #e7e2d9);
    border-radius: var(--radius-sm, 6px);
    font-size: 0.78rem;
    font-weight: 750;
    color: var(--text-muted, #78716c);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      color: var(--text-strong, #0c0a09);
      border-color: var(--primary, #8a572a);
    }

    &.active {
      background: var(--primary, #8a572a);
      color: #ffffff;
      border-color: var(--primary, #8a572a);
      box-shadow: 0 2px 6px rgba(138, 87, 42, 0.2);
    }
  }
}

/* ═══════════════════ RECEIPT BODY & ITEMS ═══════════════════ */
.receipt-body {
  flex: 1;
  overflow-y: auto;
  min-height: 180px;
  padding: 12px;
  background: #fdfcfb;
}

.receipt-empty-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px 16px;

  .empty-receipt-graphic {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: #f5f0e8;
    color: var(--primary, #8a572a);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    border: 1.5px dashed var(--primary-border, rgba(138, 87, 42, 0.3));
  }

  .empty-title {
    font-size: 1.05rem;
    font-weight: 850;
    color: var(--text-main, #292524);
    margin: 0 0 4px;
  }

  .empty-desc {
    font-size: 0.82rem;
    color: var(--text-muted, #78716c);
    margin: 0 0 16px;
  }

  .empty-tip-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ffffff;
    border: 1px solid var(--border, #e7e2d9);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 750;
    color: var(--primary, #8a572a);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.04));
  }
}

.receipt-items-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.receipt-item-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: #ffffff;
  border: 1.5px solid var(--border-soft, #f0ebe1);
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  transition: all 0.18s ease;

  &:hover {
    border-color: var(--primary-border, rgba(138, 87, 42, 0.4));
    box-shadow: 0 3px 8px rgba(138, 87, 42, 0.07);
  }

  .item-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .item-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;

      .item-index-badge {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #f4efe6;
        color: var(--primary, #8a572a);
        font-size: 0.72rem;
        font-weight: 850;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .item-name {
        font-size: 0.95rem;
        font-weight: 850;
        color: var(--text-strong, #0c0a09);
      }
    }

    .btn-delete-item {
      background: transparent;
      border: none;
      color: var(--text-subtle, #a8a29e);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;

      &:hover {
        background: var(--danger-soft, rgba(220, 38, 38, 0.1));
        color: var(--danger, #dc2626);
      }
    }
  }

  .item-custom-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding-right: 28px;

    .custom-note-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.74rem;
      font-weight: 750;
      color: var(--primary, #8a572a);
      background: var(--primary-soft, rgba(138, 87, 42, 0.08));
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.15));
    }
  }

  .item-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px dashed var(--border-soft, #f0ebe1);

    .unit-price-label {
      font-size: 0.78rem;
      font-weight: 750;
      color: var(--text-muted, #78716c);
      min-width: 75px;

      small {
        font-size: 0.7rem;
      }
    }

    .item-stepper {
      display: flex;
      align-items: center;
      background: #fbf9f6;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: var(--radius-sm, 6px);
      overflow: hidden;

      .step-btn {
        width: 30px;
        height: 28px;
        background: #ffffff;
        border: none;
        font-size: 1rem;
        font-weight: 850;
        color: var(--text-main, #292524);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s ease;

        &:hover {
          background: var(--primary, #8a572a);
          color: #ffffff;
        }

        &.minus:hover {
          background: var(--danger, #dc2626);
        }
      }

      .step-qty {
        min-width: 32px;
        text-align: center;
        font-size: 0.92rem;
        font-weight: 900;
        color: var(--text-strong, #0c0a09);
      }
    }

    .item-total-price {
      font-size: 1rem;
      font-weight: 900;
      color: var(--text-strong, #0c0a09);
      text-align: left;
      min-width: 80px;
    }
  }
}

/* ═══════════════════ RECEIPT FOOTER / TOTALS ═══════════════════ */
.receipt-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  background: #ffffff;
  border-top: 1.5px solid var(--border-soft, #f0ebe1);
  box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.03);
}

.billing-summary-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--bg-soft, #fbf9f6);
  border: 1px solid var(--border, #e7e2d9);
  border-radius: var(--radius-md, 10px);
  padding: 10px 12px;

  .summary-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.88rem;

    .line-label {
      color: var(--text-muted, #78716c);
      font-weight: 750;
    }

    .line-val {
      font-weight: 850;
      color: var(--text-strong, #0c0a09);
    }

    &.discount-line {
      .discount-label-group {
        display: flex;
        align-items: center;
        gap: 8px;

        .discount-quick-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;

          .disc-pill {
            background: #ffffff;
            border: 1px solid var(--border, #e7e2d9);
            border-radius: 4px;
            padding: 1px 6px;
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--text-muted, #78716c);
            cursor: pointer;

            &:hover,
            &.active {
              background: var(--primary, #8a572a);
              color: #ffffff;
              border-color: var(--primary, #8a572a);
            }
          }
        }
      }

      .discount-input-wrap {
        position: relative;
        display: flex;
        align-items: center;

        .disc-input {
          width: 76px;
          height: 28px;
          padding: 0 24px 0 6px;
          border: 1px solid var(--border, #e7e2d9);
          border-radius: 4px;
          background: #ffffff;
          text-align: right;
          font-weight: 850;
          font-size: 0.85rem;
          color: var(--danger, #dc2626);

          &:focus {
            outline: none;
            border-color: var(--primary, #8a572a);
          }
        }

        .input-curr {
          position: absolute;
          left: 6px;
          font-size: 0.68rem;
          color: var(--text-subtle, #a8a29e);
          pointer-events: none;
        }
      }
    }
  }

  .grand-total-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(135deg, #f7f1e6 0%, #faebd7 100%);
    border: 1.5px solid var(--primary-border, rgba(138, 87, 42, 0.3));
    border-radius: var(--radius-sm, 8px);
    padding: 8px 12px;
    margin-top: 2px;

    .total-caption {
      display: flex;
      flex-direction: column;

      .caption-title {
        font-size: 0.95rem;
        font-weight: 900;
        color: var(--primary, #8a572a);
      }

      .caption-sub {
        font-size: 0.68rem;
        font-weight: 700;
        color: var(--text-muted, #78716c);
      }
    }

    .total-figure {
      .figure-digits {
        font-size: 1.45rem;
        font-weight: 950;
        color: var(--primary, #8a572a);
        letter-spacing: -0.5px;
      }
    }
  }
}

/* ═══════════════════ PAYMENT SELECTOR ═══════════════════ */
.payment-method-selector {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;

  .pay-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 46px;
    background: #ffffff;
    border: 1.5px solid var(--border, #e7e2d9);
    border-radius: var(--radius-sm, 8px);
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--text-main, #292524);
    cursor: pointer;
    transition: all 0.15s ease;

    .btn-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted, #78716c);
    }

    &:hover {
      border-color: var(--primary, #8a572a);
      background: var(--bg-soft, #fbf9f6);
    }

    &.active {
      background: #fdfaf5;
      border-color: var(--primary, #8a572a);
      color: var(--primary, #8a572a);
      box-shadow: 0 2px 8px rgba(138, 87, 42, 0.15);

      .btn-icon-wrap {
        color: var(--primary, #8a572a);
      }
    }
  }
}

/* ═══════════════════ CASH CHANGE CALCULATOR ═══════════════════ */
.cash-change-calculator {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fcfbf9;
  border: 1px dashed var(--border-strong, #d6cebf);
  border-radius: var(--radius-sm, 8px);
  padding: 8px 10px;

  .cash-calc-row {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 8px;

    .received-input-group,
    .change-due-group {
      display: flex;
      flex-direction: column;
      gap: 2px;

      label {
        font-size: 0.7rem;
        font-weight: 750;
        color: var(--text-muted, #78716c);
      }
    }

    .cash-given-input {
      height: 32px;
      padding: 0 8px;
      border: 1.5px solid var(--primary-border, rgba(138, 87, 42, 0.3));
      border-radius: 6px;
      background: #ffffff;
      font-size: 0.95rem;
      font-weight: 850;
      color: var(--text-strong, #0c0a09);

      &:focus {
        outline: none;
        border-color: var(--primary, #8a572a);
      }
    }

    .change-due-group {
      text-align: left;

      .change-val {
        font-size: 1.05rem;
        font-weight: 900;
        color: var(--text-muted, #78716c);
        line-height: 32px;
      }

      &.has-change .change-val {
        color: var(--success, #16a34a);
      }
    }
  }

  .cash-presets-row {
    display: flex;
    gap: 4px;

    .preset-btn {
      flex: 1;
      height: 24px;
      background: #ffffff;
      border: 1px solid var(--border, #e7e2d9);
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--text-muted, #78716c);
      cursor: pointer;

      &:hover {
        background: #f4efe6;
        color: var(--primary, #8a572a);
        border-color: var(--primary-border, rgba(138, 87, 42, 0.3));
      }
    }
  }
}

/* ═══════════════════ HARDWARE QUICK ACTIONS ═══════════════════ */
.hardware-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;

  .btn-hardware {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    background: #ffffff;
    border: 1px solid var(--border, #e7e2d9);
    border-radius: var(--radius-sm, 6px);
    font-size: 0.78rem;
    font-weight: 750;
    color: var(--text-muted, #78716c);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: var(--bg-soft, #fbf9f6);
      color: var(--text-strong, #0c0a09);
      border-color: var(--primary, #8a572a);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

/* ═══════════════════ BIG MASTER CHECKOUT BUTTON ═══════════════════ */
.btn-checkout-master {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background: linear-gradient(135deg, #8a572a 0%, #6e411b 100%);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md, 10px);
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(138, 87, 42, 0.35);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(138, 87, 42, 0.45);
    background: linear-gradient(135deg, #9b6330 0%, #7d4a20 100%);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .checkout-content {
    display: flex;
    align-items: center;
    gap: 10px;

    .btn-labels {
      display: flex;
      flex-direction: column;
      text-align: right;

      .main-label {
        font-size: 1.05rem;
        font-weight: 900;
        line-height: 1.2;
      }

      .sub-label {
        font-size: 0.7rem;
        opacity: 0.85;
        font-weight: 600;
      }
    }
  }

  .checkout-badge {
    background: rgba(255, 255, 255, 0.22);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 1.15rem;
    font-weight: 950;
    letter-spacing: -0.3px;
  }
}

/* Touch-first receipt controls: the cashier should not need pixel-perfect taps. */
.order-type-tabs {
  gap: 8px;
  padding: 10px 14px;

  .type-tab {
    min-height: 52px;
    height: auto;
    padding-inline: 8px;
    font-size: 0.9rem;
    touch-action: manipulation;
  }
}

.receipt-item-card {
  padding: 14px 16px;
  gap: 9px;

  .item-card-top .btn-delete-item {
    width: 44px;
    height: 44px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    touch-action: manipulation;
  }

  .item-card-bottom .item-stepper {
    border-radius: 10px;

    .step-btn {
      width: 48px;
      height: 48px;
      font-size: 1.35rem;
      touch-action: manipulation;
    }

    .step-qty {
      min-width: 44px;
      font-size: 1.05rem;
    }
  }
}

.btn-checkout-master {
  height: 64px;
  touch-action: manipulation;
}
</style>
