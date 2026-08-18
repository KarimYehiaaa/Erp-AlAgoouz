<template>
  <svg
    class="sparkline"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="uid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :style="{ stopColor: color }" stop-opacity="0.28" />
        <stop offset="100%" :style="{ stopColor: color }" stop-opacity="0" />
      </linearGradient>
    </defs>
    <template v-if="points.length">
      <polygon :points="areaPoints" :fill="`url(#${uid})`" class="spark-area" />
      <polyline
        :points="linePoints"
        fill="none"
        :style="{ stroke: color }"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="spark-line"
      />
      <circle
        :cx="lastPoint[0]"
        :cy="lastPoint[1]"
        r="2.2"
        :style="{ fill: color }"
        class="spark-dot"
      />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    data: number[];
    color?: string;
    height?: number;
    width?: number;
  }>(),
  { color: 'var(--primary)', height: 18, width: 90 },
);

// معرف فريد لكل رسم حتى لا تتعارض تدرجات SVG المتعددة في نفس الصفحة
const uid = `spark-${Math.random().toString(36).slice(2, 9)}`;

const points = computed(() => {
  const values = props.data.map(Number).filter((v) => Number.isFinite(v));
  if (values.length < 2) return [] as [number, number][];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = props.width / (values.length - 1);
  return values.map((v, i) => {
    const x = i * stepX;
    const y = props.height - 2.5 - ((v - min) / range) * (props.height - 7);
    return [x, y] as [number, number];
  });
});

const linePoints = computed(() =>
  points.value.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
);

const lastPoint = computed(() => points.value[points.value.length - 1] || [0, 0]);

const areaPoints = computed(() => {
  if (!points.value.length) return '';
  const last = points.value[points.value.length - 1]!;
  return `${linePoints.value} ${last[0].toFixed(1)},${props.height} 0,${props.height}`;
});

// إعادة تشغيل حركة الرسم عند تغيير البيانات
const restart = () => {
  const els = document.querySelectorAll(`.sparkline[data-uid="${uid}"] .spark-line`);
  els.forEach((el) => {
    (el as SVGElement).style.animation = 'none';
    void (el as SVGElement).getBoundingClientRect();
    (el as SVGElement).style.animation = '';
  });
};

watch(
  () => props.data,
  () => restart(),
);
</script>

<style scoped>
.sparkline {
  display: block;
  overflow: visible;
}

.spark-line {
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  animation: spark-draw 1.05s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.spark-area {
  animation: spark-fade 0.8s ease 0.35s both;
}

.spark-dot {
  animation: spark-dot-pop 0.4s ease 0.85s both;
}

@keyframes spark-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes spark-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes spark-dot-pop {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spark-line,
  .spark-area,
  .spark-dot {
    animation: none !important;
    stroke-dashoffset: 0 !important;
  }
}
</style>
