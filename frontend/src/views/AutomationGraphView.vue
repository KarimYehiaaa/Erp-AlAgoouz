<template>
  <div class="automation-container">
    <!-- Header -->
    <div class="page-header card glass-header">
      <div class="header-title">
        <span class="header-icon sparkles-anim"><AppIcon name="bot" :size="24" /></span>
        <div class="title-text-wrap">
          <h2>محرك الأتمتة والوكلاء الأذكياء</h2>
          <p>لوحة التحكم التفاعلية للرسم البياني ومحاكاة سير العمليات وبوت تليجرام</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" @click="openAddNodeModal">
          <AppIcon name="add" :size="16" />
          <span class="btn-text">إضافة عقدة</span>
        </button>
        <button class="btn btn-outline btn-sm" @click="openAddEdgeModal">
          <AppIcon name="arrowRightLeft" :size="16" />
          <span class="btn-text">ربط عقدتين</span>
        </button>
        <button
          class="btn btn-sm action-simulate-btn"
          :class="isSimulating ? 'btn-danger' : 'btn-success'"
          @click="toggleSimulation"
        >
          <AppIcon :name="isSimulating ? 'close' : 'zap'" :size="16" />
          <span class="btn-text">{{ isSimulating ? 'إيقاف المحاكاة' : 'محاكاة التدفق' }}</span>
        </button>
        <button
          class="btn btn-outline btn-sm desktop-only-btn"
          @click="showSettings = !showSettings"
        >
          <AppIcon name="settings" :size="16" />
          <span>{{ showSettings ? 'إخفاء اللوحة' : 'لوحة التحكم' }}</span>
        </button>
      </div>
    </div>

    <!-- Live command dashboard: every metric maps to an actual execution signal. -->
    <section class="automation-command-dashboard" aria-label="مؤشرات تشغيل الأتمتة">
      <div class="command-status-card" :class="commandHealthTone">
        <span class="status-pulse" />
        <div>
          <small>حالة محرك الأتمتة</small>
          <strong>{{ commandHealthLabel }}</strong>
        </div>
        <span class="status-caption">{{ enabledTaskCount }} مهمة مفعلة</span>
      </div>
      <div class="command-metric-card">
        <small>نجاح آخر التشغيلات</small>
        <strong>{{ successfulExecutionCount }}</strong>
        <span>من آخر {{ executionLogs.length }} تشغيل</span>
      </div>
      <div class="command-metric-card danger">
        <small>تحتاج مراجعة</small>
        <strong>{{ failedExecutionCount }}</strong>
        <span>تشغيل فاشل أو تحذير</span>
      </div>
      <div class="command-metric-card accent">
        <small>متوسط التنفيذ</small>
        <strong>{{ averageExecutionMs }}ms</strong>
        <span>حسب السجل الحقيقي</span>
      </div>
      <div class="command-timeline-card">
        <div class="timeline-heading">
          <strong>آخر نشاط</strong>
          <span>{{ latestExecutionLabel }}</span>
        </div>
        <div class="timeline-track">
          <span
            v-for="log in recentExecutionLogs"
            :key="log.id"
            class="timeline-dot"
            :class="`status-${log.status}`"
            :title="`${log.name_ar || log.key || 'مهمة'} — ${log.message}`"
          />
          <span v-if="!recentExecutionLogs.length" class="timeline-empty"
            >لا يوجد تشغيل مسجل بعد</span
          >
        </div>
      </div>
    </section>

    <!-- Mobile Segmented View Switcher (Visible on screens < 1024px) -->
    <div class="mobile-view-switcher mobile-only-block" role="tablist">
      <button
        type="button"
        class="switcher-btn"
        :class="{ active: mobileView === 'graph' }"
        @click="mobileView = 'graph'"
        role="tab"
        :aria-selected="mobileView === 'graph'"
      >
        <span class="switcher-icon"><AppIcon name="activity" :size="16" /></span>
        <span class="switcher-label">الشبكة التفاعلية</span>
      </button>
      <button
        type="button"
        class="switcher-btn"
        :class="{ active: mobileView === 'panel' }"
        @click="mobileView = 'panel'"
        role="tab"
        :aria-selected="mobileView === 'panel'"
      >
        <span class="switcher-icon"><AppIcon name="shield" :size="16" /></span>
        <span class="switcher-label">لوحة التحكم والوكلاء ({{ tasks.length }})</span>
      </button>
    </div>

    <!-- Main Content Area -->
    <div class="graph-layout">
      <!-- Force-Graph Canvas Area -->
      <div
        class="graph-panel card"
        :class="{
          'mobile-view-active': mobileView === 'graph',
          'mobile-hidden': mobileView !== 'graph',
        }"
        ref="graphContainer"
      >
        <!-- Floating Canvas Controls -->
        <div class="canvas-controls">
          <button
            class="desktop-only-btn"
            @click="showSettings = !showSettings"
            :title="showSettings ? 'وضع ملء الشاشة (إخفاء لوحة التحكم)' : 'إظهار لوحة التحكم'"
            :class="{ active: !showSettings }"
          >
            <AppIcon name="settings" :size="14" />
          </button>
          <button @click="zoomIn" title="تكبير">+</button>
          <button @click="zoomOut" title="تصغير">−</button>
          <button @click="resetView" title="إعادة ضبط العرض">
            <AppIcon name="monitor" :size="14" />
          </button>
          <button @click="applyTreeLayout" title="تخطيط شجري منظم">
            <AppIcon name="layers" :size="14" />
          </button>
          <button @click="applyCircularLayout" title="تخطيط دائري">
            <AppIcon name="refresh" :size="14" />
          </button>
          <button @click="resetToDefaultGraph" title="استعادة الشبكة الافتراضية">
            <AppIcon name="history" :size="14" />
          </button>
          <button
            class="mobile-only-btn legend-toggle-btn"
            @click="showLegendMobile = !showLegendMobile"
            :class="{ active: showLegendMobile }"
            title="دليل ألوان العقد"
          >
            <AppIcon name="palette" :size="14" />
          </button>
        </div>

        <!-- Canvas -->
        <canvas
          ref="canvas"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
          @wheel.prevent="onWheel"
          @dblclick="onDoubleClick"
          @touchstart.passive="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
        />

        <!-- Legend -->
        <div class="graph-legend" :class="{ 'mobile-open': showLegendMobile }">
          <div class="legend-header-mobile mobile-only-flex">
            <span>دليل مجموعات الأتمتة</span>
            <button class="legend-close-btn" @click="showLegendMobile = false">
              <AppIcon name="close" :size="14" />
            </button>
          </div>
          <div class="legend-items-list">
            <div class="legend-item" v-for="g in legendGroups" :key="g.label">
              <span class="legend-dot" :style="{ background: g.color }" />
              <span>{{ g.label }}</span>
            </div>
          </div>
        </div>

        <!-- Node Quick Tooltip -->
        <div
          v-if="hoveredNode && !selectedNode"
          class="node-tooltip"
          :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
        >
          <strong>{{ hoveredNode.label_ar || hoveredNode.label }}</strong>
          <div class="tooltip-type">
            {{ typeLabels[hoveredNode.type] }} · {{ hoveredNode.group }}
          </div>
          <div v-if="hoveredNode.settings?.rule" class="tooltip-rule">
            📌 {{ ruleLabels[hoveredNode.settings.rule] || hoveredNode.settings.rule }}
          </div>
          <small class="tooltip-hint">انقر للتحديد والتعديل</small>
        </div>

        <!-- Loading Overlay -->
        <div v-if="loading" class="graph-loading">
          <div class="spinner" />
          <span>جاري تحميل بيانات الأتمتة...</span>
        </div>
      </div>

      <!-- Settings & Tools Side Panel -->
      <transition name="slide">
        <div
          v-if="showSettings || mobileView === 'panel'"
          class="settings-panel card"
          :class="{
            'mobile-view-active': mobileView === 'panel',
            'mobile-hidden': mobileView !== 'panel',
          }"
        >
          <!-- Panel Navigation Tabs -->
          <div class="panel-tabs">
            <button :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">
              <AppIcon name="shield" :size="14" /> الوكلاء ({{ tasks.length }})
            </button>
            <button :class="{ active: activeTab === 'telegram' }" @click="activeTab = 'telegram'">
              <AppIcon name="send" :size="14" /> تليجرام
            </button>
            <button :class="{ active: activeTab === 'ai' }" @click="activeTab = 'ai'">
              <AppIcon name="brain" :size="14" /> الذكاء
            </button>
            <button :class="{ active: activeTab === 'physics' }" @click="activeTab = 'physics'">
              <AppIcon name="sliders" :size="14" /> الفيزياء
            </button>
            <button :class="{ active: activeTab === 'nodes' }" @click="activeTab = 'nodes'">
              <AppIcon name="boxes" :size="14" /> العقد
            </button>
          </div>

          <!-- TAB 0: Active Automation Agents & Tasks -->
          <div v-if="activeTab === 'tasks'" class="tab-content">
            <div class="tasks-header">
              <h3><AppIcon name="shield" :size="18" /> وكلاء الأتمتة والرقابة الذكية</h3>
              <button class="btn btn-outline btn-xs" @click="loadAutomations">
                <AppIcon name="refresh" :size="12" /> تحديث
              </button>
            </div>
            <p class="tab-desc">
              وكلاء استباقيون ينفذون مهام الرقابة والتوازن والإغلاق ويرسلون تنبيهات فورية لتليجرام.
            </p>

            <div class="tasks-cards-list">
              <div
                v-for="task in tasks"
                :key="task.key"
                class="task-card"
                :class="[task.category, { disabled: !task.is_enabled }]"
              >
                <div class="task-card-top">
                  <div class="task-title-group">
                    <span class="task-category-badge">{{
                      categoryLabels[task.category] || task.category
                    }}</span>
                    <strong>{{ task.name_ar }}</strong>
                  </div>
                  <button
                    class="toggle-btn-mini"
                    :class="{ active: task.is_enabled }"
                    @click="toggleTask(task)"
                    :title="task.is_enabled ? 'تعطيل الوكيل' : 'تفعيل الوكيل'"
                  >
                    <span class="toggle-track-mini">
                      <span class="toggle-thumb-mini" />
                    </span>
                  </button>
                </div>

                <p class="task-desc-text">{{ task.description_ar }}</p>

                <div class="task-card-footer">
                  <div class="task-meta">
                    <small v-if="task.cron_expression">⏱ مُجدول: {{ task.cron_expression }}</small>
                    <small v-else>⚡ يعمل فور وقوع الحدث</small>
                    <small v-if="task.last_run_at" class="last-run">
                      آخر تشغيل: {{ formatTime(task.last_run_at) }}
                    </small>
                  </div>
                  <button
                    class="btn btn-primary btn-xs run-now-btn"
                    :disabled="runningTaskKey === task.key"
                    @click="runTask(task)"
                  >
                    {{ runningTaskKey === task.key ? 'جاري التنفيذ...' : '▶️ تشغيل فوري' }}
                  </button>
                </div>

                <div v-if="taskFeedback[task.key]" class="task-feedback-toast">
                  {{ taskFeedback[task.key] }}
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 1: Physics Settings -->
          <div v-if="activeTab === 'physics'" class="tab-content">
            <h3><AppIcon name="sliders" :size="18" /> معايير محاكاة الفيزياء</h3>
            <p class="tab-desc">تحكم بحرية في قوة التنافر ومسافات الروابط وجاذبية المركز.</p>

            <div class="setting-group">
              <label>قوة التنافر بين العقد (Repel Force)</label>
              <input
                type="range"
                min="-1000"
                max="-50"
                step="10"
                v-model.number="physics.repelForce"
                @input="onPhysicsChange"
              />
              <span class="setting-value">{{ physics.repelForce }}</span>
            </div>

            <div class="setting-group">
              <label>طول الروابط (Link Distance)</label>
              <input
                type="range"
                min="60"
                max="400"
                step="10"
                v-model.number="physics.linkDistance"
                @input="onPhysicsChange"
              />
              <span class="setting-value">{{ physics.linkDistance }}px</span>
            </div>

            <div class="setting-group">
              <label>نصف قطر التصادم (Collision Radius)</label>
              <input
                type="range"
                min="20"
                max="140"
                step="5"
                v-model.number="physics.collisionRadius"
                @input="onPhysicsChange"
              />
              <span class="setting-value">{{ physics.collisionRadius }}px</span>
            </div>

            <div class="setting-group">
              <label>قوة جذب المركز (Center Gravity)</label>
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.01"
                v-model.number="physics.centerForceX"
                @input="onGravityChange"
              />
              <span class="setting-value">{{ (physics.centerForceX * 100).toFixed(0) }}%</span>
            </div>

            <div class="layout-presets">
              <h4>نماذج التخطيط الجاهزة</h4>
              <div class="preset-buttons">
                <button class="btn btn-outline btn-xs" @click="applyTreeLayout">
                  <AppIcon name="layers" :size="12" /> شجري منظم
                </button>
                <button class="btn btn-outline btn-xs" @click="applyCircularLayout">
                  <AppIcon name="refresh" :size="12" /> دائري متزن
                </button>
                <button class="btn btn-outline btn-xs" @click="applyForceLayout">
                  <AppIcon name="zap" :size="12" /> تحرر حر
                </button>
              </div>
            </div>
          </div>

          <!-- TAB 2: Telegram Bot Controls -->
          <div v-if="activeTab === 'telegram'" class="tab-content">
            <h3><AppIcon name="send" :size="18" /> إدارة بوت تليجرام التفاعلي</h3>

            <!-- Status Indicator -->
            <div class="bot-status-card" :class="telegramActive ? 'online' : 'offline'">
              <div class="status-top">
                <span class="status-badge-dot" />
                <strong>{{
                  telegramActive ? 'البوت متصل ويستمع للأوامر الحية' : 'البوت متوقف عن الاستماع'
                }}</strong>
              </div>
              <div class="status-details">
                <small
                  >Chat ID:
                  <code>{{
                    telegramConfigured.hasDefaultChatId ? 'مُضبط' : 'غير مُضبط'
                  }}</code></small
                >
                <small
                  >Bot Token:
                  <code>{{ telegramConfigured.hasToken ? 'مُضبط' : 'غير مُضبط' }}</code></small
                >
              </div>
            </div>

            <!-- Toggle Switch -->
            <div class="toggle-box">
              <span>تفعيل الاستماع التفاعلي (Long Polling)</span>
              <button
                class="toggle-btn"
                :class="{ active: telegramActive }"
                @click="toggleTelegram"
                :disabled="togglingTelegram"
              >
                <span class="toggle-track">
                  <span class="toggle-thumb" />
                </span>
              </button>
            </div>

            <!-- Test Message Sender -->
            <div class="telegram-test-box">
              <h4>إرسال رسالة تجريبية مباشرة</h4>
              <textarea
                v-model="customTelegramMsg"
                placeholder="اكتب نص الرسالة أو اتركها فارغة للإرسال القياسي..."
                rows="2"
              ></textarea>
              <button
                class="btn btn-primary btn-sm btn-block"
                :disabled="sendingTelegramTest"
                @click="sendTestTelegram"
              >
                <AppIcon name="send" :size="14" />
                {{ sendingTelegramTest ? 'جاري الإرسال...' : 'إرسال الآن لتليجرام' }}
              </button>
              <small
                v-if="telegramSendFeedback"
                class="send-feedback"
                :class="telegramSendFeedback.type"
              >
                {{ telegramSendFeedback.text }}
              </small>
            </div>

            <hr />
            <!-- Recent Logs Stream -->
            <div class="logs-section">
              <div class="logs-header">
                <h4>آخر الرسائل والسجلات</h4>
                <button class="btn btn-outline btn-xs" @click="refreshLogs">
                  <AppIcon name="refresh" :size="12" /> تحديث
                </button>
              </div>
              <div class="telegram-logs-list">
                <div
                  v-for="log in telegramLogs"
                  :key="log.id"
                  class="log-item"
                  :class="log.direction"
                >
                  <div class="log-top">
                    <span class="log-badge">{{
                      log.direction === 'in' ? 'وارد 📥' : 'صادر 📤'
                    }}</span>
                    <span class="log-time">{{ formatTime(log.created_at) }}</span>
                  </div>
                  <p class="log-text">{{ log.message }}</p>
                  <p v-if="log.ai_response" class="log-ai">
                    <strong>رد الذكاء:</strong> {{ truncate(log.ai_response, 100) }}
                  </p>
                </div>
                <div v-if="telegramLogs.length === 0" class="empty-logs">
                  لا توجد رسائل مسجلة حتى الآن
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: Gemini AI Agent -->
          <div v-if="activeTab === 'ai'" class="tab-content">
            <h3><AppIcon name="brain" :size="18" /> وكيل الذكاء الاصطناعي (Gemini)</h3>
            <p class="tab-desc">اختبر استجابة المساعد الذكي لقواعد النظام واستفساراتك.</p>

            <div class="rules-summary-cards">
              <h4>القواعد المحاسبية الصارمة المحقونة:</h4>
              <div class="rule-card">
                <strong>1. إدخال يدوي:</strong> تسجيل وخصم مباشر من المخزن.
              </div>
              <div class="rule-card">
                <strong>2. فواتير الجملة:</strong> خصم مباشر وفوري من المخزن الرئيسي دون وصفات.
              </div>
              <div class="rule-card">
                <strong>3. استيراد الكاشير:</strong> يمر إلزامياً عبر محرك الوصفات قبل تعديل رصيد
                الفرع.
              </div>
            </div>

            <div class="ai-test-box">
              <h4>اختبار استفسار حي مع Gemini:</h4>
              <textarea
                v-model="aiTestPrompt"
                placeholder="اسأل الذكاء الاصطناعي عن المبيعات أو القواعد... مثال: كيف يتم خصم فواتير الجملة؟"
                rows="2"
              ></textarea>
              <button
                class="btn btn-primary btn-sm btn-block"
                :disabled="testingAi || !aiTestPrompt.trim()"
                @click="runAiTest"
              >
                <AppIcon name="bot" :size="14" />
                {{ testingAi ? 'جاري التفكير...' : 'اسأل Gemini' }}
              </button>
              <div v-if="aiTestReply" class="ai-reply-box">
                <strong>إجابة الوكيل:</strong>
                <p>{{ aiTestReply }}</p>
              </div>
            </div>
          </div>

          <!-- TAB 4: Nodes List -->
          <div v-if="activeTab === 'nodes'" class="tab-content">
            <div class="nodes-list-header">
              <h3>قائمة العقد المسجلة ({{ nodes.length }})</h3>
              <button class="btn btn-primary btn-xs" @click="openAddNodeModal">
                <AppIcon name="add" :size="12" /> إضافة
              </button>
            </div>
            <div class="nodes-scroll-list">
              <div
                v-for="node in nodes"
                :key="node.id"
                class="node-list-item"
                @click="selectNode(node)"
              >
                <span
                  class="node-badge-dot"
                  :style="{ background: node.settings?.color || '#94a3b8' }"
                />
                <div class="node-info">
                  <strong>{{ node.label_ar || node.label }}</strong>
                  <small>{{ typeLabels[node.type] }} · {{ node.group }}</small>
                </div>
                <button class="btn btn-outline btn-xs delete-btn" @click.stop="deleteNode(node.id)">
                  <AppIcon name="trash" :size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Node Detail / Inspector Modal -->
    <div v-if="selectedNode" class="modal-overlay" @click.self="selectedNode = null">
      <div class="modal-card card">
        <div class="modal-header">
          <h3>تفاصيل العقدة: {{ selectedNode.label_ar || selectedNode.label }}</h3>
          <button class="btn-close" @click="selectedNode = null">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>المسمى بالعربية</label>
            <input v-model="selectedNode.label_ar" />
          </div>
          <div class="form-row">
            <label>المسمى بالإنجليزية</label>
            <input v-model="selectedNode.label" />
          </div>
          <div class="form-row">
            <label>المجموعة (Group)</label>
            <select v-model="selectedNode.group">
              <option value="operations">عمليات وتوزيع (Operations)</option>
              <option value="inventory">مخزون ومستودعات (Inventory)</option>
              <option value="production">تصنيع ووصفات (Production)</option>
              <option value="notifications">إشعارات وتنبيهات (Notifications)</option>
              <option value="ai">ذكاء اصطناعي (AI)</option>
              <option value="sales">مبيعات وفواتير (Sales)</option>
            </select>
          </div>
          <div class="form-row">
            <label>اللون</label>
            <input type="color" v-model="selectedNode.settings.color" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger btn-sm" @click="deleteNode(selectedNode.id)">
            حذف العقدة
          </button>
          <button class="btn btn-primary btn-sm" @click="saveSelectedNode">حفظ التعديلات</button>
        </div>
      </div>
    </div>

    <!-- Add Node Modal -->
    <div v-if="showAddNodeModal" class="modal-overlay" @click.self="showAddNodeModal = false">
      <div class="modal-card card">
        <div class="modal-header">
          <h3><AppIcon name="add" :size="18" /> إضافة عقدة أتمتة جديدة</h3>
          <button class="btn-close" @click="showAddNodeModal = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>نوع العقدة</label>
            <select v-model="newNode.type">
              <option value="agent">🤖 وكيل ذكي (Agent)</option>
              <option value="trigger">⚡ مشغل / حدث (Trigger)</option>
              <option value="action">⚙️ عملية / إجراء (Action)</option>
            </select>
          </div>
          <div class="form-row">
            <label>المسمى بالعربية</label>
            <input v-model="newNode.label_ar" placeholder="مثال: مراقب المبيعات الفورية" />
          </div>
          <div class="form-row">
            <label>المسمى بالإنجليزية</label>
            <input v-model="newNode.label" placeholder="مثال: Live Sales Monitor" />
          </div>
          <div class="form-row">
            <label>المجموعة</label>
            <select v-model="newNode.group_name">
              <option value="operations">عمليات (Operations)</option>
              <option value="inventory">مخزون (Inventory)</option>
              <option value="production">إنتاج ووصفات (Production)</option>
              <option value="notifications">إشعارات (Notifications)</option>
              <option value="ai">ذكاء اصطناعي (AI)</option>
              <option value="sales">مبيعات (Sales)</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" @click="showAddNodeModal = false">إلغاء</button>
          <button
            class="btn btn-primary btn-sm"
            :disabled="!newNode.label || !newNode.label_ar"
            @click="submitAddNode"
          >
            حفظ وإضافة
          </button>
        </div>
      </div>
    </div>

    <!-- Add Edge Modal -->
    <div v-if="showAddEdgeModal" class="modal-overlay" @click.self="showAddEdgeModal = false">
      <div class="modal-card card">
        <div class="modal-header">
          <h3><AppIcon name="arrowRightLeft" :size="18" /> ربط عقدتين بمسار أتمتة</h3>
          <button class="btn-close" @click="showAddEdgeModal = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>العقدة المصدر (من)</label>
            <select v-model="newEdge.source_node_id">
              <option v-for="n in nodes" :key="n.id" :value="n.id">
                {{ n.label_ar || n.label }} ({{ typeLabels[n.type] }})
              </option>
            </select>
          </div>
          <div class="form-row">
            <label>العقدة الهدف (إلى)</label>
            <select v-model="newEdge.target_node_id">
              <option v-for="n in nodes" :key="n.id" :value="n.id">
                {{ n.label_ar || n.label }} ({{ typeLabels[n.type] }})
              </option>
            </select>
          </div>
          <div class="form-row">
            <label>مسمى الرابط (اختياري)</label>
            <input v-model="newEdge.label" placeholder="مثال: خصم فوري / تنبيه نقص" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" @click="showAddEdgeModal = false">إلغاء</button>
          <button
            class="btn btn-primary btn-sm"
            :disabled="
              !newEdge.source_node_id ||
              !newEdge.target_node_id ||
              newEdge.source_node_id === newEdge.target_node_id
            "
            @click="submitAddEdge"
          >
            إنشاء الرابط
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { automation } from '@/api';
import type {
  GraphNode,
  GraphEdge,
  PhysicsSettings,
  AutomationTask,
  AutomationExecutionLog,
} from '@/api/automation.api';

// ─── أنواع وبيانات ───────────────────────────────────

type SimulationNode = GraphNode & {
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
};

interface Particle {
  sourceId: number;
  targetId: number;
  progress: number;
  speed: number;
  color: string;
}

const mouseWorld = reactive({ x: 0, y: 0 });
let resizeObserver: ResizeObserver | null = null;

const DEFAULT_TASKS: AutomationTask[] = [
  {
    id: 1,
    key: 'daily_sales_report',
    name_ar: 'تقرير الإغلاق اليومي الذكي',
    description_ar:
      'تجميع إجمالي المبيعات، الأرباح، المصروفات، وأعلى الأصناف مبيعاً وإرسالها للمالك ليلاً.',
    category: 'sales',
    trigger_type: 'cron',
    cron_expression: '30 23 * * *',
    is_enabled: true,
    channels: { telegram: true },
    config: {},
    last_run_at: new Date().toISOString(),
    last_status: 'success',
  },
  {
    id: 2,
    key: 'low_stock_alert',
    name_ar: 'إنذار نقص المخزون وخامات البن',
    description_ar: 'رصد الأصناف وخامات التحميص التي وصلت لحد إعادة الطلب وإرسال تنبيه للمسؤولين.',
    category: 'inventory',
    trigger_type: 'cron',
    cron_expression: '0 10,18 * * *',
    is_enabled: true,
    channels: { telegram: true },
    config: {},
    last_run_at: new Date().toISOString(),
    last_status: 'success',
  },
  {
    id: 3,
    key: 'void_invoice_alert',
    name_ar: 'كشف فوري لإلغاء الفواتير (Anti-Fraud)',
    description_ar:
      'تنبيه فوري لمدير الفرع والمالك عند قيام أي كاشير بإلغاء فاتورة أو تطبيق خصم يتجاوز 15%.',
    category: 'security',
    trigger_type: 'event',
    cron_expression: null,
    is_enabled: true,
    channels: { telegram: true },
    config: {},
    last_run_at: new Date().toISOString(),
    last_status: 'success',
  },
  {
    id: 4,
    key: 'branch_balancing',
    name_ar: 'إعادة توازن مخزون الفروع ونقل البضاعة',
    description_ar: 'تحليل معدل سحب البن في الفروع واقتراح تحويلات ذكية تلقائية قبل نفاد الرصيد.',
    category: 'inventory',
    trigger_type: 'cron',
    cron_expression: '0 9 * * *',
    is_enabled: true,
    channels: { telegram: true },
    config: {},
    last_run_at: new Date().toISOString(),
    last_status: 'success',
  },
  {
    id: 5,
    key: 'system_health',
    name_ar: 'فحص النسخ الاحتياطي وسلامة السيرفر',
    description_ar: 'مراقبة دورية لسلامة قاعدة البيانات وحالة السيرفر والنسخ الاحتياطي اليومي.',
    category: 'system',
    trigger_type: 'cron',
    cron_expression: '0 3 * * *',
    is_enabled: true,
    channels: { telegram: true },
    config: {},
    last_run_at: new Date().toISOString(),
    last_status: 'success',
  },
];

const categoryLabels: Record<string, string> = {
  sales: '💰 مبيعات وإغلاق',
  inventory: '📦 مخزون وتحميص',
  security: '🛡️ رقابة وأمان',
  system: '🖥️ خادم ونظام',
};

const DEFAULT_SEED_NODES: SimulationNode[] = [
  {
    id: 1,
    type: 'agent',
    label: 'Cashier POS',
    label_ar: 'كاشير نقطة البيع',
    group: 'operations',
    settings: { icon: 'monitor', color: '#10b981' },
    x: -220,
    y: -120,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 2,
    type: 'agent',
    label: 'Main Warehouse',
    label_ar: 'المخزن الرئيسي',
    group: 'inventory',
    settings: { icon: 'warehouse', color: '#3b82f6' },
    x: 220,
    y: -60,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 3,
    type: 'agent',
    label: 'Recipe Engine',
    label_ar: 'محرك الوصفات',
    group: 'production',
    settings: { icon: 'flask', color: '#f59e0b' },
    x: 0,
    y: 120,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 4,
    type: 'agent',
    label: 'Telegram Bot',
    label_ar: 'وكيل تليجرام',
    group: 'notifications',
    settings: { icon: 'send', color: '#8b5cf6' },
    x: 320,
    y: 160,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 5,
    type: 'agent',
    label: 'AI Copilot (Gemini)',
    label_ar: 'المساعد الذكي Gemini',
    group: 'ai',
    settings: { icon: 'brain', color: '#ec4899' },
    x: -320,
    y: 160,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 6,
    type: 'agent',
    label: 'System Alerts',
    label_ar: 'إشعارات النظام',
    group: 'notifications',
    settings: { icon: 'bell', color: '#ef4444' },
    x: 320,
    y: -160,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 7,
    type: 'trigger',
    label: 'Manual Daily Entry',
    label_ar: 'إدخال يومي يدوي',
    group: 'sales',
    settings: { icon: 'edit', color: '#6b7280', rule: 'RULE_1_MANUAL' },
    x: -420,
    y: -220,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 8,
    type: 'trigger',
    label: 'Wholesale Invoice',
    label_ar: 'فاتورة جملة',
    group: 'sales',
    settings: { icon: 'file-text', color: '#6b7280', rule: 'RULE_2_WHOLESALE' },
    x: -420,
    y: 0,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 9,
    type: 'trigger',
    label: 'Cashier Report Import',
    label_ar: 'استيراد تقرير الكاشير',
    group: 'sales',
    settings: { icon: 'upload', color: '#6b7280', rule: 'RULE_3_CASHIER' },
    x: -420,
    y: 220,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 10,
    type: 'action',
    label: 'Direct Stock Deduction',
    label_ar: 'خصم مخزون مباشر',
    group: 'inventory',
    settings: { icon: 'minus-circle', color: '#14b8a6' },
    x: 0,
    y: -220,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 11,
    type: 'action',
    label: 'Recipe Calculation',
    label_ar: 'حساب الوصفات والتفكيك',
    group: 'production',
    settings: { icon: 'calculator', color: '#f97316' },
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    is_active: true,
  },
  {
    id: 12,
    type: 'action',
    label: 'Branch Stock Update',
    label_ar: 'تحديث مخزون الفرع',
    group: 'inventory',
    settings: { icon: 'refresh-cw', color: '#0ea5e9' },
    x: 220,
    y: 220,
    vx: 0,
    vy: 0,
    is_active: true,
  },
];

const DEFAULT_SEED_EDGES: GraphEdge[] = [
  { id: 1, source: 7, target: 10, condition: 'sale_type = manual', label: 'تسجيل عادي' },
  { id: 2, source: 10, target: 2, condition: null, label: 'خصم من المخزن' },
  { id: 3, source: 8, target: 10, condition: 'sale_type = wholesale', label: 'جملة → خصم مباشر' },
  {
    id: 4,
    source: 9,
    target: 11,
    condition: 'sale_type = cashier_import',
    label: 'يمر عبر محرك الوصفات إلزامياً',
  },
  { id: 5, source: 11, target: 3, condition: null, label: 'تفكيك وصفات ثم خصم' },
  { id: 6, source: 3, target: 12, condition: null, label: 'تحديث رصيد الفرع' },
  { id: 7, source: 2, target: 6, condition: 'on_low_stock', label: 'تنبيه نقص' },
  { id: 8, source: 6, target: 4, condition: 'always', label: 'إشعار تليجرام' },
  { id: 9, source: 4, target: 5, condition: 'command = /ai', label: 'استعلام ذكي' },
  { id: 10, source: 5, target: 2, condition: 'read_only', label: 'قراءة بيانات المخزون' },
];

// ─── الحالة العامة ───────────────────────────────────

const loading = ref(false);
const showSettings = ref(true);
const mobileView = ref<'graph' | 'panel'>('graph');
const showLegendMobile = ref(false);
const activeTab = ref<'tasks' | 'telegram' | 'ai' | 'physics' | 'nodes'>('tasks');
const canvas = ref<HTMLCanvasElement | null>(null);
const graphContainer = ref<HTMLElement | null>(null);

// مهام الأتمتة الحية
const tasks = ref<AutomationTask[]>(JSON.parse(JSON.stringify(DEFAULT_TASKS)));
const runningTaskKey = ref<string | null>(null);
const taskFeedback = reactive<Record<string, string>>({});
const executionLogs = ref<AutomationExecutionLog[]>([]);

const enabledTaskCount = computed(() => tasks.value.filter((task) => task.is_enabled).length);
const successfulExecutionCount = computed(
  () => executionLogs.value.filter((log) => log.status === 'success').length,
);
const failedExecutionCount = computed(
  () =>
    executionLogs.value.filter((log) => log.status === 'failed' || log.status === 'warning').length,
);
const averageExecutionMs = computed(() => {
  const durations = executionLogs.value
    .map((log) => Number(log.duration_ms))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (!durations.length) return 0;
  return Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
});
const recentExecutionLogs = computed(() => executionLogs.value.slice(0, 12));
const commandHealthTone = computed(() => {
  if (failedExecutionCount.value > 0) return 'is-warning';
  if (executionLogs.value.length > 0) return 'is-healthy';
  return 'is-idle';
});
const commandHealthLabel = computed(() => {
  if (failedExecutionCount.value > 0) return 'يحتاج مراجعة';
  if (executionLogs.value.length > 0) return 'يعمل بصورة مستقرة';
  return 'جاهز للتشغيل';
});
const latestExecutionLabel = computed(() => {
  const latest = executionLogs.value[0];
  return latest?.created_at ? formatTime(latest.created_at) : 'بانتظار أول تشغيل';
});

// بيانات الشبكة
const nodes = ref<SimulationNode[]>(JSON.parse(JSON.stringify(DEFAULT_SEED_NODES)));
const edges = ref<GraphEdge[]>(JSON.parse(JSON.stringify(DEFAULT_SEED_EDGES)));

// إعدادات الفيزياء
const physics = reactive<PhysicsSettings>({
  repelForce: -400,
  linkDistance: 150,
  collisionRadius: 60,
  centerForceX: 0.05,
  centerForceY: 0.05,
});

// تليجرام
const telegramActive = ref(true);
const telegramConfigured = reactive({ hasToken: false, hasDefaultChatId: false });
const togglingTelegram = ref(false);
const customTelegramMsg = ref('');
const sendingTelegramTest = ref(false);
const telegramSendFeedback = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const telegramLogs = ref<any[]>([]);

// اختبار الذكاء
const aiTestPrompt = ref('');
const testingAi = ref(false);
const aiTestReply = ref('');

// تفاعل الماوس والمحاكاة
const dragging = ref<number | null>(null);
const hoveredNode = ref<SimulationNode | null>(null);
const selectedNode = ref<SimulationNode | null>(null);
const tooltipPos = reactive({ x: 0, y: 0 });
const pan = reactive({ x: 0, y: 0 });
const zoom = ref(1);
let lastMouse = { x: 0, y: 0 };
let isPanning = false;

// محاكاة الجسيمات
const isSimulating = ref(false);
const particles = ref<Particle[]>([]);

// Modals
const showAddNodeModal = ref(false);
const showAddEdgeModal = ref(false);
const newNode = reactive({
  type: 'agent',
  label: '',
  label_ar: '',
  group_name: 'operations',
});
const newEdge = reactive({
  source_node_id: 0,
  target_node_id: 0,
  label: '',
});

// محرك الأنيميشن
let animFrameId: number | null = null;
let alpha = 1;
const alphaMin = 0.001;
const alphaDecay = 0.02;
const velocityDecay = 0.4;

// ─── ثوابت العرض ─────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  operations: '#10b981',
  inventory: '#3b82f6',
  production: '#f59e0b',
  notifications: '#8b5cf6',
  ai: '#ec4899',
  sales: '#6b7280',
  general: '#94a3b8',
};

const typeLabels: Record<string, string> = {
  agent: '🤖 وكيل ذكي',
  trigger: '⚡ مشغل أحداث',
  action: '⚙️ عملية / إجراء',
};

const ruleLabels: Record<string, string> = {
  RULE_1_MANUAL: 'القاعدة 1: إدخال يومي يدوي — خصم مباشر',
  RULE_2_WHOLESALE: 'القاعدة 2: فاتورة جملة — خصم مباشر من المخزن الرئيسي',
  RULE_3_CASHIER: 'القاعدة 3: استيراد كاشير — يمر عبر محرك الوصفات إلزامياً',
};

const legendGroups = [
  { label: 'وكيل (Agent)', color: '#10b981' },
  { label: 'مشغل (Trigger)', color: '#6b7280' },
  { label: 'عملية (Action)', color: '#14b8a6' },
  { label: 'إشعارات وتليجرام', color: '#8b5cf6' },
  { label: 'ذكاء اصطناعي (Gemini)', color: '#ec4899' },
];

// ─── دورة الحياة ─────────────────────────────────────

onMounted(async () => {
  await loadData();
  resizeCanvas();
  startSimulation();
  window.addEventListener('resize', resizeCanvas);

  if (graphContainer.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(graphContainer.value);
  }
});

onUnmounted(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  window.removeEventListener('resize', resizeCanvas);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

watch(showSettings, () => {
  nextTick(() => {
    resizeCanvas();
  });
});

// ─── جلب وتحديث البيانات ──────────────────────────────

async function loadData() {
  loading.value = true;
  try {
    const [graphRes, physicsRes, logsRes, statusRes, tasksRes, executionLogsRes] =
      await Promise.all([
        automation.getGraph().catch(() => null),
        automation.getPhysics().catch(() => null),
        automation.getTelegramLogs({ limit: 10 }).catch(() => null),
        automation.getTelegramBotStatus().catch(() => null),
        automation.getTasks().catch(() => null),
        automation.getExecutionLogs({ limit: 24 }).catch(() => null),
      ]);

    if (graphRes && (graphRes as any).data?.nodes?.length > 0) {
      nodes.value = (graphRes as any).data.nodes.map((n: GraphNode) => ({
        ...n,
        vx: 0,
        vy: 0,
      }));
      edges.value = (graphRes as any).data.edges || [];
    }

    if (physicsRes && (physicsRes as any).data) {
      Object.assign(physics, (physicsRes as any).data);
    }

    if (logsRes && (logsRes as any).data?.logs) {
      telegramLogs.value = (logsRes as any).data.logs;
    }

    if (statusRes && (statusRes as any).data) {
      telegramActive.value = (statusRes as any).data.isPolling;
      telegramConfigured.hasToken = Boolean((statusRes as any).data.hasToken);
      telegramConfigured.hasDefaultChatId = Boolean((statusRes as any).data.hasDefaultChatId);
    }

    if (tasksRes && (tasksRes as any).data?.length > 0) {
      tasks.value = (tasksRes as any).data;
    }
    if (executionLogsRes && (executionLogsRes as any).data?.logs) {
      executionLogs.value = (executionLogsRes as any).data.logs;
    }
  } catch (err) {
    console.warn('تعذر جلب البيانات من الخادم، تم تطبيق البيانات الافتراضية:', err);
  } finally {
    loading.value = false;
  }
}

async function loadAutomations() {
  try {
    const res = await automation.getTasks();
    if ((res as any)?.data?.length > 0) {
      tasks.value = (res as any).data;
    }
    await refreshExecutionLogs();
  } catch (err) {
    console.error('فشل تحديث قائمة الوكلاء:', err);
  }
}

async function toggleTask(task: AutomationTask) {
  const newState = !task.is_enabled;
  task.is_enabled = newState;
  try {
    await automation.toggleTask(task.key, newState);
  } catch (err) {
    task.is_enabled = !newState;
    console.error('فشل تبديل حالة الوكيل:', err);
  }
}

async function runTask(task: AutomationTask) {
  runningTaskKey.value = task.key;
  taskFeedback[task.key] = '';
  try {
    const res = await automation.runTaskNow(task.key);
    taskFeedback[task.key] = (res as any)?.message || 'تم تشغيل الوكيل بنجاح! ✅';
    task.last_run_at = new Date().toISOString();
    task.last_status = 'success';
    await refreshLogs();
  } catch (err: any) {
    taskFeedback[task.key] = err.message || 'فشل تشغيل الوكيل';
    task.last_status = 'failed';
  } finally {
    runningTaskKey.value = null;
    setTimeout(() => {
      taskFeedback[task.key] = '';
    }, 5000);
  }
}

async function refreshLogs() {
  try {
    const res = await automation.getTelegramLogs({ limit: 15 });
    if ((res as any).data?.logs) {
      telegramLogs.value = (res as any).data.logs;
    }
  } catch (err) {
    console.error('فشل تحديث السجلات:', err);
  }
  await refreshExecutionLogs();
}

async function refreshExecutionLogs() {
  try {
    const res = await automation.getExecutionLogs({ limit: 24 });
    if ((res as any).data?.logs) executionLogs.value = (res as any).data.logs;
  } catch (err) {
    console.error('فشل تحديث سجل تشغيل الأتمتة:', err);
  }
}

// ─── Canvas & Physics Simulation ──────────────────────

function resizeCanvas() {
  const c = canvas.value;
  const container = graphContainer.value;
  if (!c || !container) return;

  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = rect.width * dpr;
  c.height = rect.height * dpr;
  c.style.width = rect.width + 'px';
  c.style.height = rect.height + 'px';

  const ctx = c.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);
}

function startSimulation() {
  alpha = 1;
  tick();
}

function tick() {
  const n = nodes.value;
  const e = edges.value;
  const c = canvas.value;
  if (!c) return;

  const w = c.clientWidth;
  const h = c.clientHeight;
  const cx = w / 2;
  const cy = h / 2;

  if (alpha >= alphaMin) {
    alpha += (alphaMin - alpha) * alphaDecay;

    // Many-Body Force
    for (let i = 0; i < n.length; i++) {
      const ni = n[i]!;
      for (let j = i + 1; j < n.length; j++) {
        const nj = n[j]!;
        const dx = nj.x - ni.x;
        const dy = nj.y - ni.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (physics.repelForce * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        ni.vx -= fx;
        ni.vy -= fy;
        nj.vx += fx;
        nj.vy += fy;
      }
    }

    // Link Force
    const nodeMap = new Map(n.map((node) => [node.id, node]));
    for (const edge of e) {
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;

      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = ((dist - physics.linkDistance) / dist) * alpha * 0.3;
      const fx = dx * force;
      const fy = dy * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Center Gravity Force
    for (const node of n) {
      node.vx += (cx - node.x - pan.x) * physics.centerForceX * alpha;
      node.vy += (cy - node.y - pan.y) * physics.centerForceY * alpha;
    }

    // Velocity update
    for (const node of n) {
      if (node.fx !== undefined) {
        node.x = node.fx;
        node.vx = 0;
      } else {
        node.vx *= velocityDecay;
        node.x += node.vx;
      }
      if (node.fy !== undefined) {
        node.y = node.fy;
        node.vy = 0;
      } else {
        node.vy *= velocityDecay;
        node.y += node.vy;
      }
    }

    // Collision
    for (let i = 0; i < n.length; i++) {
      const ni = n[i]!;
      for (let j = i + 1; j < n.length; j++) {
        const nj = n[j]!;
        const dx = nj.x - ni.x;
        const dy = nj.y - ni.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = physics.collisionRadius;
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5;
          ni.x -= dx * push;
          ni.y -= dy * push;
          nj.x += dx * push;
          nj.y += dy * push;
        }
      }
    }
  }

  // Update Particles simulation
  if (isSimulating.value) {
    updateParticles();
  }

  draw();
  animFrameId = requestAnimationFrame(tick);
}

function updateParticles() {
  if (particles.value.length < 15 && edges.value.length > 0) {
    const randomEdge = edges.value[Math.floor(Math.random() * edges.value.length)]!;
    particles.value.push({
      sourceId: randomEdge.source,
      targetId: randomEdge.target,
      progress: 0,
      speed: 0.015 + Math.random() * 0.015,
      color: '#38bdf8',
    });
  }

  for (let i = particles.value.length - 1; i >= 0; i--) {
    const p = particles.value[i]!;
    p.progress += p.speed;
    if (p.progress >= 1) {
      particles.value.splice(i, 1);
    }
  }
}

// ─── دوال المحاكاة البصرية المجسمة (3D Cybernetic Engine) ─────

function getVisualPos(node: SimulationNode, time: number) {
  if (dragging.value === node.id || node.fx !== undefined) {
    return { x: node.x, y: node.y };
  }
  const seed = node.id * 7.31;
  const floatX = Math.sin(time * 0.0012 + seed) * 3.5;
  const floatY = Math.cos(time * 0.001 + seed * 1.3) * 3.5;
  return { x: node.x + floatX, y: node.y + floatY };
}

/**
 * 1. قاعدة ثلاثية الأبعاد أيزومترية تحت كل عقدة
 */
function draw3DIsometricBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  time: number,
  isHovered: boolean,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
  ctx.fillStyle = isHovered ? color + '25' : color + '15';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isHovered ? color + 'AA' : color + '55';
  ctx.stroke();

  const rot = time * 0.001;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, rot, rot + Math.PI * 1.5);
  ctx.strokeStyle = color + '88';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * 2. كرة هولوجرام زجاجية مجسمة ثلاثية الأبعاد (3D Volumetric Sphere for Agents)
 */
function draw3DVolumetricSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  time: number,
  isHovered: boolean,
  isSelected: boolean,
  _mouse: { x: number; y: number },
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.strokeStyle = isSelected ? '#ffffff' : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isHovered ? 15 : 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
  ctx.restore();
}

/**
 * 3. بلورة ماسية ثلاثية الأبعاد للمشغلات (3D Faceted Crystal for Triggers)
 */
function draw3DFacetedCrystal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  time: number,
  isHovered: boolean,
  isSelected: boolean,
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + r * 0.9 * Math.cos(angle);
    const py = y + r * 0.9 * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.strokeStyle = isSelected ? '#ffffff' : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isHovered ? 15 : 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - r * 0.4, y);
  ctx.lineTo(x + r * 0.4, y);
  ctx.moveTo(x, y - r * 0.4);
  ctx.lineTo(x, y + r * 0.4);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/**
 * 4. مكعب تكنولوجي ثلاثي الأبعاد للعمليات (3D Isometric Cube for Actions)
 */
function draw3DIsometricCube(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  _time: number,
  isHovered: boolean,
  isSelected: boolean,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, 8);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.strokeStyle = isSelected ? '#ffffff' : color;
  ctx.shadowColor = color;
  ctx.shadowBlur = isHovered ? 15 : 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6, 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();
}

// ─── رسم Canvas المحترف ──────────────────────────────

function draw() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;

  const w = c.clientWidth;
  const h = c.clientHeight;
  const time = performance.now();

  ctx.clearRect(0, 0, w, h);

  // 1. شبكة خلفية متحركة مع الـ Pan والـ Zoom
  const gridSize = 42;
  const zoomVal = zoom.value;
  const offsetX = pan.x % (gridSize * zoomVal);
  const offsetY = pan.y % (gridSize * zoomVal);

  ctx.beginPath();
  for (let x = offsetX; x < w; x += gridSize * zoomVal) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = offsetY; y < h; y += gridSize * zoomVal) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoomVal, zoomVal);

  const nodeMap = new Map(nodes.value.map((n) => [n.id, n]));

  // 2. رسم المسارات الليزرية متدفقة الطاقة (Multi-Layer Neon Laser Energy Paths)
  for (const edge of edges.value) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (!s || !t) continue;

    const sPos = getVisualPos(s, time);
    const tPos = getVisualPos(t, time);

    const dx = tPos.x - sPos.x;
    const dy = tPos.y - sPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;

    // انحناء انسيابي متزن
    const curvature = Math.min(32, dist * 0.12) * (edge.id % 2 === 0 ? 1 : -1);
    const cpX = (sPos.x + tPos.x) / 2 + nx * curvature;
    const cpY = (sPos.y + tPos.y) / 2 + ny * curvature;

    const sColor = s.settings?.color || GROUP_COLORS[s.group] || '#94a3b8';
    const tColor = t.settings?.color || GROUP_COLORS[t.group] || '#94a3b8';

    // مسار ليزري متدرج
    const strokeGrad = ctx.createLinearGradient(sPos.x, sPos.y, tPos.x, tPos.y);
    strokeGrad.addColorStop(0, sColor + 'E6');
    strokeGrad.addColorStop(1, tColor + 'E6');

    // أ) هالة الإشعاع الليزري الواسعة (Wide Laser Glow)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sPos.x, sPos.y);
    ctx.quadraticCurveTo(cpX, cpY, tPos.x, tPos.y);
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = isSimulating.value ? 8 : 5;
    ctx.shadowColor = sColor;
    ctx.shadowBlur = 20;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.restore();

    // ب) قلب الشعاع النيوني (Focused Neon Core Beam)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sPos.x, sPos.y);
    ctx.quadraticCurveTo(cpX, cpY, tPos.x, tPos.y);
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = isSimulating.value ? 4 : 2.5;
    ctx.stroke();
    ctx.restore();

    // ج) تدفق نبضات الفوتون المستمرة (Continuous Photon Pulse Stream)
    const pulseSpeed = isSimulating.value ? 0.12 : 0.04;
    const dashOffset = -((time * pulseSpeed) % 24);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sPos.x, sPos.y);
    ctx.quadraticCurveTo(cpX, cpY, tPos.x, tPos.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([5, 18]);
    ctx.lineDashOffset = dashOffset;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // د) سهم الطاقة الموجه
    const midT = 0.5;
    const midX =
      (1 - midT) * (1 - midT) * sPos.x + 2 * (1 - midT) * midT * cpX + midT * midT * tPos.x;
    const midY =
      (1 - midT) * (1 - midT) * sPos.y + 2 * (1 - midT) * midT * cpY + midT * midT * tPos.y;
    const tangentX = 2 * (1 - midT) * (cpX - sPos.x) + 2 * midT * (tPos.x - cpX);
    const tangentY = 2 * (1 - midT) * (cpY - sPos.y) + 2 * midT * (tPos.y - cpY);
    const angle = Math.atan2(tangentY, tangentX);

    const arrowLen = 9;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX - arrowLen * Math.cos(angle - 0.45), midY - arrowLen * Math.sin(angle - 0.45));
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX - arrowLen * Math.cos(angle + 0.45), midY - arrowLen * Math.sin(angle + 0.45));
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // هـ) بطاقة تسمية المسار الزجاجية (Glass HUD Label)
    if (edge.label) {
      ctx.save();
      ctx.font = 'bold 9.5px system-ui, sans-serif';
      const textWidth = ctx.measureText(edge.label).width;
      const pillW = textWidth + 12;
      const pillH = 18;
      const pillX = midX - pillW / 2;
      const pillY = midY - 14 - pillH / 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f1f5f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(edge.label, midX, pillY + pillH / 2);
      ctx.restore();
    }
  }

  // 3. رسم جسيمات المحاكاة فائقة التوهج (Hyper-Drive Particles)
  if (isSimulating.value) {
    for (const p of particles.value) {
      const s = nodeMap.get(p.sourceId);
      const t = nodeMap.get(p.targetId);
      if (!s || !t) continue;

      const sPos = getVisualPos(s, time);
      const tPos = getVisualPos(t, time);

      const dx = tPos.x - sPos.x;
      const dy = tPos.y - sPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const curvature = Math.min(32, dist * 0.12) * ((p.sourceId + p.targetId) % 2 === 0 ? 1 : -1);
      const cpX = (sPos.x + tPos.x) / 2 + nx * curvature;
      const cpY = (sPos.y + tPos.y) / 2 + ny * curvature;

      const prog = p.progress;
      const px =
        (1 - prog) * (1 - prog) * sPos.x + 2 * (1 - prog) * prog * cpX + prog * prog * tPos.x;
      const py =
        (1 - prog) * (1 - prog) * sPos.y + 2 * (1 - prog) * prog * cpY + prog * prog * tPos.y;

      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.restore();
    }
  }

  // 4. رسم العقد المجسمة ثلاثية الأبعاد (3D Cyber Hologram Nodes)
  for (const node of nodes.value) {
    const vPos = getVisualPos(node, time);
    const color = node.settings?.color || GROUP_COLORS[node.group] || '#94a3b8';
    const r = node.type === 'agent' ? 26 : 21;
    const isHovered = hoveredNode.value?.id === node.id;
    const isSelected = selectedNode.value?.id === node.id;

    // أ) القاعدة ثلاثية الأبعاد
    draw3DIsometricBase(ctx, vPos.x, vPos.y, r, color, time, isHovered);

    // ب) الجسم المجسم حسب نوع العقدة
    if (node.type === 'agent') {
      draw3DVolumetricSphere(
        ctx,
        vPos.x,
        vPos.y,
        r,
        color,
        time,
        isHovered,
        isSelected,
        mouseWorld,
      );
    } else if (node.type === 'trigger') {
      draw3DFacetedCrystal(ctx, vPos.x, vPos.y, r, color, time, isHovered, isSelected);
    } else {
      draw3DIsometricCube(ctx, vPos.x, vPos.y, r, color, time, isHovered, isSelected);
    }

    // ج) أيقونة العقدة في المركز
    ctx.font = `${r * 0.62}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    const icons: Record<string, string> = {
      monitor: '🖥',
      warehouse: '📦',
      flask: '🧪',
      send: '📡',
      brain: '🧠',
      bell: '🔔',
      edit: '✏️',
      'file-text': '📄',
      upload: '📤',
      'minus-circle': '➖',
      calculator: '🧮',
      'refresh-cw': '🔄',
    };
    const icon = icons[node.settings?.icon] || '●';
    ctx.fillText(icon, vPos.x, vPos.y);

    // د) شارة التسمية الزجاجية أسفل العقدة
    const labelText = node.label_ar || node.label;
    ctx.save();
    ctx.font = 'bold 10.5px system-ui, sans-serif';
    const labelW = ctx.measureText(labelText).width + 14;
    const labelH = 20;
    const labelX = vPos.x - labelW / 2;
    const labelY = vPos.y + r * 1.1 + 8;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.roundRect(labelX, labelY, labelW, labelH, 5);
    ctx.fill();
    ctx.strokeStyle = isHovered ? color : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, vPos.x, labelY + labelH / 2);
    ctx.restore();
  }

  ctx.restore();
}

// ─── تفاعل الماوس ────────────────────────────────────

function screenToWorld(sx: number, sy: number) {
  return {
    x: (sx - pan.x) / zoom.value,
    y: (sy - pan.y) / zoom.value,
  };
}

function findNodeAt(sx: number, sy: number): SimulationNode | null {
  const { x, y } = screenToWorld(sx, sy);
  const time = performance.now();
  for (let i = nodes.value.length - 1; i >= 0; i--) {
    const n = nodes.value[i];
    if (!n) continue;
    const vPos = getVisualPos(n, time);
    const r = n.type === 'agent' ? 26 : 21;
    const dx = vPos.x - x;
    const dy = vPos.y - y;
    if (dx * dx + dy * dy < r * r * 1.5) return n;
  }
  return null;
}

function onMouseDown(e: MouseEvent) {
  const rect = canvas.value?.getBoundingClientRect();
  if (!rect) return;
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const node = findNodeAt(sx, sy);
  if (node) {
    dragging.value = node.id;
    node.fx = node.x;
    node.fy = node.y;
    alpha = 0.4;
  } else {
    isPanning = true;
    lastMouse = { x: e.clientX, y: e.clientY };
  }
}

function onMouseMove(e: MouseEvent) {
  const rect = canvas.value?.getBoundingClientRect();
  if (!rect) return;
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const { x, y } = screenToWorld(sx, sy);
  mouseWorld.x = x;
  mouseWorld.y = y;

  if (dragging.value !== null) {
    const node = nodes.value.find((n) => n.id === dragging.value);
    if (node) {
      node.fx = x;
      node.fy = y;
      node.x = x;
      node.y = y;
    }
  } else if (isPanning) {
    pan.x += e.clientX - lastMouse.x;
    pan.y += e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };
  } else {
    const node = findNodeAt(sx, sy);
    hoveredNode.value = node;
    if (node) {
      tooltipPos.x = sx + 15;
      tooltipPos.y = sy - 10;
      if (canvas.value) canvas.value.style.cursor = 'pointer';
    } else {
      if (canvas.value) canvas.value.style.cursor = 'default';
    }
  }
}

function onMouseUp(e: MouseEvent) {
  if (dragging.value !== null) {
    const node = nodes.value.find((n) => n.id === dragging.value);
    if (node) {
      delete node.fx;
      delete node.fy;
      automation
        .updateNode(node.id, { position_x: node.x, position_y: node.y } as any)
        .catch(() => {});
    }
    dragging.value = null;
  } else if (!isPanning && e) {
    const rect = canvas.value?.getBoundingClientRect();
    if (rect) {
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const node = findNodeAt(sx, sy);
      if (node) {
        selectNode(node);
      }
    }
  }
  isPanning = false;
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  const newZoom = Math.max(0.25, Math.min(3.5, zoom.value * factor));
  const rect = canvas.value?.getBoundingClientRect();
  if (rect) {
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    pan.x = mx - ((mx - pan.x) / zoom.value) * newZoom;
    pan.y = my - ((my - pan.y) / zoom.value) * newZoom;
  }
  zoom.value = newZoom;
}

function onDoubleClick() {
  resetView();
}

// ─── تفاعل اللمس على الكانفاس (Mobile Touch Interactions) ───

let touchStartDistance = 0;
let initialZoom = 1;
let touchStartTime = 0;
let lastTouchPos = { x: 0, y: 0 };
let hasTouchMoved = false;

function getTouchPos(touch: Touch) {
  const rect = canvas.value?.getBoundingClientRect();
  if (!rect) return { sx: 0, sy: 0 };
  return {
    sx: touch.clientX - rect.left,
    sy: touch.clientY - rect.top,
  };
}

function getTouchesDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 1 && e.touches[0]) {
    const touch = e.touches[0];
    const { sx, sy } = getTouchPos(touch);
    touchStartTime = performance.now();
    hasTouchMoved = false;
    lastTouchPos = { x: touch.clientX, y: touch.clientY };

    const node = findNodeAt(sx, sy);
    if (node) {
      dragging.value = node.id;
      node.fx = node.x;
      node.fy = node.y;
      alpha = 0.4;
    } else {
      isPanning = true;
    }
  } else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
    // بدء قرصة التكبير/التصغير (Pinch Zoom)
    isPanning = false;
    dragging.value = null;
    touchStartDistance = getTouchesDistance(e.touches[0], e.touches[1]);
    initialZoom = zoom.value;
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 1 && e.touches[0]) {
    const touch = e.touches[0];
    const { sx, sy } = getTouchPos(touch);
    const { x, y } = screenToWorld(sx, sy);
    mouseWorld.x = x;
    mouseWorld.y = y;

    const dx = touch.clientX - lastTouchPos.x;
    const dy = touch.clientY - lastTouchPos.y;
    if (Math.hypot(dx, dy) > 3) {
      hasTouchMoved = true;
    }

    if (dragging.value !== null) {
      const node = nodes.value.find((n) => n.id === dragging.value);
      if (node) {
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
      }
    } else if (isPanning) {
      pan.x += dx;
      pan.y += dy;
    }
    lastTouchPos = { x: touch.clientX, y: touch.clientY };
  } else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
    // تحديث التكبير بالقرصة (Pinch to Zoom)
    const currentDist = getTouchesDistance(e.touches[0], e.touches[1]);
    if (touchStartDistance > 0) {
      const scaleFactor = currentDist / touchStartDistance;
      const targetZoom = Math.max(0.25, Math.min(3.5, initialZoom * scaleFactor));

      const rect = canvas.value?.getBoundingClientRect();
      if (rect) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        pan.x = midX - ((midX - pan.x) / zoom.value) * targetZoom;
        pan.y = midY - ((midY - pan.y) / zoom.value) * targetZoom;
      }
      zoom.value = targetZoom;
    }
  }
}

function onTouchEnd(e: TouchEvent) {
  const touchDuration = performance.now() - touchStartTime;

  if (dragging.value !== null) {
    const node = nodes.value.find((n) => n.id === dragging.value);
    if (node) {
      delete node.fx;
      delete node.fy;
      automation
        .updateNode(node.id, { position_x: node.x, position_y: node.y } as any)
        .catch(() => {});
    }
    dragging.value = null;
  }

  // إذا كانت نقرة لمس سريعة بدون سحب على عقدة، نفتح تفاصيل العقدة
  if (
    !hasTouchMoved &&
    touchDuration < 350 &&
    e.changedTouches.length === 1 &&
    e.changedTouches[0]
  ) {
    const touch = e.changedTouches[0];
    const { sx, sy } = getTouchPos(touch);
    const node = findNodeAt(sx, sy);
    if (node) {
      selectNode(node);
    }
  }

  isPanning = false;
  touchStartDistance = 0;
}

// ─── التحكم في العرض والتخطيط ────────────────────────

function zoomIn() {
  zoom.value = Math.min(3.5, zoom.value * 1.2);
}

function zoomOut() {
  zoom.value = Math.max(0.25, zoom.value * 0.8);
}

function resetView() {
  pan.x = 0;
  pan.y = 0;
  zoom.value = 1;
  alpha = 0.5;
}

function applyTreeLayout() {
  const triggers = nodes.value.filter((n) => n.type === 'trigger');
  const actions = nodes.value.filter((n) => n.type === 'action');
  const agents = nodes.value.filter((n) => n.type === 'agent');

  triggers.forEach((n, idx) => {
    n.x = -400;
    n.y = (idx - triggers.length / 2) * 160 + 80;
  });
  actions.forEach((n, idx) => {
    n.x = 0;
    n.y = (idx - actions.length / 2) * 160 + 80;
  });
  agents.forEach((n, idx) => {
    n.x = 350;
    n.y = (idx - agents.length / 2) * 140 + 70;
  });

  alpha = 0.3;
}

function applyCircularLayout() {
  const count = nodes.value.length;
  const radius = 280;
  nodes.value.forEach((n, idx) => {
    const theta = (idx / count) * Math.PI * 2;
    n.x = Math.cos(theta) * radius;
    n.y = Math.sin(theta) * radius;
  });
  alpha = 0.3;
}

function applyForceLayout() {
  alpha = 1;
}

function toggleSimulation() {
  isSimulating.value = !isSimulating.value;
  if (isSimulating.value) {
    alpha = 0.4;
  }
}

// ─── الإعدادات والفيزياء ──────────────────────────────

let physicsTimer: number | null = null;
function onPhysicsChange() {
  alpha = 0.4;
  if (physicsTimer) clearTimeout(physicsTimer);
  physicsTimer = window.setTimeout(() => {
    automation.updatePhysics({ ...physics }).catch(() => {});
  }, 600);
}

function onGravityChange() {
  physics.centerForceY = physics.centerForceX;
  onPhysicsChange();
}

// ─── تليجرام وإرسال الرسائل ──────────────────────────

async function toggleTelegram() {
  togglingTelegram.value = true;
  try {
    const newState = !telegramActive.value;
    await automation.toggleTelegramBot(newState);
    telegramActive.value = newState;
  } catch (err) {
    console.error('فشل تبديل حالة البوت:', err);
  } finally {
    togglingTelegram.value = false;
  }
}

async function sendTestTelegram() {
  sendingTelegramTest.value = true;
  telegramSendFeedback.value = null;
  try {
    const res = await automation.sendTestMessage(customTelegramMsg.value.trim() || undefined);
    telegramSendFeedback.value = {
      type: 'success',
      text: (res as any)?.message || 'تم إرسال الرسالة إلى تليجرام بنجاح! ✅',
    };
    customTelegramMsg.value = '';
    await refreshLogs();
  } catch (err: any) {
    telegramSendFeedback.value = {
      type: 'error',
      text: err.message || 'تعذر إرسال الرسالة، تأكد من الاتصال بالإنترنت وصحة التوكن.',
    };
  } finally {
    sendingTelegramTest.value = false;
  }
}

// ─── اختبار الذكاء الاصطناعي ─────────────────────────

async function runAiTest() {
  if (!aiTestPrompt.value.trim() || testingAi.value) return;
  testingAi.value = true;
  aiTestReply.value = '';
  try {
    const res = await automation.testAiPrompt(aiTestPrompt.value.trim());
    aiTestReply.value = (res as any)?.data?.reply || 'تم استلام رد فارغ من النموذج.';
  } catch (err: any) {
    aiTestReply.value = `خطأ أثناء الاستعلام: ${err.message || 'يرجى التحقق من اتصال Gemini API'}`;
  } finally {
    testingAi.value = false;
  }
}

// ─── إدارة العقد والروابط ────────────────────────────

function selectNode(node: SimulationNode) {
  selectedNode.value = JSON.parse(JSON.stringify(node));
}

async function saveSelectedNode() {
  if (!selectedNode.value) return;
  const id = selectedNode.value.id;
  const idx = nodes.value.findIndex((n) => n.id === id);
  if (idx !== -1) {
    nodes.value[idx] = { ...nodes.value[idx], ...selectedNode.value };
    await automation
      .updateNode(id, {
        label: selectedNode.value.label,
        label_ar: selectedNode.value.label_ar || undefined,
        group_name: selectedNode.value.group,
        settings: selectedNode.value.settings,
      })
      .catch(() => {});
  }
  selectedNode.value = null;
}

async function deleteNode(id: number) {
  if (confirm('هل أنت متأكد من حذف هذه العقدة وكافة روابطها؟')) {
    nodes.value = nodes.value.filter((n) => n.id !== id);
    edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
    if (selectedNode.value?.id === id) selectedNode.value = null;
    await automation.deleteNode(id).catch(() => {});
  }
}

function openAddNodeModal() {
  newNode.type = 'agent';
  newNode.label = '';
  newNode.label_ar = '';
  newNode.group_name = 'operations';
  showAddNodeModal.value = true;
}

async function submitAddNode() {
  try {
    const res = await automation.createNode({
      type: newNode.type as any,
      label: newNode.label,
      label_ar: newNode.label_ar,
      group_name: newNode.group_name,
      position_x: (Math.random() - 0.5) * 200,
      position_y: (Math.random() - 0.5) * 200,
    });
    if ((res as any)?.data) {
      nodes.value.push({ ...(res as any).data, vx: 0, vy: 0 });
    }
    showAddNodeModal.value = false;
    alpha = 0.5;
  } catch (err) {
    console.error('فشل إضافة العقدة:', err);
  }
}

function openAddEdgeModal() {
  if (nodes.value.length < 2) return;
  newEdge.source_node_id = nodes.value[0]?.id || 0;
  newEdge.target_node_id = nodes.value[1]?.id || 0;
  newEdge.label = '';
  showAddEdgeModal.value = true;
}

async function submitAddEdge() {
  try {
    const res = await automation.createEdge({
      source_node_id: newEdge.source_node_id,
      target_node_id: newEdge.target_node_id,
      label: newEdge.label || undefined,
    });
    if ((res as any)?.data) {
      edges.value.push({
        id: (res as any).data.id,
        source: newEdge.source_node_id,
        target: newEdge.target_node_id,
        condition: null,
        label: newEdge.label || null,
      });
    }
    showAddEdgeModal.value = false;
    alpha = 0.4;
  } catch (err) {
    console.error('فشل إنشاء الرابط:', err);
  }
}

async function resetToDefaultGraph() {
  if (confirm('هل ترغب في إعادة ضبط كافة العقد والروابط إلى الهيكل القياسي المعتمد للنظام؟')) {
    loading.value = true;
    try {
      const res = await automation.resetGraphDefaults();
      if ((res as any)?.data) {
        nodes.value = (res as any).data.nodes.map((n: GraphNode) => ({ ...n, vx: 0, vy: 0 }));
        edges.value = (res as any).data.edges || [];
      } else {
        nodes.value = JSON.parse(JSON.stringify(DEFAULT_SEED_NODES));
        edges.value = JSON.parse(JSON.stringify(DEFAULT_SEED_EDGES));
      }
      resetView();
    } catch {
      nodes.value = JSON.parse(JSON.stringify(DEFAULT_SEED_NODES));
      edges.value = JSON.parse(JSON.stringify(DEFAULT_SEED_EDGES));
      resetView();
    } finally {
      loading.value = false;
    }
  }
}

// ─── أدوات مساعدة ────────────────────────────────────

function truncate(str: string, max: number) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function formatTime(ts: string) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style lang="scss" scoped>
.automation-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--navbar-height) - 36px);
  gap: 12px;
  direction: rtl;
  position: relative;
}

/* ─── Header & Actions ─── */
.glass-header {
  background: var(--header-bg);
  border: 1px solid var(--card-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 18px;
  border-radius: var(--radius-lg);

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;

    .header-icon {
      font-size: 1.6rem;
      flex-shrink: 0;
    }

    .title-text-wrap {
      h2 {
        font-size: 1.05rem;
        font-weight: 900;
        color: var(--text-strong);
        margin: 0;
        line-height: 1.25;
      }

      p {
        font-size: 0.78rem;
        color: var(--text-muted);
        margin: 2px 0 0;
        line-height: 1.35;
      }
    }
  }
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    white-space: nowrap;
    border-radius: var(--radius-sm);
  }
}

/* ─── Live command dashboard ─── */
.automation-command-dashboard {
  display: grid;
  grid-template-columns: minmax(230px, 1.25fr) repeat(3, minmax(130px, 0.7fr)) minmax(220px, 1.4fr);
  gap: 10px;
  direction: rtl;
}

.command-status-card,
.command-metric-card,
.command-timeline-card {
  min-height: 82px;
  padding: 12px 14px;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  background: var(--header-bg);
  box-shadow: var(--shadow-sm);
}

.command-status-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  border-color: color-mix(in srgb, var(--primary) 36%, var(--card-border));

  .status-pulse {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--text-muted) 35%, transparent);
  }

  &.is-healthy .status-pulse {
    background: var(--success, #16a34a);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--success, #16a34a) 14%, transparent);
    animation: automation-pulse 2.2s ease-in-out infinite;
  }

  &.is-warning .status-pulse {
    background: var(--danger, #dc2626);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--danger, #dc2626) 14%, transparent);
  }

  small,
  strong {
    display: block;
  }

  small {
    color: var(--text-muted);
    font-size: 0.72rem;
  }
  strong {
    color: var(--text-strong);
    font-size: 0.92rem;
    margin-top: 4px;
  }
  .status-caption {
    color: var(--text-muted);
    font-size: 0.7rem;
    white-space: nowrap;
  }
}

.command-metric-card {
  small {
    display: block;
    color: var(--text-muted);
    font-size: 0.72rem;
  }
  strong {
    display: block;
    color: var(--text-strong);
    font-size: 1.35rem;
    line-height: 1.1;
    margin: 7px 0 3px;
  }
  span {
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  &.danger strong {
    color: var(--danger, #dc2626);
  }
  &.accent strong {
    color: var(--accent, #b45309);
  }
}

.command-timeline-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .timeline-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .timeline-heading strong {
    color: var(--text-strong);
    font-size: 0.78rem;
  }
  .timeline-heading span {
    color: var(--text-muted);
    font-size: 0.68rem;
  }
  .timeline-track {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 16px;
  }
  .timeline-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--text-muted);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--text-muted) 12%, transparent);
  }
  .timeline-dot.status-success {
    background: var(--success, #16a34a);
  }
  .timeline-dot.status-failed {
    background: var(--danger, #dc2626);
  }
  .timeline-dot.status-warning {
    background: var(--warning, #d97706);
  }
  .timeline-dot.status-running {
    background: var(--primary);
    animation: automation-pulse 1.3s ease-in-out infinite;
  }
  .timeline-empty {
    color: var(--text-muted);
    font-size: 0.7rem;
  }
}

@keyframes automation-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.18);
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .automation-command-dashboard * {
    animation: none !important;
    transition: none !important;
  }
}

/* ─── Mobile View Switcher (Segmented Tab Bar) ─── */
.mobile-view-switcher {
  display: none;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 4px;
  gap: 6px;
  margin-bottom: 2px;

  .switcher-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 12px;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    font-size: 0.84rem;
    font-weight: 800;
    color: var(--text-muted);
    cursor: pointer;
    transition: all var(--transition);
    min-height: 44px;

    .switcher-icon {
      font-size: 1rem;
    }

    &.active {
      background: var(--bg-card);
      color: var(--primary-strong);
      box-shadow: var(--shadow-sm);
      border: 1px solid var(--card-border);
    }
  }
}

/* ─── Main Graph Layout ─── */
.graph-layout {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
  width: 100%;
  position: relative;
}

.graph-panel {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--card-border);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
}

/* ─── Canvas Floating Controls ─── */
.canvas-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;

  button {
    width: 36px;
    height: 36px;
    min-width: 36px;
    min-height: 36px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated, #fff);
    border: 1px solid var(--border);
    color: var(--text-strong);
    font-weight: 800;
    font-size: 0.95rem;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    user-select: none;

    &:hover {
      background: var(--primary-soft);
      color: var(--primary-strong);
      transform: scale(1.05);
    }

    &:active {
      transform: scale(0.95);
    }

    &.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary-strong);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
    }
  }
}

/* ─── Graph Legend ─── */
.graph-legend {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: var(--bg-elevated, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  z-index: 10;
  box-shadow: var(--shadow-md);
  max-width: 260px;

  .legend-items-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }
}

.legend-header-mobile {
  display: none;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
  font-weight: 900;
  font-size: 0.82rem;
  color: var(--text-strong);

  .legend-close-btn {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px 6px;
  }
}

/* ─── Node Quick Tooltip ─── */
.node-tooltip {
  position: absolute;
  background: var(--bg-elevated, #1e293b);
  color: var(--text-strong, #fff);
  padding: 9px 12px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  max-width: 260px;

  .tooltip-type {
    font-size: 0.72rem;
    opacity: 0.75;
    margin-top: 2px;
  }

  .tooltip-rule {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.75rem;
    color: var(--warning);
  }

  .tooltip-hint {
    display: block;
    margin-top: 4px;
    font-size: 0.68rem;
    color: var(--accent);
  }
}

.graph-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.85);
  z-index: 20;

  .spinner {
    width: 26px;
    height: 26px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

/* ─── Settings Side Panel ─── */
.settings-panel {
  width: 360px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--card-border);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
}

.panel-tabs {
  display: flex;
  gap: 4px;
  background: var(--surface-2);
  padding: 4px;
  border-radius: var(--radius-md);
  margin-bottom: 14px;

  button {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px 4px;
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--text-muted);
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition: all var(--transition);
    white-space: nowrap;

    &.active {
      background: var(--bg-card);
      color: var(--primary-strong);
      box-shadow: var(--shadow-xs);
    }
  }
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 14px;

  h3 {
    font-size: 0.95rem;
    font-weight: 900;
    color: var(--text-strong);
    margin: 0;
  }

  .tab-desc {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.45;
  }
}

/* Tasks Tab Styles */
.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.tasks-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all var(--transition);

  &.disabled {
    opacity: 0.65;
    background: var(--surface-1, #f8fafc);
  }

  &.security {
    border-right: 4px solid var(--danger);
  }
  &.sales {
    border-right: 4px solid var(--success);
  }
  &.inventory {
    border-right: 4px solid var(--info);
  }
  &.system {
    border-right: 4px solid var(--accent);
  }

  .task-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .task-title-group {
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
      font-size: 0.88rem;
      color: var(--text-strong);
      line-height: 1.3;
    }
  }

  .task-category-badge {
    font-size: 0.68rem;
    font-weight: 800;
    color: var(--text-muted);
  }

  .task-desc-text {
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.45;
    margin: 0;
  }

  .task-card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .task-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.72rem;
    color: var(--text-muted);

    .last-run {
      color: var(--primary);
      font-weight: 700;
    }
  }

  .run-now-btn {
    font-weight: 800;
    white-space: nowrap;
    min-height: 32px;
  }

  .task-feedback-toast {
    margin-top: 4px;
    padding: 4px 8px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #059669;
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
    font-weight: 700;
  }
}

.toggle-btn-mini {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 32px;

  .toggle-track-mini {
    display: block;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--border);
    position: relative;
    transition: background 0.3s;

    .toggle-thumb-mini {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s;
    }
  }

  &.active .toggle-track-mini {
    background: var(--success, #10b981);
    .toggle-thumb-mini {
      transform: translateX(-16px);
    }
  }
}

.setting-group {
  label {
    display: block;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--primary);
    min-height: 28px;
  }

  .setting-value {
    display: block;
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--primary-strong);
    margin-top: 2px;
    text-align: center;
  }
}

.layout-presets {
  margin-top: 10px;

  h4 {
    font-size: 0.85rem;
    font-weight: 800;
    margin-bottom: 8px;
  }

  .preset-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 6px;

    .btn {
      min-height: 36px;
      justify-content: center;
    }
  }
}

/* ─── Telegram Tab Styles ─── */
.bot-status-card {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);

  &.online {
    background: rgba(16, 185, 129, 0.08);
    border-color: rgba(16, 185, 129, 0.3);
    color: #10b981;
    .status-badge-dot {
      background: #10b981;
    }
  }

  &.offline {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
    .status-badge-dot {
      background: #ef4444;
    }
  }

  .status-top {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }

  .status-badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: 0.75rem;

    code {
      background: var(--surface-2);
      padding: 2px 6px;
      border-radius: 4px;
      overflow-wrap: anywhere;
      word-break: break-all;
      font-size: 0.72rem;
    }
  }
}

.toggle-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  gap: 10px;
}

.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  min-width: 52px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  .toggle-track {
    display: block;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: var(--border);
    position: relative;
    transition: background 0.3s;

    .toggle-thumb {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s;
    }
  }

  &.active .toggle-track {
    background: var(--success, #10b981);
    .toggle-thumb {
      transform: translateX(-20px);
    }
  }
}

.telegram-test-box,
.ai-test-box {
  background: var(--surface-2);
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);

  h4 {
    font-size: 0.82rem;
    font-weight: 800;
    margin-bottom: 8px;
  }

  textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    font-family: inherit;
    font-size: 0.82rem;
    margin-bottom: 8px;
    background: var(--bg-card);
    color: var(--text);
    resize: vertical;
  }

  .send-feedback {
    display: block;
    margin-top: 6px;
    font-size: 0.78rem;
    font-weight: 700;

    &.success {
      color: #10b981;
    }
    &.error {
      color: #ef4444;
    }
  }
}

.rules-summary-cards {
  h4 {
    font-size: 0.82rem;
    font-weight: 800;
    margin-bottom: 6px;
  }

  .rule-card {
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    font-size: 0.78rem;
    margin-bottom: 6px;
    color: var(--text);
  }
}

.ai-reply-box {
  margin-top: 8px;
  background: var(--bg-card);
  border: 1px solid var(--primary-soft);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 0.82rem;
  line-height: 1.5;

  strong {
    color: var(--primary-strong);
    display: block;
    margin-bottom: 4px;
  }

  p {
    margin: 0;
  }
}

.logs-section {
  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    h4 {
      font-size: 0.85rem;
      font-weight: 800;
      margin: 0;
    }
  }

  .telegram-logs-list {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .log-item {
    background: var(--surface-2);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.78rem;

    .log-top {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .log-badge {
      font-weight: 800;
      font-size: 0.7rem;
    }

    .log-time {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .log-text {
      margin: 0;
      color: var(--text-strong);
      word-break: break-word;
    }

    .log-ai {
      margin: 4px 0 0;
      font-size: 0.72rem;
      color: var(--primary-strong);
    }
  }
}

.nodes-scroll-list {
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.node-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition);

  &:hover {
    background: var(--surface-3);
    transform: translateX(-3px);
  }

  .node-badge-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .node-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;

    strong {
      font-size: 0.82rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    small {
      font-size: 0.72rem;
      color: var(--text-muted);
    }
  }

  .delete-btn {
    padding: 2px 6px;
  }
}

/* ─── Modals ─── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  width: min(460px, 94vw);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 18px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;

  h3 {
    font-size: 1rem;
    font-weight: 900;
    margin: 0;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--text-muted);
    padding: 4px 8px;
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;

    label {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    input,
    select {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      background: var(--surface-2);
      color: var(--text);
      font-family: inherit;
      font-size: 0.88rem;
      min-height: 44px;
    }
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  .btn {
    min-height: 38px;
  }
}

.btn-block {
  width: 100%;
}

.btn-xs {
  padding: 4px 8px;
  font-size: 0.72rem;
  border-radius: 4px;
}

/* ─── Animations ─── */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.sparkles-anim {
  display: inline-block;
  animation: rotateSparkle 4s linear infinite;
}

@keyframes rotateSparkle {
  0% {
    transform: scale(1) rotate(0deg);
  }
  50% {
    transform: scale(1.15) rotate(180deg);
  }
  100% {
    transform: scale(1) rotate(360deg);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ══════════════════════════════════════════════════════════════
   MEDIA QUERIES (Mobile & Tablet Responsiveness)
   ══════════════════════════════════════════════════════════════ */

@media (min-width: 1024px) {
  .mobile-only-block,
  .mobile-only-btn,
  .mobile-only-flex {
    display: none !important;
  }
}

@media (max-width: 1023px) {
  .automation-container {
    height: auto;
    min-height: calc(100dvh - var(--navbar-height) - 24px);
  }

  .automation-command-dashboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .command-status-card,
  .command-timeline-card {
    grid-column: span 2;
  }

  .desktop-only-btn {
    display: none !important;
  }

  .mobile-only-block {
    display: flex !important;
  }

  .mobile-only-btn {
    display: flex !important;
  }

  .mobile-only-flex {
    display: flex !important;
  }

  .graph-layout {
    flex-direction: column;
    min-height: calc(100dvh - var(--navbar-height) - 180px);
  }

  .graph-panel {
    width: 100%;
    height: 70vh;
    min-height: 480px;

    &.mobile-hidden {
      display: none !important;
    }

    &.mobile-view-active {
      display: flex !important;
      flex: 1;
      height: 72vh;
    }
  }

  .settings-panel {
    width: 100%;
    max-height: none;

    &.mobile-hidden {
      display: none !important;
    }

    &.mobile-view-active {
      display: flex !important;
      width: 100%;
    }
  }

  /* Horizontal Scrollable Tabs on Mobile */
  .panel-tabs {
    overflow-x: auto;
    white-space: nowrap;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding: 6px;
    gap: 6px;

    &::-webkit-scrollbar {
      display: none;
    }

    button {
      flex: 0 0 auto;
      padding: 8px 14px;
      font-size: 0.82rem;
      border-radius: var(--radius-sm);
    }
  }

  /* Canvas Controls Position on Tablet/Mobile */
  .canvas-controls {
    top: 10px;
    left: 10px;
    flex-direction: row;
    flex-wrap: wrap;
    max-width: calc(100% - 20px);
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(8px);
    padding: 4px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);

    button {
      width: 38px;
      height: 38px;
      min-width: 38px;
      min-height: 38px;
    }
  }

  /* Collapsible Legend Drawer on Mobile */
  .graph-legend {
    display: none;
    bottom: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
    background: var(--bg-elevated, #fff);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);

    &.mobile-open {
      display: flex;
    }
  }
}

@media (max-width: 560px) {
  .automation-command-dashboard {
    grid-template-columns: 1fr;
  }

  .command-status-card,
  .command-timeline-card {
    grid-column: span 1;
  }
}

@media (max-width: 767px) {
  .page-header {
    padding: 10px 14px;

    .header-title {
      width: 100%;

      .title-text-wrap h2 {
        font-size: 0.96rem;
      }
    }
  }

  .header-actions {
    width: 100%;
    justify-content: stretch;

    .btn {
      flex: 1 1 calc(50% - 6px);
      justify-content: center;
      min-height: 38px;
      font-size: 0.78rem;
    }
  }

  .graph-panel {
    height: 64vh;
    min-height: 420px;

    &.mobile-view-active {
      height: 66vh;
    }
  }

  .modal-card {
    width: 95vw;
    padding: 14px;
  }
}

@media (max-width: 480px) {
  .header-actions {
    .btn {
      flex: 1 1 100%;
    }
  }

  .mobile-view-switcher .switcher-btn {
    font-size: 0.78rem;
    padding: 8px 6px;
  }

  .task-card .task-card-footer {
    flex-direction: column;
    align-items: stretch;

    .run-now-btn {
      width: 100%;
    }
  }
}
</style>
