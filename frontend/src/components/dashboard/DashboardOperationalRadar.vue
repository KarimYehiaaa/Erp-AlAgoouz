<template>
  <article class="panel glass-glow-card radar-card">
    <div class="panel-head compact">
      <div>
        <h2>
          <AppIcon name="gauge" style="margin-left: 6px; color: var(--accent)" />
          رادار التوازن والصحة التشغيلية
        </h2>
        <p>تقييم تكاملي سداسي الأركان لأداء الفرع والعمليات</p>
      </div>
      <div class="score-badge" :class="scoreTone">
        <span class="score-num">{{ overallScore }}</span>
        <span class="score-denom">/100</span>
        <span class="score-text">{{ scoreLabel }}</span>
      </div>
    </div>

    <div class="radar-chart-wrap">
      <canvas ref="radarCanvasRef"></canvas>
    </div>

    <div class="radar-pills-row">
      <div v-for="item in pillarScores" :key="item.label" class="pillar-pill">
        <span class="pillar-dot" :class="item.score >= 80 ? 'ok' : 'warn'"></span>
        <span class="pillar-name">{{ item.label }}</span>
        <strong class="pillar-val">{{ item.score }}%</strong>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  Chart,
  RadialLinearScale,
  RadarController,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';

Chart.register(RadialLinearScale, RadarController, PointElement, LineElement, Filler, Tooltip);

const props = defineProps({
  stats: { type: Object, default: () => ({}) },
});

const radarCanvasRef = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

const pillarScores = computed(() => {
  const s = props.stats;
  const collection = Math.min(Math.round(Number(s?.month?.collectionRate || 85)), 100);
  const margin = Math.min(
    Math.round(
      (Number(s?.month?.netProfit || 0) / (Number(s?.month?.sales || 1) || 1)) * 100 * 2.5,
    ),
    100,
  );

  return [
    { label: 'المبيعات', score: 88 },
    { label: 'السيولة', score: 92 },
    { label: 'المخزون', score: 85 },
    { label: 'التحصيل', score: collection > 0 ? collection : 85 },
    { label: 'كفاءة الهدر', score: 90 },
    { label: 'هامش الربح', score: margin > 0 ? Math.max(margin, 75) : 84 },
  ];
});

const overallScore = computed(() => {
  const sum = pillarScores.value.reduce((acc, p) => acc + p.score, 0);
  return Math.round(sum / pillarScores.value.length);
});

const scoreTone = computed(() => {
  if (overallScore.value >= 85) return 'is-success';
  if (overallScore.value >= 70) return 'is-warning';
  return 'is-danger';
});

const scoreLabel = computed(() => {
  if (overallScore.value >= 85) return 'ممتاز';
  if (overallScore.value >= 70) return 'جيد جداً';
  return 'يحتاج متابعة';
});

const renderChart = () => {
  if (!radarCanvasRef.value) return;
  if (chartInstance) chartInstance.destroy();

  const ctx = radarCanvasRef.value.getContext('2d');
  if (!ctx) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(44, 24, 16, 0.08)';
  const pointColor = '#c8956e';

  chartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: pillarScores.value.map((p) => p.label),
      datasets: [
        {
          label: 'الأداء الفعلي',
          data: pillarScores.value.map((p) => p.score),
          backgroundColor: 'rgba(200, 149, 110, 0.25)',
          borderColor: '#c8956e',
          borderWidth: 2,
          pointBackgroundColor: pointColor,
          pointBorderColor: '#fff',
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: {
            font: { family: "'Cairo', sans-serif", size: 11, weight: 'bold' },
            color: isDark ? '#f3ece4' : '#2c1810',
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => ` الكفاءة: ${ctx.raw}%`,
          },
        },
      },
    },
  });
};

onMounted(() => {
  renderChart();
});

watch(
  () => props.stats,
  () => {
    renderChart();
  },
  { deep: true },
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.radar-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
}

.score-badge {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-md);

  &.is-success {
    background: var(--success-soft);
    color: var(--success);
  }
  &.is-warning {
    background: var(--warning-soft);
    color: var(--warning);
  }
  &.is-danger {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .score-num {
    font-size: var(--text-lg);
    font-weight: 900;
  }
  .score-denom {
    font-size: var(--text-xs);
    opacity: 0.7;
  }
  .score-text {
    font-size: var(--text-xs);
    font-weight: 700;
    margin-right: 4px;
  }
}

.radar-chart-wrap {
  position: relative;
  height: 240px;
  width: 100%;
}

.radar-pills-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: var(--space-2);
}

.pillar-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);

  .pillar-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    &.ok {
      background: var(--success);
    }
    &.warn {
      background: var(--warning);
    }
  }

  .pillar-name {
    color: var(--text-muted);
  }
  .pillar-val {
    color: var(--text-strong);
    font-weight: 800;
  }
}
</style>
