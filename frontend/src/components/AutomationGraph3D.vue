<template>
  <div ref="wrapRef" class="graph3d-wrap" :class="{ 'is-loading': loading }">
    <canvas v-if="webglSupported" ref="canvasRef" class="graph3d-canvas"></canvas>
    <div v-else class="graph3d-fallback">
      <span class="fallback-icon">🕸️</span>
      <p>المتصفح لا يدعم WebGL لعرض اللوحة ثلاثية الأبعاد.</p>
      <p class="hint">جرّب متصفحاً حديثاً أو فعّل تسريع العتاد من إعدادات المتصفح.</p>
    </div>

    <!-- تلميحات التحكم -->
    <div v-if="webglSupported && !loading" class="graph3d-hints">
      <span>🖱️ سحب: دوران</span>
      <span>✋ سحب بزر أيمن: تحريك</span>
      <span>🔍 عجلة الفأرة: تكبير</span>
      <span>👆 نقرة: اختيار عقدة</span>
    </div>

    <!-- بطاقة العقدة المحددة -->
    <transition name="fade-slide">
      <div v-if="selectedNodeData" class="graph3d-selected-card">
        <div class="selected-head" :style="{ borderColor: selectedNodeData.color }">
          <span class="selected-icon">{{ selectedNodeData.icon }}</span>
          <div>
            <strong>{{ selectedNodeData.label_ar }}</strong>
            <small>{{ kindLabel(selectedNodeData.kind) }}</small>
          </div>
          <button type="button" class="selected-close" @click="$emit('select', null)">✕</button>
        </div>
        <p v-if="selectedNodeData.description_ar" class="selected-desc">
          {{ selectedNodeData.description_ar }}
        </p>
        <slot name="node-details" :node="selectedNodeData"></slot>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  computeGraphLayout,
  buildCurveControlPoint,
  type LayoutMode,
  type Vec3,
} from '@/utils/automationGraphLayout';

export interface Graph3DNode {
  id: string;
  kind: 'trigger' | 'engine' | 'agent' | 'channel';
  label_ar: string;
  description_ar?: string;
  icon: string;
  color: string;
  category?: string;
  live?: {
    dbId?: number | null;
    is_enabled: boolean;
    last_status?: string | null;
    cron_expression?: string | null;
  } | null;
}

export interface Graph3DLink {
  from: string;
  to: string;
  kind: 'command' | 'dispatch' | 'deliver' | 'flow';
}

const props = defineProps<{
  nodes: Graph3DNode[];
  links: Graph3DLink[];
  layout?: LayoutMode;
  selectedId?: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{ select: [node: Graph3DNode | null] }>();

const wrapRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const webglSupported = ref(true);

const selectedNodeData = computed(
  () => props.nodes.find((n) => n.id === props.selectedId) || null,
);

const kindLabel = (kind: string) =>
  ({
    trigger: 'عقدة انطلاق (Trigger)',
    engine: 'محرك مركزي',
    agent: 'وكيل أتمتة',
    channel: 'قناة تسليم',
  })[kind] || kind;

/* ─────────── حالة المشهد ثلاثي الأبعاد ─────────── */
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let raycaster: THREE.Raycaster | null = null;
let pointerNdc = new THREE.Vector2();
let rafId = 0;
let clock: THREE.Clock | null = null;
let graphGroup: THREE.Group | null = null;
let resizeObserver: ResizeObserver | null = null;

interface NodeEntry {
  def: Graph3DNode;
  mesh: THREE.Object3D;
  basePos: Vec3;
  bobPhase: number;
  bobAmp: number;
  spinSpeed: number;
  label: THREE.Sprite;
}
const nodeEntries = new Map<string, NodeEntry>();

interface LinkEntry {
  def: Graph3DLink;
  curve: THREE.QuadraticBezierCurve3;
  active: boolean;
}
const linkEntries: LinkEntry[] = [];

interface Pulse {
  mesh: THREE.Mesh;
  curve: THREE.QuadraticBezierCurve3;
  t: number;
  speed: number;
}
const pulses: Pulse[] = [];

const disposables: Array<{ dispose(): void }> = [];
function track<T extends { dispose(): void }>(obj: T): T {
  disposables.push(obj);
  return obj;
}

/* ─────────── نصوص عربية كملصقات ثلاثية الأبعاد ─────────── */
function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSize = 42;
  ctx.font = `bold ${fontSize}px "Segoe UI", Tahoma, sans-serif`;
  const label = text.length > 22 ? text.slice(0, 20) + '..' : text;
  const metrics = ctx.measureText(label);
  canvas.width = Math.max(256, Math.ceil(metrics.width + 48));
  canvas.height = 96;

  const ctx2 = canvas.getContext('2d')!;
  ctx2.font = `bold ${fontSize}px "Segoe UI", Tahoma, sans-serif`;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  // هالة ملونة خلف النص
  ctx2.shadowColor = color;
  ctx2.shadowBlur = 18;
  ctx2.fillStyle = '#f7ecd9';
  ctx2.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = track(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = track(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  const sprite = new THREE.Sprite(material);
  const scale = 1.55;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/* ─────────── إنشاء مجسمات العقد ─────────── */
function makeNodeMesh(def: Graph3DNode): THREE.Object3D {
  const color = new THREE.Color(def.color);
  let geo: THREE.BufferGeometry;
  let mat: THREE.Material;

  switch (def.kind) {
    case 'trigger':
      geo = track(new THREE.OctahedronGeometry(1.8));
      mat = track(
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.9,
          metalness: 0.5,
          roughness: 0.25,
        }),
      );
      break;
    case 'engine':
      geo = track(new THREE.IcosahedronGeometry(2.4));
      mat = track(
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.45,
          metalness: 0.65,
          roughness: 0.3,
        }),
      );
      break;
    case 'channel':
      geo = track(new THREE.TorusGeometry(1.15, 0.42, 14, 32));
      mat = track(
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.5,
          metalness: 0.4,
          roughness: 0.35,
        }),
      );
      break;
    default: {
      // وكيل — يبهت عند التعطيل
      const enabled = def.live ? def.live.is_enabled : true;
      geo = track(new THREE.SphereGeometry(1.25, 28, 28));
      mat = track(
        new THREE.MeshStandardMaterial({
          color: enabled ? color : new THREE.Color('#6b625a'),
          emissive: enabled ? color : new THREE.Color('#333'),
          emissiveIntensity: enabled ? 0.55 : 0.12,
          transparent: !enabled,
          opacity: enabled ? 1 : 0.35,
          metalness: 0.35,
          roughness: 0.4,
        }),
      );
    }
  }

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.nodeId = def.id;
  group.add(mesh);

  if (def.kind === 'engine') {
    const shellGeo = track(new THREE.IcosahedronGeometry(3.05));
    const shellMat = track(
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      }),
    );
    group.add(new THREE.Mesh(shellGeo, shellMat));
  }
  group.userData.nodeId = def.id;
  return group;
}

/* ─────────── بناء الشبكة كاملة داخل المشهد ─────────── */
function rebuildGraph() {
  if (!scene || !wrapRef.value) return;

  if (graphGroup) {
    scene.remove(graphGroup);
    graphGroup.traverse((obj: any) => {
      if (obj.geometry?.dispose) obj.geometry.dispose();
      if (obj.material?.dispose) obj.material.dispose();
    });
  }

  graphGroup = new THREE.Group();
  scene.add(graphGroup);
  nodeEntries.clear();
  linkEntries.length = 0;
  pulses.length = 0;

  const layoutMode: LayoutMode = props.layout || 'obsidian';
  const positions = computeGraphLayout(props.nodes, layoutMode);

  // العقد
  for (const def of props.nodes) {
    const pos = positions.get(def.id) || { x: 0, y: 0, z: 0 };
    const group = makeNodeMesh(def);
    group.position.set(pos.x, pos.y, pos.z);

    const label = makeLabelSprite(`${def.icon} ${def.label_ar}`, def.color);
    label.position.set(pos.x, pos.y + 2.6, pos.z);
    graphGroup.add(label);
    graphGroup.add(group);

    nodeEntries.set(def.id, {
      def,
      mesh: group,
      basePos: pos,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp: 0.22 + Math.random() * 0.22,
      spinSpeed: def.kind === 'trigger' ? 0.012 : def.kind === 'engine' ? 0.006 : 0.004,
      label,
    });
  }

  // الروابط المنحنية + نبضات البيانات
  const pulseGeo = track(new THREE.SphereGeometry(0.17, 10, 10));

  for (const link of props.links) {
    const fromPos = positions.get(link.from);
    const toPos = positions.get(link.to);
    if (!fromPos || !toPos) continue;

    const sourceDef = props.nodes.find((n) => n.id === link.from);
    const targetDef = props.nodes.find((n) => n.id === link.to);
    if (!sourceDef || !targetDef) continue;

    const bothAgentsEnabled =
      (sourceDef.live?.is_enabled !== false) && (targetDef.live?.is_enabled !== false);
    const isFlow = link.kind === 'flow';

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z),
      (() => {
        const c = buildCurveControlPoint(fromPos, toPos);
        return new THREE.Vector3(c.x, c.y, c.z);
      })(),
      new THREE.Vector3(toPos.x, toPos.y, toPos.z),
    );

    const tubeGeo = track(new THREE.TubeGeometry(curve, 44, 0.055, 6, false));
    const tubeMat = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(sourceDef.color),
        transparent: true,
        opacity: isFlow ? 0.13 : 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    graphGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

    linkEntries.push({ def: link, curve, active: bothAgentsEnabled });

    // نبضة بيانات على كل مسار نشط (مع سقف للأداء)
    if (bothAgentsEnabled && pulses.length < 80) {
      const pulseMat = track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(sourceDef.color),
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const pm = new THREE.Mesh(pulseGeo, pulseMat);
      graphGroup.add(pm);
      pulses.push({
        mesh: pm,
        curve,
        t: Math.random(),
        speed: isFlow ? 0.08 + Math.random() * 0.05 : 0.16 + Math.random() * 0.12,
      });
    }
  }

  applySelectionVisuals();
}

/* ─────────── إبراز التحديد ─────────── */
function applySelectionVisuals() {
  for (const [, entry] of nodeEntries) {
    const selected = entry.def.id === props.selectedId;
    const targetScale = selected ? 1.28 : 1;
    entry.mesh.scale.setScalar(targetScale);
  }
}

/* ─────────── تهيئة المشهد ─────────── */
function initScene() {
  const canvas = canvasRef.value!;
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0805');
  scene.fog = new THREE.FogExp2(0x0c0805, 0.011);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(0, 15, 31);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 8;
  controls.maxDistance = 85;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.65;
  controls.target.set(0, 2, 0);

  // الإضاءة الدافئة (هوية القهوة)
  scene.add(track(new THREE.AmbientLight(0xffffff, 0.55)));
  const dir = track(new THREE.DirectionalLight(0xffe9c9, 1.1));
  dir.position.set(12, 22, 12);
  scene.add(dir);
  const warm = track(new THREE.PointLight(0xd4a373, 260, 90));
  warm.position.set(0, 7, 0);
  scene.add(warm);

  // أرضية شبكية خافتة
  const grid = track(new THREE.GridHelper(52, 26, 0x59452f, 0x2b2016));
  (grid.material as THREE.Material).transparent = true;
  (grid.material as any).opacity = 0.32;
  grid.position.y = -3.2;
  scene.add(grid);

  // غبار نجمي محيط
  const starCount = 650;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 58 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi) * 0.6;
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = track(
    new THREE.PointsMaterial({ color: 0xd4a373, size: 0.38, transparent: true, opacity: 0.5 }),
  );
  scene.add(new THREE.Points(starGeo, starMat));

  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  attachPointerEvents(canvas);
  handleResize();

  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(wrapRef.value!);

  animate();
}

/* ─────────── تفاعل المؤشر: تمييز واختيار ─────────── */
let downAt: { x: number; y: number } | null = null;

function pickNodeId(event: PointerEvent): string | null {
  if (!renderer || !raycaster || !camera) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);

  const targets: THREE.Object3D[] = [];
  nodeEntries.forEach((entry) => targets.push(entry.mesh.children[0]!));
  const hits = raycaster.intersectObjects(targets, false);
  return hits[0]?.object.userData?.nodeId || null;
}

function attachPointerEvents(el: HTMLCanvasElement) {
  el.addEventListener('pointermove', (e) => {
    const id = pickNodeId(e);
    el.style.cursor = id ? 'pointer' : 'grab';
    nodeEntries.forEach((entry) => {
      const hovered = entry.def.id === id && id !== props.selectedId;
      const selected = entry.def.id === props.selectedId;
      entry.mesh.scale.setScalar(hovered ? 1.16 : selected ? 1.28 : 1);
    });
  });
  el.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return; // كان سحباً للدوران وليس نقرة
    const id = pickNodeId(e);
    const node = id ? props.nodes.find((n) => n.id === id) || null : null;
    emit('select', node);
  });
}

/* ─────────── حلقة الرسم ─────────── */
function animate() {
  rafId = requestAnimationFrame(animate);
  if (!scene || !camera || !renderer || !controls || !clock) return;

  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;

  nodeEntries.forEach((entry) => {
    entry.mesh.position.y =
      entry.basePos.y + Math.sin(elapsed * 1.1 + entry.bobPhase) * entry.bobAmp;
    entry.mesh.rotation.y += entry.spinSpeed * dt * 60 * 0.06;
    entry.label.position.y = entry.mesh.position.y + 2.6;
  });

  for (const pulse of pulses) {
    pulse.t += pulse.speed * dt;
    const p = pulse.curve.getPointAt(pulse.t % 1);
    pulse.mesh.position.copy(p);
  }

  controls.update();
  renderer.render(scene, camera);
}

function handleResize() {
  if (!renderer || !camera || !wrapRef.value) return;
  const w = wrapRef.value.clientWidth || 800;
  const h = wrapRef.value.clientHeight || 520;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

/* ─────────── أدوات التحكم المكشوفة للشريط العلوي ─────────── */
function dolly(factor: number) {
  if (!camera || !controls) return;
  const dirV = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(dirV.length() * factor, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(dirV.setLength(len));
}
const zoomIn = () => dolly(0.82);
const zoomOut = () => dolly(1.22);
const resetView = () => {
  if (!camera || !controls) return;
  camera.position.set(0, 15, 31);
  controls.target.set(0, 2, 0);
  controls.update();
};
/** موجة نبض: دوران تلقائي مؤقت يعطي إحساس فحص الشبكة */
let autoRotateTimer: ReturnType<typeof setTimeout> | null = null;
function pulseAll() {
  if (!controls) return;
  controls.autoRotate = true;
  if (autoRotateTimer) clearTimeout(autoRotateTimer);
  autoRotateTimer = setTimeout(() => {
    if (controls) controls.autoRotate = false;
  }, 2600);
}

defineExpose({ zoomIn, zoomOut, resetView, pulseAll });

/* ─────────── دورة الحياة ─────────── */
onMounted(() => {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    webglSupported.value = Boolean(gl);
  } catch {
    webglSupported.value = false;
  }
  if (!webglSupported.value) return;

  initScene();
  rebuildGraph();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  controls?.dispose();
  renderer?.dispose();
  disposables.forEach((d) => d.dispose());
  disposables.length = 0;
});

watch(
  () => [props.nodes, props.links, props.layout],
  () => {
    if (webglSupported.value && scene) rebuildGraph();
  },
  { deep: false },
);

watch(
  () => props.selectedId,
  () => applySelectionVisuals(),
);
</script>

<style scoped lang="scss">
.graph3d-wrap {
  position: relative;
  width: 100%;
  height: clamp(480px, 62vh, 720px);
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  background: radial-gradient(ellipse at center, #171009 0%, #0c0805 70%);

  &.is-loading .graph3d-hints {
    opacity: 0;
  }
}

.graph3d-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

.graph3d-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #f7ecd9;

  .fallback-icon {
    font-size: 3rem;
  }
  .hint {
    font-size: 0.8rem;
    color: var(--text-muted, #a89f91);
  }
}

.graph3d-hints {
  position: absolute;
  bottom: 12px;
  right: 50%;
  transform: translateX(50%);
  display: flex;
  gap: 14px;
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(12, 8, 5, 0.72);
  border: 1px solid rgba(212, 163, 115, 0.22);
  color: #cdbfa8;
  font-size: 0.74rem;
  backdrop-filter: blur(6px);
  transition: opacity 0.3s ease;
  white-space: nowrap;
}

.graph3d-selected-card {
  position: absolute;
  top: 14px;
  left: 14px;
  width: min(320px, calc(100% - 28px));
  padding: 14px;
  border-radius: 14px;
  background: rgba(18, 12, 8, 0.88);
  border: 1px solid rgba(212, 163, 115, 0.3);
  backdrop-filter: blur(8px);
  color: #f7ecd9;

  .selected-head {
    display: flex;
    align-items: center;
    gap: 10px;
    border-right: 3px solid;
    padding-right: 10px;

    strong {
      display: block;
      font-size: 0.95rem;
    }
    small {
      color: var(--text-muted, #a89f91);
      font-size: 0.72rem;
    }
    .selected-icon {
      font-size: 1.5rem;
    }
  }

  .selected-close {
    margin-inline-start: auto;
    background: none;
    border: none;
    color: #a89f91;
    cursor: pointer;
    font-size: 1rem;

    &:hover {
      color: #fff;
    }
  }

  .selected-desc {
    margin: 10px 0 0;
    font-size: 0.78rem;
    line-height: 1.6;
    color: #cdbfa8;
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
