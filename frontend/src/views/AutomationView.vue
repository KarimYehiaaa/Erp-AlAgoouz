<template>
  <div class="automations-page">
    <!-- ═══════════════════ Header الرئيسي ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <div class="header-icon-wrap">
          <span class="header-icon">⚡</span>
          <span class="pulse-ring"></span>
        </div>
        <div>
          <h2>الفضاء التفاعلي ثلاثي الأبعاد للأتمتة</h2>
          <p>خريطة حية للوكلاء والبوتات ومسارات تدفق البيانات بينها — دوران، تحريك، وتكبير حر</p>
        </div>
      </div>

      <div class="header-actions">
        <button type="button" class="btn btn-secondary" :disabled="isLoading" @click="refreshAll" title="تحديث البيانات">
          <AppIcon name="refresh" :size="16" />
          <span>تحديث</span>
        </button>

        <button type="button" class="btn btn-warning-soft" :disabled="isFiringAll" @click="triggerAllAutomations" title="إرسال نبضة فحص شاملة لكافة مسارات الشبكة">
          <span>{{ isFiringAll ? 'جاري الفحص الشامل...' : '⚡ فحص الشبكة بالكامل' }}</span>
        </button>

        <button type="button" class="btn btn-primary" @click="showTelegramModal = true">
          <AppIcon name="settings" :size="16" />
          <span>بوت تليجرام 📲</span>
        </button>
      </div>
    </div>

    <!-- رسائل التنبيه -->
    <transition name="slide-fade">
      <div v-if="feedbackMessage" :class="`feedback-alert ${feedbackType}`">
        <span class="alert-icon">{{ feedbackType === 'success' ? '✨' : '⚠️' }}</span>
        <span>{{ feedbackMessage }}</span>
      </div>
    </transition>

    <!-- ═══════════════════ شريط الإحصائيات ═══════════════════ -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-primary-soft"><span>⚡</span></div>
        <div class="stat-info">
          <span class="stat-label">المسارات المفعلة بالشبكة</span>
          <h3 class="stat-value">{{ graphStats.enabledAgents }} <small>/ {{ graphStats.totalAgents }} وكيل</small></h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-success-soft"><span>🤖</span></div>
        <div class="stat-info">
          <span class="stat-label">عقدة انطلاق بوت تليجرام</span>
          <h3 class="stat-value text-success">
            <span class="status-pulse-dot" :class="{ active: isTelegramReady }"></span>
            <span>{{ telegramStatusLabel }}</span>
          </h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-accent-soft"><span>🕸️</span></div>
        <div class="stat-info">
          <span class="stat-label">مسارات التدفق الحية</span>
          <h3 class="stat-value">{{ graphStats.totalLinks }} <small>رابط</small></h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-warning-soft"><span>📜</span></div>
        <div class="stat-info">
          <span class="stat-label">إجمالي العمليات المنفذة</span>
          <h3 class="stat-value">{{ logsList.length }} <small>عملية</small></h3>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ اللوحة ثلاثية الأبعاد (Interactive 3D Canvas) ═══════════════════ -->
    <div class="canvas-section-card card">
      <div class="canvas-toolbar">
        <div class="canvas-title-group">
          <div class="canvas-badge-live">
            <span class="live-dot"></span>
            <span>الشبكة ثلاثية الأبعاد للأتمتة (Live 3D Graph)</span>
          </div>
          <span class="canvas-subtitle">💡 اسحب للتدوير • عجلة الفأرة للتكبير • انقر أي عقدة لتفاصيلها وإجراءاتها</span>
        </div>

        <div class="canvas-controls-group">
          <!-- تبديل نمط التوزيع ثلاثي الأبعاد -->
          <div class="layout-toggle-pill">
            <button v-for="mode in LAYOUT_MODES" :key="mode.key" type="button" class="layout-btn" :class="{ active: canvasLayout === mode.key }" :title="mode.hint" @click="canvasLayout = mode.key">
              {{ mode.label }}
            </button>
          </div>

          <div class="zoom-controls-pill">
            <button type="button" class="zoom-btn" @click="graph3dRef?.zoomIn()" title="تكبير">+</button>
            <button type="button" class="zoom-btn" @click="graph3dRef?.zoomOut()" title="تصغير">−</button>
            <button type="button" class="zoom-btn reset-btn" @click="resetCanvasView" title="إعادة ضبط الكاميرا">↺ إعادة ضبط</button>
          </div>

          <button type="button" class="btn btn-xs btn-outline pulse-btn" @click="pulseNetwork" title="دوران فحص سريع لكافة العقد">💫 ضخ نبضة طاقة</button>

          <button v-if="selectedNodeId" type="button" class="btn btn-xs btn-outline" @click="clearSelection" title="إلغاء التحديد">✕ إلغاء التحديد</button>
        </div>
      </div>

      <!-- فلاتر الفئات على اللوحة -->
      <div class="canvas-categories-bar">
        <button v-for="cat in categoryTabs" :key="cat.key" type="button" class="canvas-cat-pill" :class="{ active: selectedCategory === cat.key }" @click="selectedCategory = cat.key">
          <span>{{ cat.icon }}</span>
          <span>{{ cat.label }}</span>
          <span class="cat-pill-count">{{ getCategoryCount(cat.key) }}</span>
        </button>
      </div>

      <AutomationGraph3D
        ref="graph3dRef"
        :nodes="graphNodes"
        :links="graphLinks"
        :layout="canvasLayout"
        :selected-id="selectedNodeId"
        :loading="isLoading"
        @select="onNodeSelect"
      >
        <template #node-details="{ node }">
          <div v-if="node.kind === 'agent'" class="selected-actions">
            <div class="live-meta">
              <span v-if="node.live?.cron_expression" class="meta-chip">⏰ {{ formatCronHuman(node.live.cron_expression) }}</span>
              <span v-if="node.live?.last_status" class="meta-chip" :class="`status-${node.live.last_status}`">
                {{ node.live.last_status === 'success' ? '✅ آخر تشغيل ناجح' : node.live.last_status === 'failed' ? '❌ آخر تشغيل فاشل' : '⚠️ تحذير' }}
              </span>
              <span v-if="node.live?.is_enabled === false" class="meta-chip muted">⚪ معطل حالياً</span>
            </div>
            <div class="actions-row">
              <button type="button" class="btn-action primary" :disabled="triggeringDbId === node.live?.dbId || !node.live?.dbId" @click="triggerAgent(node)">
                {{ triggeringDbId === node.live?.dbId ? 'جاري التنفيذ...' : '▶ تشغيل الآن' }}
              </button>
              <button type="button" class="btn-action ghost" :disabled="!node.live?.dbId" @click="toggleAgent(node)">
                {{ node.live?.is_enabled ? '⏸ تعطيل' : '⏵ تفعيل' }}
              </button>
              <button type="button" class="btn-action ghost" :disabled="!node.live?.dbId" @click="openConfigModalById(node.live!.dbId!)">⚙ الإعدادات</button>
            </div>
          </div>
          <p v-else-if="node.id === 'telegram-bot'" class="telegram-node-hint">
            {{ isTelegramReady ? '🟢 البوت يستقبل أوامر المالك ويرسلها لمحرك الأتمتة لحظياً' : '🟡 اضبط بيانات البوت من زر «بوت تليجرام» بالأعلى' }}
          </p>
        </template>
      </AutomationGraph3D>

      <!-- دليل ألوان العقد -->
      <div class="canvas-legend">
        <span class="legend-item"><i class="legend-dot" style="background: #229ed9"></i> عقدة انطلاق (تليجرام)</span>
        <span class="legend-item"><i class="legend-dot" style="background: #d4a373"></i> محرك الأتمتة</span>
        <span class="legend-item"><i class="legend-dot" style="background: #f59e0b"></i> وكلاء المبيعات</span>
        <span class="legend-item"><i class="legend-dot" style="background: #22c55e"></i> وكلاء المخزون</span>
        <span class="legend-item"><i class="legend-dot" style="background: #ef4444"></i> وكلاء الرقابة</span>
        <span class="legend-item"><i class="legend-dot" style="background: #38bdf8"></i> النظام والقنوات</span>
      </div>
    </div>

    <!-- ═══════════════════ سجل العمليات ═══════════════════ -->
    <div class="logs-card card">
      <div class="logs-head">
        <h3>📜 سجل العمليات الأخيرة</h3>
        <button v-if="logsList.length > logsPageSize" type="button" class="btn btn-xs btn-outline" @click="showAllLogs = !showAllLogs">
          {{ showAllLogs ? 'عرض أقل' : `عرض الكل (${logsList.length})` }}
        </button>
      </div>

      <div v-if="visibleLogs.length === 0" class="logs-empty">لا توجد عمليات مسجلة بعد — جرّب «فحص الشبكة بالكامل».</div>

      <table v-else class="logs-table">
        <thead>
          <tr>
            <th>الحالة</th>
            <th>العملية</th>
            <th>المسار</th>
            <th>الوقت</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in visibleLogs" :key="log.id">
            <td><span class="log-status-badge" :class="log.status">{{ log.status === 'success' ? 'نجاح' : log.status === 'failed' ? 'فشل' : 'تحذير' }}</span></td>
            <td class="log-title-cell">{{ log.title }}</td>
            <td>{{ log.automation_name || '—' }}</td>
            <td class="log-time">{{ formatDateTime(log.created_at) }}</td>
            <td><button type="button" class="btn btn-xs btn-outline" @click="selectedLog = log">عرض</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ═══════════════════ نافذة تفاصيل السجل ═══════════════════ -->
    <div v-if="selectedLog" class="modal-overlay" @click.self="selectedLog = null">
      <div class="modal-box">
        <div class="modal-header">
          <h4>{{ selectedLog.title }}</h4>
          <button type="button" class="modal-close" @click="selectedLog = null">✕</button>
        </div>
        <pre class="modal-log-body">{{ selectedLog.message }}</pre>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="selectedLog = null">إغلاق</button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ نافذة بوت تليجرام ═══════════════════ -->
    <div v-if="showTelegramModal" class="modal-overlay" @click.self="showTelegramModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h4>📲 بوت تليجرام — عقدة الانطلاق</h4>
          <button type="button" class="modal-close" @click="showTelegramModal = false">✕</button>
        </div>

        <div class="telegram-status-banner" :class="telegramStatusClass">
          <span class="status-pulse-dot big" :class="{ active: isTelegramReady }"></span>
          <div>
            <strong>{{ telegramStatusLabel }}</strong>
            <small v-if="isTelegramReady">التوثيق يُدار مركزياً من متغيرات البيئة على الخادم (لا تُخزَّن هنا أبداً)</small>
            <small v-else>أضف TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID إلى backend/.env ثم أعد تشغيل الخادم</small>
          </div>
        </div>

        <p class="field-hint-main">
          اختياري: يمكنك اختبار توكن مؤقت قبل ضبطه على الخادم. اترك الحقول فارغة لتجربة الإعدادات المركزية الحالية.
        </p>

        <label class="field">
          <span>Bot Token (اختياري للتجربة)</span>
          <input v-model="telegramForm.botToken" type="password" placeholder="اتركه فارغاً لاستخدام إعدادات الخادم" autocomplete="off" />
        </label>

        <label class="field">
          <span>Chat ID (اختياري للتجربة)</span>
          <input v-model="telegramForm.chatId" type="text" placeholder="اتركه فارغاً لاستخدام إعدادات الخادم" autocomplete="off" />
        </label>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showTelegramModal = false">إغلاق</button>
          <button type="button" class="btn btn-primary" :disabled="isTestingTelegram" @click="handleTestTelegram">
            {{ isTestingTelegram ? 'جاري الإرسال...' : '🚀 إرسال رسالة تجريبية' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ نافذة تعديل إعدادات الوكيل ═══════════════════ -->
    <div v-if="editingAutomation" class="modal-overlay" @click.self="editingAutomation = null">
      <div class="modal-box">
        <div class="modal-header">
          <h4>⚙ إعدادات: {{ editingAutomation.name_ar }}</h4>
          <button type="button" class="modal-close" @click="editingAutomation = null">✕</button>
        </div>

        <label class="switch-row">
          <span>تفعيل المسار</span>
          <input v-model="editingAutomation.is_enabled" type="checkbox" />
          <i class="switch-ui"></i>
        </label>

        <label class="field">
          <span>الموعد المجدول (Cron)</span>
          <input v-model="editingAutomation.cron_expression" type="text" placeholder="30 23 * * *" dir="ltr" />
        </label>

        <div class="channels-grid">
          <label class="channel-check"><input v-model="editingAutomation.channels.telegram" type="checkbox" /> قناة تليجرام 📲</label>
          <label class="channel-check"><input v-model="editingAutomation.channels.in_app" type="checkbox" /> الإشعارات الداخلية 🔔</label>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="editingAutomation = null">إلغاء</button>
          <button type="button" class="btn btn-primary" :disabled="isSavingConfig" @click="saveAutomationConfig">
            {{ isSavingConfig ? 'جاري الحفظ...' : '💾 حفظ الإعدادات' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { automations as automationsApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';
import AutomationGraph3D, { type Graph3DLink, type Graph3DNode } from '@/components/AutomationGraph3D.vue';
import type { LayoutMode } from '@/utils/automationGraphLayout';

/* ─── الحالة العامة ─── */
const isLoading = ref(false);
const triggeringDbId = ref<number | null>(null);
const isFiringAll = ref(false);
const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

const graphNodes = ref<Graph3DNode[]>([]);
const graphLinks = ref<Graph3DLink[]>([]);
const graphStats = ref({ enabledAgents: 0, totalAgents: 0, totalLinks: 0 });
const telegramInfo = ref({ configured: false, listening: false });

const logsList = ref<any[]>([]);
const showAllLogs = ref(false);
const logsPageSize = 15;
const visibleLogs = computed(() =>
  showAllLogs.value ? logsList.value : logsList.value.slice(0, logsPageSize),
);

const selectedCategory = ref<string>('all');
const selectedNodeId = ref<string | null>(null);
const canvasLayout = ref<LayoutMode>('obsidian');
const graph3dRef = ref<InstanceType<typeof AutomationGraph3D> | null>(null);

const showTelegramModal = ref(false);
const isTestingTelegram = ref(false);
const selectedLog = ref<any | null>(null);
const editingAutomation = ref<any | null>(null);
const isSavingConfig = ref(false);

/** نسخة كاملة من سجلات قاعدة البيانات (للتعديل والتشغيل اليدوي) */
let dbRecordsByKey = new Map<string, any>();

const telegramForm = ref({ botToken: '', chatId: '' });

const LAYOUT_MODES: Array<{ key: LayoutMode; label: string; hint: string }> = [
  { key: 'obsidian', label: '🕸️ عنقودي', hint: 'عناقيد الفئات حول المحرك في الفضاء' },
  { key: 'orbit', label: '🪐 مداري', hint: 'حلقتان مداريتان مائلتان حول المحرك' },
  { key: 'matrix', label: '🔀 شبكي', hint: 'مصفوفة شبكية متوازنة' },
];

const categoryTabs = [
  { key: 'all', label: 'كافة المسارات', icon: '🌟' },
  { key: 'sales', label: 'المبيعات والسيولة', icon: '☕' },
  { key: 'inventory', label: 'المخزون والتحميص', icon: '🫘' },
  { key: 'security', label: 'الرقابة والأمان', icon: '🛡️' },
  { key: 'system', label: 'النظام والنسخ', icon: '⚙️' },
];

/* ─── مشتقات ─── */
const isTelegramReady = computed(() => telegramInfo.value.configured && telegramInfo.value.listening);
const telegramStatusLabel = computed(() => {
  if (!telegramInfo.value.configured) return 'بحاجة للضبط';
  return telegramInfo.value.listening ? 'متصل ويستمع للأوامر 24/7' : 'مهيأ — بانتظار بدء الاستماع';
});
const telegramStatusClass = computed(() => (telegramInfo.value.configured ? 'ok' : 'warn'));

const visibleGraphNodes = computed<Graph3DNode[]>(() => {
  // البنية التحتية دائماً ظاهرة؛ الوكلاء يتأثرون بفلتر الفئات
  const infra = graphNodes.value.filter((n) => n.kind !== 'agent');
  if (selectedCategory.value === 'all') return graphNodes.value;
  const agents = graphNodes.value.filter((n) => n.kind === 'agent' && n.category === selectedCategory.value);
  return [...infra, ...agents];
});

function getCategoryCount(catKey: string) {
  if (catKey === 'all') return graphNodes.value.filter((n) => n.kind === 'agent').length;
  return graphNodes.value.filter((n) => n.kind === 'agent' && n.category === catKey).length;
}

/* ─── أدوات مساعدة ─── */
const setFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  setTimeout(() => {
    feedbackMessage.value = '';
  }, 4500);
};

const formatCronHuman = (cronStr?: string | null) => {
  if (!cronStr) return 'حدث فوري';
  const map: Record<string, string> = {
    '30 23 * * *': 'يومياً 11:30 م',
    '0 10,18 * * *': 'مرتين يومياً (10 ص و 6 م)',
    '0 9 * * *': 'يومياً 9:00 ص',
    '0 10 * * 1': 'كل إثنين 10:00 ص',
    '0 3 * * *': 'يومياً 3:00 ص',
    '0 22 * * *': 'يومياً 10:00 م',
    '0 11 * * *': 'يومياً 11:00 ص',
    '0 12 * * 0': 'كل أحد 12:00 م',
  };
  return map[cronStr] || cronStr;
};

const formatDateTime = (isoString: string) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/* ─── جلب البيانات ─── */
const fetchGraph = async () => {
  const res: any = await automationsApi.graph();
  const data = res?.data ?? res ?? {};
  graphNodes.value = Array.isArray(data.nodes) ? data.nodes : [];
  graphLinks.value = Array.isArray(data.links) ? data.links : [];
  graphStats.value = {
    enabledAgents: data.stats?.enabledAgents ?? 0,
    totalAgents: data.stats?.totalAgents ?? 0,
    totalLinks: data.stats?.totalLinks ?? 0,
  };
  telegramInfo.value = {
    configured: Boolean(data.telegram?.configured),
    listening: Boolean(data.telegram?.listening),
  };
};

const fetchRecords = async () => {
  try {
    const res: any = await automationsApi.list();
    const raw = res?.data ?? res ?? {};
    const list = Array.isArray(raw) ? raw : raw.automations || [];
    dbRecordsByKey = new Map(list.map((a: any) => [a.key, a]));
  } catch (err: any) {
    console.error('Failed to fetch automations:', err);
  }
};

const fetchLogs = async () => {
  try {
    const res: any = await automationsApi.getLogs();
    const raw = res?.data ?? res ?? {};
    logsList.value = Array.isArray(raw) ? raw : raw.logs || [];
  } catch (err: any) {
    console.error('Failed to fetch logs:', err);
  }
};

const refreshAll = async () => {
  isLoading.value = true;
  try {
    await Promise.all([fetchGraph(), fetchRecords(), fetchLogs()]);
  } catch (err: any) {
    setFeedback('فشل تحميل شبكة الأتمتة: ' + err.message, 'error');
  } finally {
    isLoading.value = false;
  }
};

/* ─── تفاعل اللوحة ثلاثية الأبعاد ─── */
const onNodeSelect = (node: Graph3DNode | null) => {
  selectedNodeId.value = node ? node.id : null;
};
const clearSelection = () => {
  selectedNodeId.value = null;
};
const resetCanvasView = () => {
  graph3dRef.value?.resetView();
};
const pulseNetwork = () => {
  graph3dRef.value?.pulseAll();
};

/* ─── إجراءات الوكيل ─── */
const triggerAgent = async (node: Graph3DNode) => {
  const dbId = node.live?.dbId;
  if (!dbId) return;
  triggeringDbId.value = dbId;
  try {
    const res: any = await automationsApi.trigger(dbId, { isManualRun: true });
    setFeedback(`✨ ${res?.message || res?.data?.message || 'تم تشغيل المسار بنجاح وإرسال الإشعارات'}`);
    await fetchLogs();
  } catch (err: any) {
    setFeedback('فشل التشغيل: ' + (err.message || 'خطأ غير معروف'), 'error');
  } finally {
    triggeringDbId.value = null;
  }
};

const toggleAgent = async (node: Graph3DNode) => {
  const dbId = node.live?.dbId;
  if (!dbId || !node.live) return;
  const newStatus = !node.live.is_enabled;
  // تحديث فوري متفائل ثم إعادة جلب الشبكة
  node.live.is_enabled = newStatus;
  try {
    await automationsApi.update(dbId, { is_enabled: newStatus });
    setFeedback(`تم ${newStatus ? 'تفعيل 🟢' : 'تعطيل ⚪'} مسار (${node.label_ar}) بنجاح`);
    await fetchGraph();
  } catch (err: any) {
    node.live.is_enabled = !newStatus;
    setFeedback('فشل تعديل حالة المسار: ' + err.message, 'error');
  }
};

const openConfigModalById = (dbId: number) => {
  const record = Array.from(dbRecordsByKey.values()).find((r) => r.id === dbId);
  if (!record) {
    setFeedback('لم يتم العثور على سجل المسار', 'error');
    return;
  }
  editingAutomation.value = JSON.parse(JSON.stringify(record));
  if (!editingAutomation.value.channels) {
    editingAutomation.value.channels = { telegram: true, in_app: true, whatsapp: false };
  }
};

const saveAutomationConfig = async () => {
  if (!editingAutomation.value) return;
  isSavingConfig.value = true;
  try {
    const payload = {
      is_enabled: editingAutomation.value.is_enabled,
      cron_expression: editingAutomation.value.cron_expression,
      channels: editingAutomation.value.channels,
      config: editingAutomation.value.config,
    };
    await automationsApi.update(editingAutomation.value.id, payload);
    setFeedback(`تم حفظ إعدادات مسار (${editingAutomation.value.name_ar}) بنجاح ✨`);
    editingAutomation.value = null;
    await Promise.all([fetchGraph(), fetchRecords()]);
  } catch (err: any) {
    setFeedback('فشل حفظ الإعدادات: ' + err.message, 'error');
  } finally {
    isSavingConfig.value = false;
  }
};

/* ─── الفحص الشامل ─── */
const triggerAllAutomations = async () => {
  isFiringAll.value = true;
  setFeedback('جاري فحص وضخ كافة مسارات الأتمتة المجدولة...');
  pulseNetwork();
  try {
    for (const [, record] of dbRecordsByKey) {
      if (record.is_enabled) {
        await automationsApi.trigger(record.id, { isManualRun: true });
      }
    }
    setFeedback('✨ تم اكتمال فحص وتشغيل شبكة الأتمتة بالكامل بنجاح!');
    await fetchLogs();
  } catch (err: any) {
    setFeedback('حدث خطأ أثناء الفحص: ' + err.message, 'error');
  } finally {
    isFiringAll.value = false;
  }
};

/* ─── تليجرام ─── */
const handleTestTelegram = async () => {
  isTestingTelegram.value = true;
  try {
    const res: any = await automationsApi.testTelegram({
      botToken: telegramForm.value.botToken || undefined,
      chatId: telegramForm.value.chatId || undefined,
    });
    if (res?.success !== false) {
      setFeedback('تم إرسال الرسالة التجريبية إلى تليجرام بنجاح! تفقد هاتفك 📲');
      await fetchGraph();
    } else {
      setFeedback(`فشل إرسال تليجرام: ${res?.message || 'تحقق من صحة التوكن والشات'}`, 'error');
    }
  } catch (err: any) {
    setFeedback('فشل الاتصال بتليجرام: ' + (err.message || 'خطأ غير معروف'), 'error');
  } finally {
    isTestingTelegram.value = false;
  }
};

onMounted(refreshAll);
</script>

<style scoped lang="scss">
/* ═══════════════════════════════════════════════════════════════════
   الفضاء ثلاثي الأبعاد للأتمتة (3D Automation Studio)
   ═══════════════════════════════════════════════════════════════════ */

.automations-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 40px;
}

/* ── الهيدر ── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 18px 24px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 18px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 14px;

  .header-icon-wrap {
    position: relative;
    width: 46px;
    height: 46px;
    background: rgba(212, 163, 115, 0.12);
    border: 1.5px solid rgba(212, 163, 115, 0.35);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;

    .pulse-ring {
      position: absolute;
      inset: -4px;
      border-radius: 18px;
      border: 1.5px solid rgba(212, 163, 115, 0.4);
      animation: pulseGlow 2.5s infinite;
    }
  }

  h2 {
    margin: 0 0 4px;
    font-size: 1.35rem;
    font-weight: 900;
    color: #faedcd;
  }

  p {
    margin: 0;
    font-size: 0.84rem;
    color: var(--text-muted, #a89f91);
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.2;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-warning-soft {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #f59e0b;
  font-weight: 800;
  padding: 8px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: #f59e0b;
    color: #140d08;
  }
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ── التنبيهات ── */
.feedback-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 12px;
  font-weight: 750;
  font-size: 0.88rem;

  &.success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.4);
    color: #86efac;
  }

  &.error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }
}

/* ── الإحصائيات ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 16px;

  .stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;

    &.bg-primary-soft {
      background: rgba(212, 163, 115, 0.15);
    }
    &.bg-success-soft {
      background: rgba(34, 197, 94, 0.15);
    }
    &.bg-accent-soft {
      background: rgba(56, 189, 248, 0.15);
    }
    &.bg-warning-soft {
      background: rgba(245, 158, 11, 0.15);
    }
  }

  .stat-info {
    display: flex;
    flex-direction: column;

    .stat-label {
      font-size: 0.76rem;
      color: var(--text-muted, #a89f91);
    }

    .stat-value {
      margin: 4px 0 0;
      font-size: 1.15rem;
      font-weight: 900;
      color: #faedcd;

      small {
        font-size: 0.72rem;
        color: var(--text-muted, #a89f91);
        font-weight: 600;
      }
    }
  }
}

.text-success {
  color: #86efac !important;
}
.status-pulse-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6b7280;
  margin-inline-end: 6px;

  &.active {
    background: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
    animation: dotPulse 1.8s infinite;
  }
  &.big {
    width: 14px;
    height: 14px;
  }
}
@keyframes dotPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.35);
  }
}

/* ── بطاقة اللوحة ثلاثية الأبعاد ── */
.canvas-section-card {
  padding: 18px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 18px;
}

.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 14px;
}

.canvas-title-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.canvas-badge-live {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border-radius: 999px;
  background: rgba(212, 163, 115, 0.1);
  border: 1px solid rgba(212, 163, 115, 0.3);
  color: #faedcd;
  font-weight: 800;
  font-size: 0.82rem;
  align-self: flex-start;

  .live-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #22c55e;
    animation: dotPulse 1.6s infinite;
  }
}

.canvas-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted, #a89f91);
}

.canvas-controls-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.layout-toggle-pill,
.zoom-controls-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(12, 8, 5, 0.5);
  border: 1px solid rgba(212, 163, 115, 0.25);
}

.layout-btn {
  border: none;
  background: transparent;
  color: #cdbfa8;
  font-weight: 700;
  font-size: 0.76rem;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.18s ease;

  &.active {
    background: rgba(212, 163, 115, 0.85);
    color: #17100a;
  }
}

.zoom-btn {
  border: none;
  background: transparent;
  color: #cdbfa8;
  font-size: 1rem;
  font-weight: 900;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(212, 163, 115, 0.2);
    color: #fff;
  }

  &.reset-btn {
    width: auto;
    border-radius: 999px;
    padding: 0 12px;
    font-size: 0.74rem;
    font-weight: 700;
  }
}

.pulse-btn {
  color: #38bdf8 !important;
  border-color: rgba(56, 189, 248, 0.4) !important;
}

.btn.btn-xs.btn-outline {
  font-size: 0.74rem;
}

/* ── فلاتر الفئات ── */
.canvas-categories-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.canvas-cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(12, 8, 5, 0.5);
  border: 1px solid rgba(212, 163, 115, 0.25);
  color: #cdbfa8;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    border-color: rgba(212, 163, 115, 0.55);
  }

  &.active {
    background: rgba(212, 163, 115, 0.18);
    border-color: rgba(212, 163, 115, 0.65);
    color: #faedcd;
  }

  .cat-pill-count {
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(212, 163, 115, 0.2);
    font-size: 0.68rem;
  }
}

/* ── بطاقة العقدة داخل اللوحة (slot) ── */
.selected-actions {
  margin-top: 10px;

  .live-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }

  .meta-chip {
    font-size: 0.68rem;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(212, 163, 115, 0.12);
    border: 1px solid rgba(212, 163, 115, 0.28);

    &.status-success {
      color: #86efac;
    }
    &.status-failed {
      color: #fca5a5;
    }
    &.muted {
      color: #a89f91;
    }
  }

  .actions-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
}

.btn-action {
  border: none;
  padding: 7px 13px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;

  &.primary {
    background: rgba(245, 158, 11, 0.9);
    color: #17100a;

    &:hover:not(:disabled) {
      background: #f59e0b;
    }
  }

  &.ghost {
    background: rgba(212, 163, 115, 0.12);
    border: 1px solid rgba(212, 163, 115, 0.35);
    color: #faedcd;

    &:hover:not(:disabled) {
      background: rgba(212, 163, 115, 0.25);
    }
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.telegram-node-hint {
  margin: 10px 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: #9fd8ff;
}

/* ── الدليل ── */
.canvas-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(212, 163, 115, 0.18);

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    color: var(--text-muted, #a89f91);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
}

/* ── السجلات ── */
.logs-card {
  padding: 18px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 18px;
}

.logs-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 1rem;
    color: #faedcd;
  }
}

.logs-empty {
  padding: 26px;
  text-align: center;
  color: var(--text-muted, #a89f91);
  font-size: 0.84rem;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;

  th {
    text-align: right;
    padding: 8px 10px;
    color: var(--text-muted, #a89f91);
    font-size: 0.72rem;
    border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  }

  td {
    padding: 9px 10px;
    color: #e7dcc8;
    border-bottom: 1px solid rgba(212, 163, 115, 0.08);
  }

  .log-title-cell {
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-time {
    white-space: nowrap;
    color: var(--text-muted, #a89f91);
  }
}

.log-status-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;

  &.success {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }
  &.failed {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }
  &.warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }
}

/* ── النوافذ المنبثقة ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(8, 5, 3, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-box {
  width: min(520px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  background: #1e140d;
  border: 1px solid rgba(212, 163, 115, 0.35);
  border-radius: 18px;
  padding: 20px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;

  h4 {
    margin: 0;
    color: #faedcd;
    font-size: 1rem;
  }

  .modal-close {
    background: none;
    border: none;
    color: #a89f91;
    font-size: 1.05rem;
    cursor: pointer;

    &:hover {
      color: #fff;
    }
  }
}

.modal-log-body {
  margin: 0 0 14px;
  padding: 14px;
  background: rgba(12, 8, 5, 0.6);
  border-radius: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 0.8rem;
  line-height: 1.9;
  color: #e7dcc8;
  direction: rtl;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ── نافذة تليجرام ── */
.telegram-status-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 15px;
  border-radius: 13px;
  margin-bottom: 14px;

  strong {
    display: block;
    font-size: 0.88rem;
  }
  small {
    font-size: 0.72rem;
    opacity: 0.8;
  }

  &.ok {
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.35);
    color: #bbf7d0;
  }

  &.warn {
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: #fde68a;
  }
}

.field-hint-main {
  font-size: 0.75rem;
  color: var(--text-muted, #a89f91);
  margin: 0 0 12px;
  line-height: 1.7;
}

.field {
  display: block;
  margin-bottom: 13px;

  span {
    display: block;
    font-size: 0.76rem;
    color: #cdbfa8;
    margin-bottom: 6px;
    font-weight: 700;
  }

  input {
    width: 100%;
    padding: 10px 13px;
    border-radius: 11px;
    border: 1px solid rgba(212, 163, 115, 0.3);
    background: rgba(12, 8, 5, 0.55);
    color: #f7ecd9;
    font-size: 0.84rem;
    outline: none;
    transition: border-color 0.18s ease;

    &:focus {
      border-color: rgba(212, 163, 115, 0.7);
    }
  }
}

/* ── نافذة الإعدادات ── */
.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  cursor: pointer;

  span {
    font-size: 0.82rem;
    font-weight: 700;
    color: #e7dcc8;
  }

  input {
    display: none;
  }

  .switch-ui {
    width: 42px;
    height: 23px;
    border-radius: 999px;
    background: rgba(107, 98, 90, 0.5);
    position: relative;
    transition: background 0.2s ease;

    &::after {
      content: '';
      position: absolute;
      top: 3px;
      right: 3px;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      background: #f7ecd9;
      transition: transform 0.2s ease;
    }
  }

  input:checked + .switch-ui {
    background: #22c55e;

    &::after {
      transform: translateX(-19px);
    }
  }
}

.channels-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.channel-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border-radius: 11px;
  background: rgba(212, 163, 115, 0.09);
  border: 1px solid rgba(212, 163, 115, 0.25);
  font-size: 0.78rem;
  color: #e7dcc8;
  cursor: pointer;

  input {
    accent-color: #d4a373;
  }
}
</style>
