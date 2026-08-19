<template>
  <div class="automations-page">
    <!-- ═══════════════════ Header الرئيسي ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <div class="header-icon-wrap">
          <span class="header-icon">⚡</span>
          <span class="radar-ping"></span>
        </div>
        <div>
          <h2>مركز الأتمتة والذكاء التشغيلي</h2>
          <p>
            مراقبة وتصميم مسارات العمل التلقائية، تقارير الإغلاق، والإنذارات اللحظية عبر تليجرام
          </p>
        </div>
      </div>

      <div class="header-actions">
        <!-- أزرار التبديل بين وضع المخطط الشبكي Obsidian والوضع الكلاسيكي -->
        <div class="view-mode-toggle">
          <button
            type="button"
            class="mode-btn"
            :class="{ active: viewMode === 'graph' }"
            @click="viewMode = 'graph'"
          >
            <span>🌌 استوديو المخطط الشبكي (Obsidian Canvas)</span>
          </button>
          <button
            type="button"
            class="mode-btn"
            :class="{ active: viewMode === 'cards' }"
            @click="viewMode = 'cards'"
          >
            <span>🎛️ البطاقات والتحكم</span>
          </button>
        </div>

        <button
          type="button"
          class="btn btn-secondary"
          :disabled="isLoading"
          @click="fetchAutomations"
        >
          <AppIcon name="refresh" :size="16" />
          <span>تحديث</span>
        </button>

        <button type="button" class="btn btn-primary" @click="showTelegramModal = true">
          <AppIcon name="settings" :size="16" />
          <span>إعدادات البوت 📲</span>
        </button>
      </div>
    </div>

    <!-- رسائل التنبيه والنجاح الحركية -->
    <transition name="slide-fade">
      <div v-if="feedbackMessage" :class="`feedback-alert ${feedbackType}`">
        <span class="alert-icon">{{ feedbackType === 'success' ? '✨' : '⚠️' }}</span>
        <span>{{ feedbackMessage }}</span>
      </div>
    </transition>

    <!-- ═══════════════════ شريط الإحصائيات (Live Pulsing Bento) ═══════════════════ -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-primary-soft">
          <span>⚡</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">المسارات والعقد النشطة</span>
          <h3 class="stat-value">
            {{ activeCount }} <small>/ {{ automationsList.length }}</small>
          </h3>
        </div>
        <div class="sparkle-glow"></div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-success-soft">
          <span>🤖</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">حالة بوت تليجرام</span>
          <h3 class="stat-value text-success">
            <span class="status-pulse-dot" :class="{ active: isTelegramConfigured }"></span>
            <span>{{ isTelegramConfigured ? 'متصل وحي' : 'بحاجة للضبط' }}</span>
          </h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-accent-soft">
          <span>📊</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">التقرير اليومي القادم</span>
          <h3 class="stat-value text-primary">11:30 م <small>تلقائياً</small></h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-warning-soft">
          <span>📜</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">إجمالي العمليات المنفذة</span>
          <h3 class="stat-value">{{ logsList.length }} <small>عملية</small></h3>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ العرض الأول: استوديو المخطط الشبكي التفاعلي (Obsidian Graph & n8n Canvas) ═══════════════════ -->
    <div v-if="viewMode === 'graph'" class="obsidian-graph-wrapper card">
      <!-- شريط أدوات الكانفاس العلوي -->
      <div class="graph-top-bar">
        <div class="graph-title-group">
          <div class="beacon-circle"></div>
          <div>
            <h3 class="graph-heading">خريطة المنظومة العصبية الحية (Interactive Node Graph)</h3>
            <span class="graph-sub"
              >✨ يمكنك سحب العقد بالماوس بحرية، والتحريك والتكبير لعرض مسارات البيانات</span
            >
          </div>
        </div>

        <div class="graph-controls">
          <button type="button" class="graph-ctrl-btn" title="تكبير المنظور" @click="zoomIn">
            ➕
          </button>
          <span class="zoom-level-text">{{ Math.round(zoomLevel * 100) }}%</span>
          <button type="button" class="graph-ctrl-btn" title="تصغير المنظور" @click="zoomOut">
            ➖
          </button>
          <button
            type="button"
            class="graph-ctrl-btn reset-btn"
            title="إعادة ضبط المنظور"
            @click="resetViewport"
          >
            🎯 إعادة الضبط
          </button>
          <button
            type="button"
            class="graph-ctrl-btn auto-layout-btn"
            title="إعادة الترتيب التلقائي"
            @click="autoLayoutNodes"
          >
            ✨ ترتيب ذكي
          </button>
          <button
            type="button"
            class="graph-ctrl-btn fire-all-btn"
            :disabled="isFiringAll"
            @click="simulateFullNetworkPulse"
          >
            <span>{{ isFiringAll ? '⚡ سريان الطاقة...' : '🚀 ضخ نبضة طاقة شاملة' }}</span>
          </button>
        </div>
      </div>

      <!-- مساحة الكانفاس التفاعلية (The Obsidian Canvas Area) -->
      <div
        ref="canvasContainerRef"
        class="obsidian-canvas-viewport"
        :class="{ dragging: isPanning }"
        @mousedown="handleCanvasMouseDown"
        @mousemove="handleCanvasMouseMove"
        @mouseup="handleCanvasMouseUp"
        @mouseleave="handleCanvasMouseUp"
        @wheel.prevent="handleCanvasWheel"
      >
        <!-- خلفية الفضاء النقطي الشبكي (Obsidian Dot Grid) -->
        <div
          class="obsidian-grid-pattern"
          :style="{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }"
        ></div>

        <!-- مساحة التحويل الرئيسية (Canvas Content Layer) -->
        <div
          class="canvas-transform-layer"
          :style="{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }"
        >
          <!-- طبقة الأسلاك المنحنية التفاعلية SVG (Dynamic Bézier Wires) -->
          <svg class="wires-svg-layer" width="3000" height="2000">
            <defs>
              <!-- تدرجات الألوان للأسلاك الضوئية -->
              <linearGradient id="wire-amber-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8" />
                <stop offset="50%" stop-color="#fbbf24" stop-opacity="1" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.8" />
              </linearGradient>
              <linearGradient id="wire-cyan-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#6366f1" stop-opacity="0.8" />
                <stop offset="50%" stop-color="#38bdf8" stop-opacity="1" />
                <stop offset="100%" stop-color="#22c55e" stop-opacity="0.8" />
              </linearGradient>

              <!-- مرشح التوهج النيوني للأسلاك -->
              <filter id="glow-neon" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- رسم الوصلات المنحنية لكل رابط -->
            <g v-for="link in graphLinks" :key="link.id" class="wire-group">
              <!-- سلك الخلفية الأساسي -->
              <path :d="computeBezierPath(link)" class="bezier-wire-bg" />
              <!-- السلك النبضي المتوهج المتحرك -->
              <path
                :d="computeBezierPath(link)"
                class="bezier-wire-pulse"
                :class="{ 'high-voltage': isFiringAll || triggeringId === link.automationId }"
                filter="url(#glow-neon)"
              />
            </g>
          </svg>

          <!-- طبقة العقد التفاعلية (Draggable Nodes) -->
          <div
            v-for="node in graphNodes"
            :key="node.id"
            class="obsidian-node"
            :class="[
              node.category,
              {
                active: selectedNode?.id === node.id,
                executing: isFiringAll || triggeringId === node.automationId,
                dragging: draggedNodeId === node.id,
              },
            ]"
            :style="{
              left: `${node.x}px`,
              top: `${node.y}px`,
            }"
            @mousedown.stop="handleNodeMouseDown(node, $event)"
            @click.stop="selectNode(node)"
          >
            <!-- مقبس الإدخال (Input Socket) -->
            <div v-if="node.hasInput" class="node-socket socket-input" title="مدخل البيانات">
              <span class="socket-dot"></span>
            </div>

            <!-- رأس العقدة -->
            <div class="node-header">
              <div class="node-icon-bubble">
                <span>{{ node.icon }}</span>
              </div>
              <div class="node-meta">
                <span class="node-type-label">{{ node.typeLabel }}</span>
                <h4 class="node-title">{{ node.title }}</h4>
              </div>
            </div>

            <!-- جسم العقدة وتفاصيلها -->
            <p class="node-desc">{{ node.desc }}</p>

            <!-- شريط حالة العقدة السفلي -->
            <div class="node-footer">
              <span class="node-status-badge" :class="node.status">
                <span class="dot"></span>
                <span>{{ node.statusLabel }}</span>
              </span>

              <button
                v-if="node.automationId"
                type="button"
                class="node-quick-run-btn"
                title="تشغيل تجريبي لهذا المسار"
                @click.stop="triggerTestRunById(node.automationId)"
              >
                ⚡ تشغيل
              </button>
            </div>

            <!-- مقبس الإخراج (Output Socket) -->
            <div v-if="node.hasOutput" class="node-socket socket-output" title="مخرج البيانات">
              <span class="socket-dot"></span>
            </div>
          </div>
        </div>

        <!-- اللوحة الجانبية لمستكشف العقدة المحددة (Node Inspector Glass Card) -->
        <transition name="slide-left">
          <div v-if="selectedNode" class="node-inspector-drawer">
            <div class="inspector-header">
              <div class="flex items-center gap-2">
                <span class="text-xl">{{ selectedNode.icon }}</span>
                <div>
                  <h4 class="font-black text-sm text-strong">{{ selectedNode.title }}</h4>
                  <span class="text-xs text-muted">{{ selectedNode.typeLabel }}</span>
                </div>
              </div>
              <button type="button" class="btn-close-mini" @click="selectedNode = null">✕</button>
            </div>

            <div class="inspector-body">
              <p class="text-xs text-muted mb-3">{{ selectedNode.desc }}</p>

              <div class="inspector-stat-row">
                <span class="text-xs font-bold text-muted">حالة التشغيل:</span>
                <span class="badge-mini on">🟢 نشط ومتصل</span>
              </div>

              <div class="inspector-stat-row">
                <span class="text-xs font-bold text-muted">بروتوكول النقل:</span>
                <span class="font-mono text-xs text-strong">Event / Webhook / Cron</span>
              </div>

              <div v-if="selectedNode.cron" class="inspector-stat-row">
                <span class="text-xs font-bold text-muted">الموعد الزمني:</span>
                <span class="text-xs font-bold text-primary">{{ selectedNode.cron }}</span>
              </div>

              <div class="inspector-actions mt-3">
                <button
                  v-if="selectedNode.automationId"
                  type="button"
                  class="btn btn-primary btn-sm w-full"
                  :disabled="triggeringId === selectedNode.automationId"
                  @click="triggerTestRunById(selectedNode.automationId)"
                >
                  <span>{{
                    triggeringId === selectedNode.automationId
                      ? 'جاري الضخ...'
                      : '⚡ تشغيل محاكاة العقدة'
                  }}</span>
                </button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- ═══════════════════ العرض الثاني: كروت التحكم المتقدمة (Grid View) ═══════════════════ -->
    <div v-else class="section-card card">
      <div class="section-header">
        <div class="flex items-center gap-2">
          <AppIcon name="cpu" :size="20" />
          <h3 class="text-lg font-black text-strong">سيناريوهات الأتمتة والإنذارات المتاحة</h3>
        </div>
        <span class="text-xs text-muted font-bold">انقر لتفعيل أو تخصيص كل سيناريو</span>
      </div>

      <div v-if="isLoading" class="loading-state">
        <span class="spinner"></span>
        <span>جاري تحميل إعدادات الأتمتة...</span>
      </div>

      <div v-else class="automations-grid">
        <div
          v-for="item in automationsList"
          :key="item.id"
          class="automation-box"
          :class="{ 'is-disabled': !item.is_enabled, 'is-firing': triggeringId === item.id }"
        >
          <div class="box-head">
            <div class="flex items-center gap-3">
              <div class="scenario-icon">
                {{ getScenarioEmoji(item.key) }}
              </div>
              <div>
                <h4 class="scenario-title">{{ item.name_ar }}</h4>
                <div class="flex items-center gap-2 mt-1">
                  <span :class="`category-pill ${item.category}`">
                    {{ getCategoryLabel(item.category) }}
                  </span>
                  <span class="trigger-type-tag">
                    {{ item.trigger_type === 'cron' ? '⏰ مجدول دورياً' : '⚡ حدث فوري لحظي' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- مفتاح التشغيل والإيقاف -->
            <div class="toggle-switch-wrap" @click.stop="toggleAutomation(item)">
              <div class="toggle-track" :class="{ 'is-on': item.is_enabled }">
                <div class="toggle-knob"></div>
              </div>
              <span class="toggle-status-text">{{ item.is_enabled ? 'مفعل' : 'معطل' }}</span>
            </div>
          </div>

          <p class="scenario-desc">{{ item.description_ar }}</p>

          <!-- شريط الإعدادات السريعة والمواعيد -->
          <div class="scenario-meta-row">
            <div v-if="item.trigger_type === 'cron'" class="cron-info-badge">
              <AppIcon name="clock" :size="14" />
              <span
                >الموعد: <b>{{ formatCronHuman(item.cron_expression) }}</b></span
              >
            </div>
            <div v-else class="cron-info-badge event">
              <AppIcon name="shield" :size="14" />
              <span>حماية ومراقبة فورية 24/7</span>
            </div>

            <div class="channels-icons">
              <span
                class="channel-badge"
                :class="{ active: item.channels?.telegram }"
                title="إشعار عبر تليجرام"
              >
                📲 تليجرام
              </span>
              <span
                class="channel-badge"
                :class="{ active: item.channels?.in_app }"
                title="إشعار داخلي في النظام"
              >
                🔔 داخلي
              </span>
            </div>
          </div>

          <!-- أزرار الإجراءات السريعة والتشغيل التجريبي -->
          <div class="box-actions">
            <div class="last-run-time">
              <span v-if="item.last_run_at">
                آخر تشغيل: {{ formatRelativeTime(item.last_run_at) }}
                <span
                  :class="`status-tag ${item.last_status === 'success' ? 'success' : 'failed'}`"
                >
                  {{ item.last_status === 'success' ? 'نجح ✨' : 'فشل ❌' }}
                </span>
              </span>
              <span v-else class="text-muted text-xs">لم يتم التشغيل بعد</span>
            </div>

            <button
              type="button"
              class="btn btn-xs btn-primary-soft btn-trigger-test"
              :disabled="triggeringId === item.id"
              @click="triggerTestRun(item)"
            >
              <AppIcon name="play" :size="12" />
              <span>{{ triggeringId === item.id ? 'جاري الضخ...' : '⚡ تشغيل تجريبي الآن' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ سجل عمليات الأتمتة (Live Stream Logs) ═══════════════════ -->
    <div class="section-card card">
      <div class="section-header">
        <div class="flex items-center gap-2">
          <AppIcon name="invoices" :size="20" />
          <h3 class="text-lg font-black text-strong">
            سجل عمليات وتشغيل الأتمتة (Automation Logs)
          </h3>
        </div>
        <button type="button" class="btn btn-xs btn-outline" @click="fetchLogs">
          <AppIcon name="refresh" :size="12" /> تحديث السجل
        </button>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 160px">الوقت والتاريخ</th>
              <th style="width: 220px">الأتمتة والحدث</th>
              <th style="width: 100px">الحالة</th>
              <th>ملخص الرسالة والنتيجة</th>
              <th style="width: 90px; text-align: center">معاينة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!logsList.length">
              <td colspan="5" class="text-center py-6 text-muted">
                لا توجد سجلات تشغيل بعد. جرب الضغط على "⚡ تشغيل تجريبي الآن" لأي أتمتة.
              </td>
            </tr>
            <tr v-for="log in logsList" :key="log.id" class="log-row">
              <td class="text-xs font-bold text-muted">
                {{ formatDateTime(log.created_at) }}
              </td>
              <td>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-extrabold text-strong">{{
                    log.automation_name || log.event_name
                  }}</span>
                </div>
              </td>
              <td>
                <span :class="`badge-status ${log.status}`">
                  {{ log.status === 'success' ? 'نجحت ✨' : 'فشلت ❌' }}
                </span>
              </td>
              <td>
                <div class="log-title-text">{{ log.title }}</div>
              </td>
              <td style="text-align: center">
                <button
                  type="button"
                  class="btn btn-xs btn-outline"
                  title="عرض الرسالة كاملة"
                  @click="openMessageModal(log)"
                >
                  👁️ عرض
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═══════════════════ مودال إعدادات بوت تليجرام ═══════════════════ -->
    <div v-if="showTelegramModal" class="modal-overlay" @click.self="showTelegramModal = false">
      <div class="modal-box tg-modal">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="text-xl">📲</span>
            <h3 class="font-black text-lg">إعدادات وقناة بوت تليجرام</h3>
          </div>
          <button type="button" class="btn-close" @click="showTelegramModal = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="alert-box-info mb-4">
            <p class="text-xs">
              💡 يمكنك إنشاء بوت تليجرام مجاني خاص بـ <b>"بن العجوز"</b> في دقيقة واحدة عبر مراسلة
              <b>@BotFather</b> على تليجرام، ثم الحصول على الـ <b>Bot Token</b> والـ
              <b>Chat ID</b> الخاص بك من <b>@userinfobot</b>.
            </p>
          </div>

          <div class="form-group mb-3">
            <label class="form-label font-bold">Bot Token (رمز توكن البوت):</label>
            <input
              v-model="telegramForm.botToken"
              type="text"
              placeholder="مثال: 123456789:ABCdefGHIjklMNO..."
              class="form-input font-mono text-xs"
            />
          </div>

          <div class="form-group mb-4">
            <label class="form-label font-bold">Chat ID (معرف الشات أو المجموعة):</label>
            <input
              v-model="telegramForm.chatId"
              type="text"
              placeholder="مثال: 987654321 أو -1001234567890..."
              class="form-input font-mono text-xs"
            />
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              class="btn btn-outline flex-1"
              :disabled="isTestingTelegram"
              @click="handleTestTelegram"
            >
              <span>{{
                isTestingTelegram ? 'جاري الإرسال...' : '🚀 إرسال رسالة تجريبية الآن'
              }}</span>
            </button>
            <button type="button" class="btn btn-primary flex-1" @click="saveTelegramConfig">
              <span>💾 حفظ الإعدادات</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ مودال معاينة نص الرسالة ═══════════════════ -->
    <div v-if="selectedLog" class="modal-overlay" @click.self="selectedLog = null">
      <div class="modal-box message-modal">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="text-xl">📩</span>
            <h3 class="font-black text-base">{{ selectedLog.title }}</h3>
          </div>
          <button type="button" class="btn-close" @click="selectedLog = null">✕</button>
        </div>

        <div class="modal-body">
          <div class="rendered-message-box custom-scrollbar" v-html="selectedLog.message"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="selectedLog = null">إغلاق</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { automations as automationsApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';

const automationsList = ref<any[]>([]);
const logsList = ref<any[]>([]);
const isLoading = ref(false);
const triggeringId = ref<number | null>(null);

const viewMode = ref<'graph' | 'cards'>('graph');
const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

const showTelegramModal = ref(false);
const isTestingTelegram = ref(false);
const selectedLog = ref<any | null>(null);
const isFiringAll = ref(false);

const telegramForm = ref({
  botToken: '',
  chatId: '',
});

/* ═══════════════════ محرك الكانفاس والفيزياء التفاعلية (Obsidian Engine) ═══════════════════ */
const canvasContainerRef = ref<HTMLElement | null>(null);
const zoomLevel = ref(1.0);
const panOffset = reactive({ x: 40, y: 30 });
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0 });

const draggedNodeId = ref<string | null>(null);
const dragNodeStart = reactive({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
const selectedNode = ref<any | null>(null);

// تعريف عقد الخريطة الشبكية التفاعلية
const graphNodes = ref<any[]>([
  {
    id: 'node-pos',
    typeLabel: 'Trigger • نقطة بيع',
    category: 'trigger-cat',
    icon: '☕',
    title: 'كاشير الفروع (POS)',
    desc: 'إصدار الفواتير، التحصيل، ومتابعة الورديات الحية',
    x: 60,
    y: 80,
    hasInput: false,
    hasOutput: true,
    status: 'online',
    statusLabel: 'متصل ولحظي',
    automationId: null,
  },
  {
    id: 'node-cron',
    typeLabel: 'Trigger • جدول زمني',
    category: 'trigger-cat',
    icon: '⏰',
    title: 'محرك الجدولة (Cron)',
    desc: 'جدولة تقرير الإغلاق وفحص النواقص الدوري',
    cron: 'يومياً 11:30 م',
    x: 60,
    y: 310,
    hasInput: false,
    hasOutput: true,
    status: 'online',
    statusLabel: 'مجدول ونشط',
    automationId: null,
  },
  {
    id: 'node-inv',
    typeLabel: 'Trigger • مخازن البن',
    category: 'trigger-cat',
    icon: '🫘',
    title: 'مخازن البن والتحميص',
    desc: 'رصد كميات البن الأخضر والمحمص وحركات الصرف',
    x: 60,
    y: 530,
    hasInput: false,
    hasOutput: true,
    status: 'online',
    statusLabel: 'مراقبة حية',
    automationId: null,
  },
  {
    id: 'node-brain',
    typeLabel: 'Engine • محرك التقارير',
    category: 'logic-cat',
    icon: '🧠',
    title: 'عقل الأتمتة المركزي',
    desc: 'تجميع إيرادات اليوم، صافي الأرباح، وأعلى الأصناف طلباً',
    x: 480,
    y: 190,
    hasInput: true,
    hasOutput: true,
    status: 'online',
    statusLabel: 'معالجة فورية',
    automationId: null,
  },
  {
    id: 'node-fraud',
    typeLabel: 'Security • كشف التلاعب',
    category: 'security-cat',
    icon: '🛡️',
    title: 'منظومة الرقابة والأمان',
    desc: 'كشف فوري لإلغاء الفواتير والخصومات المشبوهة',
    x: 480,
    y: 430,
    hasInput: true,
    hasOutput: true,
    status: 'online',
    statusLabel: 'حماية 24/7',
    automationId: null,
  },
  {
    id: 'node-balancing',
    typeLabel: 'Balancing • مناقلات الفروع',
    category: 'logic-cat',
    icon: '🔄',
    title: 'المناقلات وتوازن الفروع',
    desc: 'تحليل سرعة السحب واقتراح مناقلات لتفادي الشراء الجديد',
    x: 480,
    y: 370,
    hasInput: true,
    hasOutput: true,
    status: 'online',
    statusLabel: 'توازن ذكي',
    automationId: null,
  },
  {
    id: 'node-cashflow',
    typeLabel: 'Shield • درع السيولة',
    category: 'security-cat',
    icon: '💰',
    title: 'درع حماية السيولة النقدية',
    desc: 'تنبؤ استباقي بالعجز المالي ومقارنة الالتزامات بالإيرادات',
    x: 480,
    y: 560,
    hasInput: true,
    hasOutput: true,
    status: 'online',
    statusLabel: 'حماية السيولة',
    automationId: null,
  },
  {
    id: 'node-db',
    typeLabel: 'Storage • قاعدة البيانات',
    category: 'storage-cat',
    icon: '🗄️',
    title: 'سحابة بن العجوز (PostgreSQL)',
    desc: 'حفظ الحركات المحاسبية والسجلات وسلسلة الجرد',
    x: 920,
    y: 110,
    hasInput: true,
    hasOutput: false,
    status: 'online',
    statusLabel: 'مستقرة وسريعة',
    automationId: null,
  },
  {
    id: 'node-tg',
    typeLabel: 'Action • بوت تليجرام التفاعلي',
    category: 'action-cat',
    icon: '🤖',
    title: 'بوت تليجرام (2-Way Bot)',
    desc: 'إرسال التقارير والرد الفوري على أوامر المالك على تليجرام',
    x: 920,
    y: 330,
    hasInput: true,
    hasOutput: false,
    status: 'online',
    statusLabel: 'استماع لحظي 24/7',
    automationId: null,
  },
  {
    id: 'node-logs',
    typeLabel: 'Audit • سجل المراقبة',
    category: 'action-cat',
    icon: '📜',
    title: 'سجل الأتمتة (Audit Stream)',
    desc: 'أرشفة كافة المهام المنفذة مع التوقيت والنتيجة',
    x: 920,
    y: 540,
    hasInput: true,
    hasOutput: false,
    status: 'online',
    statusLabel: 'أرشفة دائمة',
    automationId: null,
  },
]);

// شبكة الوصلات بين العقد (Bézier Links)
const graphLinks = ref<any[]>([
  { id: 'l1', from: 'node-pos', to: 'node-brain', automationId: null },
  { id: 'l2', from: 'node-pos', to: 'node-fraud', automationId: null },
  { id: 'l3', from: 'node-cron', to: 'node-brain', automationId: null },
  { id: 'l4', from: 'node-inv', to: 'node-balancing', automationId: null },
  { id: 'l5', from: 'node-cron', to: 'node-cashflow', automationId: null },
  { id: 'l6', from: 'node-brain', to: 'node-db', automationId: null },
  { id: 'l7', from: 'node-brain', to: 'node-tg', automationId: null },
  { id: 'l8', from: 'node-fraud', to: 'node-tg', automationId: null },
  { id: 'l9', from: 'node-balancing', to: 'node-tg', automationId: null },
  { id: 'l10', from: 'node-cashflow', to: 'node-tg', automationId: null },
  { id: 'l11', from: 'node-brain', to: 'node-logs', automationId: null },
]);

const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;

// حساب منحنى بيزييه الدقيق بين عقدتين
const computeBezierPath = (link: any) => {
  const fromNode = graphNodes.value.find((n) => n.id === link.from);
  const toNode = graphNodes.value.find((n) => n.id === link.to);
  if (!fromNode || !toNode) return '';

  const x1 = fromNode.x + NODE_WIDTH;
  const y1 = fromNode.y + NODE_HEIGHT / 2;
  const x2 = toNode.x;
  const y2 = toNode.y + NODE_HEIGHT / 2;

  const dx = Math.abs(x2 - x1) * 0.55;
  const cx1 = x1 + dx;
  const cy1 = y1;
  const cx2 = x2 - dx;
  const cy2 = y2;

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
};

// تفاعلات الكانفاس والتحريك (Pan & Zoom)
const handleCanvasMouseDown = (e: MouseEvent) => {
  if (
    e.target !== canvasContainerRef.value &&
    !(e.target as HTMLElement).classList.contains('obsidian-grid-pattern')
  ) {
    return;
  }
  isPanning.value = true;
  panStart.x = e.clientX - panOffset.x;
  panStart.y = e.clientY - panOffset.y;
};

const handleCanvasMouseMove = (e: MouseEvent) => {
  if (draggedNodeId.value) {
    const node = graphNodes.value.find((n) => n.id === draggedNodeId.value);
    if (node) {
      const deltaX = (e.clientX - dragNodeStart.x) / zoomLevel.value;
      const deltaY = (e.clientY - dragNodeStart.y) / zoomLevel.value;
      node.x = Math.max(10, Math.round(dragNodeStart.nodeX + deltaX));
      node.y = Math.max(10, Math.round(dragNodeStart.nodeY + deltaY));
    }
    return;
  }

  if (isPanning.value) {
    panOffset.x = e.clientX - panStart.x;
    panOffset.y = e.clientY - panStart.y;
  }
};

const handleCanvasMouseUp = () => {
  isPanning.value = false;
  draggedNodeId.value = null;
};

const handleCanvasWheel = (e: WheelEvent) => {
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(1.8, Math.max(0.5, zoomLevel.value * zoomFactor));
  zoomLevel.value = parseFloat(newZoom.toFixed(2));
};

const zoomIn = () => {
  zoomLevel.value = Math.min(1.8, parseFloat((zoomLevel.value + 0.15).toFixed(2)));
};

const zoomOut = () => {
  zoomLevel.value = Math.max(0.5, parseFloat((zoomLevel.value - 0.15).toFixed(2)));
};

const resetViewport = () => {
  panOffset.x = 40;
  panOffset.y = 30;
  zoomLevel.value = 1.0;
};

const autoLayoutNodes = () => {
  const layouts: Record<string, { x: number; y: number }> = {
    'node-pos': { x: 60, y: 80 },
    'node-cron': { x: 60, y: 310 },
    'node-inv': { x: 60, y: 530 },
    'node-brain': { x: 480, y: 150 },
    'node-balancing': { x: 480, y: 340 },
    'node-fraud': { x: 480, y: 510 },
    'node-cashflow': { x: 480, y: 680 },
    'node-db': { x: 920, y: 110 },
    'node-tg': { x: 920, y: 330 },
    'node-logs': { x: 920, y: 540 },
  };

  for (const node of graphNodes.value) {
    const loc = layouts[node.id];
    if (loc) {
      node.x = loc.x;
      node.y = loc.y;
    }
  }
  showFeedback('تمت إعادة ترتيب العقد بذكاء! ✨');
};

const handleNodeMouseDown = (node: any, e: MouseEvent) => {
  draggedNodeId.value = node.id;
  dragNodeStart.x = e.clientX;
  dragNodeStart.y = e.clientY;
  dragNodeStart.nodeX = node.x;
  dragNodeStart.nodeY = node.y;
  selectedNode.value = node;
};

const selectNode = (node: any) => {
  selectedNode.value = node;
};

const simulateFullNetworkPulse = async () => {
  isFiringAll.value = true;
  showFeedback('⚡ جاري ضخ نبضات الطاقة في جميع أسلاك المنظومة العصبية...');
  setTimeout(() => {
    isFiringAll.value = false;
    showFeedback('تم سريان نبضات البيانات بنجاح في كامل المنظومة! ✨');
  }, 2500);
};

/* ═══════════════════ منطق الـ API والتفاعل مع السيستم ═══════════════════ */
const isTelegramConfigured = computed(() => {
  return (
    Boolean(telegramForm.value.botToken && telegramForm.value.chatId) ||
    automationsList.value.some((a) => a.config?.bot_token && a.config?.chat_id)
  );
});

const activeCount = computed(() => {
  return automationsList.value.filter((a) => a.is_enabled).length;
});

onMounted(async () => {
  await fetchAutomations();
  await fetchLogs();
});

const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  setTimeout(() => {
    feedbackMessage.value = '';
  }, 5000);
};

const fetchAutomations = async () => {
  try {
    isLoading.value = true;
    const res: any = await automationsApi.list();
    const list = res?.data?.automations || res?.automations || [];
    automationsList.value = list;

    // ربط الأتمتة الحقيقية بالعقد التفاعلية
    const dailyAuto = list.find((a: any) => a.key === 'daily_sales_report');
    const voidAuto = list.find((a: any) => a.key === 'void_invoice_alert');
    const stockAuto = list.find((a: any) => a.key === 'low_stock_alert');
    const balAuto = list.find((a: any) => a.key === 'branch_stock_balancing');
    const cashAuto = list.find((a: any) => a.key === 'cashflow_risk_shield');

    const brainNode = graphNodes.value.find((n) => n.id === 'node-brain');
    if (brainNode && dailyAuto) brainNode.automationId = dailyAuto.id;

    const fraudNode = graphNodes.value.find((n) => n.id === 'node-fraud');
    if (fraudNode && voidAuto) fraudNode.automationId = voidAuto.id;

    const invNode = graphNodes.value.find((n) => n.id === 'node-inv');
    if (invNode && stockAuto) invNode.automationId = stockAuto.id;

    const balNode = graphNodes.value.find((n) => n.id === 'node-balancing');
    if (balNode && balAuto) balNode.automationId = balAuto.id;

    const cashNode = graphNodes.value.find((n) => n.id === 'node-cashflow');
    if (cashNode && cashAuto) cashNode.automationId = cashAuto.id;

    // استخراج إعدادات تليجرام إن وجدت
    const firstWithTg = automationsList.value.find((a) => a.config?.bot_token);
    if (firstWithTg) {
      telegramForm.value.botToken = firstWithTg.config.bot_token;
      telegramForm.value.chatId = firstWithTg.config.chat_id;
    }
  } catch (err: any) {
    showFeedback(
      err?.message || err?.response?.data?.message || 'تعذر تحميل إعدادات الأتمتة',
      'error',
    );
  } finally {
    isLoading.value = false;
  }
};

const fetchLogs = async () => {
  try {
    const res: any = await automationsApi.getLogs({ limit: 30 });
    const logs = res?.data?.logs || res?.logs || [];
    logsList.value = logs;
  } catch {
    // Silent
  }
};

const toggleAutomation = async (item: any) => {
  const nextState = !item.is_enabled;
  item.is_enabled = nextState;
  try {
    await automationsApi.update(item.id, { is_enabled: nextState });
    showFeedback(`تم ${nextState ? 'تفعيل' : 'إيقاف'} مسار "${item.name_ar}" بنجاح! ✨`, 'success');
  } catch (err: any) {
    item.is_enabled = !nextState;
    showFeedback(err?.message || 'تعذر تحديث حالة الأتمتة', 'error');
  }
};

const triggerTestRunById = (autoId: number) => {
  const item = automationsList.value.find((a) => a.id === autoId);
  if (item) triggerTestRun(item);
};

const triggerTestRun = async (item: any) => {
  try {
    triggeringId.value = item.id;
    showFeedback(`⚡ جاري ضخ البيانات في الأسلاك وتشغيل مسار "${item.name_ar}"...`);
    const res: any = await automationsApi.trigger(item.id);
    if (res?.success || res?.data?.success) {
      showFeedback(`تم إطلاق مسار "${item.name_ar}" بنجاح وتوصيل الرسالة! 🎉`, 'success');
      item.last_run_at = new Date().toISOString();
      item.last_status = 'success';
      await fetchLogs();
    } else {
      showFeedback(res?.message || res?.data?.message || 'فشل تشغيل الأتمتة', 'error');
    }
  } catch (err: any) {
    showFeedback(err?.message || err?.response?.data?.message || 'حدث خطأ أثناء التشغيل', 'error');
  } finally {
    setTimeout(() => {
      triggeringId.value = null;
    }, 1500);
  }
};

const handleTestTelegram = async () => {
  try {
    isTestingTelegram.value = true;
    const res: any = await automationsApi.testTelegram({
      botToken: telegramForm.value.botToken,
      chatId: telegramForm.value.chatId,
    });
    if (res?.success || res?.data?.success) {
      showFeedback(
        res?.message || res?.data?.message || 'تم إرسال رسالة الاختبار بنجاح إلى شات تليجرام! 📲',
        'success',
      );
    } else {
      showFeedback(res?.message || res?.data?.message || 'فشل إرسال رسالة الاختبار', 'error');
    }
  } catch (err: any) {
    showFeedback(
      err?.message || err?.response?.data?.message || 'فشل الاتصال ببوت تليجرام',
      'error',
    );
  } finally {
    isTestingTelegram.value = false;
  }
};

const saveTelegramConfig = async () => {
  try {
    for (const auto of automationsList.value) {
      const cfg = { ...(auto.config || {}) };
      cfg.bot_token = telegramForm.value.botToken;
      cfg.chat_id = telegramForm.value.chatId;
      await automationsApi.update(auto.id, { config: cfg });
    }
    showFeedback('تم حفظ إعدادات بوت تليجرام لجميع المسارات بنجاح! 🎉');
    showTelegramModal.value = false;
  } catch {
    showFeedback('حدث خطأ أثناء حفظ الإعدادات', 'error');
  }
};

const openMessageModal = (log: any) => {
  selectedLog.value = log;
};

const getScenarioEmoji = (key: string) => {
  const map: Record<string, string> = {
    daily_sales_report: '📊',
    low_stock_alert: '🚨',
    void_invoice_alert: '🛡️',
    large_discount_alert: '💸',
    daily_backup_reminder: '💾',
    branch_stock_balancing: '🔄',
    cashflow_risk_shield: '💰',
  };
  return map[key] || '⚡';
};

const getCategoryLabel = (cat: string) => {
  const map: Record<string, string> = {
    sales: 'مبيعات وأرباح',
    inventory: 'مخزون وخامات',
    security: 'أمان ورقابة',
    system: 'صيانة وسيرفر',
  };
  return map[cat] || 'عام';
};

const formatCronHuman = (cronExpr?: string) => {
  if (!cronExpr) return 'غير محدد';
  if (cronExpr.includes('23 * * *') || cronExpr.includes('30 23')) return 'يومياً الساعة 11:30 م';
  if (cronExpr.includes('10,18')) return 'مرتين يومياً (10:00 ص و 6:00 م)';
  if (cronExpr.includes('0 3 * * *')) return 'يومياً الساعة 3:00 فجراً';
  return cronExpr;
};

const formatDateTime = (dtStr?: string) => {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  return d.toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRelativeTime = (dtStr?: string) => {
  if (!dtStr) return '';
  const diffSec = Math.floor((Date.now() - new Date(dtStr).getTime()) / 1000);
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
  if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
  return `منذ ${Math.floor(diffSec / 86400)} يوم`;
};
</script>

<style scoped>
.automations-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: calc(100vh - var(--navbar-height) - 40px);
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
  border: 1px solid var(--border-strong);
}

.header-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-icon-wrap {
  position: relative;
  width: 46px;
  height: 46px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(217, 119, 6, 0.3);
}

.header-icon {
  font-size: 1.6rem;
  line-height: 1;
  z-index: 2;
}

.radar-ping {
  position: absolute;
  inset: -4px;
  border-radius: var(--radius-md);
  border: 2px solid rgba(217, 119, 6, 0.5);
  animation: radar-pulse 2s infinite cubic-bezier(0, 0, 0.2, 1);
}

@keyframes radar-pulse {
  0% {
    transform: scale(0.95);
    opacity: 1;
  }
  100% {
    transform: scale(1.3);
    opacity: 0;
  }
}

.header-title h2 {
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.header-title p {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 2px 0 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.view-mode-toggle {
  display: flex;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.mode-btn {
  border: none;
  background: transparent;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Bento Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  overflow: hidden;
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
}

.bg-primary-soft {
  background: #fef3c7;
  color: #92400e;
}

.bg-success-soft {
  background: #dcfce7;
  color: #166534;
}

.bg-accent-soft {
  background: #e0e7ff;
  color: #3730a3;
}

.bg-warning-soft {
  background: #fef9c3;
  color: #854d0e;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 2px 0 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-value small {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.status-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9ca3af;
  display: inline-block;
}

.status-pulse-dot.active {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
  animation: dot-pulse 1.5s infinite;
}

@keyframes dot-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.8;
  }
}

/* ═══════════════════ Obsidian Graph & n8n Canvas Styles ═══════════════════ */
.obsidian-graph-wrapper {
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #3d352e;
  overflow: hidden;
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}

.graph-top-bar {
  background: #181512;
  border-bottom: 1px solid #332b24;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  z-index: 10;
}

.graph-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.beacon-circle {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 10px #f59e0b;
  animation: beacon-pulse 1.8s infinite;
}

@keyframes beacon-pulse {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 16px #f59e0b;
  }
  100% {
    opacity: 0.4;
  }
}

.graph-heading {
  font-size: 0.95rem;
  font-weight: 900;
  color: #fff;
  margin: 0;
}

.graph-sub {
  font-size: 0.72rem;
  color: #a8a29e;
}

.graph-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.graph-ctrl-btn {
  background: #26211c;
  border: 1px solid #443c34;
  color: #f5f5f5;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}

.graph-ctrl-btn:hover {
  background: #383028;
  border-color: #f59e0b;
  color: #fbbf24;
}

.zoom-level-text {
  font-size: 0.75rem;
  font-weight: 900;
  color: #fbbf24;
  padding: 0 4px;
}

.fire-all-btn {
  background: linear-gradient(135deg, #d97706, #b45309);
  border: none;
  color: #fff;
  padding: 6px 16px;
  box-shadow: 0 2px 10px rgba(217, 119, 6, 0.4);
}

.fire-all-btn:hover {
  box-shadow: 0 4px 16px rgba(217, 119, 6, 0.7);
  transform: translateY(-1px);
}

/* Obsidian Canvas Viewport */
.obsidian-canvas-viewport {
  width: 100%;
  height: 720px;
  background: #0d0c0b;
  position: relative;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.obsidian-canvas-viewport.dragging {
  cursor: grabbing;
}

/* Background Dot Matrix Pattern */
.obsidian-grid-pattern {
  position: absolute;
  width: 4000px;
  height: 4000px;
  left: -1000px;
  top: -1000px;
  background-image: radial-gradient(#3a322a 1.2px, transparent 1.2px);
  background-size: 24px 24px;
  opacity: 0.45;
  pointer-events: none;
}

.canvas-transform-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  pointer-events: none;
}

/* SVG Wires Layer */
.wires-svg-layer {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 1;
}

.bezier-wire-bg {
  fill: none;
  stroke: #383028;
  stroke-width: 3;
}

.bezier-wire-pulse {
  fill: none;
  stroke: url(#wire-amber-grad);
  stroke-width: 3;
  stroke-dasharray: 8 6;
  animation: wire-flow 1.2s linear infinite;
  opacity: 0.85;
}

.bezier-wire-pulse.high-voltage {
  stroke: #fbbf24;
  stroke-width: 4.5;
  animation: wire-flow 0.4s linear infinite;
  opacity: 1;
}

@keyframes wire-flow {
  from {
    stroke-dashoffset: 28;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* Obsidian Nodes */
.obsidian-node {
  position: absolute;
  width: 260px;
  background: rgba(26, 22, 19, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid #4a3e34;
  border-radius: var(--radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: grab;
  pointer-events: auto;
  z-index: 2;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    transform 0.1s;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.obsidian-node:hover {
  border-color: #f59e0b;
  box-shadow: 0 12px 32px rgba(245, 158, 11, 0.2);
  z-index: 5;
}

.obsidian-node.dragging {
  cursor: grabbing;
  border-color: #fbbf24;
  box-shadow: 0 16px 40px rgba(251, 191, 36, 0.35);
  z-index: 10;
}

.obsidian-node.active {
  border-color: #fbbf24;
  box-shadow:
    0 0 0 2px rgba(251, 191, 36, 0.5),
    0 12px 32px rgba(0, 0, 0, 0.5);
}

.obsidian-node.executing {
  animation: node-pulse-glow 0.8s infinite alternate;
}

@keyframes node-pulse-glow {
  0% {
    border-color: #f59e0b;
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
  }
  100% {
    border-color: #10b981;
    box-shadow: 0 0 25px rgba(16, 185, 129, 0.6);
  }
}

/* Category Color Borders */
.obsidian-node.trigger-cat {
  border-right: 4px solid #f59e0b;
}

.obsidian-node.logic-cat {
  border-right: 4px solid #6366f1;
}

.obsidian-node.storage-cat {
  border-right: 4px solid #0ea5e9;
}

.obsidian-node.action-cat {
  border-right: 4px solid #10b981;
}

/* Sockets */
.node-socket {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #181512;
  border: 2px solid #5a4c40;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
}

.socket-input {
  right: -7px;
}

.socket-output {
  left: -7px;
}

.socket-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
}

/* Node Internal Styling */
.node-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-icon-bubble {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: #2a231d;
  border: 1px solid #524336;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
}

.node-meta {
  display: flex;
  flex-direction: column;
}

.node-type-label {
  font-size: 0.65rem;
  font-weight: 800;
  color: #a8a29e;
  text-transform: uppercase;
}

.node-title {
  font-size: 0.88rem;
  font-weight: 900;
  color: #fff;
  margin: 0;
}

.node-desc {
  font-size: 0.75rem;
  color: #a8a29e;
  line-height: 1.4;
  margin: 0;
}

.node-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #383028;
  padding-top: 6px;
  margin-top: 2px;
}

.node-status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 800;
  color: #10b981;
}

.node-status-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.node-quick-run-btn {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}

.node-quick-run-btn:hover {
  background: #f59e0b;
  color: #000;
}

/* Inspector Drawer Card */
.node-inspector-drawer {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 280px;
  background: rgba(22, 19, 16, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid #4a3e34;
  border-radius: var(--radius-md);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  z-index: 20;
  overflow: hidden;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #1a1612;
  border-bottom: 1px solid #383028;
}

.btn-close-mini {
  background: transparent;
  border: none;
  color: #a8a29e;
  cursor: pointer;
  font-size: 0.9rem;
}

.inspector-body {
  padding: 14px;
}

.inspector-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px dashed #2e2721;
}

/* Section Cards & Grid */
.section-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 1px solid var(--border-strong);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.automations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--space-3);
}

.automation-box {
  background: var(--surface-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-3);
  transition: all 0.2s ease;
}

.automation-box:hover {
  border-color: var(--primary);
  background: var(--surface-2);
  transform: translateY(-2px);
}

.automation-box.is-firing {
  border-color: #fbbf24;
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.4);
}

.box-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-2);
}

.scenario-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.scenario-title {
  font-size: 0.98rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.category-pill {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.category-pill.sales {
  background: #dcfce7;
  color: #166534;
}

.category-pill.inventory {
  background: #fef3c7;
  color: #92400e;
}

.category-pill.security {
  background: #fee2e2;
  color: #991b1b;
}

.category-pill.system {
  background: #e0e7ff;
  color: #3730a3;
}

.trigger-type-tag {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* Switch Toggle */
.toggle-switch-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.toggle-track {
  width: 40px;
  height: 22px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  position: relative;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.toggle-track.is-on {
  background: var(--primary);
  border-color: var(--primary);
}

.toggle-knob {
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  right: 3px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.toggle-track.is-on .toggle-knob {
  transform: translateX(-18px);
}

.toggle-status-text {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-muted);
}

.scenario-desc {
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0;
}

.scenario-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-card);
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
}

.cron-info-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-strong);
}

.channels-icons {
  display: flex;
  gap: 4px;
}

.channel-badge {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  color: var(--text-muted);
}

.channel-badge.active {
  background: #dcfce7;
  color: #166534;
}

.box-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: var(--space-2);
}

.last-run-time {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
}

.status-tag {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: var(--radius-xs);
}

.status-tag.success {
  color: var(--success);
}

.status-tag.failed {
  color: var(--danger);
}

.btn-trigger-test {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: var(--radius-xs);
}

/* Logs Table */
.table-responsive {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}

.data-table th {
  background: var(--surface-2);
  font-weight: 800;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.badge-status {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.badge-status.success {
  background: #dcfce7;
  color: #166534;
}

.badge-status.failed {
  background: #fee2e2;
  color: #991b1b;
}

.log-title-text {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-strong);
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.tg-modal {
  width: 520px;
  max-width: 95vw;
}

.message-modal {
  width: 600px;
  max-width: 95vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.modal-body {
  padding: var(--space-4);
}

.alert-box-info {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
}

.rendered-message-box {
  background: #1e1b18;
  color: #f5f5f5;
  padding: 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-ui), sans-serif;
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 380px;
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.feedback-alert {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-weight: 800;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.feedback-alert.success {
  background: #dcfce7;
  color: var(--success);
  border: 1px solid #86efac;
}

.feedback-alert.error {
  background: #fee2e2;
  color: var(--danger);
  border: 1px solid #fca5a5;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.25s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
