<template>
  <span class="animated-number" :class="{ pulsing }"><slot>{{ display }}</slot></span>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number;
    format?: (_n: number) => string;
    duration?: number;
    pulse?: boolean;
  }>(),
  { format: (n: number) => String(n), duration: 900, pulse: true },
);

const display = ref('');
const pulsing = ref(false);
let raf = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const animate = (from: number, to: number) => {
  cancelAnimationFrame(raf);
  const start = performance.now();
  const dur = props.duration;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    display.value = props.format(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else display.value = props.format(to);
  };
  raf = requestAnimationFrame(step);
};

watch(
  () => props.value,
  (to, from) => {
    animate(Number(from) || 0, Number(to) || 0);
    if (props.pulse && Number(from) !== Number(to)) {
      pulsing.value = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (pulsing.value = false), 600);
    }
  },
);

onMounted(() => animate(0, Number(props.value) || 0));
</script>

<style scoped>
.animated-number {
  display: inline-block;
  font-variant-numeric: tabular-nums;
}

.animated-number.pulsing {
  animation: number-pulse 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes number-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.14);
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 50%, transparent));
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .animated-number.pulsing {
    animation: none;
  }
}
</style>
