<template>
  <teleport to="body">
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      <transition-group name="toast-anim" tag="div" class="toast-list">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item"
          :class="`toast-${toast.type}`"
          role="alert"
        >
          <!-- Icon -->
          <div class="toast-icon">
            <AppIcon :name="toastIcon(toast.type)" :size="18" />
          </div>

          <!-- Content -->
          <div class="toast-body">
            <span class="toast-msg">{{ toast.message }}</span>
            <button
              v-if="toast.onUndo"
              class="toast-undo"
              type="button"
              @click="
                toast.onUndo();
                removeToast(toast.id);
              "
            >
              تراجع
            </button>
          </div>

          <!-- Progress bar -->
          <div
            v-if="toast.duration > 0"
            class="toast-progress"
            :style="`animation-duration: ${toast.duration}ms`"
          />

          <!-- Close -->
          <button
            class="toast-close"
            type="button"
            @click="removeToast(toast.id)"
            aria-label="إغلاق"
          >
            <AppIcon name="close" :size="14" />
          </button>
        </div>
      </transition-group>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();
const toasts = computed(() => appStore.toasts);
const removeToast = (id: any) => appStore.removeToast(id);

const toastIcon = (type: any) => {
  const map = {
    success: 'check',
    error: 'warning',
    warning: 'warning',
    info: 'copilot',
  };
  return map[type as keyof typeof map] || 'copilot';
};
</script>

<style lang="scss" scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
  max-width: min(380px, calc(100vw - 32px));
}

.toast-list {
  display: contents;
}

.toast-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  pointer-events: all;
  overflow: hidden;
  min-width: 280px;

  &.toast-success {
    border-color: color-mix(in srgb, var(--success) 35%, var(--border));
  }
  &.toast-error {
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  }
  &.toast-warning {
    border-color: color-mix(in srgb, var(--warning) 35%, var(--border));
  }
  &.toast-info {
    border-color: color-mix(in srgb, var(--primary) 35%, var(--border));
  }
}

.toast-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;

  .toast-success & {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: var(--success);
  }
  .toast-error & {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }
  .toast-warning & {
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    color: var(--warning);
  }
  .toast-info & {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }
}

.toast-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toast-msg {
  font-size: 0.86rem;
  color: var(--text-strong);
  line-height: 1.4;
  word-break: break-word;
}

.toast-undo {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;

  &:hover {
    opacity: 0.75;
  }
}

.toast-close {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    background: var(--border);
    color: var(--text);
  }
}

/* Progress bar */
.toast-progress {
  position: absolute;
  bottom: 0;
  right: 0;
  left: 0;
  height: 3px;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  transform-origin: right;
  animation: toast-shrink linear forwards;

  .toast-success & {
    background: var(--success);
  }
  .toast-error & {
    background: var(--danger);
  }
  .toast-warning & {
    background: var(--warning);
  }
  .toast-info & {
    background: var(--primary);
  }
}

@keyframes toast-shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

/* ── Transitions ──────────────────────────────────────────────── */
.toast-anim-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-anim-leave-active {
  transition: all 0.2s ease;
}
.toast-anim-enter-from {
  opacity: 0;
  transform: translateX(-24px) scale(0.95);
}
.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(-16px) scale(0.96);
}
.toast-anim-move {
  transition: transform 0.25s ease;
}
</style>
