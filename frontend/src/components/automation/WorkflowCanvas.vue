<template>
  <div class="workflow-canvas-card" dir="rtl">
    <!-- شريط أدوات الرسم البياني المتطور والمبسط -->
    <div class="workflow-toolbar">
      <div class="toolbar-brand">
        <span class="live-dot-pulse" />
        <span class="toolbar-title">
          <AppIcon name="activity" :size="16" />
          خريطة التدفق وسير العمليات التفاعلية
        </span>
      </div>

      <div class="toolbar-center">
        <!-- تبديل التخطيط بنمط Segmented Pill -->
        <div class="segmented-control" role="tablist">
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: engine.currentLayout.value === 'pipeline' }"
            @click="engine.applyPipelineLayout()"
            title="تخطيط متسلسل لسير العمليات (مدخلات → معالجة → مخزون → إشعارات)"
          >
            <AppIcon name="layers" :size="13" />
            <span>المسار المتسلسل</span>
          </button>
          <button
            type="button"
            class="segmented-btn"
            :class="{ active: engine.currentLayout.value === 'tree' }"
            @click="engine.applyTreeLayout()"
            title="تخطيط شجري هرمي منظم"
          >
            <AppIcon name="boxes" :size="13" />
            <span>تخطيط شجري</span>
          </button>
        </div>

        <button
          type="button"
          class="toolbar-action-btn"
          @click="handleResetDefaults"
          title="استعادة المواقع الافتراضية وتنظيم العقد"
        >
          <AppIcon name="refresh" :size="13" />
          <span>إعادة التوزيع</span>
        </button>
      </div>

      <div class="toolbar-tools">
        <div class="search-box-mini">
          <AppIcon name="search" :size="13" class="search-mini-icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-mini-input"
            placeholder="ابحث عن عقدة أو وكيل..."
            @keydown.enter="handleSearch"
          />
        </div>
        <div class="zoom-pill-group">
          <button type="button" class="zoom-pill-btn" @click="engine.zoomOut()" title="تصغير">
            −
          </button>
          <span class="zoom-level">{{ Math.round(engine.zoom.value * 100) }}%</span>
          <button type="button" class="zoom-pill-btn" @click="engine.zoomIn()" title="تكبير">
            +
          </button>
          <button
            type="button"
            class="zoom-pill-btn fit"
            @click="engine.fitView()"
            title="ملاءمة الشاشة بالكامل"
          >
            <AppIcon name="monitor" :size="13" />
          </button>
        </div>
      </div>
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

      <!-- دليل المجموعات العائم الأنيق -->
      <div class="canvas-legend-floating">
        <span class="legend-title">مفتاح المراحل:</span>
        <div class="legend-chips">
          <span class="legend-chip operations"><span class="dot" /> عمليات ومبيعات</span>
          <span class="legend-chip inventory"><span class="dot" /> مخازن ومستودعات</span>
          <span class="legend-chip production"><span class="dot" /> تصنيع ووصفات</span>
          <span class="legend-chip security"><span class="dot" /> رقابة وأمان</span>
          <span class="legend-chip notifications"><span class="dot" /> تليجرام وإشعارات</span>
          <span class="legend-chip ai"><span class="dot" /> ذكاء اصطناعي</span>
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

      <!-- لوحة تفاصيل العقدة الجانبية التفاعلية مع مسارات الترابط -->
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
            <button type="button" class="panel-close" @click="closeDetail" title="إغلاق">
              <AppIcon name="close" :size="15" />
            </button>
          </div>

          <div class="panel-scroll-body">
            <dl class="panel-body">
              <div class="panel-row">
                <dt>المجموعة والمرحلة</dt>
                <dd>
                  {{
                    groupLabels[engine.selectedNode.value.group] || engine.selectedNode.value.group
                  }}
                </dd>
              </div>
              <div class="panel-row">
                <dt>حالة العقدة</dt>
                <dd class="status-active-dd">
                  <span class="active-dot" :class="{ on: engine.selectedNode.value.is_active }" />
                  {{ engine.selectedNode.value.is_active ? 'نشطة ومتصلة بالمسار' : 'معطلة مؤقتاً' }}
                </dd>
              </div>
              <div v-if="engine.selectedNode.value.settings?.rule" class="panel-row">
                <dt>القاعدة التشغيلية الإلزامية</dt>
                <dd class="rule-highlight">
                  {{
                    ruleLabels[engine.selectedNode.value.settings.rule] ||
                    engine.selectedNode.value.settings.rule
                  }}
                </dd>
              </div>
              <div v-if="detailSettingsText" class="panel-row">
                <dt>المعاملات والإعدادات</dt>
                <dd class="panel-settings">{{ detailSettingsText }}</dd>
              </div>
            </dl>

            <!-- المسارات والروابط الواردة (Incoming Connections) -->
            <div class="panel-connections-section" v-if="selectedIncomingEdges.length">
              <div class="connections-header">
                <AppIcon name="arrowLeft" :size="13" class="conn-header-icon in" />
                <span>المسارات الواردة (تتغذى من):</span>
                <span class="connections-count">{{ selectedIncomingEdges.length }}</span>
              </div>
              <div class="connections-list">
                <button
                  type="button"
                  v-for="(conn, idx) in selectedIncomingEdges"
                  :key="`in-${idx}`"
                  class="connection-chip incoming"
                  @click="selectConnectedNode(conn.node)"
                  title="انقر للانتقال للعقدة المغذية"
                >
                  <span
                    class="conn-node-dot"
                    :style="{ background: groupColor(conn.node.group) }"
                  />
                  <div class="conn-info">
                    <strong class="conn-label">{{ conn.node.label_ar || conn.node.label }}</strong>
                    <span class="conn-condition">{{ conn.label }}</span>
                  </div>
                  <AppIcon name="search" :size="11" class="conn-goto-icon" />
                </button>
              </div>
            </div>

            <!-- المسارات والروابط الصادرة (Outgoing Connections) -->
            <div class="panel-connections-section" v-if="selectedOutgoingEdges.length">
              <div class="connections-header">
                <AppIcon name="send" :size="13" class="conn-header-icon out" />
                <span>المسارات الصادرة (تؤدي إلى):</span>
                <span class="connections-count">{{ selectedOutgoingEdges.length }}</span>
              </div>
              <div class="connections-list">
                <button
                  type="button"
                  v-for="(conn, idx) in selectedOutgoingEdges"
                  :key="`out-${idx}`"
                  class="connection-chip outgoing"
                  @click="selectConnectedNode(conn.node)"
                  title="انقر للانتقال للعقدة المستهدفة"
                >
                  <span
                    class="conn-node-dot"
                    :style="{ background: groupColor(conn.node.group) }"
                  />
                  <div class="conn-info">
                    <strong class="conn-label">{{ conn.node.label_ar || conn.node.label }}</strong>
                    <span class="conn-condition">{{ conn.label }}</span>
                  </div>
                  <AppIcon name="search" :size="11" class="conn-goto-icon" />
                </button>
              </div>
            </div>
          </div>

          <div class="panel-actions">
            <button
              type="button"
              class="btn-panel-primary"
              @click="focusSelected"
              title="تكبير الكاميرا على العقدة"
            >
              <AppIcon name="search" :size="13" />
              <span>تركيز الكاميرا</span>
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
const searchQuery = ref('');

interface NodeConnectionInfo {
  node: EngineNode;
  label: string;
  condition?: string | null;
  direction: 'in' | 'out';
}

const selectedIncomingEdges = computed<NodeConnectionInfo[]>(() => {
  if (!engine.selectedNode.value) return [];
  const nodeId = engine.selectedNode.value.id;
  return engine.edges.value
    .filter((e) => e.target === nodeId)
    .map((e) => {
      const src = engine.nodes.value.find((n) => n.id === e.source);
      return {
        node: src!,
        label: e.label || e.condition || 'تدفق أحداث مباشر',
        condition: e.condition,
        direction: 'in' as const,
      };
    })
    .filter((c) => Boolean(c.node));
});

const selectedOutgoingEdges = computed<NodeConnectionInfo[]>(() => {
  if (!engine.selectedNode.value) return [];
  const nodeId = engine.selectedNode.value.id;
  return engine.edges.value
    .filter((e) => e.source === nodeId)
    .map((e) => {
      const tgt = engine.nodes.value.find((n) => n.id === e.target);
      return {
        node: tgt!,
        label: e.label || e.condition || 'إجراء مباشر',
        condition: e.condition,
        direction: 'out' as const,
      };
    })
    .filter((c) => Boolean(c.node));
});

function selectConnectedNode(targetNode: EngineNode) {
  engine.focusNode(targetNode);
  engine.selectedNode.value = targetNode;
}

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
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
}

/* ── شريط الأدوات الرئيسي ── */
.workflow-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  padding: 0.85rem 1.25rem;
  background: var(--bg-soft, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.toolbar-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.live-dot-pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
  animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

.toolbar-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary, var(--text, #1e293b));
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

/* ── مفتاح التبديل Segmented Control ── */
.segmented-control {
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--border-color, #cbd5e1) 40%, transparent);
  padding: 3px;
  border-radius: 999px;
  gap: 3px;
}

.segmented-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary, var(--text-muted, #64748b));
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  min-height: 30px;
}

.segmented-btn:hover {
  color: var(--text-primary, var(--text, #1e293b));
}

.segmented-btn.active {
  background: var(--bg-card, #ffffff);
  color: var(--primary, #0284c7);
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.toolbar-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-card, #ffffff);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, var(--text-muted, #475569));
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 30px;
}

.toolbar-action-btn:hover {
  border-color: var(--primary, #0284c7);
  color: var(--primary, #0284c7);
}

/* ── أدوات التكبير والبحث ── */
.toolbar-tools {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.search-box-mini {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.search-mini-icon {
  position: absolute;
  right: 0.6rem;
  color: var(--text-secondary, var(--text-muted, #94a3b8));
  pointer-events: none;
}

.search-mini-input {
  width: 170px;
  padding: 0.38rem 2rem 0.38rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border-color, #cbd5e1);
  background: var(--bg-card, #ffffff);
  font-size: 0.76rem;
  color: var(--text-primary, var(--text, #334155));
  outline: none;
  transition: all 0.2s ease;
}

.search-mini-input:focus {
  border-color: var(--primary, #0284c7);
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
  width: 195px;
}

.zoom-pill-group {
  display: inline-flex;
  align-items: center;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: 999px;
  padding: 2px;
  gap: 2px;
}

.zoom-pill-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 50%;
  color: var(--text-secondary, var(--text-muted, #475569));
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.zoom-pill-btn:hover {
  background: var(--bg-soft, #f1f5f9);
  color: var(--text-primary, var(--text, #0f172a));
}

.zoom-pill-btn.fit {
  font-size: 0.78rem;
}

.zoom-level {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-secondary, var(--text-muted, #64748b));
  min-width: 38px;
  text-align: center;
}

/* ── مساحة الكانفس ── */
.canvas-viewport {
  position: relative;
  width: 100%;
  height: 600px;
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

/* ── دليل المجموعات العائم ── */
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
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
  font-size: 0.74rem;
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
  max-width: 230px;
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
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  font-size: 0.68rem;
  color: #fde68a;
}

/* ── لوحة تفاصيل العقدة الجانبية ── */
.node-detail-panel {
  position: absolute;
  top: 1rem;
  left: 1rem;
  width: 300px;
  max-height: calc(100% - 2rem);
  display: flex;
  flex-direction: column;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.14);
  overflow: hidden;
  z-index: 12;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-soft, #f8fafc);
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-titles p {
  margin: 0.1rem 0 0;
  font-size: 0.72rem;
  color: var(--text-secondary, var(--text-muted, #64748b));
}

.panel-close {
  background: transparent;
  border: none;
  color: var(--text-secondary, var(--text-muted, #94a3b8));
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-close:hover {
  background: var(--bg-soft, #e2e8f0);
  color: var(--text-primary, var(--text, #0f172a));
}

.panel-scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.panel-body {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.panel-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.panel-row dt {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-secondary, var(--text-muted, #94a3b8));
}

.panel-row dd {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-primary, var(--text, #1e293b));
}

.status-active-dd {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.status-active-dd .active-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}

.status-active-dd .active-dot.on {
  background: #10b981;
}

.rule-highlight {
  font-size: 0.74rem;
  color: #b45309;
  background: #fef3c7;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 600;
}

.panel-settings {
  font-size: 0.7rem;
  font-family: monospace;
  direction: ltr;
  text-align: left;
  word-break: break-all;
  background: var(--bg-soft, #f8fafc);
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--border-color, #e2e8f0);
}

/* ── مسارات الترابط في اللوحة الجانبية ── */
.panel-connections-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--border-color, #e2e8f0);
}

.connections-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-secondary, var(--text-muted, #64748b));
}

.conn-header-icon.in {
  color: #0284c7;
}

.conn-header-icon.out {
  color: #10b981;
}

.connections-count {
  font-size: 0.65rem;
  background: var(--bg-soft, #f1f5f9);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-weight: 700;
  margin-right: auto;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.connection-chip {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-soft, #f8fafc);
  cursor: pointer;
  text-align: right;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.connection-chip:hover {
  border-color: var(--primary, #0284c7);
  background: color-mix(in srgb, var(--primary, #0284c7) 8%, var(--bg-card, #ffffff));
  transform: translateX(-2px);
}

.conn-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.conn-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.conn-label {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-primary, var(--text, #0f172a));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-condition {
  font-size: 0.68rem;
  color: var(--text-secondary, var(--text-muted, #64748b));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-goto-icon {
  color: var(--text-secondary, var(--text-muted, #94a3b8));
  flex-shrink: 0;
}

.panel-actions {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-soft, #f8fafc);
}

.btn-panel-primary {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  border: none;
  background: var(--primary, #0284c7);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
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
  transform: translateX(-14px);
}

/* ── الخريطة المصغرة ── */
.minimap-wrap {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  z-index: 8;
  background: var(--bg-card, #ffffff);
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
