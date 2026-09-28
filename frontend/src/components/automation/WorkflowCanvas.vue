<template>
  <div class="workflow-canvas-card" dir="rtl">
    <!-- شريط أدوات الرسم البياني -->
    <div class="workflow-toolbar">
      <div class="toolbar-section">
        <span class="toolbar-title">
          <AppIcon name="activity" :size="16" />
          خريطة ترابط وتدفق العمليات والوكلاء
        </span>
      </div>

      <div class="toolbar-presets">
        <button
          class="toolbar-btn"
          :class="{ active: engine.currentLayout.value === 'pipeline' }"
          @click="engine.applyPipelineLayout()"
          title="تخطيط متسلسل لسير العمليات (مدخلات → معالجة → مخزون → إشعارات)"
        >
          <AppIcon name="layers" :size="14" />
          <span>المسار المتسلسل</span>
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: engine.currentLayout.value === 'tree' }"
          @click="engine.applyTreeLayout()"
          title="تخطيط شجري منظم"
        >
          <AppIcon name="boxes" :size="14" />
          <span>تخطيط شجري</span>
        </button>
        <button class="toolbar-btn" @click="handleResetDefaults" title="استعادة العقد الافتراضية">
          <AppIcon name="refresh" :size="14" />
          <span>إعادة الضبط</span>
        </button>
      </div>

      <div class="toolbar-zoom">
        <div class="search-box-mini">
          <AppIcon name="search" :size="13" class="search-mini-icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-mini-input"
            placeholder="ابحث عن عقدة..."
            @keydown.enter="handleSearch"
          />
        </div>
        <button class="zoom-btn" @click="engine.zoomIn()" title="تكبير">+</button>
        <span class="zoom-level">{{ Math.round(engine.zoom.value * 100) }}%</span>
        <button class="zoom-btn" @click="engine.zoomOut()" title="تصغير">−</button>
        <button class="zoom-btn" @click="engine.fitView()" title="ملاءمة الشاشة">
          <AppIcon name="monitor" :size="14" />
        </button>
        <button
          class="btn-simulate"
          :class="{ active: !engine.physicsFrozen.value }"
          @click="engine.togglePhysics()"
          title="تشغيل محاكاة القوى الفيزيائية أو تثبيتها"
        >
          <AppIcon :name="engine.physicsFrozen.value ? 'close' : 'zap'" :size="14" />
          <span>{{ engine.physicsFrozen.value ? 'تثبيت الفيزياء' : 'تشغيل الفيزياء' }}</span>
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: showPhysicsPanel }"
          @click="showPhysicsPanel = !showPhysicsPanel"
          title="لوحة ضبط الفيزياء الحية"
        >
          <AppIcon name="settings" :size="14" />
          <span>الفيزياء</span>
        </button>
      </div>
    </div>

    <!-- لوحة الفيزياء الحية: sliders لحظية تُحفظ عبر PUT /automation/physics -->
    <div v-if="showPhysicsPanel" class="physics-panel">
      <div class="physics-slider" v-for="cfg in physicsSliders" :key="cfg.key">
        <label :for="`ph-${cfg.key}`">{{ cfg.label }}</label>
        <input
          :id="`ph-${cfg.key}`"
          type="range"
          :min="cfg.min"
          :max="cfg.max"
          :step="cfg.step"
          :value="engine.physics[cfg.key]"
          @input="handlePhysicsInput(cfg.key, ($event.target as HTMLInputElement).valueAsNumber)"
        />
        <span class="physics-value">{{ formatPhysicsValue(engine.physics[cfg.key]) }}</span>
      </div>
      <span v-if="physicsSaveState" class="physics-save-state" :class="physicsSaveState">
        {{
          physicsSaveState === 'saving'
            ? 'جاري الحفظ...'
            : physicsSaveState === 'saved'
              ? 'تم الحفظ ✓'
              : 'فشل الحفظ'
        }}
      </span>
    </div>

    <!-- مساحة الـ Canvas -->
    <div class="canvas-viewport" ref="containerRef">
      <canvas
        ref="canvasRef"
        @mousedown="engine.onMouseDown"
        @mousemove="engine.onMouseMove"
        @mouseup="engine.onMouseUp"
        @mouseleave="engine.onMouseUp"
        @click="engine.onClick"
        @wheel.prevent="engine.onWheel"
        @touchstart.passive="engine.onTouchStart"
        @touchmove.prevent="engine.onTouchMove"
        @touchend="engine.onTouchEnd"
      />

      <!-- دليل المجموعات -->
      <div class="canvas-legend-floating">
        <span class="legend-title">مفتاح المجموعات:</span>
        <div class="legend-chips">
          <span class="legend-chip operations"><span class="dot" /> عمليات ومبيعات</span>
          <span class="legend-chip inventory"><span class="dot" /> مخازن ومستودعات</span>
          <span class="legend-chip production"><span class="dot" /> تصنيع ووصفات</span>
          <span class="legend-chip security"><span class="dot" /> رقابة وأمان</span>
          <span class="legend-chip notifications"><span class="dot" /> تليجرام وإشعارات</span>
          <span class="legend-chip ai"><span class="dot" /> ذكاء اصطناعي (Gemini)</span>
        </div>
      </div>

      <!-- تفاصيل العقدة عند التحويم -->
      <div
        v-if="engine.hoveredNode.value && !engine.selectedNode.value"
        class="canvas-hover-tooltip"
        :style="{ left: engine.tooltipPos.x + 'px', top: engine.tooltipPos.y + 'px' }"
      >
        <strong>{{ engine.hoveredNode.value.label_ar || engine.hoveredNode.value.label }}</strong>
        <div class="node-meta-line">
          {{ typeLabels[engine.hoveredNode.value.type] }} ·
          {{ groupLabels[engine.hoveredNode.value.group] || engine.hoveredNode.value.group }}
        </div>
        <div v-if="engine.hoveredNode.value.settings?.rule" class="node-rule-badge">
          📌
          {{
            ruleLabels[engine.hoveredNode.value.settings.rule] ||
            engine.hoveredNode.value.settings.rule
          }}
        </div>
      </div>

      <!-- لوحة تفاصيل العقدة الجانبية (نقر) -->
      <transition name="panel-slide">
        <aside v-if="engine.selectedNode.value" class="node-detail-panel">
          <div class="panel-head">
            <span
              class="panel-accent"
              :style="{ background: groupColor(engine.selectedNode.value.group) }"
            />
            <div class="panel-titles">
              <h4>{{ engine.selectedNode.value.label_ar || engine.selectedNode.value.label }}</h4>
              <p>{{ typeLabels[engine.selectedNode.value.type] }}</p>
            </div>
            <button class="panel-close" @click="closeDetail" title="إغلاق">
              <AppIcon name="close" :size="15" />
            </button>
          </div>
          <dl class="panel-body">
            <div class="panel-row">
              <dt>المجموعة</dt>
              <dd>
                {{
                  groupLabels[engine.selectedNode.value.group] || engine.selectedNode.value.group
                }}
              </dd>
            </div>
            <div class="panel-row">
              <dt>الحالة</dt>
              <dd>{{ engine.selectedNode.value.is_active ? 'نشطة ✓' : 'معطلة' }}</dd>
            </div>
            <div v-if="engine.selectedNode.value.settings?.rule" class="panel-row">
              <dt>القاعدة</dt>
              <dd>
                {{
                  ruleLabels[engine.selectedNode.value.settings.rule] ||
                  engine.selectedNode.value.settings.rule
                }}
              </dd>
            </div>
            <div v-if="detailSettingsText" class="panel-row">
              <dt>الإعدادات</dt>
              <dd class="panel-settings">{{ detailSettingsText }}</dd>
            </div>
          </dl>
          <div class="panel-actions">
            <button
              class="btn-panel-primary"
              @click="focusSelected"
              title="تكبير الكاميرا على العقدة"
            >
              <AppIcon name="search" :size="13" />
              <span>تكبير عليها</span>
            </button>
          </div>
        </aside>
      </transition>

      <!-- الخريطة المصغرة -->
      <div class="minimap-wrap">
        <canvas
          ref="minimapRef"
          class="minimap-canvas"
          @click="handleMinimapClick"
          title="الخريطة المصغرة — انقر للتنقل"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { automation } from '@/api';
import type { GraphData, PhysicsSettings, AutomationExecutionLog } from '@/api/automation.api';
import { useGraphEngine, type EngineNode } from '@/composables/useGraphEngine';

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });

// ─── تسميات مشتركة (نفس التسميات العربية الحالية) ───
const typeLabels: Record<string, string> = {
  agent: '🤖 وكيل ذكي',
  trigger: '⚡ مشغل أحداث',
  action: '⚙️ معالجة وإجراء',
};

const groupLabels: Record<string, string> = {
  operations: 'عمليات المحل والكاشير',
  inventory: 'المخازن والمستودعات',
  production: 'محرك الوصفات والتحميص',
  notifications: 'إشعارات تليجرام',
  ai: 'ذكاء اصطناعي (Gemini)',
  sales: 'مبيعات وفواتير',
  security: 'رقابة وأمان',
};

const ruleLabels: Record<string, string> = {
  RULE_1_MANUAL: 'إدخال يدوي مباشر',
  RULE_2_WHOLESALE: 'فاتورة جملة → خصم من المخزن',
  RULE_3_CASHIER: 'استيراد كاشير → تفكيك الوصفات إلزامياً',
};

// ─── المحرك ───
const engine = useGraphEngine({
  onDragEnd: handleDragEnd,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const minimapRef = ref<HTMLCanvasElement | null>(null);
const showPhysicsPanel = ref(false);
const searchQuery = ref('');
const physicsSaveState = ref<'saving' | 'saved' | 'error' | null>(null);

const physicsSliders: Array<{
  key: keyof PhysicsSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'repelForce', label: 'قوة التنافر بين العقد', min: 0, max: 9000, step: 100 },
  { key: 'linkDistance', label: 'مسافة الروابط الهدف', min: 80, max: 500, step: 10 },
  { key: 'collisionRadius', label: 'أنصاف أقطار التصادم', min: 0, max: 80, step: 2 },
  { key: 'centerForceX', label: 'الجذب المركزي أفقيًا', min: 0, max: 0.2, step: 0.005 },
  { key: 'centerForceY', label: 'الجذب المركزي رأسيًا', min: 0, max: 0.2, step: 0.005 },
];

const detailSettingsText = computed(() => {
  const s = engine.selectedNode.value?.settings;
  if (!s) return '';
  const entries = Object.entries(s).filter(([k]) => k !== 'rule' && k !== 'icon' && k !== 'color');
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
});

function groupColor(group: string): string {
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

function formatPhysicsValue(v: number): string {
  return Math.abs(v) < 1 ? v.toFixed(3) : String(Math.round(v));
}

function closeDetail() {
  engine.selectedNode.value = null;
}

function focusSelected() {
  if (engine.selectedNode.value) engine.focusNode(engine.selectedNode.value);
}

function handleSearch() {
  engine.searchNode(searchQuery.value);
}

function handleMinimapClick(e: MouseEvent) {
  engine.onMinimapPointer(e.clientX, e.clientY);
}

// ─── تحميل البيانات والفيزياء ───
onMounted(async () => {
  if (canvasRef.value && containerRef.value) {
    engine.attach(canvasRef.value, containerRef.value);
  }
  if (minimapRef.value) {
    engine.attachMinimap(minimapRef.value);
  }
  await loadGraphAndPhysics();
});

async function loadGraphAndPhysics() {
  try {
    const [graphRes, physicsRes] = await Promise.all([
      automation.getGraph().catch(() => null),
      automation.getPhysics().catch(() => null),
    ]);
    if (physicsRes && (physicsRes as any).data) {
      engine.setPhysics((physicsRes as any).data as Partial<PhysicsSettings>);
    }
    const graph = (graphRes as any)?.data as GraphData | undefined;
    if (graph?.nodes?.length) {
      engine.setGraph(graph);
    }
  } catch (err) {
    console.error('فشل جلب خريطة سير العمليات:', err);
  }
}

async function handleResetDefaults() {
  try {
    const res = await automation.resetGraphDefaults();
    const graph = (res as any)?.data as GraphData | undefined;
    if (graph?.nodes?.length) {
      engine.resetToGraphDefaults(graph);
    }
  } catch (err) {
    console.error('فشل إعادة ضبط الخريطة:', err);
  }
}

// ─── حفظ مواقع السحب (البند 11): debounce نحو 800ms ───
let positionsTimer: number | null = null;
const pendingPositions = new Map<number, { id: number; x: number; y: number }>();

function handleDragEnd(node: EngineNode) {
  pendingPositions.set(node.id, { id: node.id, x: Math.round(node.x), y: Math.round(node.y) });
  if (positionsTimer !== null) window.clearTimeout(positionsTimer);
  positionsTimer = window.setTimeout(async () => {
    positionsTimer = null;
    if (!pendingPositions.size) return;
    const positions = [...pendingPositions.values()];
    pendingPositions.clear();
    try {
      await automation.updateNodePositions(positions);
    } catch (err) {
      console.error('فشل حفظ مواقع العقد:', err);
    }
  }, 800);
}

// ─── حفظ إعدادات الفيزياء (debounce 600ms) ───
let physicsTimer: number | null = null;

function handlePhysicsInput(key: keyof PhysicsSettings, value: number) {
  engine.updatePhysicsLive({ [key]: value } as Partial<PhysicsSettings>);
  if (physicsTimer !== null) window.clearTimeout(physicsTimer);
  physicsSaveState.value = 'saving';
  physicsTimer = window.setTimeout(async () => {
    physicsTimer = null;
    try {
      await automation.updatePhysics({ ...engine.physics });
      physicsSaveState.value = 'saved';
      window.setTimeout(() => {
        if (physicsSaveState.value === 'saved') physicsSaveState.value = null;
      }, 1800);
    } catch {
      physicsSaveState.value = 'error';
    }
  }, 600);
}

// ─── نبضات حقيقية: ربط التحرك بسجل التنفيذ عبر polling خفيف كل 45 ثانية (البند 16) ───
let lastLogId = 0;
let pollTimer: number | null = null;

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(pollExecutionLogs, 45_000);
}

async function pollExecutionLogs() {
  try {
    const res = await automation.getExecutionLogs({ limit: 10 });
    const logs = ((res as any)?.data?.logs || []) as AutomationExecutionLog[];
    if (!logs.length) return;
    const newestId = logs[0]!.id;
    if (lastLogId === 0) {
      // أول قراءة: مرجع فقط بلا نبضات رجعية
      lastLogId = newestId;
      return;
    }
    if (newestId <= lastLogId) return;
    const fresh = logs.filter((l) => l.id > lastLogId);
    lastLogId = newestId;
    for (const log of fresh.slice(0, 3)) {
      engine.pulse(log.key, log.event_name);
    }
  } catch {
    // polling صامت — لا يزعج المستخدم
  }
}

// ─── تفعيل المحرك مع تبويب الخريطة فقط (البند 15) ───
watch(
  () => props.active,
  (active) => {
    engine.setActive(active);
    if (active) {
      startPolling();
    } else {
      stopPolling();
    }
  },
  { immediate: false },
);

onBeforeUnmount(() => {
  stopPolling();
  if (positionsTimer !== null) window.clearTimeout(positionsTimer);
  if (physicsTimer !== null) window.clearTimeout(physicsTimer);
  engine.detach();
});
</script>

<style scoped>
.workflow-canvas-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.workflow-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.8rem;
  padding: 0.85rem 1.25rem;
  background: var(--bg-soft, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.toolbar-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary, var(--text, #1e293b));
}

.toolbar-presets,
.toolbar-zoom {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.toolbar-btn,
.zoom-btn,
.btn-simulate {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-card, #ffffff);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary, var(--text, #334155));
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover,
.zoom-btn:hover {
  border-color: var(--primary, #0284c7);
}

.toolbar-btn.active,
.btn-simulate.active {
  background: var(--primary, #0284c7);
  color: #ffffff;
  border-color: var(--primary, #0284c7);
}

.zoom-level {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary, var(--text-muted, #64748b));
  min-width: 42px;
  text-align: center;
}

.search-box-mini {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.search-mini-icon {
  position: absolute;
  right: 0.5rem;
  color: var(--text-secondary, var(--text-muted, #94a3b8));
}

.search-mini-input {
  width: 150px;
  padding: 0.32rem 1.8rem 0.32rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-card, #ffffff);
  font-size: 0.76rem;
  color: var(--text-primary, var(--text, #334155));
  outline: none;
}

.search-mini-input:focus {
  border-color: var(--primary, #0284c7);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}

/* ── لوحة الفيزياء الحية ── */
.physics-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--bg-soft, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  animation: panel-enter 0.2s ease;
}

@keyframes panel-enter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.physics-slider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-secondary, var(--text-muted, #475569));
}

.physics-slider input[type='range'] {
  width: 110px;
  accent-color: var(--primary, #0284c7);
}

.physics-value {
  min-width: 46px;
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--primary, #0284c7);
}

.physics-save-state {
  font-size: 0.72rem;
  font-weight: 700;
}

.physics-save-state.saved {
  color: #059669;
}

.physics-save-state.saving {
  color: var(--text-secondary, var(--text-muted, #64748b));
}

.physics-save-state.error {
  color: #dc2626;
}

/* ── مساحة الكانفس ── */
.canvas-viewport {
  position: relative;
  width: 100%;
  height: 580px;
  cursor: grab;
  user-select: none;
}

.canvas-viewport:active {
  cursor: grabbing;
}

.canvas-viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.canvas-legend-floating {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  background: color-mix(in srgb, var(--bg-card, #ffffff) 92%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  font-size: 0.75rem;
  pointer-events: none;
}

.legend-title {
  font-weight: 700;
  color: var(--text-secondary, var(--text-muted, #475569));
}

.legend-chips {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-primary, var(--text, #334155));
}

.legend-chip .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-chip.operations .dot {
  background: #10b981;
}
.legend-chip.inventory .dot {
  background: #0284c7;
}
.legend-chip.production .dot {
  background: #f59e0b;
}
.legend-chip.security .dot {
  background: #ef4444;
}
.legend-chip.notifications .dot {
  background: #8b5cf6;
}
.legend-chip.ai .dot {
  background: #ec4899;
}

.canvas-hover-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--text, #0f172a);
  color: #ffffff;
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  font-size: 0.78rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 10;
  max-width: 220px;
}

.canvas-hover-tooltip strong {
  display: block;
  margin-bottom: 0.2rem;
}

.node-meta-line {
  color: #94a3b8;
  font-size: 0.72rem;
}

.node-rule-badge {
  margin-top: 0.3rem;
  padding: 0.2rem 0.4rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 0.68rem;
  color: #fde68a;
}

/* ── لوحة تفاصيل العقدة الجانبية ── */
.node-detail-panel {
  position: absolute;
  top: 1rem;
  left: 1rem;
  width: 250px;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 12;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.panel-accent {
  width: 5px;
  height: 36px;
  border-radius: 4px;
  flex-shrink: 0;
}

.panel-titles {
  flex: 1;
  min-width: 0;
}

.panel-titles h4 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--text-primary, var(--text, #0f172a));
}

.panel-titles p {
  margin: 0.1rem 0 0;
  font-size: 0.7rem;
  color: var(--text-secondary, var(--text-muted, #64748b));
}

.panel-close {
  background: transparent;
  border: none;
  color: var(--text-secondary, var(--text-muted, #94a3b8));
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 6px;
}

.panel-close:hover {
  background: var(--bg-soft, #f1f5f9);
  color: var(--text-primary, var(--text, #0f172a));
}

.panel-body {
  margin: 0;
  padding: 0.7rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.panel-row {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.panel-row dt {
  font-size: 0.66rem;
  font-weight: 700;
  color: var(--text-secondary, var(--text-muted, #94a3b8));
}

.panel-row dd {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-primary, var(--text, #1e293b));
}

.panel-settings {
  font-size: 0.7rem;
  font-family: monospace;
  direction: ltr;
  text-align: left;
  word-break: break-all;
}

.panel-actions {
  padding: 0.7rem 0.9rem;
  border-top: 1px solid var(--border-color, #e2e8f0);
}

.btn-panel-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  border: none;
  background: var(--primary, #0284c7);
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-panel-primary:hover {
  filter: brightness(1.08);
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

/* ── الخريطة المصغرة ── */
.minimap-wrap {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 8;
}

.minimap-canvas {
  display: block;
  width: 180px;
  height: 120px;
  cursor: pointer;
}

@media (max-width: 640px) {
  .minimap-wrap {
    display: none;
  }

  .node-detail-panel {
    width: calc(100% - 2rem);
  }
}
</style>
