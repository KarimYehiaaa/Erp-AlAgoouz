<template>
  <article class="panel cashflow-hub-panel glass-glow-card">
    <!-- Header -->
    <div class="panel-head compact">
      <div class="flex items-center gap-2">
        <span class="hub-icon-badge">
          <AppIcon name="wallet" :size="16" />
        </span>
        <div>
          <h2>السيولة والتدفق المالي</h2>
          <p class="hub-sub-text">كفاءة التحصيل ونقدية الخزينة</p>
        </div>
      </div>
      <span class="status-pill" :class="isHealthy ? 'is-good' : 'is-warn'">
        <span class="status-dot"></span>
        {{ isHealthy ? 'موقف مالي مستقر' : 'تنبيه سيولة' }}
      </span>
    </div>

    <!-- Hero Section: Radial Collection Efficiency + Target Progress & Cash -->
    <div class="hub-hero-section">
      <div class="gauge-wrap">
        <svg class="gauge-svg" width="90" height="90" viewBox="0 0 100 100">
          <circle class="gauge-bg" cx="50" cy="50" r="40" />
          <circle
            class="gauge-progress"
            cx="50"
            cy="50"
            r="40"
            :stroke-dasharray="251.32"
            :stroke-dashoffset="251.32 * (1 - Math.min(Math.max(collectionRate, 0), 1))"
          />
        </svg>
        <div class="gauge-center-text">
          <span class="gauge-val">{{ percent(collectionRate) }}</span>
          <small class="gauge-lbl">التحصيل</small>
        </div>
      </div>

      <div class="hero-stats">
        <!-- Daily Target Bar -->
        <div class="target-box">
          <div class="flex justify-between items-center text-xs mb-1">
            <span class="target-title">🎯 مستهدف اليوم</span>
            <span class="target-nums">
              <strong class="text-primary">{{ formatMoney(todaySales) }}</strong>
              <span class="text-muted"> / {{ formatMoney(targetAmount) }}</span>
            </span>
          </div>
          <div class="target-progress-track">
            <div class="target-progress-fill" :style="{ width: targetPercent + '%' }"></div>
          </div>
        </div>

        <!-- Live Cash in Register -->
        <div class="live-cash-card">
          <div class="cash-meta">
            <span class="cash-title">نقدية الدرج الحية</span>
            <strong class="cash-value text-success">{{ formatMoney(cashInRegister) }}</strong>
          </div>
          <RouterLink to="/branch-sales" class="btn-pos-shortcut" title="الانتقال إلى شاشة الكاشير">
            <AppIcon name="shop" :size="13" />
            <span>POS</span>
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- 4 Key Financial Vitals Grid -->
    <div class="vitals-grid">
      <div class="vital-card">
        <span class="vital-label">
          <AppIcon name="reports" :size="12" />
          هامش الربح
        </span>
        <strong class="vital-num text-success">{{ percent(profitMargin) }}</strong>
      </div>

      <div class="vital-card">
        <span class="vital-label">
          <AppIcon name="warning" :size="12" />
          ديون معلقة
        </span>
        <strong class="vital-num" :class="unpaidDebt > 0 ? 'text-warning' : 'text-success'">
          {{ formatMoney(unpaidDebt) }}
        </strong>
      </div>

      <div class="vital-card">
        <span class="vital-label">
          <AppIcon name="purchases" :size="12" />
          نسبة المشتريات
        </span>
        <strong
          class="vital-num"
          :class="purchaseToSalesRatio <= 35 ? 'text-success' : 'text-warning'"
        >
          {{ purchaseToSalesRatio }}%
        </strong>
      </div>

      <div class="vital-card">
        <span class="vital-label">
          <AppIcon name="inventory" :size="12" />
          نواقص المخزون
        </span>
        <strong class="vital-num" :class="stockAlerts > 0 ? 'text-danger' : 'text-success'">
          {{ stockAlerts ? `${stockAlerts} صنف` : 'مستقر 🟢' }}
        </strong>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney, formatPercent } from '@/utils/formatters';

const props = defineProps({
  stats: { type: Object, required: true },
});

const percent = (val: any) => formatPercent(val || 0);

// معدل التحصيل (0 إلى 1)
const collectionRate = computed(() => {
  const r = Number(props.stats?.month?.collectionRate || 0);
  return r > 1 ? r / 100 : r;
});

// مبيعات اليوم
const todaySales = computed(() => {
  const s = props.stats;
  return Number(s?.today?.sales || s?.month?.sales || 0);
});

// مستهدف اليوم
const targetAmount = computed(() => {
  const monthTarget = Number(props.stats?.target || 50000);
  return Math.max(Math.round(monthTarget / 30), 1500);
});

// نسبة تحقيق الهدف
const targetPercent = computed(() => {
  if (!targetAmount.value) return 0;
  return Math.min(Math.round((todaySales.value / targetAmount.value) * 100), 100);
});

// نقدية الدرج
const cashInRegister = computed(() => {
  const s = props.stats;
  return Number(s?.today?.cash || s?.month?.cash || s?.cashBalance || s?.realIncomeMonth || 0);
});

// هامش الربح
const profitMargin = computed(() => {
  const s = props.stats;
  const sales = Number(s?.month?.sales || 0);
  const netProfit = Number(s?.month?.netProfit || 0);
  if (!sales) return 0;
  return (netProfit / sales) * 100;
});

// مديونيات معلقة
const unpaidDebt = computed(() => {
  return Number(props.stats?.unpaidInvoices?.amount || 0);
});

// نسبة الشراء للبيع
const purchaseToSalesRatio = computed(() => {
  const s = props.stats;
  const purchases = Number(s?.monthCards?.purchases || s?.month?.purchases || 0);
  const sales = Number(s?.month?.sales || 0);
  if (!sales) return 0;
  return Math.round((purchases / sales) * 100);
});

// تنبيهات المخزون
const stockAlerts = computed(() => {
  return Number(props.stats?.stockAlerts || 0);
});

// الحالة المالية العامة
const isHealthy = computed(() => {
  return collectionRate.value >= 0.7 && unpaidDebt.value < 50000;
});
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

.cashflow-hub-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1.5px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow-xs);
  transition: all 0.2s ease;
}

.hub-icon-badge {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 12%, var(--bg-soft));
  color: var(--primary);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.hub-sub-text {
  font-size: 0.72rem;
  color: var(--text-muted);
  font-weight: 700;
  margin: 0;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  &.is-good {
    background: rgba(34, 197, 94, 0.12);
    color: #16a34a;
    border: 1px solid rgba(34, 197, 94, 0.25);
    .status-dot {
      background: #16a34a;
      box-shadow: 0 0 6px rgba(22, 163, 74, 0.6);
    }
  }

  &.is-warn {
    background: rgba(234, 179, 8, 0.12);
    color: #ca8a04;
    border: 1px solid rgba(234, 179, 8, 0.25);
    .status-dot {
      background: #ca8a04;
    }
  }
}

.hub-hero-section {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 12px 0 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-soft);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.gauge-wrap {
  position: relative;
  width: 86px;
  height: 86px;
  display: grid;
  place-items: center;
  flex-shrink: 0;

  .gauge-svg {
    transform: rotate(-90deg);
    grid-area: 1 / 1;
  }

  .gauge-bg {
    fill: none;
    stroke: var(--border);
    stroke-width: 8;
  }

  .gauge-progress {
    fill: none;
    stroke: var(--primary);
    stroke-width: 8;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s ease;
  }

  .gauge-center-text {
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    .gauge-val {
      font-size: 1.15rem;
      font-weight: 900;
      color: var(--text-strong);
      line-height: 1;
      direction: ltr;
    }

    .gauge-lbl {
      font-size: 0.65rem;
      color: var(--text-muted);
      font-weight: 800;
      margin-top: 2px;
    }
  }
}

.hero-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.target-box {
  .target-title {
    font-size: 0.72rem;
    font-weight: 800;
  }
  .target-nums {
    font-size: 0.72rem;
    font-weight: 800;
  }
  .target-progress-track {
    height: 6px;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }
  .target-progress-fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--accent) 0%, var(--primary) 100%);
    transition: width 0.6s ease;
  }
}

.live-cash-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--bg-card);
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);

  .cash-meta {
    display: flex;
    flex-direction: column;

    .cash-title {
      font-size: 0.66rem;
      color: var(--text-muted);
      font-weight: 800;
    }

    .cash-value {
      font-size: 0.95rem;
      font-weight: 900;
      line-height: 1.2;
    }
  }

  .btn-pos-shortcut {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--primary);
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 800;
    text-decoration: none;
    transition: transform 0.15s ease;

    &:hover {
      transform: scale(1.05);
    }
  }
}

.vitals-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: auto;
}

.vital-card {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  .vital-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.68rem;
    color: var(--text-muted);
    font-weight: 800;
  }

  .vital-num {
    font-size: 0.88rem;
    font-weight: 900;
    line-height: 1.2;
  }
}
</style>
