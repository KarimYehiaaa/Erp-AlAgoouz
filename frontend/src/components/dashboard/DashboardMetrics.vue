<template>
  <section class="executive-kpi-hub">
    <!-- Controls Bar: Quick Density Switcher & Interaction Hints -->
    <div class="kpi-controls-bar">
      <div class="kpi-hub-title">
        <span class="hub-pill">
          <span class="hub-dot"></span>
          المؤشرات الحيوية التنفيذية
        </span>
        <span class="drag-hint">
          <AppIcon name="shortcuts" :size="12" />
          <span>اسحب أي بطاقة لتغيير ترتيبها</span>
        </span>
      </div>

      <div class="kpi-density-switch" role="group" aria-label="طريقة عرض المؤشرات">
        <button
          type="button"
          class="density-btn"
          :class="{ active: viewDensity === 'core' }"
          @click="setDensity('core')"
          title="عرض الـ 6 بطاقات الاستراتيجية الأساسية فقط"
        >
          <AppIcon name="dashboard" :size="13" />
          <span>عرض مركّز (6)</span>
        </button>
        <button
          type="button"
          class="density-btn"
          :class="{ active: viewDensity === 'detailed' }"
          @click="setDensity('detailed')"
          title="عرض تفصيلي يشمل المشتريات والتكلفة المباشرة"
        >
          <AppIcon name="reports" :size="13" />
          <span>عرض مفصل (8)</span>
        </button>
      </div>
    </div>

    <!-- Bento Grid Container -->
    <div class="executive-kpi-bento">
      <div
        v-for="(metric, index) in displayedMetrics"
        :key="metric.key"
        class="kpi-card-wrapper stagger-fade-item"
        :class="[
          `stagger-delay-${(index % 8) + 1}`,
          metric.tier === 'hero' ? 'is-hero' : 'is-secondary',
        ]"
        draggable="true"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent
        @drop="onDrop($event, index)"
        title="اسحب البطاقة لتغيير مكانها"
      >
        <RouterLink
          v-spotlight
          class="bento-kpi-card hover-lift glass-glow-card"
          :class="[
            metric.tone,
            metric.tier === 'hero' ? 'hero-card' : 'secondary-card',
            { 'has-spark': metric.spark && metric.spark.length > 1 },
          ]"
          :to="metric.to"
        >
          <!-- Ambient Radial Bloom Layer -->
          <div class="card-ambient-glow" aria-hidden="true"></div>
          <!-- Glass Specular Highlight -->
          <div class="card-glass-specular" aria-hidden="true"></div>

          <!-- Top Header: Icon + Badges -->
          <div class="kpi-top-bar">
            <div class="kpi-icon-wrap" :class="metric.tone">
              <AppIcon
                class="kpi-icon"
                :name="metric.icon"
                :size="metric.tier === 'hero' ? 22 : 18"
              />
            </div>

            <div class="kpi-badges">
              <!-- Integrated Margin Badge (Embedded inside Net Profit Hero Card) -->
              <span
                v-if="metric.key === 'profit' && metric.margin !== undefined"
                class="kpi-margin-badge"
                title="هامش صافي الربح من إجمالي المبيعات"
              >
                <AppIcon name="trendingUp" :size="11" />
                <span>هامش {{ percent(metric.margin) }}</span>
              </span>

              <!-- Cash Safety Status Badge (Exclusive to Cash Hero Card) -->
              <span
                v-if="metric.key === 'cash' && metric.statusText"
                class="kpi-status-badge"
                :class="metric.statusClass"
              >
                <span class="status-dot"></span>
                <span>{{ metric.statusText }}</span>
              </span>

              <!-- Low Stock Warning Badge (Exclusive to Inventory Card) -->
              <span
                v-if="metric.key === 'inventory' && metric.stockAlerts > 0"
                class="kpi-warning-chip"
                title="أصناف وصلت لحد الطلب أو نفدت"
              >
                <AppIcon name="warning" :size="11" />
                <span>{{ metric.stockAlerts }} حرج</span>
              </span>

              <!-- Debtors Count Badge (Exclusive to Unpaid Card) -->
              <span
                v-if="metric.key === 'unpaid' && metric.debtorCount > 0"
                class="kpi-danger-chip"
                title="عدد العملاء الذين عليهم مديونيات آجلة"
              >
                <span>{{ metric.debtorCount }} عميل</span>
              </span>

              <!-- Real Dynamic Delta Pill (from Backend Comparison) -->
              <span
                v-if="metric.delta !== undefined && metric.delta !== null"
                class="trend-delta-pill"
                :class="metric.delta >= 0 ? 'up' : 'down'"
                :title="`مقارنة بالفترة السابقة: ${metric.delta >= 0 ? '+' : ''}${metric.delta}%`"
              >
                <AppIcon :name="metric.delta >= 0 ? 'trendingUp' : 'trendingDown'" :size="11" />
                <span
                  >{{ metric.delta >= 0 ? '+' : '' }}{{ Math.round(metric.delta * 10) / 10 }}%</span
                >
              </span>

              <!-- Estimate Pill -->
              <span v-if="metric.estimate" class="estimate-pill" :title="metric.estimateNote">
                <span class="estimate-dot"></span>
                <span>تقديري</span>
              </span>
            </div>
          </div>

          <!-- Body: Label & Main Value with Animated Number -->
          <div class="kpi-body">
            <div class="kpi-label-row">
              <span class="kpi-label">{{ metric.label }}</span>
              <span v-if="metric.extraBadge" class="kpi-extra-chip">{{ metric.extraBadge }}</span>
            </div>
            <div class="kpi-value-row">
              <strong class="kpi-num" :class="{ 'hero-num': metric.tier === 'hero' }">
                <AnimatedNumber :value="metric.raw" :format="metric.format" />
              </strong>
            </div>
          </div>

          <!-- Footer: Subtitle + Micro-Sparkline -->
          <div class="kpi-footer">
            <span class="kpi-sub" :title="metric.sub">{{ metric.sub }}</span>
            <div v-if="metric.spark && metric.spark.length > 1" class="kpi-spark-wrap">
              <Sparkline
                :data="metric.spark"
                :color="metric.sparkColor"
                :height="metric.tier === 'hero' ? 24 : 20"
                :width="metric.tier === 'hero' ? 84 : 70"
                class="kpi-spark"
              />
            </div>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { formatMoney, abbreviateNumber, formatPercent } from '@/utils/formatters';
import AnimatedNumber from '@/components/ui/AnimatedNumber.vue';
import Sparkline from '@/components/ui/Sparkline.vue';

const props = defineProps({
  stats: { type: Object, required: true },
});

const authStore = useAuthStore();

// تنسيقات الأرقام والعملات
const money = (val: any) => formatMoney(val || 0);
const moneyCompact = (val: any) => formatMoney(val || 0, { compact: true });
const number = (val: any) => abbreviateNumber(val || 0);
const percent = (val: any) => formatPercent(val || 0);

// وضع العرض (مركّز: 6 كروت استراتيجية | مفصّل: 8 كروت تشمل المشتريات والتكلفة)
const viewDensity = ref<'core' | 'detailed'>(
  (localStorage.getItem('dashboard_kpi_density') as 'core' | 'detailed') || 'core',
);

const setDensity = (mode: 'core' | 'detailed') => {
  viewDensity.value = mode;
  localStorage.setItem('dashboard_kpi_density', mode);
};

const monthCards = computed(() => props.stats?.monthCards || {});

const mainMetrics = computed(() => {
  const s = props.stats;
  // بيانات الاتجاه للـ Sparklines (آخر 7 نقاط في المخطط)
  const salesTrend = (s?.salesTrend || []).map((r: any) => Number(r.sales || 0));
  const profitTrend = (s?.salesTrend || []).map((r: any) => Number(r.profit || 0));
  const expenseTrend = (s?.expenseTrend || []).map((r: any) => Number(r.expenses || 0));

  // الحسابات المالية الحقيقية
  const salesVal = Number(s?.month?.sales || 0);
  const profitVal = Number(s?.month?.netProfit || 0);
  const marginRate = salesVal > 0 ? (profitVal / salesVal) * 100 : 0;
  const cashVal = Number(s?.realIncomeMonth || 0);
  const unpaidVal = Number(s?.unpaidInvoices?.amount || 0);
  const stockAlertsCount = Number(s?.stockAlerts || 0);

  // دلتا النمو الحقيقية القادمة من الباك إند
  const salesDelta = s?.comparison?.sales !== undefined ? Number(s.comparison.sales) : undefined;
  const profitDelta =
    s?.comparison?.netProfit !== undefined ? Number(s.comparison.netProfit) : undefined;
  const expenseDelta =
    s?.comparison?.expenses !== undefined ? Number(s.comparison.expenses) : undefined;

  const metrics = [
    // ── الطبقة الأولى: الركائز الاستراتيجية الثلاث (Hero Tier) ──
    {
      key: 'sales',
      tier: 'hero',
      label: 'إجمالي المبيعات',
      raw: salesVal,
      format: money,
      spark: salesTrend,
      sparkColor: '#d97706',
      delta: salesDelta,
      sub: `${number(s?.month?.salesCount)} عملية بيع منفذة`,
      extraBadge: s?.month?.avgDailySales
        ? `معدل ${moneyCompact(s.month.avgDailySales)}/يوم`
        : null,
      icon: 'sales',
      tone: 'sales',
      to: '/sales',
    },
    {
      key: 'profit',
      tier: 'hero',
      label: 'صافي الربح',
      raw: profitVal,
      format: money,
      spark: profitTrend,
      sparkColor: '#10b981',
      delta: profitDelta,
      margin: marginRate,
      sub: `${s?.month?.cogsBasis === 'purchases' ? 'تقديري بناء على المشتريات — ' : ''}تحصيل ${percent(s?.month?.collectionRate)}`,
      icon: 'reports',
      tone: 'profit',
      to: '/reports',
      perm: 'reports.view',
    },
    {
      key: 'cash',
      tier: 'hero',
      label: 'السيولة المتوفرة (الخزينة)',
      raw: cashVal,
      format: money,
      estimate: true,
      estimateNote:
        s?.cashDetails?.estimateNote ||
        'تقدير نقدي: رصيد أول المدة + تحصيلات العملاء الفعلية − مدفوعات الموردين − المصروفات',
      sub:
        Number(s?.cashDetails?.oldDebtCollections || 0) > 0
          ? `منها ${moneyCompact(s?.cashDetails?.oldDebtCollections)} سداد ديون سابقة`
          : 'رصيد أول المدة + تحصيلات − مصاريف − موردين',
      statusText: cashVal >= 0 ? 'سيولة آمنة' : 'عجز نقدي',
      statusClass: cashVal >= 0 ? 'safe' : 'danger',
      icon: 'wallet',
      tone: 'teal',
      to: '/reports',
      perm: 'reports.view',
    },

    // ── الطبقة الثانية: نبض التشغيل والمخزون والمستحقات (Operational Tier) ──
    {
      key: 'expenses',
      tier: 'secondary',
      label: 'المصروفات التشغيلية',
      raw: Number(s?.month?.expenses || 0),
      format: money,
      spark: expenseTrend,
      sparkColor: '#f59e0b',
      delta: expenseDelta,
      sub: `${number(s?.month?.expensesCount)} حركة صرف مقيدة`,
      icon: 'expenses',
      tone: 'warning',
      to: '/expenses',
      perm: 'expenses.manage',
    },
    {
      key: 'inventory',
      tier: 'secondary',
      label: 'قيمة المخزون السلعي',
      raw: Number(s?.inventoryStats?.inventory_value || 0),
      format: money,
      stockAlerts: stockAlertsCount,
      sub: `${number(s?.inventoryStats?.products)} صنف بالمخزن`,
      icon: 'inventory',
      tone: 'inventory',
      to: '/inventory',
      perm: 'inventory.manage',
    },
    {
      key: 'unpaid',
      tier: 'secondary',
      label: 'مستحقات ومديونيات العملاء',
      raw: unpaidVal,
      format: money,
      debtorCount: Number(s?.unpaidInvoices?.count || 0),
      sub:
        unpaidVal > 0
          ? `${number(s?.unpaidInvoices?.count)} عميل مدين`
          : 'الحسابات والآجل مسددة بالكامل',
      icon: 'warning',
      tone: unpaidVal > 0 ? 'danger' : 'success',
      to: '/sales?tab=wholesale',
      perm: 'reports.view',
    },

    // ── مؤشرات إضافية للعرض المفصل (Detailed Only) ──
    {
      key: 'purchases',
      tier: 'secondary',
      label: 'المشتريات والتوريدات',
      raw: Number(monthCards.value.purchases || 0),
      format: money,
      sub: `${number(monthCards.value.purchasesCount)} فاتورة توريد`,
      icon: 'purchases',
      tone: 'purchases',
      to: '/purchases',
      perm: 'inventory.manage',
      detailedOnly: true,
    },
    {
      key: 'cogs',
      tier: 'secondary',
      label: 'تكلفة البضاعة المباعة',
      raw: Number(s?.month?.cost || 0),
      format: money,
      sub: 'تكلفة المواد والبضاعة المباشرة',
      icon: 'coins',
      tone: 'warning',
      to: '/recipes',
      perm: 'reports.view',
      detailedOnly: true,
    },
  ];

  return metrics.filter((m: any) => !m.perm || authStore.hasPermission(m.perm));
});

const metricsOrder = ref<string[]>([]);

onMounted(() => {
  const saved = localStorage.getItem('dashboard_metrics_order_keys');
  if (saved) {
    try {
      metricsOrder.value = JSON.parse(saved);
    } catch {
      metricsOrder.value = [];
    }
  }
});

const orderedMetrics = computed(() => {
  const base = mainMetrics.value;
  if (!metricsOrder.value.length) return base;
  const sorted: any[] = [];
  metricsOrder.value.forEach((key: string) => {
    const found = base.find((m: any) => m.key === key);
    if (found) sorted.push(found);
  });
  base.forEach((m: any) => {
    if (!sorted.find((x: any) => x.key === m.key)) sorted.push(m);
  });
  return sorted;
});

const displayedMetrics = computed(() => {
  let list = orderedMetrics.value;
  if (viewDensity.value === 'core') {
    list = list.filter((m: any) => !m.detailedOnly);
  }
  return list;
});

const dragIndex = ref<number | null>(null);

const onDragStart = (event: DragEvent, index: number) => {
  dragIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
};

const onDrop = (event: DragEvent, index: number) => {
  if (dragIndex.value === null || dragIndex.value === index) return;
  const currentDisplayed = [...displayedMetrics.value];
  const draggedItem = currentDisplayed[dragIndex.value];
  const targetItem = currentDisplayed[index];

  if (!draggedItem || !targetItem) return;

  const fullList = [...orderedMetrics.value];
  const fromIdx = fullList.findIndex((m: any) => m.key === draggedItem.key);
  const toIdx = fullList.findIndex((m: any) => m.key === targetItem.key);

  if (fromIdx !== -1 && toIdx !== -1) {
    const [moved] = fullList.splice(fromIdx, 1);
    fullList.splice(toIdx, 0, moved);
    metricsOrder.value = fullList.map((m: any) => m.key);
    localStorage.setItem('dashboard_metrics_order_keys', JSON.stringify(metricsOrder.value));
  }
  dragIndex.value = null;
};
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

.executive-kpi-hub {
  margin-bottom: 24px;
}

.kpi-controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 4px 2px;
}

.kpi-hub-title {
  display: flex;
  align-items: center;
  gap: 10px;

  .hub-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--color-text-strong);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 4px 10px;
    border-radius: var(--radius-pill, 9999px);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .hub-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }

  .drag-hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-text-subtle);
  }
}

.kpi-density-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  padding: 3px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);

  .density-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      color: var(--color-text-strong);
      background: rgba(0, 0, 0, 0.03);
    }

    &.active {
      background: var(--color-primary-soft, rgba(181, 138, 74, 0.12));
      color: var(--color-primary, #b58a4a);
      font-weight: 800;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
  }
}

.executive-kpi-bento {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 1080px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

.kpi-card-wrapper {
  display: flex;
  width: 100%;

  &.is-hero {
    /* Hero cards get enhanced emphasis in layout */
  }
}

.bento-kpi-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  text-align: right;
  width: 100%;
  border-radius: 20px;
  padding: 16px 18px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow:
    0 2px 10px -2px rgba(0, 0, 0, 0.05),
    0 1px 3px 0 rgba(0, 0, 0, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition:
    transform var(--motion-hover, 0.25s cubic-bezier(0.16, 1, 0.3, 1)),
    box-shadow var(--motion-hover, 0.25s cubic-bezier(0.16, 1, 0.3, 1)),
    border-color var(--motion-hover, 0.25s ease);
  animation: dashboardRise 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
  overflow: hidden;
  box-sizing: border-box;

  &.hero-card {
    min-height: 152px;
    padding: 18px 20px;
    border-width: 1.5px;
  }

  &.secondary-card {
    min-height: 136px;
    padding: 15px 18px;
  }

  /* Ambient radial bloom layer */
  .card-ambient-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: radial-gradient(
      120% 90% at 92% 0%,
      var(--glow-color, rgba(181, 138, 74, 0.12)) 0%,
      transparent 68%
    );
    opacity: 0.85;
    transition: opacity 0.3s ease;
  }

  .card-glass-specular {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow:
      0 14px 30px -8px var(--halo-color, rgba(181, 138, 74, 0.25)),
      0 4px 12px -2px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.85);
    border-color: var(--border-hover-color, var(--primary));

    .card-ambient-glow {
      opacity: 1;
    }

    .kpi-icon-wrap {
      transform: scale(1.08) rotate(2deg);
      box-shadow: 0 6px 16px -2px var(--halo-color, rgba(181, 138, 74, 0.3));
    }
  }

  &:focus-visible {
    outline: none;
    border-color: var(--color-gold);
    box-shadow:
      0 0 0 3px var(--color-gold-halo),
      var(--shadow-md);
  }

  &:active {
    transform: translateY(-1px);
  }
}

.kpi-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  position: relative;
  z-index: 1;
}

.kpi-icon-wrap {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--icon-bg, var(--color-primary-soft));
  color: var(--icon-color, var(--color-primary));
  border: 1px solid var(--icon-border, transparent);
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.25s ease;
}

.kpi-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.kpi-margin-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: var(--radius-pill, 9999px);
  background: color-mix(in srgb, #10b981 16%, var(--color-surface));
  color: #10b981;
  border: 1px solid color-mix(in srgb, #10b981 35%, transparent);
  white-space: nowrap;
}

.kpi-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
  white-space: nowrap;

  &.safe {
    background: color-mix(in srgb, #0d9488 15%, var(--color-surface));
    color: #0d9488;
    border: 1px solid color-mix(in srgb, #0d9488 35%, transparent);

    .status-dot {
      background: #0d9488;
      box-shadow: 0 0 6px #0d9488;
    }
  }

  &.danger {
    background: color-mix(in srgb, #ef4444 15%, var(--color-surface));
    color: #ef4444;
    border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);

    .status-dot {
      background: #ef4444;
      box-shadow: 0 0 6px #ef4444;
    }
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
}

.kpi-warning-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: var(--radius-pill, 9999px);
  background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
  color: var(--color-warning);
  border: 1px solid color-mix(in srgb, var(--color-warning) 35%, transparent);
}

.kpi-danger-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: var(--radius-pill, 9999px);
  background: color-mix(in srgb, var(--color-danger) 16%, var(--color-surface));
  color: var(--color-danger);
  border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent);
}

.kpi-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.kpi-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.kpi-label {
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-extra-chip {
  font-size: 0.66rem;
  font-weight: 700;
  color: var(--color-text-subtle);
  background: color-mix(in srgb, var(--color-text-subtle) 10%, transparent);
  padding: 1px 6px;
  border-radius: 6px;
}

.kpi-num {
  color: var(--color-text-strong);
  font-size: 1.58rem;
  font-weight: 900;
  line-height: 1.18;
  direction: ltr;
  text-align: right;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;

  &.hero-num {
    font-size: 1.88rem;
  }
}

.kpi-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 24px;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
  position: relative;
  z-index: 1;
}

.kpi-sub {
  color: var(--color-text-subtle);
  font-size: 0.74rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.kpi-spark-wrap {
  flex-shrink: 0;
  opacity: 0.88;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;

  .kpi-spark {
    display: block;
  }
}

.bento-kpi-card:hover .kpi-spark-wrap {
  opacity: 1;
  transform: scale(1.05);
}

/* ── Tone Color Schemes ── */
.bento-kpi-card.sales {
  --glow-color: rgba(217, 119, 6, 0.16);
  --halo-color: rgba(217, 119, 6, 0.28);
  --border-hover-color: #d97706;
  --icon-bg: color-mix(in srgb, #d97706 14%, var(--color-surface));
  --icon-color: #d97706;
  --icon-border: color-mix(in srgb, #d97706 35%, transparent);
  border-color: color-mix(in srgb, #d97706 35%, var(--color-border));
}

.bento-kpi-card.profit {
  --glow-color: rgba(16, 185, 129, 0.18);
  --halo-color: rgba(16, 185, 129, 0.3);
  --border-hover-color: #10b981;
  --icon-bg: color-mix(in srgb, #10b981 14%, var(--color-surface));
  --icon-color: #10b981;
  --icon-border: color-mix(in srgb, #10b981 35%, transparent);
  border-color: color-mix(in srgb, #10b981 35%, var(--color-border));
}

.bento-kpi-card.teal {
  --glow-color: rgba(13, 148, 136, 0.18);
  --halo-color: rgba(13, 148, 136, 0.3);
  --border-hover-color: #0d9488;
  --icon-bg: color-mix(in srgb, #0d9488 14%, var(--color-surface));
  --icon-color: #0d9488;
  --icon-border: color-mix(in srgb, #0d9488 35%, transparent);
  border-color: color-mix(in srgb, #0d9488 35%, var(--color-border));
}

.bento-kpi-card.warning {
  --glow-color: rgba(245, 158, 11, 0.16);
  --halo-color: rgba(245, 158, 11, 0.28);
  --border-hover-color: var(--color-warning);
  --icon-bg: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
  --icon-color: var(--color-warning);
  --icon-border: color-mix(in srgb, var(--color-warning) 35%, transparent);
  border-color: color-mix(in srgb, var(--color-warning-border) 60%, var(--color-border));
}

.bento-kpi-card.danger {
  --glow-color: rgba(239, 68, 68, 0.18);
  --halo-color: rgba(239, 68, 68, 0.3);
  --border-hover-color: var(--color-danger);
  --icon-bg: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
  --icon-color: var(--color-danger);
  --icon-border: color-mix(in srgb, var(--color-danger) 35%, transparent);
  border-color: color-mix(in srgb, var(--color-danger-border) 60%, var(--color-border));
}

.bento-kpi-card.inventory {
  --glow-color: rgba(6, 182, 212, 0.16);
  --halo-color: rgba(6, 182, 212, 0.28);
  --border-hover-color: #06b6d4;
  --icon-bg: color-mix(in srgb, #06b6d4 14%, var(--color-surface));
  --icon-color: #0891b2;
  --icon-border: color-mix(in srgb, #06b6d4 35%, transparent);
  border-color: color-mix(in srgb, #06b6d4 35%, var(--color-border));
}

.bento-kpi-card.purchases {
  --glow-color: rgba(139, 92, 246, 0.16);
  --halo-color: rgba(139, 92, 246, 0.28);
  --border-hover-color: #8b5cf6;
  --icon-bg: color-mix(in srgb, #8b5cf6 14%, var(--color-surface));
  --icon-color: #7c3aed;
  --icon-border: color-mix(in srgb, #8b5cf6 35%, transparent);
  border-color: color-mix(in srgb, #8b5cf6 35%, var(--color-border));
}
</style>
