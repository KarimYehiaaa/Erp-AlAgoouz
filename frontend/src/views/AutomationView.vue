<template>
  <div class="automations-page">
    <!-- ═══════════════════ Header الرئيسي ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <div class="header-icon-wrap">
          <span class="header-icon">🪐</span>
          <span class="radar-ping"></span>
        </div>
        <div>
          <h2>مركز الأتمتة والمخطط العصبي</h2>
          <p>مراقبة شبكة الأتمتة الحية، تقارير الإغلاق، والإنذارات اللحظية عبر بوت تليجرام</p>
        </div>
      </div>

      <div class="header-actions">
        <!-- أزرار التبديل بين وضع المخطط الدائري Obsidian والوضع الكلاسيكي -->
        <div class="view-mode-toggle">
          <button
            type="button"
            class="mode-btn"
            :class="{ active: viewMode === 'graph' }"
            @click="viewMode = 'graph'"
          >
            <span>🪐 مخطط أوبسيديان العصبي (Obsidian Graph)</span>
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

    <!-- ═══════════════════ شريط الإحصائيات (Modern Glass Bento) ═══════════════════ -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-primary-soft">
          <span>⚡</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">المسارات والعقد الفعالة</span>
          <h3 class="stat-value">
            {{ activeCount }} <small>/ {{ automationsList.length }}</small>
          </h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-success-soft">
          <span>🤖</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">حالة بوت تليجرام</span>
          <h3 class="stat-value text-success">
            <span class="status-pulse-dot" :class="{ active: isTelegramConfigured }"></span>
            <span>{{ isTelegramConfigured ? 'متصل ومستمع 24/7' : 'بحاجة للضبط' }}</span>
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

    <!-- ═══════════════════ العرض الأول: مخطط أوبسيديان الفضائي الدوار (True Obsidian Force Graph) ═══════════════════ -->
    <div v-if="viewMode === 'graph'" class="obsidian-graph-wrapper card">
      <!-- شريط أدوات الكانفاس الزجاجي العائم -->
      <div class="graph-top-bar">
        <div class="graph-title-group">
          <div class="live-status-pill">
            <span class="beacon-circle"></span>
            <span class="live-text">ORBITAL PHYSICS</span>
          </div>
          <div>
            <h3 class="graph-heading">المنظومة الكونية الدوارة (Obsidian Orb Constellation)</h3>
            <span class="graph-sub"
              >✨ العقد تدور بفيزياء جاذبية حية. اسحب أي كوكب بالماوس، أو انقر عليه لمعاينته
              وتشغيله</span
            >
          </div>
        </div>

        <div class="graph-controls">
          <button
            type="button"
            class="graph-btn-secondary"
            :class="{ 'is-active': isRotating }"
            @click="toggleRotation"
          >
            <span>{{ isRotating ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران' }}</span>
          </button>

          <div class="zoom-pill">
            <button type="button" class="ctrl-btn-icon" title="تكبير" @click="zoomIn">➕</button>
            <span class="zoom-value">{{ Math.round(zoomLevel * 100) }}%</span>
            <button type="button" class="ctrl-btn-icon" title="تصغير" @click="zoomOut">➖</button>
          </div>

          <button
            type="button"
            class="graph-btn-secondary"
            title="إعادة ضبط وتمركز المنظومة"
            @click="resetPhysicsAndCenter"
          >
            <span>🎯 إعادة التمركز</span>
          </button>

          <button
            type="button"
            class="graph-btn-laser"
            :disabled="isFiringAll"
            @click="simulateFullNetworkPulse"
          >
            <span>{{ isFiringAll ? '⚡ سريان الطاقة...' : '🚀 ضخ نبضة طاقة كونية' }}</span>
          </button>
        </div>
      </div>

      <!-- مساحة الكانفاس التفاعلية الفضائية -->
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
        <!-- سديم الإضاءة الكونية العميقة -->
        <div class="nebula-glow glow-amber"></div>
        <div class="nebula-glow glow-cyan"></div>
        <div class="nebula-glow glow-purple"></div>

        <!-- شبكة الفضاء النقطية -->
        <div
          class="obsidian-grid-pattern"
          :style="{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }"
        ></div>

        <!-- مساحة التحويل الرئيسية (Transform Layer) -->
        <div
          class="canvas-transform-layer"
          :style="{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }"
        >
          <!-- طبقة الخيوط العصبية الشبكية SVG (Thin Neural Web Filaments) -->
          <svg class="wires-svg-layer" width="3000" height="2000">
            <defs>
              <linearGradient id="orb-wire-amber" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8" />
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.4" />
              </linearGradient>

              <filter id="orb-wire-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- رسم الخيوط العصبية المستقيمة/المرنة بين الكواكب -->
            <g v-for="link in graphLinks" :key="link.id" class="filament-group">
              <!-- الخط العصبي الأساسي -->
              <line
                :x1="getNodePos(link.from).x"
                :y1="getNodePos(link.from).y"
                :x2="getNodePos(link.to).x"
                :y2="getNodePos(link.to).y"
                class="neural-filament-base"
                :class="{
                  highlighted:
                    hoveredNodeId === link.from ||
                    hoveredNodeId === link.to ||
                    selectedNode?.id === link.from ||
                    selectedNode?.id === link.to,
                }"
              />

              <!-- نبضات الفوتون الضوئي المضيء المتحرك على الخيط -->
              <line
                :x1="getNodePos(link.from).x"
                :y1="getNodePos(link.from).y"
                :x2="getNodePos(link.to).x"
                :y2="getNodePos(link.to).y"
                class="neural-filament-laser"
                :class="{
                  active: isFiringAll || triggeringId === link.automationId,
                }"
                filter="url(#orb-wire-glow)"
              />
            </g>

            <!-- مدارات الجاذبية الدائرية الخافتة في الخلفية -->
            <circle :cx="centerCoord.x" :cy="centerCoord.y" r="140" class="orbit-ring ring-inner" />
            <circle :cx="centerCoord.x" :cy="centerCoord.y" r="240" class="orbit-ring ring-outer" />
          </svg>

          <!-- طبقة الكواكب والعقد الدائرية المضيئة (Obsidian Glowing Orbs) -->
          <div
            v-for="node in graphNodes"
            :key="node.id"
            class="obsidian-orb-node"
            :class="[
              node.category,
              {
                'is-center': node.isCenter,
                'is-active': selectedNode?.id === node.id,
                'is-hovered': hoveredNodeId === node.id,
                'is-dimmed':
                  hoveredNodeId && hoveredNodeId !== node.id && !isNeighbor(hoveredNodeId, node.id),
                'is-executing': isFiringAll || triggeringId === node.automationId,
                'is-dragging': draggedNodeId === node.id,
              },
            ]"
            :style="{
              transform: `translate3d(${node.x - node.radius}px, ${node.y - node.radius}px, 0)`,
              width: `${node.radius * 2}px`,
              height: `${node.radius * 2}px`,
            }"
            @mousedown.stop="handleNodeMouseDown(node, $event)"
            @mouseenter="hoveredNodeId = node.id"
            @mouseleave="hoveredNodeId = null"
            @click.stop="selectNode(node)"
          >
            <!-- الهالة الضوئية الخارجية المتوهجة (Atmosphere Halo) -->
            <div class="orb-halo"></div>

            <!-- الكوكب الزجاجي الداخلي والمحتوى -->
            <div class="orb-core">
              <span class="orb-icon">{{ node.icon }}</span>
              <span v-if="node.hasLed" class="orb-led"></span>
            </div>

            <!-- التسمية النصية العائمة تحت الكوكب (Obsidian Label) -->
            <div class="orb-floating-label">
              <span class="label-title">{{ node.title }}</span>
              <span v-if="node.subLabel" class="label-sub">{{ node.subLabel }}</span>
            </div>
          </div>
        </div>

        <!-- اللوحة الجانبية لمستكشف الكوكب المحدد (Glass Node Inspector) -->
        <transition name="slide-left">
          <div v-if="selectedNode" class="node-inspector-drawer">
            <div class="inspector-header">
              <div class="flex items-center gap-2">
                <span class="text-2xl">{{ selectedNode.icon }}</span>
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
                <span class="text-xs font-bold text-muted">الحالة في المنظومة:</span>
                <span class="badge-mini on">🟢 مدار متصل ومستقر</span>
              </div>

              <div class="inspector-stat-row">
                <span class="text-xs font-bold text-muted">طبيعة العقدة:</span>
                <span class="font-mono text-xs text-strong">{{ selectedNode.typeLabel }}</span>
              </div>

              <div v-if="selectedNode.cron" class="inspector-stat-row">
                <span class="text-xs font-bold text-muted">الجدولة:</span>
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
                      ? '⚡ جاري إطلاق الطاقة...'
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
          <span v-if="logsList.length" class="logs-count-badge">{{ logsList.length }} سجل</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-xs btn-outline" @click="fetchLogs">
            <AppIcon name="refresh" :size="12" /> تحديث السجل
          </button>
        </div>
      </div>

      <div class="logs-table-wrapper">
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
            <tr v-for="log in visibleLogs" :key="log.id" class="log-row">
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

      <!-- أزرار التحكم في عرض المزيد -->
      <div v-if="logsList.length > logsPageSize" class="logs-pagination-bar">
        <button
          v-if="!showAllLogs"
          type="button"
          class="btn btn-sm btn-outline logs-expand-btn"
          @click="showAllLogs = true"
        >
          📋 عرض كل السجلات ({{ logsList.length }}) ↓
        </button>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-outline logs-expand-btn"
          @click="showAllLogs = false"
        >
          🔼 تقليص العرض إلى آخر {{ logsPageSize }} سجلات
        </button>
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
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue';
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

const showAllLogs = ref(false);
const logsPageSize = 15;
const visibleLogs = computed(() =>
  showAllLogs.value ? logsList.value : logsList.value.slice(0, logsPageSize),
);

const telegramForm = ref({
  botToken: '',
  chatId: '',
});

/* ═══════════════════ محرك فيزياء أوبسيديان الكوني الدوار (True Obsidian Orbit Engine) ═══════════════════ */
const canvasContainerRef = ref<HTMLElement | null>(null);
const zoomLevel = ref(1.0);
const panOffset = reactive({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0 });

const isRotating = ref(true);
let animationFrameId: number | null = null;
const hoveredNodeId = ref<string | null>(null);
const selectedNode = ref<any | null>(null);

const draggedNodeId = ref<string | null>(null);
const dragNodeStart = reactive({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

// إحداثيات مركز الجاذبية الكونية
const centerCoord = reactive({ x: 500, y: 320 });

// تعريف كواكب وعقد المنظومة العصبية (Obsidian Celestial Orbs)
const graphNodes = ref<any[]>([
  {
    id: 'node-brain',
    typeLabel: 'Core Nucleus • العقل المركزي',
    category: 'core-cat',
    icon: '🧠',
    title: 'عقل الأتمتة المركزي',
    subLabel: 'محرك التقارير والقرارات',
    desc: 'تجميع إيرادات اليوم، صافي الأرباح، وأعلى الأصناف طلباً',
    radius: 34,
    x: 500,
    y: 320,
    vx: 0,
    vy: 0,
    orbitRadius: 0,
    orbitSpeed: 0,
    orbitAngle: 0,
    isCenter: true,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-pos',
    typeLabel: 'Trigger • نقطة بيع',
    category: 'trigger-cat',
    icon: '☕',
    title: 'كاشير الفروع (POS)',
    subLabel: 'مبيعات حية',
    desc: 'إصدار الفواتير، التحصيل، ومتابعة الورديات الحية',
    radius: 24,
    x: 340,
    y: 200,
    vx: 0,
    vy: 0,
    orbitRadius: 170,
    orbitSpeed: 0.0035,
    orbitAngle: 0,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-inv',
    typeLabel: 'Trigger • مخازن البن',
    category: 'trigger-cat',
    icon: '🫘',
    title: 'مخازن البن والتحميص',
    subLabel: 'رصد الخامات',
    desc: 'رصد كميات البن الأخضر والمحمص وحركات الصرف',
    radius: 24,
    x: 660,
    y: 200,
    vx: 0,
    vy: 0,
    orbitRadius: 190,
    orbitSpeed: 0.0028,
    orbitAngle: 1.2,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-cron',
    typeLabel: 'Trigger • جدولة زمنية',
    category: 'trigger-cat',
    icon: '⏰',
    title: 'محرك الجدولة (Cron)',
    subLabel: '11:30 م يومياً',
    desc: 'جدولة تقرير الإغلاق وفحص النواقص الدوري',
    cron: 'يومياً 11:30 م',
    radius: 22,
    x: 360,
    y: 440,
    vx: 0,
    vy: 0,
    orbitRadius: 180,
    orbitSpeed: 0.003,
    orbitAngle: 2.4,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-fraud',
    typeLabel: 'Security • كشف التلاعب',
    category: 'security-cat',
    icon: '🛡️',
    title: 'منظومة الرقابة والأمان',
    subLabel: 'حماية 24/7',
    desc: 'كشف فوري لإلغاء الفواتير والخصومات المشبوهة',
    radius: 25,
    x: 640,
    y: 440,
    vx: 0,
    vy: 0,
    orbitRadius: 185,
    orbitSpeed: 0.0032,
    orbitAngle: 3.6,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-balancing',
    typeLabel: 'Balancing • مناقلات الفروع',
    category: 'logic-cat',
    icon: '🔄',
    title: 'توازن مخزون الفروع',
    subLabel: 'مناقلات ذكية',
    desc: 'تحليل سرعة السحب واقتراح مناقلات لتفادي الشراء الجديد',
    radius: 24,
    x: 230,
    y: 320,
    vx: 0,
    vy: 0,
    orbitRadius: 270,
    orbitSpeed: -0.002,
    orbitAngle: 4.8,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-cashflow',
    typeLabel: 'Shield • درع السيولة',
    category: 'security-cat',
    icon: '💰',
    title: 'درع حماية السيولة',
    subLabel: 'توقعات 14 يوم',
    desc: 'تنبؤ استباقي بالعجز المالي ومقارنة الالتزامات بالإيرادات',
    radius: 25,
    x: 770,
    y: 320,
    vx: 0,
    vy: 0,
    orbitRadius: 275,
    orbitSpeed: -0.0022,
    orbitAngle: 0.6,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-db',
    typeLabel: 'Storage • قاعدة البيانات',
    category: 'storage-cat',
    icon: '🗄️',
    title: 'سحابة PostgreSQL',
    subLabel: 'أرشفة دائمة',
    desc: 'حفظ الحركات المحاسبية والسجلات وسلسلة الجرد',
    radius: 22,
    x: 500,
    y: 110,
    vx: 0,
    vy: 0,
    orbitRadius: 220,
    orbitSpeed: 0.0024,
    orbitAngle: 5.4,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-tg',
    typeLabel: 'Action • بوت تليجرام التفاعلي',
    category: 'action-cat',
    icon: '🤖',
    title: 'بوت تليجرام 2-Way',
    subLabel: 'استماع لحظي',
    desc: 'توصيل التقارير والرد الفوري على أوامر المالك على تليجرام',
    radius: 28,
    x: 500,
    y: 530,
    vx: 0,
    vy: 0,
    orbitRadius: 230,
    orbitSpeed: 0.0025,
    orbitAngle: 1.8,
    hasLed: true,
    automationId: null,
  },
  {
    id: 'node-logs',
    typeLabel: 'Audit • سجل المراقبة',
    category: 'action-cat',
    icon: '📜',
    title: 'سجل العمليات الحي',
    subLabel: 'Audit Stream',
    desc: 'أرشفة كافة المهام المنفذة مع التوقيت والنتيجة',
    radius: 22,
    x: 280,
    y: 170,
    vx: 0,
    vy: 0,
    orbitRadius: 260,
    orbitSpeed: -0.0018,
    orbitAngle: 3.0,
    hasLed: true,
    automationId: null,
  },
]);

// خيوط الشبكة العصبية (Neural Links)
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

const getNodePos = (nodeId: string) => {
  const node = graphNodes.value.find((n) => n.id === nodeId);
  return node ? { x: node.x, y: node.y } : { x: centerCoord.x, y: centerCoord.y };
};

const isNeighbor = (nodeAId: string, nodeBId: string) => {
  return graphLinks.value.some(
    (l) => (l.from === nodeAId && l.to === nodeBId) || (l.from === nodeBId && l.to === nodeAId),
  );
};

/* ═══════════════════ محرك الدوران والفيزياء المستمرة ═══════════════════ */
const startPhysicsLoop = () => {
  const step = () => {
    if (isRotating.value) {
      for (const node of graphNodes.value) {
        if (node.isCenter || draggedNodeId.value === node.id) continue;

        // تقدم الزاوية المدارية للكوكب
        node.orbitAngle += node.orbitSpeed;

        // حساب الإحداثيات المستهدفة بناء على المسار المداري
        const targetX = centerCoord.x + Math.cos(node.orbitAngle) * node.orbitRadius;
        const targetY = centerCoord.y + Math.sin(node.orbitAngle) * node.orbitRadius * 0.78; // إهليلجي ثلاثي الأبعاد

        // اقتراب ناعم وفيزيائي (Smooth Spring Easing)
        node.x += (targetX - node.x) * 0.04;
        node.y += (targetY - node.y) * 0.04;
      }
    }
    animationFrameId = requestAnimationFrame(step);
  };
  animationFrameId = requestAnimationFrame(step);
};

const toggleRotation = () => {
  isRotating.value = !isRotating.value;
  showFeedback(
    isRotating.value ? 'تم تفعيل الدوران الكوني للمنظومة 🪐' : 'تم إيقاف الدوران مؤقتاً ⏸️',
  );
};

const resetPhysicsAndCenter = () => {
  for (const node of graphNodes.value) {
    if (node.isCenter) {
      node.x = centerCoord.x;
      node.y = centerCoord.y;
    } else {
      node.x = centerCoord.x + Math.cos(node.orbitAngle) * node.orbitRadius;
      node.y = centerCoord.y + Math.sin(node.orbitAngle) * node.orbitRadius * 0.78;
    }
  }
  panOffset.x = 0;
  panOffset.y = 0;
  zoomLevel.value = 1.0;
  showFeedback('تمت إعادة تمركز المنظومة بالكامل! 🎯');
};

/* تفاعلات الكانفاس والتحريك (Pan & Zoom) */
const handleCanvasMouseDown = (e: MouseEvent) => {
  if (
    e.target !== canvasContainerRef.value &&
    !(e.target as HTMLElement).classList.contains('obsidian-grid-pattern') &&
    !(e.target as HTMLElement).classList.contains('wires-svg-layer')
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
      node.x = Math.round(dragNodeStart.nodeX + deltaX);
      node.y = Math.round(dragNodeStart.nodeY + deltaY);

      // تحديث نصف القطر المداري وزاوية الكوكب بناء على الموقع الجديد الذي سحبه المستخدم
      if (!node.isCenter) {
        const dx = node.x - centerCoord.x;
        const dy = (node.y - centerCoord.y) / 0.78;
        node.orbitRadius = Math.max(80, Math.sqrt(dx * dx + dy * dy));
        node.orbitAngle = Math.atan2(dy, dx);
      }
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
  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
  const newZoom = Math.min(1.6, Math.max(0.6, zoomLevel.value * zoomFactor));
  zoomLevel.value = parseFloat(newZoom.toFixed(2));
};

const zoomIn = () => {
  zoomLevel.value = Math.min(1.6, parseFloat((zoomLevel.value + 0.12).toFixed(2)));
};

const zoomOut = () => {
  zoomLevel.value = Math.max(0.6, parseFloat((zoomLevel.value - 0.12).toFixed(2)));
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
  showFeedback('⚡ ضخ نبضات الليزر الكونية في جميع الخيوط العصبية...');
  setTimeout(() => {
    isFiringAll.value = false;
    showFeedback('اكتمل سريان نبضات الطاقة في كامل المنظومة! ✨');
  }, 2200);
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
  startPhysicsLoop();
});

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
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
    showFeedback(`⚡ جاري إطلاق مسار "${item.name_ar}"...`);
    const res: any = await automationsApi.trigger(item.id);
    if (res?.success || res?.data?.success) {
      showFeedback(`تم تشغيل مسار "${item.name_ar}" بنجاح! 🎉`, 'success');
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
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(217, 119, 6, 0.3);
}

.header-icon {
  font-size: 1.5rem;
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
  font-size: 1.3rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.header-title p {
  font-size: 0.82rem;
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
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
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
  font-size: 1.2rem;
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

/* ═══════════════════ True Obsidian Force Orbital Graph ═══════════════════ */
.obsidian-graph-wrapper {
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #201c18;
  overflow: hidden;
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  background: #080706;
}

.graph-top-bar {
  background: rgba(14, 12, 10, 0.88);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 18px;
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
  gap: 12px;
}

.live-status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  padding: 3px 10px;
  border-radius: 20px;
}

.beacon-circle {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
  animation: beacon-pulse 1.8s infinite;
}

@keyframes beacon-pulse {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 12px #f59e0b;
  }
  100% {
    opacity: 0.4;
  }
}

.live-text {
  font-size: 0.65rem;
  font-weight: 900;
  letter-spacing: 0.6px;
  color: #fbbf24;
}

.graph-heading {
  font-size: 0.92rem;
  font-weight: 900;
  color: #f5f5f4;
  margin: 0;
}

.graph-sub {
  font-size: 0.7rem;
  color: #78716c;
}

.graph-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-pill {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  gap: 4px;
}

.ctrl-btn-icon {
  background: transparent;
  border: none;
  color: #a8a29e;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.75rem;
  transition: color 0.15s;
}

.ctrl-btn-icon:hover {
  color: #fbbf24;
}

.zoom-value {
  font-size: 0.72rem;
  font-weight: 800;
  color: #fbbf24;
  min-width: 34px;
  text-align: center;
  font-family: monospace;
}

.graph-btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #d6d3d1;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}

.graph-btn-secondary:hover,
.graph-btn-secondary.is-active {
  background: rgba(255, 255, 255, 0.12);
  border-color: #fbbf24;
  color: #fbbf24;
}

.graph-btn-laser {
  background: linear-gradient(135deg, #d97706, #b45309);
  border: 1px solid rgba(251, 191, 36, 0.4);
  color: #fff;
  padding: 5px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(217, 119, 6, 0.35);
  transition: all 0.2s;
}

.graph-btn-laser:hover {
  box-shadow: 0 4px 20px rgba(217, 119, 6, 0.6);
  transform: translateY(-1px);
}

/* Canvas Viewport */
.obsidian-canvas-viewport {
  width: 100%;
  height: 640px;
  background: #080706;
  position: relative;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.obsidian-canvas-viewport.dragging {
  cursor: grabbing;
}

/* Ambient Cosmic Nebulae */
.nebula-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(110px);
  pointer-events: none;
  opacity: 0.18;
}

.glow-amber {
  width: 450px;
  height: 450px;
  background: #f59e0b;
  left: 20%;
  top: 15%;
}

.glow-cyan {
  width: 500px;
  height: 500px;
  background: #38bdf8;
  right: 15%;
  bottom: 10%;
}

.glow-purple {
  width: 380px;
  height: 380px;
  background: #818cf8;
  left: 50%;
  top: 40%;
}

/* Dot Grid */
.obsidian-grid-pattern {
  position: absolute;
  width: 4000px;
  height: 4000px;
  left: -1000px;
  top: -1000px;
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 22px 22px;
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

/* Wires Layer (Obsidian Neural Filaments) */
.wires-svg-layer {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 1;
}

.orbit-ring {
  fill: none;
  stroke: rgba(255, 255, 255, 0.03);
  stroke-width: 1;
  stroke-dasharray: 4 6;
}

.neural-filament-base {
  stroke: rgba(255, 255, 255, 0.09);
  stroke-width: 1.2;
  transition:
    stroke 0.2s,
    stroke-width 0.2s;
}

.neural-filament-base.highlighted {
  stroke: #fbbf24;
  stroke-width: 2.2;
  opacity: 0.9;
}

.neural-filament-laser {
  stroke: url(#orb-wire-amber);
  stroke-width: 1.8;
  stroke-dasharray: 4 14;
  animation: laser-spark 1.4s linear infinite;
  opacity: 0.6;
}

.neural-filament-laser.active {
  stroke: #fbbf24;
  stroke-width: 3;
  animation: laser-spark 0.35s linear infinite;
  opacity: 1;
}

@keyframes laser-spark {
  from {
    stroke-dashoffset: 36;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* ═══════════════════ Obsidian Glowing Orbs (Celestial Spheres) ═══════════════════ */
.obsidian-orb-node {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  cursor: grab;
  pointer-events: auto;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity 0.2s,
    filter 0.2s;
}

.obsidian-orb-node.is-dimmed {
  opacity: 0.25;
  filter: grayscale(0.6);
}

.obsidian-orb-node.is-dragging {
  cursor: grabbing;
  z-index: 10;
}

/* Atmosphere Halo */
.orb-halo {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, transparent 70%);
  opacity: 0.6;
  transition: all 0.25s;
  pointer-events: none;
}

.obsidian-orb-node:hover .orb-halo,
.obsidian-orb-node.is-hovered .orb-halo {
  inset: -12px;
  opacity: 1;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.45) 0%, transparent 70%);
}

.obsidian-orb-node.is-center .orb-halo {
  inset: -14px;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 75%);
  animation: core-pulsar 2.4s infinite ease-in-out;
}

@keyframes core-pulsar {
  0% {
    transform: scale(0.95);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.9;
  }
  100% {
    transform: scale(0.95);
    opacity: 0.5;
  }
}

/* The Solid Orb Core */
.orb-core {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(22, 19, 16, 0.94);
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.6),
    inset 0 1px 1px rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.obsidian-orb-node:hover .orb-core,
.obsidian-orb-node.is-active .orb-core {
  border-color: #fbbf24;
  box-shadow:
    0 0 16px rgba(251, 191, 36, 0.6),
    inset 0 1px 1px rgba(255, 255, 255, 0.4);
  transform: scale(1.15);
}

.obsidian-orb-node.is-center .orb-core {
  border: 2px solid #f59e0b;
  background: radial-gradient(circle, #3d260f 0%, #17130f 100%);
  box-shadow: 0 0 24px rgba(245, 158, 11, 0.5);
}

.obsidian-orb-node.is-executing .orb-core {
  animation: orb-laser-pulse 0.6s infinite alternate;
}

@keyframes orb-laser-pulse {
  0% {
    border-color: #f59e0b;
    box-shadow: 0 0 20px #f59e0b;
  }
  100% {
    border-color: #10b981;
    box-shadow: 0 0 30px #10b981;
  }
}

.orb-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.obsidian-orb-node.is-center .orb-icon {
  font-size: 1.45rem;
}

.orb-led {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

/* Category Colors */
.obsidian-orb-node.trigger-cat .orb-core {
  border-color: rgba(245, 158, 11, 0.5);
}

.obsidian-orb-node.logic-cat .orb-core {
  border-color: rgba(99, 102, 241, 0.6);
}

.obsidian-orb-node.security-cat .orb-core {
  border-color: rgba(239, 68, 68, 0.6);
}

.obsidian-orb-node.storage-cat .orb-core {
  border-color: rgba(56, 189, 248, 0.6);
}

.obsidian-orb-node.action-cat .orb-core {
  border-color: rgba(16, 185, 129, 0.6);
}

/* Floating Label Under Orb */
.orb-floating-label {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  white-space: nowrap;
}

.label-title {
  font-size: 0.72rem;
  font-weight: 800;
  color: #e7e5e4;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
  transition: color 0.15s;
}

.obsidian-orb-node:hover .label-title,
.obsidian-orb-node.is-hovered .label-title {
  color: #fbbf24;
}

.label-sub {
  font-size: 0.58rem;
  font-weight: 700;
  color: #a8a29e;
  opacity: 0.75;
}

/* Inspector Drawer Card */
.node-inspector-drawer {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 270px;
  background: rgba(16, 14, 12, 0.94);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  z-index: 20;
  overflow: hidden;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
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
.logs-table-wrapper {
  overflow-x: auto;
  overflow-y: auto;
  max-height: 520px;
  scrollbar-width: thin;
}

.logs-count-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--accent-10, rgba(59, 130, 246, 0.1));
  color: var(--accent, #3b82f6);
}

.logs-pagination-bar {
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.logs-expand-btn {
  font-weight: 700;
  font-size: 0.82rem;
  padding: 6px 20px;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
}

.logs-expand-btn:hover {
  background: var(--accent-10, rgba(59, 130, 246, 0.08));
  color: var(--accent, #3b82f6);
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
