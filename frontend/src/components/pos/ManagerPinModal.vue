<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="modal-overlay" @click.self="cancel">
        <div class="pin-modal-box">
          <div class="pin-header">
            <div class="pin-icon-wrap">
              <span class="pin-icon">🔐</span>
            </div>
            <h3>صلاحية المدير (Manager PIN)</h3>
            <p class="pin-action-desc">
              {{ actionDescription || 'هذه العملية تتطلب موافقة المدير للمتابعة' }}
            </p>
          </div>

          <!-- PIN Masked Display -->
          <div class="pin-display" :class="{ error: !!errorMessage }">
            <span
              v-for="i in 4"
              :key="i"
              class="pin-dot"
              :class="{ filled: enteredPin.length >= i }"
            ></span>
          </div>

          <div v-if="errorMessage" class="pin-error-text">⚠️ {{ errorMessage }}</div>

          <!-- Touch Numpad Grid -->
          <div class="pin-numpad">
            <button
              v-for="num in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
              :key="num"
              type="button"
              class="pin-num-btn"
              @click="appendDigit(num)"
              :disabled="loading"
            >
              {{ num }}
            </button>
            <button
              type="button"
              class="pin-num-btn pin-clear-btn"
              @click="clearPin"
              :disabled="loading"
              title="مسح الكل"
            >
              C
            </button>
            <button type="button" class="pin-num-btn" @click="appendDigit('0')" :disabled="loading">
              0
            </button>
            <button
              type="button"
              class="pin-num-btn pin-backspace-btn"
              @click="backspace"
              :disabled="loading"
              title="مسح رقم"
            >
              ⌫
            </button>
          </div>

          <!-- Actions -->
          <div class="pin-actions">
            <button type="button" class="btn-cancel" @click="cancel" :disabled="loading">
              إلغاء (Esc)
            </button>
            <button
              type="button"
              class="btn-confirm"
              @click="submit"
              :disabled="loading || enteredPin.length < 4"
            >
              <span v-if="loading">جاري التحقق...</span>
              <span v-else>موافقة المدير ✨</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  show: boolean;
  actionDescription?: string;
  loading?: boolean;
  errorMessage?: string;
}>();

const emit = defineEmits<{
  'update:show': [val: boolean];
  submitPin: [pin: string];
  cancel: [];
}>();

const enteredPin = ref('');

const appendDigit = (d: string) => {
  if (enteredPin.value.length < 6) {
    enteredPin.value += d;
    if (enteredPin.value.length === 4) {
      // Automatic submit on 4th digit for ultra-fast cashier experience
      submit();
    }
  }
};

const backspace = () => {
  if (enteredPin.value.length > 0) {
    enteredPin.value = enteredPin.value.slice(0, -1);
  }
};

const clearPin = () => {
  enteredPin.value = '';
};

const cancel = () => {
  enteredPin.value = '';
  emit('update:show', false);
  emit('cancel');
};

const submit = () => {
  if (enteredPin.value.length >= 4 && !props.loading) {
    emit('submitPin', enteredPin.value);
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.show) return;
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    appendDigit(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    backspace();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    submit();
  }
};

watch(
  () => props.show,
  (val) => {
    if (val) {
      enteredPin.value = '';
    }
  },
);

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  direction: rtl;
  font-family: 'Cairo', 'Tajawal', sans-serif;
}

.pin-modal-box {
  background: linear-gradient(145deg, #1a1a2b, #222238);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 28px 24px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  color: #fff;
  text-align: center;
}

.pin-header {
  margin-bottom: 20px;

  .pin-icon-wrap {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    margin-bottom: 12px;
  }

  h3 {
    margin: 0 0 6px 0;
    font-size: 1.15rem;
    font-weight: 800;
    color: #f1f5f9;
  }

  .pin-action-desc {
    margin: 0;
    font-size: 0.82rem;
    color: #94a3b8;
    line-height: 1.4;
  }
}

.pin-display {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin: 16px 0 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);

  &.error {
    border-color: rgba(239, 68, 68, 0.5);
    background: rgba(239, 68, 68, 0.1);
  }

  .pin-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.3);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    &.filled {
      background: #f59e0b;
      border-color: #fbbf24;
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
      transform: scale(1.15);
    }
  }
}

.pin-error-text {
  font-size: 0.8rem;
  color: #f87171;
  margin-bottom: 12px;
  font-weight: 600;
}

.pin-numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

.pin-num-btn {
  height: 52px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  font-size: 1.35rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  user-select: none;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.96);
    background: rgba(245, 158, 11, 0.25);
  }

  &.pin-clear-btn {
    color: #f87171;
    font-size: 1.1rem;
  }

  &.pin-backspace-btn {
    color: #cbd5e1;
    font-size: 1.2rem;
  }
}

.pin-actions {
  display: flex;
  gap: 10px;

  .btn-cancel {
    flex: 1;
    height: 44px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
  }

  .btn-confirm {
    flex: 1.4;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    border: none;
    color: #fff;
    font-size: 0.92rem;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
    transition: all 0.2s;

    &:hover:not(:disabled) {
      opacity: 0.95;
      transform: translateY(-1px);
    }

    &:disabled {
      background: #374151;
      color: #6b7280;
      box-shadow: none;
      cursor: not-allowed;
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
