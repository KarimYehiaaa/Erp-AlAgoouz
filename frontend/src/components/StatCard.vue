<template>
  <div class="stat-card animate-in" :style="{ animationDelay: delay }">
    <span class="stat-icon-wrap">
      <AppIcon class="stat-icon" :name="iconName" />
    </span>
    <div class="stat-info">
      <span class="stat-label">{{ label }}</span>
      <span class="stat-value">{{ formattedValue }}</span>
      <span v-if="sub" class="stat-sub">{{ sub }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney } from '@/utils/currency';

const props = defineProps({
  label: String,
  value: [Number, String],
  icon: String,
  sub: String,
  format: { type: String, default: 'currency' },
  delay: String,
});

const formattedValue = computed(() => {
  if (props.format === 'number') return Number(props.value || 0).toLocaleString('en-GB');
  if (props.format === 'text') return props.value || '-';
  return formatMoney(props.value);
});

const iconName = computed(() => props.icon || 'dashboard');
</script>

<style lang="scss" scoped>
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-xs);
  transition:
    transform var(--motion-hover),
    box-shadow var(--motion-hover),
    border-color var(--motion-hover);

  &:hover {
    transform: translateY(-2px);
    border-color: var(--primary-border);
    box-shadow:
      var(--shadow-sm),
      0 8px 18px -4px var(--primary-halo);

    .stat-icon-wrap {
      transform: scale(1.06);
      background: color-mix(in srgb, var(--primary) 16%, var(--bg-elevated));
      color: var(--primary);
    }
  }
}

.stat-icon-wrap {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--primary) 10%, var(--bg-elevated));
  color: var(--primary-dark);
  flex-shrink: 0;
  transition:
    transform var(--motion-hover),
    background-color var(--motion-hover),
    color var(--motion-hover);
}

.stat-icon {
  width: 22px;
  height: 22px;
}

.stat-info {
  min-width: 0;
  flex: 1;
}

.stat-label {
  display: block;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 900;
}

.stat-value {
  display: block;
  color: var(--text-strong);
  font-size: 1.25rem;
  font-weight: 900;
  line-height: 1.2;
}

.stat-sub {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.74rem;
}
</style>
