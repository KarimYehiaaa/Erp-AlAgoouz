<template>
  <BaseModal
    v-model="modelValue"
    :title="title"
    :icon="icon"
    :icon-tone="tone === 'danger' ? 'tone-danger' : tone === 'warning' ? 'tone-warning' : ''"
    size="sm"
    centered
    :closable="!loading"
    :close-on-backdrop="!loading"
    :show-default-footer="true"
    :confirm-text="confirmText"
    :cancel-text="cancelText"
    :confirm-class="`btn-${tone}`"
    :loading="loading"
    @confirm="$emit('confirm')"
    @close="$emit('update:modelValue', false)"
  >
    <div class="confirm-body">
      <!-- Tone Icon -->
      <div class="confirm-icon-wrap" :class="`tone-bg-${tone}`">
        <AppIcon :name="icon" :size="28" />
      </div>
      <!-- Message -->
      <p class="confirm-message">{{ message }}</p>
      <!-- Extra content -->
      <slot />
    </div>
  </BaseModal>
</template>

<script setup>
import BaseModal from './BaseModal.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'تأكيد الإجراء' },
  message: { type: String, default: 'هل أنت متأكد من تنفيذ هذا الإجراء؟' },
  icon: { type: String, default: 'warning' },
  tone: {
    type: String,
    default: 'danger',
    validator: (v) => ['danger', 'warning', 'primary', 'success'].includes(v),
  },
  confirmText: { type: String, default: 'تأكيد الحذف' },
  cancelText: { type: String, default: 'إلغاء' },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'confirm']);
</script>

<style lang="scss" scoped>
.confirm-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 8px 0;
}

.confirm-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;

  &.tone-bg-danger {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }
  &.tone-bg-warning {
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    color: var(--warning);
  }
  &.tone-bg-primary {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }
  &.tone-bg-success {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: var(--success);
  }
}

.confirm-message {
  color: var(--text);
  font-size: 0.92rem;
  line-height: 1.6;
  max-width: 340px;
}
</style>
