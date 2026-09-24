<template>
  <section class="live-pulse-banner glass-glow-card mb-4">
    <div class="pulse-left">
      <!-- عداد الهدف اليومي الدائري التفاعلي -->
      <div class="target-gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="42" />
          <circle
            class="gauge-progress"
            cx="50"
            cy="50"
            r="42"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="progressOffset"
          />
        </svg>
        <div class="gauge-content">
          <span class="gauge-percent">{{ targetPercent }}%</span>
          <span class="gauge-caption">تارجت اليوم</span>
        </div>
      </div>

      <div class="pulse-summary">
        <div class="flex items-center gap-2">
          <span class="live-beacon"></span>
          <h3 class="pulse-title">النبض التشغيلي اللحظي</h3>
          <span v-if="isPeakHour" class="peak-badge">
            <AppIcon name="flame" :size="14" />
            فترة ذروة نشطة 🔥
          </span>
          <span v-else class="normal-badge">
            <AppIcon name="check" :size="14" />
            تشغيل اعتيادي مستقر
          </span>
        </div>
        <p class="pulse-subtitle">
          تم تحقيق
          <strong class="text-primary">{{ formatMoney(todaySales) }}</strong>
          من مستهدف اليوم ({{ formatMoney(targetAmount) }}) • المتبقي:
          <strong :class="remainingTarget <= 0 ? 'text-success' : 'text-muted'">
            {{ remainingTarget <= 0 ? 'تم تجاوز الهدف بنجاح 🎯' : formatMoney(remainingTarget) }}
          </strong>
        </p>
      </div>
    </div>

    <div class="pulse-right">
      <!-- حالة الوردية والشفت -->
      <div class="shift-stat-box">
        <div class="shift-info">
          <span class="shift-label">نقدية الدرج الحية</span>
          <strong class="shift-value text-success">{{ formatMoney(cashInRegister) }}</strong>
        </div>
        <div class="shift-badge-wrap">
          <span class="shift-pill">
            <AppIcon name="shop" :size="14" />
            {{ shopName }}
          </span>
        </div>
      </div>

      <RouterLink to="/pos" class="btn btn-primary btn-sm flex items-center gap-2">
        <AppIcon name="shop" :size="16" />
        <span>الكاشير (POS)</span>
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '@/utils/formatters';

const props = defineProps({
  stats: { type: Object, required: true },
});

// مبيعات اليوم المستخلصة
const todaySales = computed(() => {
  const s = props.stats;
  return Number(s?.today?.sales || s?.month?.sales || 0);
});

// الهدف اليومي (افتراضي أو محسوب بناء على المتوسط الشهري)
const targetAmount = computed(() => {
  const monthTarget = Number(props.stats?.target || 50000);
  return Math.max(Math.round(monthTarget / 30), 1500);
});

const targetPercent = computed(() => {
  if (!targetAmount.value) return 0;
  return Math.min(Math.round((todaySales.value / targetAmount.value) * 100), 100);
});

const remainingTarget = computed(() => {
  return Math.max(targetAmount.value - todaySales.value, 0);
});

// SVG Circular Gauge Calculations
const radius = 42;
const circumference = 2 * Math.PI * radius;
const progressOffset = computed(() => {
  const p = targetPercent.value / 100;
  return circumference * (1 - p);
});

// مؤشر ساعة الذروة (بين 12 م و 3 م، أو بين 6 م و 10 م)
const isPeakHour = computed(() => {
  const currentHour = new Date().getHours();
  return (currentHour >= 12 && currentHour <= 15) || (currentHour >= 18 && currentHour <= 22);
});

// النقدية في درج الكاشير بالمحل
const cashInRegister = computed(() => {
  return Number(props.stats?.cashTotal || props.stats?.today?.cash || todaySales.value * 0.65);
});

const shopName = computed(() => props.stats?.shopName || 'المحل الرئيسي');
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.live-pulse-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5);
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-soft) 100%);
  border: 1px solid var(--border);

  @media (max-width: 900px) {
    flex-direction: column;
    align-items: stretch;
  }
}

.pulse-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.target-gauge-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;

  .gauge-svg {
    transform: rotate(-90deg);
    width: 100%;
    height: 100%;
  }

  .gauge-bg {
    fill: none;
    stroke: var(--border);
    stroke-width: 8;
  }

  .gauge-progress {
    fill: none;
    stroke: var(--accent);
    stroke-width: 8;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.8s ease;
  }

  .gauge-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    .gauge-percent {
      font-size: var(--text-sm);
      font-weight: 900;
      color: var(--text-strong);
      line-height: 1;
    }

    .gauge-caption {
      font-size: 0.62rem;
      color: var(--text-muted);
      margin-top: 2px;
    }
  }
}

.pulse-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .pulse-title {
    font-size: var(--text-base);
    font-weight: 800;
    color: var(--text-strong);
    margin: 0;
  }

  .pulse-subtitle {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin: 0;
  }
}

.peak-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger);
  font-size: var(--text-xs);
  font-weight: 700;
}

.normal-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full, 9999px);
  background: var(--success-soft);
  color: var(--success);
  font-size: var(--text-xs);
  font-weight: 700;
}

.pulse-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);

  @media (max-width: 900px) {
    justify-content: space-between;
  }
}

.shift-stat-box {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);

  .shift-info {
    display: flex;
    flex-direction: column;

    .shift-label {
      font-size: 0.68rem;
      color: var(--text-muted);
    }

    .shift-value {
      font-size: var(--text-sm);
      font-weight: 900;
    }
  }

  .shift-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-muted);
  }
}
</style>
