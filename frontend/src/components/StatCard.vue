<template>
  <div
    class="stat-card animate-in"
    :class="[`tone-${tone}`, `surface-raised`]"
    :style="{ animationDelay: delay }"
  >
    <div class="stat-card-glow" aria-hidden="true"></div>
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: linear-gradient(
    180deg,
    var(--color-surface, var(--bg-elevated)) 0%,
    var(--color-surface-sunken, var(--bg-elevated)) 100%
  );
  box-shadow:
    0 2px 10px -2px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  transition:
    transform var(--motion-hover, 0.25s cubic-bezier(0.16, 1, 0.3, 1)),
    box-shadow var(--motion-hover, 0.25s cubic-bezier(0.16, 1, 0.3, 1)),
    border-color var(--motion-hover, 0.25s ease);
  overflow: hidden;

  .stat-card-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(
      120% 90% at 92% 0%,
      var(--glow-color, rgba(181, 138, 74, 0.08)) 0%,
      transparent 65%
    );
    opacity: 0.8;
    transition: opacity 0.3s ease;
  }

  &:hover {
    transform: translateY(-3px);
    border-color: var(--primary-border, var(--primary));
    box-shadow:
      0 12px 26px -6px var(--halo-color, var(--primary-halo)),
      0 4px 10px -2px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);

    .stat-card-glow {
      opacity: 1;
    }

    .stat-icon-wrap {
      transform: scale(1.08) rotate(2deg);
      box-shadow: 0 4px 14px -2px var(--halo-color, var(--primary-halo));
    }
  }

  &.tone-emerald,
  &.tone-success {
    --glow-color: rgba(16, 185, 129, 0.12);
    --halo-color: rgba(16, 185, 129, 0.25);
    &:hover {
      border-color: var(--color-emerald-border, var(--success));
    }
    .stat-icon-wrap {
      background: var(--color-emerald-soft, rgba(16, 185, 129, 0.12));
      color: var(--color-emerald, #10b981);
      border-color: var(--color-emerald-border, rgba(16, 185, 129, 0.3));
    }
  }

  &.tone-teal {
    --glow-color: rgba(20, 184, 166, 0.12);
    --halo-color: rgba(20, 184, 166, 0.25);
    &:hover {
      border-color: var(--color-teal-border, #14b8a6);
    }
    .stat-icon-wrap {
      background: var(--color-teal-soft, rgba(20, 184, 166, 0.12));
      color: var(--color-teal, #0d9488);
      border-color: var(--color-teal-border, rgba(20, 184, 166, 0.3));
    }
  }

  &.tone-amber,
  &.tone-warning {
    --glow-color: rgba(245, 158, 11, 0.12);
    --halo-color: rgba(245, 158, 11, 0.25);
    &:hover {
      border-color: var(--color-amber-border, var(--warning));
    }
    .stat-icon-wrap {
      background: var(--color-amber-soft, rgba(245, 158, 11, 0.12));
      color: var(--color-amber, #f59e0b);
      border-color: var(--color-amber-border, rgba(245, 158, 11, 0.3));
    }
  }

  &.tone-danger {
    --glow-color: rgba(239, 68, 68, 0.12);
    --halo-color: rgba(239, 68, 68, 0.25);
    &:hover {
      border-color: var(--color-danger-border, var(--danger));
    }
    .stat-icon-wrap {
      background: var(--color-danger-soft, rgba(239, 68, 68, 0.12));
      color: var(--color-danger, #ef4444);
      border-color: var(--color-danger-border, rgba(239, 68, 68, 0.3));
    }
  }
}

.stat-icon-wrap {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary) 12%, var(--bg-elevated));
  color: var(--primary);
  border: 1px solid var(--border-subtle, transparent);
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.25s ease,
    color 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease;
  position: relative;
  z-index: 1;
}

.stat-icon {
  width: 22px;
  height: 22px;
}

.stat-info {
  min-width: 0;
  flex: 1;
  position: relative;
  z-index: 1;
}

.stat-label {
  display: block;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 800;
}

.stat-value {
  display: block;
  color: var(--text-strong);
  font-size: 1.35rem;
  font-weight: 900;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.stat-sub {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 600;
}
</style>
