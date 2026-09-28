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

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.pin-modal-box {
  width: 100%;
  max-width: 360px;
  background: #1e130b;
  border: 1.5px solid #d4a373;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
  color: #fffaf2;
  text-align: center;
}

.pin-header {
  margin-bottom: 20px;

  .pin-icon-wrap {
    font-size: 2.2rem;
    margin-bottom: 6px;
  }

  h3 {
    margin: 0 0 6px 0;
    font-size: 1.15rem;
    font-weight: 850;
    color: #faedcd;
  }

  .pin-action-desc {
    margin: 0;
    font-size: 0.8rem;
    color: #d4a373;
  }
}

.pin-display {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-bottom: 18px;

  .pin-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(212, 163, 115, 0.4);
    background: transparent;
    transition: all 0.2s ease;

    &.filled {
      background: #d4a373;
      border-color: #faedcd;
      box-shadow: 0 0 10px rgba(212, 163, 115, 0.8);
      transform: scale(1.15);
    }
  }

  &.error .pin-dot {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.2);
  }
}

.pin-error-text {
  color: #f87171;
  font-size: 0.8rem;
  font-weight: 700;
  margin-bottom: 12px;
}

.pin-numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;

  .pin-num-btn {
    padding: 14px 0;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(212, 163, 115, 0.2);
    border-radius: 12px;
    color: #faedcd;
    font-size: 1.25rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      background: rgba(212, 163, 115, 0.25);
      border-color: #d4a373;
      transform: scale(1.04);
    }

    &:active:not(:disabled) {
      transform: scale(0.96);
    }

    &.pin-clear-btn {
      color: #f87171;
    }

    &.pin-backspace-btn {
      color: #fde047;
    }
  }
}

.pin-actions {
  display: flex;
  gap: 10px;

  .btn-cancel {
    flex: 1;
    padding: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    color: #cbd5e1;
    font-weight: 750;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  }

  .btn-confirm {
    flex: 2;
    padding: 10px;
    background: linear-gradient(135deg, #d4a373 0%, #a86f3d 100%);
    border: 1px solid #faedcd;
    border-radius: 10px;
    color: #140d08;
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(212, 163, 115, 0.35);

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #faedcd 0%, #d4a373 100%);
      transform: translateY(-1px);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}
</style>
