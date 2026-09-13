<template>
  <div class="pos-shift-close-page">
    <div class="close-card">
      <div class="card-header">
        <div class="header-icon-badge">
          <AppIcon name="receipt" :size="32" />
        </div>
        <h2>إغلاق الوردية ومطابقة النقدية (Z-Report)</h2>
        <p>الوردية رقم: <strong>{{ shiftStore.currentShift?.shift_number }}</strong></p>
      </div>

      <!-- Financial Reconciliation Summary -->
      <div class="reconciliation-summary">
        <div class="summary-row">
          <span>الرصيد الافتتاحي (عهدة البداية):</span>
          <strong>{{ formatMoney(shiftStore.currentShift?.opening_cash || 0) }}</strong>
        </div>

        <div class="summary-row">
          <span>إجمالي مبيعات الكاش النقدية:</span>
          <strong class="positive">+ {{ formatMoney(shiftStore.currentShift?.total_cash_sales || 0) }}</strong>
        </div>

        <div class="summary-row">
          <span>إجمالي الإيداعات النقدية:</span>
          <strong class="positive">+ {{ formatMoney(shiftStore.currentShift?.total_deposits || 0) }}</strong>
        </div>

        <div class="summary-row">
          <span>إجمالي المسحوبات / التوريد:</span>
          <strong class="negative">- {{ formatMoney(shiftStore.currentShift?.total_withdrawals || 0) }}</strong>
        </div>

        <div class="summary-row total-expected-row">
          <span>النقدية المتوقعة بالدرج (Expected Cash):</span>
          <strong class="expected-val">{{ formatMoney(shiftStore.currentShift?.expected_cash || 0) }}</strong>
        </div>
      </div>

      <!-- Actual Cash Input Form -->
      <form class="close-form" @submit.prevent="handleCloseShift">
        <div class="form-group">
          <label>النقدية الفعلية بعد الجرد بالدرج (Actual Cash Count)</label>
          <div class="money-input-wrapper">
            <input
              v-model.number="actualCash"
              type="number"
              min="0"
              step="any"
              required
              placeholder="0.00"
              class="money-input"
              autofocus
            />
            <span class="currency-label">ج.م</span>
          </div>
        </div>

        <!-- Realtime Difference Badge -->
        <div class="difference-banner" :class="diffClass">
          <div class="diff-title">
            <AppIcon :name="diffIcon" :size="16" />
            <span>{{ diffText }}</span>
          </div>
          <strong class="diff-amount">{{ formatMoney(Math.abs(cashDifference)) }}</strong>
        </div>

        <div class="form-group">
          <label>ملاحظات الإغلاق (اختياري)</label>
          <input
            v-model="notes"
            type="text"
            placeholder="سبب العجز أو الزيادة إن وجد..."
            class="pos-input"
          />
        </div>

        <div class="actions-grid">
          <button
            type="button"
            class="btn-cancel"
            @click="router.push('/sales')"
          >
            الرجوع لشاشة البيع
          </button>

          <button
            type="submit"
            class="btn-confirm-close"
            :disabled="shiftStore.loading"
          >
            <span v-if="shiftStore.loading">جاري الإغلاق...</span>
            <span v-else>اعتماد الإغلاق وطباعة Z-Report</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { usePosShiftStore } from '../stores/posShift';
import { formatMoney } from '../utils/currency';

const router = useRouter();
const shiftStore = usePosShiftStore();

const actualCash = ref<number>(0);
const notes = ref<string>('');

const expectedCash = computed(() => Number(shiftStore.currentShift?.expected_cash || 0));
const cashDifference = computed(() => Number(actualCash.value) - expectedCash.value);

const diffClass = computed(() => {
  if (cashDifference.value === 0) return 'match';
  return cashDifference.value > 0 ? 'over' : 'short';
});

const diffIcon = computed(() => {
  if (cashDifference.value === 0) return 'check';
  return cashDifference.value > 0 ? 'trendingUp' : 'alertTriangle';
});

const diffText = computed(() => {
  if (cashDifference.value === 0) return 'مطابقة تامة (لا يوجد عجز أو زيادة)';
  return cashDifference.value > 0 ? 'فائض نقدي بالدرج (Over)' : 'عجز نقدي بالدرج (Short)';
});

onMounted(async () => {
  await shiftStore.fetchCurrentShift();
  if (shiftStore.currentShift) {
    actualCash.value = Number(shiftStore.currentShift.expected_cash || 0);
  }
});

const handleCloseShift = async () => {
  if (!confirm('هل أنت متأكد من إغلاق الوردية الحالية واعتماد المبالغ؟')) return;

  try {
    await shiftStore.closeShift(actualCash.value, notes.value);
    alert('تم إغلاق الوردية بنجاح وطباعة تقرير الـ Z-Report.');
    router.push('/login');
  } catch (err: any) {
    alert('فشل إغلاق الوردية: ' + err.message);
  }
};
</script>

<style lang="scss" scoped>
.pos-shift-close-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 20%, rgba(138, 87, 42, 0.08) 0%, #f6f4f0 85%);
  padding: 20px;
}

.close-card {
  width: 100%;
  max-width: 540px;
  background: #ffffff;
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-xl, 18px);
  padding: 36px 30px;
  box-shadow: 0 12px 36px rgba(41, 37, 36, 0.08);
}

.card-header {
  text-align: center;
  margin-bottom: 22px;

  .header-icon-badge {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--primary, #8a572a);
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    box-shadow: 0 4px 14px rgba(138, 87, 42, 0.3);
  }

  h2 {
    font-size: 1.45rem;
    font-weight: 900;
    color: var(--text-strong, #0c0a09);
    margin: 0 0 4px;
  }

  p {
    font-size: 0.88rem;
    color: var(--text-muted, #78716c);
    margin: 0;
  }
}

.reconciliation-summary {
  background: var(--bg-soft, #fbf9f6);
  border: 1px solid var(--border, #e7e2d9);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;

  .summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.88rem;
    color: var(--text-main, #292524);

    .positive { color: var(--success, #16a34a); font-weight: 800; }
    .negative { color: var(--danger, #dc2626); font-weight: 800; }

    &.total-expected-row {
      border-top: 1.5px solid var(--border, #e7e2d9);
      padding-top: 10px;
      margin-top: 4px;
      font-size: 1rem;
      font-weight: 850;
      color: var(--text-strong, #0c0a09);

      .expected-val {
        color: var(--primary, #8a572a);
        font-size: 1.25rem;
        font-weight: 950;
      }
    }
  }
}

.close-form {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 0.88rem;
      font-weight: 750;
      color: var(--text-main, #292524);
    }

    .money-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;

      .money-input {
        width: 100%;
        height: 54px;
        padding: 0 54px 0 16px;
        background: #fdfaf5;
        border: 2px solid var(--primary, #8a572a);
        border-radius: 8px;
        color: var(--primary, #8a572a);
        font-size: 1.5rem;
        font-weight: 950;
        text-align: right;

        &:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(138, 87, 42, 0.2);
        }
      }

      .currency-label {
        position: absolute;
        left: 16px;
        font-size: 1rem;
        font-weight: 800;
        color: var(--text-muted, #78716c);
      }
    }

    .pos-input {
      height: 46px;
      padding: 0 14px;
      background: #ffffff;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: 8px;
      color: var(--text-strong, #0c0a09);
      font-size: 0.92rem;

      &:focus {
        border-color: var(--primary, #8a572a);
        outline: none;
      }
    }
  }

  .difference-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 800;

    .diff-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    &.match {
      background: var(--success-soft, rgba(22, 163, 74, 0.1));
      border: 1px solid var(--success-border, rgba(22, 163, 74, 0.25));
      color: var(--success, #16a34a);
    }

    &.over {
      background: var(--info-soft, rgba(2, 132, 199, 0.1));
      border: 1px solid rgba(2, 132, 199, 0.25);
      color: #0284c7;
    }

    &.short {
      background: var(--danger-soft, rgba(220, 38, 38, 0.1));
      border: 1px solid var(--danger-border, rgba(220, 38, 38, 0.25));
      color: var(--danger, #dc2626);
    }
  }

  .actions-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 10px;
    margin-top: 8px;

    .btn-cancel {
      height: 50px;
      background: #ffffff;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: 8px;
      color: var(--text-main, #292524);
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: var(--bg-soft, #fbf9f6);
        border-color: var(--primary, #8a572a);
      }
    }

    .btn-confirm-close {
      height: 50px;
      background: var(--danger, #dc2626);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-weight: 850;
      font-size: 1rem;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);
      transition: all 0.2s ease;

      &:hover:not(:disabled) {
        background: #b91c1c;
        transform: translateY(-2px);
      }
    }
  }
}
</style>
