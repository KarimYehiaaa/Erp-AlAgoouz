<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <header class="modal-header">
        <div class="header-title-wrap">
          <div class="icon-circle">
            <AppIcon name="banknote" :size="20" />
          </div>
          <div>
            <h3>حركة نقدية بالدرج (Cash Movement)</h3>
            <p>سحب توريد للخزينة المركزية أو إيداع نقدية إضافية للوردية</p>
          </div>
        </div>
        <button type="button" class="btn-close-modal" @click="emit('close')">
          <AppIcon name="close" :size="18" />
        </button>
      </header>

      <form class="modal-body" @submit.prevent="handleSubmit">
        <!-- Movement Type Switcher -->
        <div class="movement-type-grid">
          <button
            type="button"
            class="type-btn"
            :class="{ active: movementType === 'WITHDRAWAL' }"
            @click="movementType = 'WITHDRAWAL'"
          >
            <AppIcon name="trendingUp" :size="18" />
            <span>سحب / توريد للخزينة</span>
          </button>

          <button
            type="button"
            class="type-btn"
            :class="{ active: movementType === 'DEPOSIT' }"
            @click="movementType = 'DEPOSIT'"
          >
            <AppIcon name="plus" :size="18" />
            <span>إيداع نقدية بالدرج</span>
          </button>
        </div>

        <!-- Amount Input -->
        <div class="form-group">
          <label>المبلغ المطلوب (ج.م):</label>
          <div class="amount-input-wrapper">
            <input
              v-model.number="amount"
              type="number"
              min="1"
              required
              class="amount-input"
              placeholder="0.00"
            />
            <span class="curr-tag">ج.م</span>
          </div>
        </div>

        <!-- Reason / Notes -->
        <div class="form-group">
          <label>سبب الحركة / الملاحظات:</label>
          <input
            v-model="reason"
            type="text"
            required
            class="pos-input"
            placeholder="مثال: توريد نقدية للمشرف / مصروفات ثلج / سلفة..."
          />
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn-cancel"
            @click="emit('close')"
          >
            إلغاء
          </button>

          <button
            type="submit"
            class="btn-submit"
            :disabled="submitting || amount <= 0 || !reason"
          >
            <AppIcon name="check" :size="18" />
            <span>{{ submitting ? 'جاري التسجيل...' : 'تأكيد وحفظ الحركة النقدية' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { api } from '../services/api';
import { usePosShiftStore } from '../stores/posShift';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const shiftStore = usePosShiftStore();

const movementType = ref<'WITHDRAWAL' | 'DEPOSIT'>('WITHDRAWAL');
const amount = ref<number>(0);
const reason = ref<string>('');
const submitting = ref<boolean>(false);

const handleSubmit = async () => {
  if (amount.value <= 0 || !reason.value) return;

  submitting.value = true;
  try {
    const shiftId = shiftStore.currentShift?.id;
    if (!shiftId) throw new Error('لا توجد وردية مفتوحة حالياً');

    await api.post('/pos/shifts/movements', {
      shift_id: shiftId,
      movement_type: movementType.value,
      amount: amount.value,
      reason: reason.value,
    });

    alert('تم تسجيل الحركة النقدية وتحديث رصيد الدرج بنجاح.');
    await shiftStore.fetchCurrentShift();
    emit('saved');
    emit('close');
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل تسجيل الحركة النقدية');
  } finally {
    submitting.value = false;
  }
};
</script>

<style lang="scss" scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(12, 10, 9, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 520px;
  background: #ffffff;
  border: 1.5px solid var(--border, #e7e2d9);
  border-radius: var(--radius-lg, 14px);
  box-shadow: 0 16px 40px rgba(41, 37, 36, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1.5px solid var(--border-soft, #f0ebe1);

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;

    .icon-circle {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--primary-soft, rgba(138, 87, 42, 0.08));
      color: var(--primary, #8a572a);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--primary-border, rgba(138, 87, 42, 0.2));
    }

    h3 {
      font-size: 1.15rem;
      font-weight: 900;
      color: var(--text-strong, #0c0a09);
      margin: 0 0 2px;
    }

    p {
      font-size: 0.78rem;
      color: var(--text-muted, #78716c);
      margin: 0;
    }
  }

  .btn-close-modal {
    background: transparent;
    border: none;
    color: var(--text-muted, #78716c);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;

    &:hover {
      background: var(--bg-soft, #fbf9f6);
      color: var(--text-strong, #0c0a09);
    }
  }
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.movement-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;

  .type-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 46px;
    background: var(--bg-soft, #fbf9f6);
    border: 1.5px solid var(--border, #e7e2d9);
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 850;
    color: var(--text-muted, #78716c);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--primary, #8a572a);
      color: var(--text-strong, #0c0a09);
    }

    &.active {
      background: #fdfaf5;
      border-color: var(--primary, #8a572a);
      color: var(--primary, #8a572a);
      box-shadow: 0 2px 6px rgba(138, 87, 42, 0.15);
    }
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 0.85rem;
    font-weight: 750;
    color: var(--text-main, #292524);
  }

  .amount-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;

    .amount-input {
      width: 100%;
      height: 48px;
      padding: 0 50px 0 14px;
      background: #ffffff;
      border: 1.5px solid var(--border, #e7e2d9);
      border-radius: 8px;
      font-size: 1.3rem;
      font-weight: 900;
      color: var(--text-strong, #0c0a09);
      text-align: right;

      &:focus {
        border-color: var(--primary, #8a572a);
        outline: none;
      }
    }

    .curr-tag {
      position: absolute;
      left: 14px;
      font-size: 0.9rem;
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
    font-size: 0.92rem;
    color: var(--text-strong, #0c0a09);

    &:focus {
      border-color: var(--primary, #8a572a);
      outline: none;
    }
  }
}

.modal-footer {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
  margin-top: 8px;

  .btn-cancel {
    height: 48px;
    background: #ffffff;
    border: 1.5px solid var(--border, #e7e2d9);
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--text-main, #292524);
    cursor: pointer;

    &:hover {
      background: var(--bg-soft, #fbf9f6);
    }
  }

  .btn-submit {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 48px;
    background: linear-gradient(135deg, #8a572a 0%, #6e411b 100%);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(138, 87, 42, 0.3);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #9b6330 0%, #7d4a20 100%);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
