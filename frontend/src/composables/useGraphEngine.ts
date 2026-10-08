/**
 * composables/useGraphEngine.ts — محرك الفيزياء والحركة الحقيقي لخريطة سير العمليات
 *
 * محاكاة قوى يدوية (بلا مكتبات خارجية — d3-force غير مثبتة في المشروع):
 *   تنافر بين العقد (Coulomb) + نوابض الروابط بمسافة هدف + تصادم بأنصاف أقطار + جذب مركزي.
 * القيم تُقرأ من إعدادات الفيزياء (GET/PUT /automation/physics) عبر setPhysics/updatePhysicsLive.
 *
 * الرسم بأسلوب dirty-rendering: لا حلقة requestAnimationFrame إلا أثناء الحركة الفعلية
 * (فيزياء حية، انتقال تخطيط، موجات تنفيذ، تخفيف كاميرا) — تتوقف كليًا عند الخمول
 * وعند إخفاء التبويب (setActive(false)) وعند document.hidden. (البندان 15 و2.5)
 *
 * ألوان الرسم تُقرأ من متغيرات CSS للثيم (--bg-card و--text وأمثالها) وقت الرسم
 * لدعم الوضع الليلي بدل الثوابت الفاتحة المدمجة. (البند 12)
 */
import { ref, reactive, onUnmounted } from 'vue';
import type { GraphNode, GraphEdge, PhysicsSettings } from '@/api/automation.api';

// ─── أنواع داخلية ───
export interface EngineNode extends GraphNode {
  vx: number;
  vy: number;
  width: number;
  height: number;
  glow: number; // شدة التوهج النشط 0..1 (موجات التنفيذ)
  rippleT: number; // تقدم هالة الـ ripple على عقدة الوكيل (-1 = خاملة)
  enter: number; // تقدم حركة الدخول 0..1
  spawnDelay: number; // تأخير دخول متتابع (ms)
  fixed: boolean; // عقدة قيد السحب
}

export interface EngineEdge extends GraphEdge {
  glow: number; // توهج الحافة أثناء مرور الموجة 0..1
}

/** موجة تنفيذ حقيقية تسري في حافة محددة */
interface FlowWave {
  edgeIndex: number;
  progress: number;
  speed: number;
  color: string;
}

interface Tween {
  // انتقال سلس بين مواقع التخطيطات
  nodeId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export type EngineLayout = 'pipeline' | 'tree';

const NODE_W = 170;
const NODE_H = 72;

export const DEFAULT_PHYSICS: PhysicsSettings = {
  repelForce: 3600,
  linkDistance: 230,
  collisionRadius: 26,
  centerForceX: 0.035,
  centerForceY: 0.03,
};

// حدود عليا لأداء الأجهزة الضعيفة
const MAX_DPR = 2;
const MAX_WAVES = 24;
const PHYSICS_MAX_SPEED = 24;

export interface GraphEngineOptions {
  /** يُستدعى عند نقر عقدة (اختيار) أو إلغائها */
  onNodeSelect?: (node: EngineNode | null) => void;
  /** يُستدعى عند إفلات عقدة مسحوبة ل حفظ مواقعها عبر updateNodePositions (debounce في الطبقة الأعلى) */
  onDragEnd?: (node: EngineNode) => void;
}

export function useGraphEngine(options: GraphEngineOptions = {}) {
  // ─── حالة معرضة للمكوّن ───
  const nodes = ref<EngineNode[]>([]);
  const edges = ref<EngineEdge[]>([]);
  const currentLayout = ref<EngineLayout>('pipeline');
  const zoom = ref(1);
  const pan = reactive({ x: 0, y: 0 });
  const physics = reactive<PhysicsSettings>({ ...DEFAULT_PHYSICS });
  const physicsFrozen = ref(false); // «تثبيت الفيزياء» — إيقاف القوى والاكتفاء بالرسم
  const hoveredNode = ref<EngineNode | null>(null);
  const selectedNode = ref<EngineNode | null>(null);
  const tooltipPos = reactive({ x: 0, y: 0 });
  /** هل هناك حركة مستمرة الآن (لعرض مؤشر في الواجهة إن لزم) */
  const isAnimating = ref(false);

  // ─── حالة داخلية ───
  let canvasEl: HTMLCanvasElement | null = null;
  let containerEl: HTMLElement | null = null;
  let minimapEl: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let minimapCtx: CanvasRenderingContext2D | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let rafId: number | null = null;
  let engineActive = false; // تبويب الخريطة معروض
  let lastFrameTs = 0;
  let themeReadTs = 0;

  // كاميرا مستهدفة (تخفيف ناعم easing)
  const camTarget = { zoom: 1, x: 0, y: 0 };
  let camAnimating = false;

  // الفيزياء
  let alpha = 0; // طاقة المحاكاة — تتحلل حتى التوقف الكامل للحلقة

  // انتقالات التخطيط
  let tweens: Tween[] = [];
  let tweenStartTs = 0;
  const TWEEN_MS = 650;

  // موجات التنفيذ وهالات العقد
  const waves: FlowWave[] = [];

  // سحب وتحويم
  let dragNodeId: number | null = null;
  let dragOffset = { x: 0, y: 0 };
  let isPanning = false;
  let lastPointer = { x: 0, y: 0 };
  let downPos = { x: 0, y: 0 };
  let pinchState: { dist: number; midX: number; midY: number } | null = null;

  // حركة الدخول
  let entryStartTs = 0;
  let entryDuration = 0;

  // بحث بارز
  let highlightNodeId: number | null = null;

  // ألوان الثيم المقرؤة من CSS
  const theme = {
    bg: '#ffffff',
    card: '#ffffff',
    text: '#0f172a',
    textMuted: '#64748b',
    border: '#e2e8f0',
    accent: '#0284c7',
    dark: false,
  };

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── قراءة ألوان الثيم من متغيرات CSS (مع تخزين مؤقت قصير) ───
  function readThemeColors() {
    const now = performance.now();
    if (now - themeReadTs < 250) return;
    themeReadTs = now;
    const el = containerEl || document.documentElement;
    const cs = getComputedStyle(el);
    const pick = (names: string[], fallback: string): string => {
      for (const n of names) {
        const v = cs.getPropertyValue(n)?.trim();
        if (v) return v;
      }
      return fallback;
    };
    theme.card = pick(['--bg-card', '--bg', '--color-surface'], '#ffffff');
    theme.bg = pick(['--bg-soft', '--bg', '--color-bg-subtle'], theme.card);
    theme.text = pick(
      ['--text-primary', '--text-strong', '--text', '--color-text-strong'],
      '#0f172a',
    );
    theme.textMuted = pick(['--text-secondary', '--text-muted', '--color-text-muted'], '#64748b');
    theme.border = pick(['--border-color', '--border', '--color-border'], '#e2e8f0');
    theme.accent = pick(['--primary', '--accent', '--color-primary'], '#0284c7');
    // كشف الوضع الداكن من إضاءة لون الخلفية
    theme.dark = isDarkColor(theme.card);
  }

  function isDarkColor(color: string): boolean {
    const m = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) {
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
    }
    const hex = color.replace('#', '');
    if (hex.length === 6 || hex.length === 3) {
      const full =
        hex.length === 3
          ? hex
              .split('')
              .map((c) => c + c)
              .join('')
          : hex;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
    }
    return false;
  }

  // ─── إدارة الحلقة: dirty rendering فقط ───
  function markDirty() {
    ensureLoop();
  }

  function loopActive(): boolean {
    // هل ما زالت هناك أسباب لإطار جديد؟
    if (tweens.length) return true;
    if (!engineActive || document.hidden) return false;
    if (camAnimating) return true;
    if (waves.length) return true;
    if (entryStartTs && performance.now() - entryStartTs < entryDuration) return true;
    if (!physicsFrozen.value && alpha > 0.004) return true;
    if (nodes.value.some((n) => n.glow > 0.01 || n.rippleT >= 0 || n.enter < 1)) return true;
    if (edges.value.some((e) => e.glow > 0.01)) return true;
    if (!reducedMotion) return true; // استمرار حركة النبضات الانسيابية طالما التبويب نشط
    return false;
  }

  function ensureLoop() {
    if (rafId !== null) return;
    if (!engineActive || document.hidden) return; // البند 15: لا استهلاك رسم عند الخفاء
    lastFrameTs = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function frame(ts: number) {
    rafId = null;
    const dt = Math.min((ts - lastFrameTs) / 1000, 0.05) || 0.016;
    lastFrameTs = ts;

    stepCamera(dt);
    stepLayoutTweens();
    if (!physicsFrozen.value) stepPhysics(dt);
    stepEffects(dt);

    draw();

    if (loopActive()) {
      rafId = requestAnimationFrame(frame);
    } else {
      // خمول تام — إيقاف الحلقة نهائيًا حتى العلامة التالية
      isAnimating.value = false;
      alpha = 0;
    }
  }

  function wakePhysics(strength = 1) {
    alpha = Math.max(alpha, strength);
    isAnimating.value = true;
    markDirty();
  }

  // ─── خطوات المحاكاة ───
  function stepCamera(dt: number) {
    if (!camAnimating) return;
    const k = Math.min(1, dt * 9); // تخفيف أُسّي ناعم
    zoom.value += (camTarget.zoom - zoom.value) * k;
    pan.x += (camTarget.x - pan.x) * k;
    pan.y += (camTarget.y - pan.y) * k;
    if (
      Math.abs(camTarget.zoom - zoom.value) < 0.001 &&
      Math.abs(camTarget.x - pan.x) < 0.5 &&
      Math.abs(camTarget.y - pan.y) < 0.5
    ) {
      zoom.value = camTarget.zoom;
      pan.x = camTarget.x;
      pan.y = camTarget.y;
      camAnimating = false;
    }
    clampCamera();
  }

  function clampCamera() {
    zoom.value = Math.min(Math.max(zoom.value, 0.3), 3);
  }

  function stepLayoutTweens() {
    if (!tweens.length) return;
    const t = Math.min(1, (performance.now() - tweenStartTs) / TWEEN_MS);
    const e = easeInOutCubic(t);
    const byId = new Map<number, EngineNode>();
    for (const n of nodes.value) byId.set(n.id, n);
    for (const tw of tweens) {
      const n = byId.get(tw.nodeId);
      if (!n) continue;
      n.x = tw.fromX + (tw.toX - tw.fromX) * e;
      n.y = tw.fromY + (tw.toY - tw.fromY) * e;
      n.vx = 0;
      n.vy = 0;
    }
    if (t >= 1) tweens = [];
  }

  function stepPhysics(dt: number) {
    if (alpha <= 0.004) return;
    // تبريد الطاقة (مثل alpha في d3-force)
    alpha *= Math.pow(0.985, dt * 60);
    const ns = nodes.value;
    const es = edges.value;
    const nCount = ns.length;
    if (!nCount) return;

    // 1) تنافر بين العقد (Coulomb) — O(n²) مقبول لعدد عقد الخريطة الصغير (≈12)
    for (let i = 0; i < nCount; i++) {
      const a = ns[i]!;
      for (let j = i + 1; j < nCount; j++) {
        const b = ns[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          d2 = 4;
        }
        if (d2 > 1_000_000) continue; // تجاهل الأزواج البعيدة (حد أداء)
        const f = (physics.repelForce * alpha) / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2) نوابض الروابط نحو مسافة الهدف
    const byId = new Map<number, EngineNode>();
    for (const n of ns) byId.set(n.id, n);
    for (const e of es) {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = 0.06 * alpha;
      const f = k * (d - physics.linkDistance);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // 3) جذب مركزي
    for (const n of ns) {
      n.vx -= n.x * physics.centerForceX * alpha;
      n.vy -= n.y * physics.centerForceY * alpha;
    }

    // 4) تكامل الحركة + تصادم بأنصاف الأقطار
    for (const n of ns) {
      if (n.fixed) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= 0.82;
      n.vy *= 0.82;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > PHYSICS_MAX_SPEED) {
        n.vx = (n.vx / sp) * PHYSICS_MAX_SPEED;
        n.vy = (n.vy / sp) * PHYSICS_MAX_SPEED;
      }
      n.x += n.vx * dt * 60;
      n.y += n.vy * dt * 60;
    }
    resolveCollisions(ns);
  }

  function resolveCollisions(ns: EngineNode[]) {
    const nCount = ns.length;
    for (let i = 0; i < nCount; i++) {
      const a = ns[i]!;
      for (let j = i + 1; j < nCount; j++) {
        const b = ns[j]!;
        const minDist =
          (Math.hypot(a.width, a.height) + Math.hypot(b.width, b.height)) / 2 / 2 +
          physics.collisionRadius * 0.5;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minDist) {
          const push = ((minDist - d) / d) * 0.4;
          const fx = dx * push;
          const fy = dy * push;
          if (!a.fixed) {
            a.x -= fx;
            a.y -= fy;
          }
          if (!b.fixed) {
            b.x += fx;
            b.y += fy;
          }
        }
      }
    }
  }

  function stepEffects(dt: number) {
    // موجات التنفيذ الحقيقية
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]!;
      w.progress += w.speed * dt;
      const edge = edges.value[w.edgeIndex];
      if (edge) edge.glow = Math.max(edge.glow, 0.85);
      if (w.progress >= 1) {
        waves.splice(i, 1);
        if (edge) edge.glow = Math.min(edge.glow, 0.6); // توهج باقٍ يتلاشى تدريجيًا
      }
    }
    for (const e of edges.value) {
      if (e.glow > 0 && !waves.some((w) => edges.value[w.edgeIndex] === e)) {
        e.glow = Math.max(0, e.glow - dt * 0.5);
      }
    }
    // توهج وهالات العقد
    for (const n of nodes.value) {
      if (n.glow > 0) n.glow = Math.max(0, n.glow - dt * 0.35);
      if (n.rippleT >= 0) {
        n.rippleT += dt * 0.9;
        if (n.rippleT > 1) n.rippleT = -1;
      }
      if (n.enter < 1 && entryStartTs) {
        const elapsed = performance.now() - entryStartTs - n.spawnDelay;
        if (elapsed > 0) {
          n.enter = reducedMotion ? 1 : Math.min(1, elapsed / 380);
        }
      }
    }
  }

  // ─── الرسم ───
  function draw() {
    if (!canvasEl || !ctx) return;
    readThemeColors();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = canvasEl.width / dpr;
    const height = canvasEl.height / dpr;

    // 1. إعادة ضبط مصفوفة التحويل بالكامل ومسح كامل بكسلات الذاكرة التخزينية
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // 2. تفعيل مقياس DPR لشاشات العرض بدقة 1:1 مع إحداثيات الـ CSS
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 3. ملء الخلفية بلون صلب يطابق بطاقة الثيم لمنع ترسبات الشفافية وظلال التتبع في المتصفح
    ctx.fillStyle = theme.card;
    ctx.fillRect(0, 0, width, height);

    // 4. رسم شبكة النقاط الهندسية
    drawDotGrid(ctx, width, height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom.value, zoom.value);

    drawEdges(ctx);
    drawWaves(ctx);
    drawNodes(ctx);

    ctx.restore();
    drawMinimap();
  }

  function drawDotGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.fillStyle = theme.dark ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.14)';
    const gridSize = 24 * zoom.value;
    const offsetX = ((pan.x % gridSize) + gridSize) % gridSize;
    const offsetY = ((pan.y % gridSize) + gridSize) % gridSize;
    // حد أعلى لعدد النقاط على الأجهزة الضعيفة
    const cols = Math.ceil(width / gridSize);
    const rows = Math.ceil(height / gridSize);
    if (cols * rows > 6000) {
      ctx.restore();
      return;
    }
    for (let x = offsetX; x < width; x += gridSize) {
      for (let y = offsetY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function edgeCurve(source: EngineNode, target: EngineNode) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const hw = (source.width || NODE_W) / 2;
    const hh = (source.height || NODE_H) / 2;

    let sx: number;
    let sy: number;
    let tx: number;
    let ty: number;

    // توجيه انسيابي أفقي رئيسي للمسارات
    if (Math.abs(dx) >= Math.abs(dy) * 0.75) {
      if (dx >= 0) {
        sx = source.x + hw;
        tx = target.x - hw;
      } else {
        sx = source.x - hw;
        tx = target.x + hw;
      }
      sy = source.y;
      ty = target.y;
    } else {
      // توجيه رأسي
      if (dy >= 0) {
        sy = source.y + hh;
        ty = target.y - hh;
      } else {
        sy = source.y - hh;
        ty = target.y + hh;
      }
      sx = source.x;
      tx = target.x;
    }

    const dist = Math.hypot(tx - sx, ty - sy);
    const curvature = Math.min(Math.max(dist * 0.45, 45), 200);

    let cx1 = sx;
    let cy1 = sy;
    let cx2 = tx;
    let cy2 = ty;

    if (Math.abs(dx) >= Math.abs(dy) * 0.75) {
      const dir = dx >= 0 ? 1 : -1;
      cx1 = sx + curvature * dir;
      cx2 = tx - curvature * dir;
    } else {
      const dir = dy >= 0 ? 1 : -1;
      cy1 = sy + curvature * dir;
      cy2 = ty - curvature * dir;
    }

    return { sx, sy, cx1, cy1, cx2, cy2, tx, ty };
  }

  function drawArrowhead(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
    size = 9,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.48);
    ctx.lineTo(-size * 0.65, 0);
    ctx.lineTo(-size, size * 0.48);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawEdgeBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    isHighlighted: boolean,
    color: string,
  ) {
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, "Cairo", sans-serif';
    const textMetrics = ctx.measureText(text);
    const tw = textMetrics.width;
    const badgeW = tw + 18;
    const badgeH = 22;
    const rx = x - badgeW / 2;
    const ry = y - badgeH / 2;

    ctx.beginPath();
    roundRect(ctx, rx, ry, badgeW, badgeH, 11);
    ctx.fillStyle = isHighlighted
      ? theme.dark
        ? 'rgba(30, 41, 59, 0.96)'
        : 'rgba(255, 255, 255, 0.98)'
      : theme.dark
        ? 'rgba(15, 23, 42, 0.92)'
        : 'rgba(248, 250, 252, 0.96)';
    ctx.fill();

    ctx.lineWidth = isHighlighted ? 1.6 : 1;
    ctx.strokeStyle = isHighlighted
      ? color
      : theme.dark
        ? 'rgba(148, 163, 184, 0.35)'
        : 'rgba(203, 213, 225, 0.85)';
    ctx.stroke();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = isHighlighted ? (theme.dark ? '#38bdf8' : '#0284c7') : theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawEdges(ctx: CanvasRenderingContext2D) {
    const nodeMap = new Map<number, EngineNode>();
    for (const n of nodes.value) nodeMap.set(n.id, n);

    const activeNodeId = selectedNode.value?.id ?? hoveredNode.value?.id ?? null;
    const now = performance.now();

    for (let i = 0; i < edges.value.length; i++) {
      const edge = edges.value[i]!;
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;

      const isConnected =
        activeNodeId !== null && (edge.source === activeNodeId || edge.target === activeNodeId);
      const isDimmed = activeNodeId !== null && !isConnected;

      const c = edgeCurve(s, t);

      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.16;
      } else if (isConnected) {
        ctx.globalAlpha = 1.0;
      } else {
        ctx.globalAlpha = 0.72;
      }

      const sColor = getNodeColor(s.group);
      const tColor = getNodeColor(t.group);

      // تدرج لوني انسيابي يربط بين مجموعة العقدة المصدر والمستقبلة
      const grad = ctx.createLinearGradient(c.sx, c.sy, c.tx, c.ty);
      grad.addColorStop(0, sColor);
      grad.addColorStop(1, tColor);

      ctx.beginPath();
      ctx.moveTo(c.sx, c.sy);
      ctx.bezierCurveTo(c.cx1, c.cy1, c.cx2, c.cy2, c.tx, c.ty);

      if (isConnected) {
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3.2;
        ctx.shadowColor = sColor;
        ctx.shadowBlur = 10;
      } else if (edge.glow > 0.01) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2.4;
        ctx.shadowColor = theme.accent;
        ctx.shadowBlur = 12 * edge.glow;
      } else {
        ctx.strokeStyle = theme.dark ? 'rgba(148, 163, 184, 0.40)' : 'rgba(148, 163, 184, 0.60)';
        ctx.lineWidth = 1.8;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // سهم توجيه هندسي احترافي يصب مباشرة في جدار العقدة الهدف
      const arrowAngle = Math.atan2(c.ty - c.cy2, c.tx - c.cx2);
      drawArrowhead(
        ctx,
        c.tx,
        c.ty,
        arrowAngle,
        isConnected ? tColor : theme.dark ? 'rgba(148, 163, 184, 0.75)' : '#64748b',
        isConnected ? 10 : 8,
      );

      // نبضات طاقة متحركة لطيفة توضح سريان البيانات على طول المسار
      if (!reducedMotion && !isDimmed) {
        const pulseT = (now * 0.0004 + i * 0.13) % 1;
        const pt = getBezierPoint(c.sx, c.sy, c.cx1, c.cy1, c.cx2, c.cy2, c.tx, c.ty, pulseT);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isConnected ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isConnected ? '#ffffff' : sColor;
        ctx.shadowColor = sColor;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      // بطاقة اسم الرابط (Floating Pill Badge)
      if (edge.label) {
        const mid = getBezierPoint(c.sx, c.sy, c.cx1, c.cy1, c.cx2, c.cy2, c.tx, c.ty, 0.5);
        drawEdgeBadge(ctx, edge.label, mid.x, mid.y, isConnected, sColor);
      }

      ctx.restore();
    }
  }

  function drawWaves(ctx: CanvasRenderingContext2D) {
    const nodeMap = new Map<number, EngineNode>();
    for (const n of nodes.value) nodeMap.set(n.id, n);
    ctx.save();
    for (const w of waves) {
      const edge = edges.value[w.edgeIndex];
      if (!edge) continue;
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;
      const c = edgeCurve(s, t);
      const pos = getBezierPoint(c.sx, c.sy, c.cx1, c.cy1, c.cx2, c.cy2, c.tx, c.ty, w.progress);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = w.color;
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 12;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNodes(ctx: CanvasRenderingContext2D) {
    const regularNodes: EngineNode[] = [];
    let draggedNode: EngineNode | null = null;

    for (const n of nodes.value) {
      if (dragNodeId === n.id) {
        draggedNode = n;
      } else {
        regularNodes.push(n);
      }
    }

    for (const n of regularNodes) {
      drawSingleNode(ctx, n, false);
    }
    if (draggedNode) {
      drawSingleNode(ctx, draggedNode, true);
    }
  }

  function drawSingleNode(ctx: CanvasRenderingContext2D, n: EngineNode, isDragging: boolean) {
    const isHovered = hoveredNode.value?.id === n.id;
    const isSelected = selectedNode.value?.id === n.id;
    const isHighlighted = highlightNodeId === n.id;
    const enter = reducedMotion ? 1 : n.enter;
    if (enter <= 0) return;

    const w = n.width;
    const h = n.height;
    // عند السحب: رفع خفيف وتكبير سلس وتثبيت الإزاحة
    const scale = isDragging ? 1.03 : 0.85 + 0.15 * easeOutCubic(enter);
    const alphaEnter = easeOutCubic(enter);
    const slideY = isDragging ? 0 : (1 - easeOutCubic(enter)) * 14;

    ctx.save();
    ctx.globalAlpha = alphaEnter;
    ctx.translate(n.x, n.y + slideY);
    ctx.scale(scale, scale);

    const accent = getNodeColor(n.group);

    // هالة ripple على عقدة الوكيل عند التنفيذ الحقيقي
    if (n.rippleT >= 0) {
      const rt = n.rippleT;
      const rr = (w / 2) * (1 + rt * 1.4);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${(1 - rt) * 0.55})`;
      ctx.lineWidth = 2.5 * (1 - rt) + 0.5;
      ctx.stroke();
    }

    // ظل الكارت النظيف
    if (isDragging) {
      ctx.shadowColor = theme.dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(2, 132, 199, 0.22)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 6;
    } else if (n.glow > 0.01 || isHighlighted) {
      const g = Math.max(n.glow, isHighlighted ? 0.8 : 0);
      ctx.shadowColor = accent;
      ctx.shadowBlur = 26 * g;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowColor = theme.dark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(15, 23, 42, 0.08)';
      ctx.shadowBlur = isHovered ? 16 : 8;
      ctx.shadowOffsetY = 2;
    }

    // خلفية بطاقة العقدة بلون الثيم
    ctx.beginPath();
    roundRect(ctx, -w / 2, -h / 2, w, h, 12);
    ctx.fillStyle = theme.card;
    ctx.fill();

    // إلغاء الظل فوراً لمنع ترسبه أو تكراره في أي عناصر أخرى
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowColor = 'transparent';

    // تمييز لوني متدرج لبطاقة العقدة حسب المجموعة
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    grad.addColorStop(0, hexWithAlpha(accent, theme.dark ? 0.16 : 0.07));
    grad.addColorStop(1, hexWithAlpha(accent, 0));
    ctx.fillStyle = grad;
    ctx.fill();

    // إطار البطاقة
    ctx.lineWidth = isDragging ? 2.5 : isSelected ? 2.5 : isHovered ? 2 : 1.2;
    ctx.strokeStyle = isDragging
      ? theme.accent
      : isSelected
        ? theme.accent
        : isHovered || isHighlighted
          ? accent
          : theme.dark
            ? 'rgba(148, 163, 184, 0.35)'
            : theme.border;
    ctx.stroke();

    // شريط التصنيف الجانبي
    ctx.beginPath();
    roundRectLeft(ctx, -w / 2, -h / 2, 6, h, 12);
    ctx.fillStyle = accent;
    ctx.fill();

    // نقطة الحالة
    ctx.beginPath();
    ctx.arc(w / 2 - 16, -h / 2 + 16, 4, 0, Math.PI * 2);
    ctx.fillStyle = n.is_active ? '#10b981' : theme.textMuted;
    if (n.glow > 0.4) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 8 * n.glow;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // الاسم بالعربية
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'right';
    ctx.fillText(n.label_ar || n.label, w / 2 - 28, -h / 2 + 26);

    // نوع العقدة والمجموعة
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(typeLabelOf(n.type), w / 2 - 28, -h / 2 + 46);

    ctx.restore();
  }

  // ─── الخريطة المصغرة ───
  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }

  function roundRectLeft(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }

  function drawMinimap() {
    if (!minimapEl || !minimapCtx) return;
    const mm = minimapEl;
    const mctx = minimapCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (mm.width !== mm.clientWidth * dpr) {
      mm.width = mm.clientWidth * dpr;
      mm.height = mm.clientHeight * dpr;
    }
    const W = mm.width / dpr;
    const H = mm.height / dpr;
    mctx.save();
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mm.width, mm.height);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = theme.dark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(248, 250, 252, 0.85)';
    mctx.fillRect(0, 0, W, H);

    if (!nodes.value.length) {
      mctx.restore();
      return;
    }

    // نطاق العالم
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes.value) {
      minX = Math.min(minX, n.x - n.width);
      maxX = Math.max(maxX, n.x + n.width);
      minY = Math.min(minY, n.y - n.height);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const pad = 60;
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const s = Math.min(W / worldW, H / worldH);
    const toMM = (wx: number, wy: number) => ({
      x: (wx - (minX - pad)) * s + (W - worldW * s) / 2,
      y: (wy - (minY - pad)) * s + (H - worldH * s) / 2,
    });

    // الروابط
    const nodeMap = new Map(nodes.value.map((n) => [n.id, n]));
    mctx.strokeStyle = theme.textMuted;
    mctx.globalAlpha = 0.35;
    mctx.lineWidth = 0.6;
    for (const e of edges.value) {
      const a = nodeMap.get(e.source);
      const b = nodeMap.get(e.target);
      if (!a || !b) continue;
      const p1 = toMM(a.x, a.y);
      const p2 = toMM(b.x, b.y);
      mctx.beginPath();
      mctx.moveTo(p1.x, p1.y);
      mctx.lineTo(p2.x, p2.y);
      mctx.stroke();
    }
    mctx.globalAlpha = 1;

    // العقد
    for (const n of nodes.value) {
      const p = toMM(n.x, n.y);
      mctx.beginPath();
      mctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      mctx.fillStyle = getNodeColor(n.group);
      mctx.fill();
    }

    // مستطيل إطار العرض الحالي
    const container = containerEl;
    if (container) {
      const vw = container.clientWidth / zoom.value;
      const vh = container.clientHeight / zoom.value;
      const tl = screenToWorld(0, 0);
      const p1 = toMM(tl.x, tl.y);
      mctx.strokeStyle = theme.accent;
      mctx.lineWidth = 1.2;
      mctx.strokeRect(p1.x, p1.y, vw * s, vh * s);
    }
    mctx.restore();
  }

  /** تحويل إحداثيات الشاشة (بكسل الكانفس) إلى إحداثيات العالم */
  function screenToWorld(sx: number, sy: number) {
    return { x: (sx - pan.x) / zoom.value, y: (sy - pan.y) / zoom.value };
  }

  /** نقرة/سحب على الخريطة المصغرة: تحريك الكاميرا */
  function onMinimapPointer(clientX: number, clientY: number) {
    if (!minimapEl || !nodes.value.length || !containerEl) return;
    const rect = minimapEl.getBoundingClientRect();
    // إعادة حساب نفس تحويل drawMinimap
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes.value) {
      minX = Math.min(minX, n.x - n.width);
      maxX = Math.max(maxX, n.x + n.width);
      minY = Math.min(minY, n.y - n.height);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const pad = 60;
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const W = rect.width;
    const H = rect.height;
    const s = Math.min(W / worldW, H / worldH);
    const originX = minX - pad - (W - worldW * s) / 2 / s;
    const originY = minY - pad - (H - worldH * s) / 2 / s;
    const wx = (clientX - rect.left) / s + originX;
    const wy = (clientY - rect.top) / s + originY;
    animateCameraTo(
      1.0,
      containerEl.clientWidth / 2 - wx * 1.0,
      containerEl.clientHeight / 2 - wy * 1.0,
    );
  }

  // ─── الكاميرا ───
  function animateCameraTo(targetZoom: number, tx: number, ty: number) {
    camTarget.zoom = Math.min(Math.max(targetZoom, 0.3), 3);
    camTarget.x = tx;
    camTarget.y = ty;
    camAnimating = true;
    markDirty();
  }

  function zoomIn() {
    animateCameraTo(zoom.value * 1.25, pan.x * 1.25 - 0, pan.y * 1.25);
    // تصحيح مركز التكبير نحو مركز الشاشة
    const container = containerEl;
    if (container) {
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const nz = Math.min(zoom.value * 1.25, 3);
      camTarget.zoom = nz;
      camTarget.x = cx - ((cx - pan.x) * nz) / zoom.value;
      camTarget.y = cy - ((cy - pan.y) * nz) / zoom.value;
    }
  }

  function zoomOut() {
    const container = containerEl;
    const nz = Math.max(zoom.value / 1.25, 0.3);
    if (container) {
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      camTarget.zoom = nz;
      camTarget.x = cx - ((cx - pan.x) * nz) / zoom.value;
      camTarget.y = cy - ((cy - pan.y) * nz) / zoom.value;
    } else {
      camTarget.zoom = nz;
      camTarget.x = pan.x;
      camTarget.y = pan.y;
    }
    camAnimating = true;
    markDirty();
  }

  /** ملاءمة الشاشة: تكيف ناعم يحيط بكل العقد */
  function fitView() {
    const container = containerEl;
    if (!container || !nodes.value.length) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of nodes.value) {
      minX = Math.min(minX, n.x - n.width / 2);
      maxX = Math.max(maxX, n.x + n.width / 2);
      minY = Math.min(minY, n.y - n.height / 2);
      maxY = Math.max(maxY, n.y + n.height / 2);
    }
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    const z = Math.min(Math.min(vw / (maxX - minX + 160), vh / (maxY - minY + 160)), 1.6);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    animateCameraTo(z, vw / 2 - cx * z, vh / 2 - cy * z);
  }

  function resetView() {
    const container = containerEl;
    if (!container) return;
    animateCameraTo(1, container.clientWidth / 2, container.clientHeight / 2);
  }

  /** تركيز الكاميرا على عقدة معينة (بحث/تكبير من لوحة التفاصيل) */
  function focusNode(node: EngineNode) {
    const container = containerEl;
    if (!container) return;
    const z = Math.max(zoom.value, 1.35);
    animateCameraTo(
      z,
      container.clientWidth / 2 - node.x * z,
      container.clientHeight / 2 - node.y * z,
    );
    highlightNodeId = node.id;
    markDirty();
    window.setTimeout(() => {
      if (highlightNodeId === node.id) {
        highlightNodeId = null;
        markDirty();
      }
    }, 1800);
  }

  // ─── التخطيطات مع انتقال متحرك سلس ───
  function computePipelineTargets(): Map<number, { x: number; y: number }> {
    // 4 مراحل تشغيلية هندسية منظمة:
    // مرحلة 1: مدخلات البيع والكاشير (-380)
    // مرحلة 2: معالجة العمليات وحساب الوصفات (-120)
    // مرحلة 3: المخازن وتحديث الأرصدة (140)
    // مرحلة 4: التنبيهات وتليجرام والذكاء (400)
    const stageMap: Record<number, { x: number; y: number }> = {
      // المرحلة 1: المدخلات
      7: { x: -380, y: -160 }, // تسجيل يدوي
      8: { x: -380, y: -50 }, // فاتورة جملة
      9: { x: -380, y: 60 }, // استيراد كاشير
      1: { x: -380, y: 170 }, // كاشير نقطة البيع

      // المرحلة 2: العمليات والوصفات
      10: { x: -120, y: -110 }, // خصم مخزون مباشر
      11: { x: -120, y: 5 }, // حساب الوصفات والتفكيك
      3: { x: -120, y: 120 }, // محرك الوصفات

      // المرحلة 3: المستودعات والمخازن
      12: { x: 140, y: -55 }, // تحديث مخزون المخزن
      2: { x: 140, y: 65 }, // المخزن الرئيسي

      // المرحلة 4: الإشعارات وتليجرام والذكاء
      6: { x: 400, y: -110 }, // إشعارات النظام
      4: { x: 400, y: 5 }, // وكيل تليجرام
      5: { x: 400, y: 120 }, // المساعد الذكي Gemini
    };

    const targets = new Map<number, { x: number; y: number }>();
    const fallbackCols: Record<string, number> = {
      sales: -380,
      production: -120,
      operations: -120,
      inventory: 140,
      notifications: 400,
      security: 400,
      ai: 400,
    };
    const fallbackCounts: Record<number, number> = {};

    for (const n of nodes.value) {
      if (stageMap[n.id]) {
        targets.set(n.id, stageMap[n.id]!);
      } else {
        const colX = fallbackCols[n.group] ?? 0;
        const count = fallbackCounts[colX] || 0;
        targets.set(n.id, { x: colX, y: (count - 1.5) * 115 });
        fallbackCounts[colX] = count + 1;
      }
    }
    return targets;
  }

  function computeTreeTargets(): Map<number, { x: number; y: number }> {
    // توزيع هرمي متوازن: مشغلات → معالجات → وكلاء
    const levels: Record<string, number> = { trigger: -190, action: 0, agent: 190 };
    const targets = new Map<number, { x: number; y: number }>();
    const types = ['trigger', 'action', 'agent'] as const;

    for (const t of types) {
      const typeNodes = nodes.value.filter((n) => n.type === t);
      const total = typeNodes.length;
      typeNodes.forEach((n, idx) => {
        const x = (idx - (total - 1) / 2) * 195;
        const y = levels[t] ?? 0;
        targets.set(n.id, { x, y });
      });
    }

    for (const n of nodes.value) {
      if (!targets.has(n.id)) {
        targets.set(n.id, { x: 0, y: 0 });
      }
    }
    return targets;
  }

  function applyLayoutAnimated(layout: EngineLayout) {
    currentLayout.value = layout;
    const targets = layout === 'pipeline' ? computePipelineTargets() : computeTreeTargets();
    if (reducedMotion) {
      // بلا حركة: تطبيق فوري
      for (const n of nodes.value) {
        const t = targets.get(n.id);
        if (t) {
          n.x = t.x;
          n.y = t.y;
          n.vx = 0;
          n.vy = 0;
        }
      }
      resetView();
      markDirty();
      return;
    }
    tweens = [];
    for (const n of nodes.value) {
      const t = targets.get(n.id);
      if (!t) continue;
      // من أي موقع حالي (سواء مخطط أو مسحوب) نحو الهدف بسلاسة
      tweens.push({ nodeId: n.id, fromX: n.x, fromY: n.y, toX: t.x, toY: t.y });
      n.vx = 0;
      n.vy = 0;
    }
    tweenStartTs = performance.now();
    resetView();
    isAnimating.value = true;
    markDirty();
  }

  function applyPipelineLayout() {
    applyLayoutAnimated('pipeline');
  }

  function applyTreeLayout() {
    applyLayoutAnimated('tree');
  }

  // ─── تحميل البيانات ───
  function setGraph(
    data: { nodes: GraphNode[]; edges: GraphEdge[] },
    opts: { animateEntry?: boolean } = {},
  ) {
    nodes.value = (data.nodes || []).map((n, i) => ({
      ...n,
      width: NODE_W,
      height: NODE_H,
      vx: 0,
      vy: 0,
      glow: 0,
      rippleT: -1,
      enter: 0,
      spawnDelay: i * 45,
      fixed: false,
      // مواقع محفوظة من سحب سابق تُحترم؛ وإلا تُرتب بالتخطيط الافتراضي
      x: n.position_x ?? 0,
      y: n.position_y ?? 0,
    }));
    edges.value = (data.edges || []).map((e) => ({ ...e, glow: 0 }));
    // عقد بلا موقع محفوظ تُوزع بالتخطيط الأنبوبي فورًا (بلا تحريك) ثم حركة الدخول
    const targets = computePipelineTargets();
    for (const n of nodes.value) {
      if (n.position_x == null || n.position_y == null) {
        const t = targets.get(n.id);
        if (t) {
          n.x = t.x;
          n.y = t.y;
        }
      }
    }
    selectedNode.value = null;
    hoveredNode.value = null;
    if (opts.animateEntry !== false && !reducedMotion) {
      entryStartTs = performance.now();
      entryDuration = nodes.value.length * 45 + 420;
    } else {
      for (const n of nodes.value) n.enter = 1;
      entryStartTs = 0;
    }
    // ابدأ فيزياء خفيفة للنسيان والاستقرار
    if (!physicsFrozen.value) wakePhysics(0.5);
    resetView();
    markDirty();
  }

  function resetToGraphDefaults(data: { nodes: GraphNode[]; edges: GraphEdge[] }) {
    setGraph(data, { animateEntry: true });
    applyPipelineLayout();
  }

  // ─── الفيزياء ───
  function setPhysics(p: Partial<PhysicsSettings>) {
    Object.assign(physics, DEFAULT_PHYSICS, p);
    wakePhysics(0.6);
  }

  function updatePhysicsLive(p: Partial<PhysicsSettings>) {
    Object.assign(physics, p);
    if (!physicsFrozen.value) wakePhysics(0.8);
    else markDirty();
  }

  function togglePhysics() {
    physicsFrozen.value = !physicsFrozen.value;
    if (!physicsFrozen.value) wakePhysics(1);
    else markDirty();
  }

  // ─── موجات التنفيذ الحقيقية (البند 16) ───
  // key: مفتاح المهمة المنفذة، category: تصنيفها من قائمة المهام (اختياري)
  function pulse(key: string | null | undefined, category?: string | null) {
    if (reducedMotion || !key) return;
    const matched = matchNodesForKey(key, category);
    if (!matched.length) return;

    // موجة تمر عبر الحافات المتصلة بالعقد المطابقة (عمق 2)
    const adjacency = new Map<number, number[]>(); // nodeId → edge indexes
    edges.value.forEach((e, idx) => {
      if (!adjacency.has(e.source)) adjacency.set(e.source, []);
      if (!adjacency.has(e.target)) adjacency.set(e.target, []);
      adjacency.get(e.source)!.push(idx);
      adjacency.get(e.target)!.push(idx);
    });

    const matchedIds = new Set(matched.map((n) => n.id));
    const waveColor = '#38bdf8';
    const visited = new Set<number>();
    let frontier = [...matchedIds];
    let depth = 0;
    while (frontier.length && depth < 2) {
      const next: number[] = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        const idxs = adjacency.get(id) || [];
        for (const ei of idxs) {
          if (waves.length >= MAX_WAVES) break;
          waves.push({
            edgeIndex: ei,
            progress: -depth * 0.25, // تأخير موجة لكل عمق
            speed: 0.9 + Math.random() * 0.2,
            color: waveColor,
          });
          const e = edges.value[ei];
          if (!e) continue;
          next.push(e.source === id ? e.target : e.source);
        }
      }
      frontier = next;
      depth++;
    }

    // توهج وهالة ripple على عقدة الوكيل المطابقة
    for (const n of matched) {
      n.glow = 1;
      if (n.type === 'agent') n.rippleT = 0;
    }
    isAnimating.value = true;
    markDirty();
  }

  function matchNodesForKey(key: string, category?: string | null): EngineNode[] {
    const k = key.toLowerCase();
    // 1) تطابق مباشر عبر settings.automation_key إن وُجد
    const direct = nodes.value.filter((n) => n.settings?.automation_key === key);
    if (direct.length) return direct;

    // 2) كلمات مفتاحية من نص المهمة نحو المجموعات/التسميات
    const groups: string[] = [];
    if (/telegram|bot/.test(k)) groups.push('notifications');
    if (/copilot|gemini|\bai\b/.test(k)) groups.push('ai');
    if (/stock|inventory|خامات/.test(k)) groups.push('inventory');
    if (/recipe|roast|تحميص|وصفات/.test(k)) groups.push('production');
    if (/sale|invoice|discount|void|revenue|sales/.test(k)) groups.push('sales', 'operations');
    if (/shift|handover|عهدة/.test(k)) groups.push('operations');
    if (/backup|system|error|webhook/.test(k)) groups.push('notifications');
    if (/report|summary/.test(k)) groups.push('notifications', 'sales');
    if (category === 'sales') groups.push('sales', 'operations');
    if (category === 'inventory') groups.push('inventory');
    if (category === 'security') groups.push('security');
    if (category === 'system') groups.push('notifications');
    if (category === 'production') groups.push('production');

    let result = nodes.value.filter((n) => groups.includes(n.group));
    if (!result.length) {
      // احتياط: أضئ الوكلاء النشطين الأقرب صلة (أول وكيل إشعارات)
      result = nodes.value.filter((n) => n.type === 'agent' && n.group === 'notifications');
    }
    return result;
  }

  // ─── التفاعل: ماوس ولمس ───
  function getPointerPos(clientX: number, clientY: number) {
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function findNodeAt(wx: number, wy: number): EngineNode | null {
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const n = nodes.value[i]!;
      const hw = n.width / 2;
      const hh = n.height / 2;
      if (wx >= n.x - hw && wx <= n.x + hw && wy >= n.y - hh && wy <= n.y + hh) return n;
    }
    return null;
  }

  function handleDown(pos: { x: number; y: number }) {
    lastPointer = pos;
    downPos = pos;
    const w = screenToWorld(pos.x, pos.y);
    const hit = findNodeAt(w.x, w.y);
    if (hit) {
      dragNodeId = hit.id;
      hit.fixed = true;
      dragOffset = { x: hit.x - w.x, y: hit.y - w.y };
    } else {
      isPanning = true;
    }
  }

  function handleMove(pos: { x: number; y: number }) {
    const w = screenToWorld(pos.x, pos.y);

    if (dragNodeId !== null) {
      const node = nodes.value.find((n) => n.id === dragNodeId);
      if (node) {
        node.x = w.x + dragOffset.x;
        node.y = w.y + dragOffset.y;
        node.vx = 0;
        node.vy = 0;
        markDirty();
      }
      return;
    }

    if (isPanning) {
      pan.x += pos.x - lastPointer.x;
      pan.y += pos.y - lastPointer.y;
      camAnimating = false;
      lastPointer = pos;
      markDirty();
      return;
    }

    const hit = findNodeAt(w.x, w.y);
    if (hoveredNode.value?.id !== (hit?.id ?? null)) {
      hoveredNode.value = hit;
      markDirty();
    }
    if (hit) {
      tooltipPos.x = pos.x + 14;
      tooltipPos.y = pos.y + 14;
    }
  }

  function handleUp() {
    if (dragNodeId !== null) {
      const node = nodes.value.find((n) => n.id === dragNodeId);
      if (node) {
        node.fixed = false;
        // حفظ مواقع السحب عبر الطبقة الأعلى (debounce 800ms) — البند 11
        if (
          Math.hypot(node.x - (node.position_x ?? node.x), node.y - (node.position_y ?? node.y)) > 1
        ) {
          options.onDragEnd?.(node);
        }
        node.position_x = node.x;
        node.position_y = node.y;
      }
      dragNodeId = null;
      wakePhysics(0.4);
      markDirty();
      return;
    }
    if (isPanning) {
      // نقرة خلفية قصيرة = إلغاء التحديد
      const moved = Math.hypot(lastPointer.x - downPos.x, lastPointer.y - downPos.y);
      if (moved < 4) {
        selectedNode.value = null;
        options.onNodeSelect?.(null);
      }
      isPanning = false;
      markDirty();
    }
  }

  function onMouseDown(e: MouseEvent) {
    handleDown(getPointerPos(e.clientX, e.clientY));
  }

  function onMouseMove(e: MouseEvent) {
    handleMove(getPointerPos(e.clientX, e.clientY));
  }

  function onMouseUp() {
    handleUp();
  }

  function onClick(e: MouseEvent) {
    // نقر عقدة يفتح لوحة التفاصيل الجانبية
    const pos = getPointerPos(e.clientX, e.clientY);
    if (Math.hypot(pos.x - downPos.x, pos.y - downPos.y) >= 4) return;
    const w = screenToWorld(pos.x, pos.y);
    const hit = findNodeAt(w.x, w.y);
    if (hit) {
      selectedNode.value = hit;
      options.onNodeSelect?.(hit);
    }
    markDirty();
  }

  function onWheel(e: WheelEvent) {
    // zoom ناعم بـ easing: هدف جديد ثم تخفيف
    const pos = getPointerPos(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nz = Math.min(Math.max(zoom.value * factor, 0.3), 3);
    camTarget.zoom = nz;
    camTarget.x = pos.x - ((pos.x - pan.x) * nz) / zoom.value;
    camTarget.y = pos.y - ((pos.y - pan.y) * nz) / zoom.value;
    camAnimating = true;
    markDirty();
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      handleDown(getPointerPos(t.clientX, t.clientY));
    } else if (e.touches.length === 2) {
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      pinchState = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
      };
      dragNodeId = null;
      isPanning = false;
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && pinchState) {
      // pinch-to-zoom
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const rect = canvasEl?.getBoundingClientRect();
      if (rect) {
        const px = midX - rect.left;
        const py = midY - rect.top;
        const factor = dist / (pinchState.dist || dist);
        const nz = Math.min(Math.max(zoom.value * factor, 0.3), 3);
        pan.x = px - ((px - pan.x) * nz) / zoom.value;
        pan.y = py - ((py - pan.y) * nz) / zoom.value;
        zoom.value = nz;
        camAnimating = false;
      }
      pinchState = { dist, midX, midY };
      markDirty();
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      handleMove(getPointerPos(t.clientX, t.clientY));
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      pinchState = null;
      handleUp();
    } else if (e.touches.length === 1) {
      pinchState = null;
      const t = e.touches[0]!;
      lastPointer = getPointerPos(t.clientX, t.clientY);
      isPanning = true;
      dragNodeId = null;
    }
  }

  // ─── البحث ───
  function searchNode(query: string): EngineNode | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const found = nodes.value.find(
      (n) =>
        (n.label_ar || '').toLowerCase().includes(q) ||
        (n.label || '').toLowerCase().includes(q) ||
        (n.group_name || n.group || '').toLowerCase().includes(q),
    );
    if (found) focusNode(found);
    return found ?? null;
  }

  // ─── التركيب والتفكيك ───
  function attach(canvas: HTMLCanvasElement, container: HTMLElement) {
    canvasEl = canvas;
    containerEl = container;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(container);
    }
    document.addEventListener('visibilitychange', onVisibility);
    readThemeColors();
    engineActive = true;
    markDirty();
  }

  function attachMinimap(el: HTMLCanvasElement) {
    minimapEl = el;
    minimapCtx = el.getContext('2d');
    markDirty();
  }

  function resizeCanvas() {
    const c = canvasEl;
    const container = containerEl;
    if (!c || !container || !ctx) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';
    if (pan.x === 0 && pan.y === 0) {
      pan.x = rect.width / 2;
      pan.y = rect.height / 2;
      camTarget.x = pan.x;
      camTarget.y = pan.y;
    }
    markDirty();
  }

  function onVisibility() {
    if (document.hidden) {
      stopLoop(); // البند 15: توقف كامل عند إخفاء الجلسة
    } else if (engineActive) {
      markDirty();
    }
  }

  /** تفعيل/تعطيل المحرك عند تبديل تبويب الخريطة (v-show) */
  function setActive(active: boolean) {
    engineActive = active;
    if (active) {
      resizeCanvas();
      markDirty();
    } else {
      stopLoop();
    }
  }

  function detach() {
    engineActive = false;
    stopLoop();
    window.removeEventListener('resize', resizeCanvas);
    document.removeEventListener('visibilitychange', onVisibility);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    canvasEl = null;
    containerEl = null;
    minimapEl = null;
    minimapCtx = null;
    ctx = null;
  }

  onUnmounted(detach);

  // ─── أدوات ───
  function getBezierPoint(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    t: number,
  ) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    return {
      x: uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3,
      y: uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3,
    };
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function typeLabelOf(type: string): string {
    const map: Record<string, string> = {
      agent: '🤖 وكيل ذكي',
      trigger: '⚡ مشغل أحداث',
      action: '⚙️ معالجة وإجراء',
    };
    return map[type] || type;
  }

  function hexWithAlpha(hex: string, alphaA: number): string {
    const h = hex.replace('#', '');
    if (h.length === 3) {
      const r = parseInt(h[0]! + h[0]!, 16);
      const g = parseInt(h[1]! + h[1]!, 16);
      const b = parseInt(h[2]! + h[2]!, 16);
      return `rgba(${r}, ${g}, ${b}, ${alphaA})`;
    }
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alphaA})`;
    }
    return hex;
  }

  function getNodeColor(group: string): string {
    const map: Record<string, string> = {
      operations: '#10b981',
      inventory: '#0284c7',
      production: '#f59e0b',
      notifications: '#8b5cf6',
      ai: '#ec4899',
      sales: '#64748b',
      security: '#ef4444',
    };
    return map[group] || '#0284c7';
  }

  return {
    // حالة
    nodes,
    edges,
    zoom,
    pan,
    physics,
    physicsFrozen,
    hoveredNode,
    selectedNode,
    tooltipPos,
    currentLayout,
    isAnimating,
    // تركيب
    attach,
    detach,
    attachMinimap,
    setActive,
    // بيانات
    setGraph,
    resetToGraphDefaults,
    // تخطيطات وكاميرا
    applyPipelineLayout,
    applyTreeLayout,
    fitView,
    resetView,
    zoomIn,
    zoomOut,
    focusNode,
    searchNode,
    // فيزياء
    setPhysics,
    updatePhysicsLive,
    togglePhysics,
    // نبضات التنفيذ الحقيقية
    pulse,
    // تفاعل (تُربط على الكانفس في المكوّن)
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClick,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMinimapPointer,
    screenToWorld,
  };
}

export type GraphEngine = ReturnType<typeof useGraphEngine>;
