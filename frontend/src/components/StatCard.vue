<template>
  <div
    class="stat-card animate-in"
    :class="[`tone-${tone}`, `surface-raised`]"
    :style="{ animationDelay: delay }"
  >
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
  tone: { type: String, default: 'default' },
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
  background: linear-gradient(
    180deg,
    var(--color-surface, var(--bg-elevated)) 0%,
    var(--color-surface-sunken, var(--bg-elevated)) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    var(--shadow-xs);
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
    }
  }

  &.tone-emerald,
  &.tone-success {
    &:hover {
      border-color: var(--color-emerald-border, var(--success));
      box-shadow:
        var(--shadow-sm),
        0 8px 18px -4px var(--color-emerald-halo, rgba(16, 185, 129, 0.2));
    }
    .stat-icon-wrap {
      background: var(--color-emerald-soft, rgba(16, 185, 129, 0.12));
      color: var(--color-emerald, #10b981);
      border-color: var(--color-emerald-border, rgba(16, 185, 129, 0.3));
    }
  }

  &.tone-teal {
    &:hover {
      border-color: var(--color-teal-border, #14b8a6);
      box-shadow:
        var(--shadow-sm),
        0 8px 18px -4px var(--color-teal-halo, rgba(20, 184, 166, 0.2));
    }
    .stat-icon-wrap {
      background: var(--color-teal-soft, rgba(20, 184, 166, 0.12));
      color: var(--color-teal, #0d9488);
      border-color: var(--color-teal-border, rgba(20, 184, 166, 0.3));
    }
  }

  &.tone-amber,
  &.tone-warning {
    &:hover {
      border-color: var(--color-amber-border, var(--warning));
      box-shadow:
        var(--shadow-sm),
        0 8px 18px -4px var(--color-amber-halo, rgba(245, 158, 11, 0.2));
    }
    .stat-icon-wrap {
      background: var(--color-amber-soft, rgba(245, 158, 11, 0.12));
      color: var(--color-amber, #f59e0b);
      border-color: var(--color-amber-border, rgba(245, 158, 11, 0.3));
    }
  }

  &.tone-danger {
    &:hover {
      border-color: var(--color-danger-border, var(--danger));
      box-shadow:
        var(--shadow-sm),
        0 8px 18px -4px var(--color-danger-halo, rgba(239, 68, 68, 0.2));
    }
    .stat-icon-wrap {
      background: var(--color-danger-soft, rgba(239, 68, 68, 0.12));
      color: var(--color-danger, #ef4444);
      border-color: var(--color-danger-border, rgba(239, 68, 68, 0.3));
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
  color: var(--primary);
  border: 1px solid var(--border-subtle, transparent);
  flex-shrink: 0;
  transition:
    transform var(--motion-hover),
    background-color var(--motion-hover),
    color var(--motion-hover),
    border-color var(--motion-hover);
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
