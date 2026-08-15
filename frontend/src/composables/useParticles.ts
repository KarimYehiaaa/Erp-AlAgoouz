import { ref, onUnmounted } from 'vue';

/** خيارات تأثير الجزيئات. */
export interface ParticlesOptions {
  count?: number;
  color?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
}

/**
 * تأثير جزيئات متحركة على خلفية canvas.
 * @param {ParticlesOptions} [options] الخيارات
 * @returns {{ canvasRef: Ref<HTMLCanvasElement | null>, init: (canvas: HTMLCanvasElement) => void, destroy: () => void, isActive: Ref<boolean> }}
 */
export function useParticles(options: ParticlesOptions = {}) {
  const {
    count = 25,
    color = 'rgba(196, 164, 124, 0.35)',
    minSize = 3,
    maxSize = 8,
    speed = 0.4,
  } = options;

  const canvasRef = ref<any>(null);
  let ctx: CanvasRenderingContext2D | null = null;
  let particles: any[] = [];
  let animationId: number | null = null;
  let isActive = false;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const createParticle = (width: any, height: any) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * (maxSize - minSize) + minSize,
    speedX: (Math.random() - 0.5) * speed,
    speedY: (Math.random() - 0.5) * speed - 0.15,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    opacity: Math.random() * 0.4 + 0.15,
    shape: Math.random() > 0.4 ? 'bean' : 'circle',
  });

  const drawBean = (p: any) => {
    if (!ctx) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${p.opacity * 0.5})`);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -p.size * 1.1);
    ctx.quadraticCurveTo(p.size * 0.3, 0, 0, p.size * 1.1);
    ctx.stroke();
    ctx.restore();
  };

  const drawCircle = (p: any) => {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const animate = () => {
    if (!ctx || !canvasRef.value) return;

    const { width, height } = canvasRef.value;
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.rotationSpeed;

      if (p.x < -p.size * 2) p.x = width + p.size;
      if (p.x > width + p.size * 2) p.x = -p.size;
      if (p.y < -p.size * 2) p.y = height + p.size;
      if (p.y > height + p.size * 2) p.y = -p.size;

      if (p.shape === 'bean') {
        drawBean(p);
      } else {
        drawCircle(p);
      }
    }

    animationId = requestAnimationFrame(animate);
  };

  const init = (canvas: any) => {
    if (prefersReducedMotion.matches) return;

    canvasRef.value = canvas;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      if (!canvasRef.value) return;
      const rect = canvasRef.value.parentElement?.getBoundingClientRect();
      if (rect) {
        canvasRef.value.width = rect.width;
        canvasRef.value.height = rect.height;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    particles = Array.from({ length: count }, () => createParticle(canvas.width, canvas.height));

    isActive = true;
    animate();

    onUnmounted(() => {
      window.removeEventListener('resize', resize);
    });
  };

  const destroy = () => {
    isActive = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    particles = [];
    ctx = null;
  };

  onUnmounted(destroy);

  return {
    canvasRef,
    init,
    destroy,
    isActive: ref(isActive),
  };
}
