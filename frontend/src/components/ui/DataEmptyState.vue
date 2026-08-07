<template>
  <div class="empty-state" :class="compact ? 'empty-state-compact' : ''">
    <div class="empty-icon" :class="tone ? `tone-${tone}` : ''">
      <AppIcon :name="icon" :size="compact ? 32 : 48" />
    </div>
    <div class="empty-text">
      <h3 class="empty-title">{{ title }}</h3>
      <p v-if="message" class="empty-message">{{ message }}</p>
    </div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  title:   { type: String, default: 'لا توجد بيانات' },
  message: { type: String, default: '' },
  icon:    { type: String, default: 'inventory' },
  tone:    { type: String, default: '' }, // 'muted', 'primary', 'warning'
  compact: { type: Boolean, default: false },
});
</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px 24px;
  text-align: center;
}

.empty-state-compact {
  padding: 28px 16px;
  gap: 10px;
  .empty-icon { width: 56px; height: 56px; }
}

.empty-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--border) 60%, transparent);
  color: var(--text-muted);
  transition: transform 0.3s ease;

  &.tone-primary {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary);
  }
  &.tone-warning {
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
  }
  &.tone-muted {
    background: transparent;
    color: var(--text-muted);
    opacity: 0.5;
  }
}

.empty-state:hover .empty-icon { transform: scale(1.06); }

.empty-text { display: flex; flex-direction: column; gap: 6px; }

.empty-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-strong);
}

.empty-message {
  font-size: 0.84rem;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 320px;
}
</style>
