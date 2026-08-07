<template>
  <teleport to="body">
    <transition name="modal-fade">
      <div
        v-if="modelValue"
        class="modal-overlay"
        :class="{ 'modal-blur': blur }"
        @click.self="closeOnBackdrop && close()"
        role="dialog"
        :aria-modal="true"
        :aria-label="title"
        ref="overlayRef"
      >
        <div
          class="modal-box"
          :class="[`modal-size-${size}`, centered ? 'modal-centered' : '']"
          ref="boxRef"
          tabindex="-1"
        >
          <!-- Header -->
          <div v-if="title || $slots.header" class="modal-header">
            <slot name="header">
              <div class="modal-title-wrap">
                <span v-if="icon" class="modal-icon" :class="iconTone">
                  <AppIcon :name="icon" :size="20" />
                </span>
                <div>
                  <h2 class="modal-title">{{ title }}</h2>
                  <p v-if="subtitle" class="modal-subtitle">{{ subtitle }}</p>
                </div>
              </div>
            </slot>
            <button
              v-if="closable"
              class="modal-close-btn"
              type="button"
              aria-label="إغلاق"
              @click="close()"
            >
              <AppIcon name="close" :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body" :class="{ 'modal-body-padded': padded }">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>

          <!-- Default Footer with confirm/cancel -->
          <div
            v-else-if="showDefaultFooter"
            class="modal-footer"
          >
            <button
              v-if="cancelText"
              class="btn btn-ghost"
              type="button"
              :disabled="loading"
              @click="close('cancel')"
            >
              {{ cancelText }}
            </button>
            <button
              class="btn"
              :class="confirmClass"
              type="button"
              :disabled="loading || confirmDisabled"
              @click="$emit('confirm')"
            >
              <span v-if="loading" class="btn-spinner" />
              {{ loading ? loadingText : confirmText }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  iconTone: { type: String, default: '' }, // 'tone-success', 'tone-danger', etc.

  size: {
    type: String,
    default: 'md',
    validator: (v) => ['xs', 'sm', 'md', 'lg', 'xl', 'full'].includes(v),
  },
  centered: { type: Boolean, default: false },
  closable: { type: Boolean, default: true },
  closeOnBackdrop: { type: Boolean, default: true },
  closeOnEsc: { type: Boolean, default: true },
  blur: { type: Boolean, default: true },
  padded: { type: Boolean, default: true },

  // Default footer
  showDefaultFooter: { type: Boolean, default: false },
  confirmText: { type: String, default: 'تأكيد' },
  cancelText: { type: String, default: 'إلغاء' },
  confirmClass: { type: String, default: 'btn-primary' },
  confirmDisabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  loadingText: { type: String, default: 'جارٍ الحفظ...' },
});

const emit = defineEmits(['update:modelValue', 'close', 'confirm']);

const overlayRef = ref(null);
const boxRef = ref(null);

const close = (reason = 'close') => {
  emit('update:modelValue', false);
  emit('close', reason);
};

// Focus trap + keyboard
const handleKeydown = (e) => {
  if (!props.modelValue) return;
  if (e.key === 'Escape' && props.closeOnEsc) close('esc');
  if (e.key === 'Tab') trapFocus(e);
};

const trapFocus = (e) => {
  if (!boxRef.value) return;
  const focusable = boxRef.value.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
};

watch(() => props.modelValue, async (val) => {
  if (val) {
    document.body.style.overflow = 'hidden';
    await nextTick();
    boxRef.value?.focus();
  } else {
    document.body.style.overflow = '';
  }
});

onMounted(() => document.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
</script>

<style lang="scss" scoped>
/* ── Overlay ──────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px 24px;
  background: color-mix(in srgb, #000 55%, transparent);
  overflow-y: auto;

  &.modal-blur {
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
}

/* ── Box ──────────────────────────────────────────────────────── */
.modal-box {
  position: relative;
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl, 18px);
  box-shadow: var(--shadow-xl, 0 24px 60px rgba(0,0,0,.25));
  display: flex;
  flex-direction: column;
  outline: none;

  &.modal-centered { margin: auto; }
}

/* Sizes */
.modal-size-xs { max-width: 380px; }
.modal-size-sm { max-width: 500px; }
.modal-size-md { max-width: 660px; }
.modal-size-lg { max-width: 860px; }
.modal-size-xl { max-width: 1100px; }
.modal-size-full { max-width: calc(100vw - 32px); min-height: calc(100vh - 80px); }

/* ── Header ───────────────────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--border);
}

.modal-title-wrap {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.modal-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  flex-shrink: 0;

  &.tone-danger { background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); }
  &.tone-success { background: color-mix(in srgb, var(--success) 10%, transparent); color: var(--success); }
  &.tone-warning { background: color-mix(in srgb, var(--warning) 10%, transparent); color: var(--warning); }
}

.modal-title {
  font-size: 1.05rem;
  font-weight: 900;
  color: var(--text-strong);
  line-height: 1.2;
}

.modal-subtitle {
  margin-top: 3px;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border-color: var(--danger);
    color: var(--danger);
  }
}

/* ── Body ─────────────────────────────────────────────────────── */
.modal-body { flex: 1; overflow-y: auto; }
.modal-body-padded { padding: 22px; }

/* ── Footer ───────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

/* ── Loading spinner ──────────────────────────────────────────── */
.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .6s linear infinite;
  margin-left: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Transition ───────────────────────────────────────────────── */
.modal-fade-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-leave-active {
  transition: all 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  .modal-box { transform: translateY(-16px) scale(0.97); }
}
</style>
