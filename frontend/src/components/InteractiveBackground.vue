<template>
  <canvas ref="canvasRef" class="interactive-bg-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

const canvasRef = ref<any>(null);
let animationFrameId: number | null = null;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // احترام تفضيل تقليل الحركة: رسم ثابت واحد فقط (بدون حلقة) أو إيقاف كامل
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  let running = false;

  const handleResize = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', handleResize);

  const particles: any[] = [];
  const particleCount = prefersReducedMotion.matches ? 12 : 45;
  const mouse = { x: null, y: null, radius: 160 };

  let lastInteractionTime = Date.now();

  const handleMouseMove = (e: any) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    lastInteractionTime = Date.now();
    if (!running && !prefersReducedMotion.matches) {
      startAnimation();
    }
  };

  const handleMouseLeave = () => {
    mouse.x = null;
    mouse.y = null;
  };

  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('mouseleave', handleMouseLeave, { passive: true });

  // init gold dust particles
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2 + 0.6,
      speedX: (Math.random() - 0.5) * 0.25,
      speedY: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.35 + 0.1,
      baseAlpha: Math.random() * 0.25 + 0.05,
    });
  }

  const animate = () => {
    if (!running) return;

    // تهدئة وإيقاف الحلقة عند خمول المؤشر لأكثر من ثانيتين لتوفير 100% من أداء المعالج والكرت لتصفح الصفحات
    if (Date.now() - lastInteractionTime > 2500) {
      stopAnimation();
      return;
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // attract to mouse pointer
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          p.x += (dx / distance) * force * 0.45;
          p.y += (dy / distance) * force * 0.45;
          p.alpha = Math.min(0.65, p.alpha + 0.02);
        } else {
          if (p.alpha > p.baseAlpha) p.alpha -= 0.005;
        }
      } else {
        if (p.alpha > p.baseAlpha) p.alpha -= 0.005;
      }

      p.x += p.speedX;
      p.y += p.speedY;

      // boundary warp
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      // draw gold particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212, 163, 115, ${p.alpha})`;
      ctx.fill();
    }

    animationFrameId = requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    if (running || prefersReducedMotion.matches) return;
    running = true;
    animate();
  };

  const stopAnimation = () => {
    running = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  // إيقاف كامل للحلقة عندما يكون التبويب مخفيًا
  const handleVisibility = () => {
    if (document.hidden) stopAnimation();
    else {
      lastInteractionTime = Date.now();
      startAnimation();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  if (!prefersReducedMotion.matches) {
    startAnimation();
  }

  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseleave', handleMouseLeave);
    document.removeEventListener('visibilitychange', handleVisibility);
    stopAnimation();
  });
});
</script>

<style scoped>
.interactive-bg-canvas {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  opacity: 0.95;
  will-change: transform;
  transform: translateZ(0);
  contain: strict;
}
</style>
