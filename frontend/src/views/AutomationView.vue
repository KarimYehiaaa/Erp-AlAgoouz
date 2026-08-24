<template>
  <div class="automations-page">
    <!-- ═══════════════════ Header الرئيسي الفاخر ═══════════════════ -->
    <div class="page-header card">
      <div class="header-title">
        <div class="header-icon-wrap">
          <span class="header-icon">⚡</span>
          <span class="pulse-ring"></span>
        </div>
        <div>
          <h2>استوديو واللوحة التفاعلية للأتمتة الذكية</h2>
          <p>خريطة التدفق الحي، مسارات التشغيل التلقائي، إنذارات الرقابة، وبوت تليجرام الفوري</p>
        </div>
      </div>

      <div class="header-actions">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="isLoading"
          @click="fetchAutomations"
          title="تحديث البيانات"
        >
          <AppIcon name="refresh" :size="16" />
          <span>تحديث</span>
        </button>

        <button
          type="button"
          class="btn btn-warning-soft"
          :disabled="isFiringAll"
          @click="triggerAllAutomations"
          title="إرسال نبضة فحص شاملة لكافة مسارات الشبكة"
        >
          <span>{{ isFiringAll ? 'جاري الفحص الشامل...' : '⚡ فحص الشبكة بالكامل' }}</span>
        </button>

        <button type="button" class="btn btn-primary" @click="showTelegramModal = true">
          <AppIcon name="settings" :size="16" />
          <span>إعدادات البوت والقنوات 📲</span>
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

    <!-- ═══════════════════ شريط الإحصائيات (Modern Glass Bento Cards) ═══════════════════ -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon bg-primary-soft">
          <span>⚡</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">المسارات المفعلة بالشبكة</span>
          <h3 class="stat-value">
            {{ activeCount }} <small>/ {{ automationsList.length }} مسار</small>
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
            <span>{{ isTelegramConfigured ? 'متصل ومستعد 24/7' : 'بحاجة للضبط' }}</span>
          </h3>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon bg-accent-soft">
          <span>📊</span>
        </div>
        <div class="stat-info">
          <span class="stat-label">تقرير الإغلاق القادم</span>
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

    <!-- ═══════════════════ اللوحة التفاعلية البصرية المطورة (Visual Matrix Hub) ═══════════════════ -->
    <div class="canvas-section-card card">
      <div class="canvas-toolbar">
        <div class="canvas-title-group">
          <div class="canvas-badge-live">
            <span class="live-dot"></span>
            <span>اللوحة التفاعلية الحية (Live Automation Neural Grid)</span>
          </div>
          <span class="canvas-subtitle">انقر على أي عقدة في اللوحة للمعاينة والتحكم الفوري</span>
        </div>

        <!-- أدوات التحكم في اللوحة -->
        <div class="canvas-controls-group">
          <!-- تبديل المنظور -->
          <div class="layout-toggle-pill">
            <button
              type="button"
              class="layout-btn"
              :class="{ active: canvasLayout === 'orbit' }"
              @click="canvasLayout = 'orbit'"
              title="توزيع مداري دائري متناسق"
            >
              🌐 مداري
            </button>
            <button
              type="button"
              class="layout-btn"
              :class="{ active: canvasLayout === 'matrix' }"
              @click="canvasLayout = 'matrix'"
              title="توزيع شبكي منظم"
            >
              🔀 شبكي
            </button>
          </div>

          <button
            type="button"
            class="btn btn-xs btn-outline"
            @click="pulseNetwork"
            title="إرسال موجة نبضية في مسارات الطاقة"
          >
            💫 إرسال موجة طاقة
          </button>

          <button
            type="button"
            class="btn btn-xs btn-outline"
            @click="selectedNodeId = null"
            v-if="selectedNodeId"
            title="إلغاء التحديد"
          >
            ✕ إلغاء التحديد
          </button>
        </div>
      </div>

      <!-- فلاتر الفئات على اللوحة -->
      <div class="canvas-categories-bar">
        <button
          v-for="cat in categoryTabs"
          :key="cat.key"
          type="button"
          class="canvas-cat-pill"
          :class="{ active: selectedCategory === cat.key }"
          @click="selectedCategory = cat.key"
        >
          <span>{{ cat.icon }}</span>
          <span>{{ cat.label }}</span>
          <span class="cat-pill-count">{{ getCategoryCount(cat.key) }}</span>
        </button>
      </div>

      <!-- مساحة الرسم التفاعلي SVG Matrix Viewport -->
      <div class="svg-canvas-container" :class="{ 'is-pulsing': isNetworkPulsing }">
        <svg
          class="automation-svg-board"
          viewBox="0 0 1000 620"
          preserveAspectRatio="xMidYMid meet"
        >
          <!-- التدرجات والأنماط المعرفة (Defs) -->
          <defs>
            <!-- خلفية النقاط الشبكية -->
            <pattern id="grid-dots" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="rgba(212, 163, 115, 0.12)" />
            </pattern>

            <!-- التدرج الشعاعي للمركز -->
            <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(212, 163, 115, 0.35)" />
              <stop offset="60%" stop-color="rgba(212, 163, 115, 0.08)" />
              <stop offset="100%" stop-color="rgba(0, 0, 0, 0)" />
            </radialGradient>

            <!-- تدرجات خطوط الطاقة -->
            <linearGradient id="gold-beam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#d4a373" stop-opacity="0.8" />
              <stop offset="50%" stop-color="#faedcd" stop-opacity="1" />
              <stop offset="100%" stop-color="#d4a373" stop-opacity="0.8" />
            </linearGradient>

            <linearGradient id="emerald-beam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#22c55e" stop-opacity="0.8" />
              <stop offset="50%" stop-color="#86efac" stop-opacity="1" />
              <stop offset="100%" stop-color="#22c55e" stop-opacity="0.8" />
            </linearGradient>

            <linearGradient id="amber-beam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8" />
              <stop offset="50%" stop-color="#fde047" stop-opacity="1" />
              <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.8" />
            </linearGradient>

            <!-- فلاتر التوهج النيون -->
            <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <!-- 1. خلفية الشبكة الهندسية -->
          <rect width="1000" height="620" fill="url(#grid-dots)" />
          <circle cx="500" cy="310" r="260" fill="url(#center-glow)" />

          <!-- الدوائر المدارية التوجيهية الناعمة -->
          <circle
            cx="500"
            cy="310"
            r="160"
            fill="none"
            stroke="rgba(212, 163, 115, 0.12)"
            stroke-width="1.5"
            stroke-dasharray="6,6"
          />
          <circle
            cx="500"
            cy="310"
            r="255"
            fill="none"
            stroke="rgba(212, 163, 115, 0.08)"
            stroke-width="1.5"
            stroke-dasharray="10,10"
          />

          <!-- 2. خطوط الطاقة الانسيابية المنحنية (Bézier Energy Conduits) -->
          <g class="conduits-layer">
            <template v-for="node in nodeLayouts" :key="`conduit-${node.id}`">
              <!-- خط الخلفية الخافت -->
              <path
                :d="generateConduitPath(500, 310, node.x, node.y)"
                fill="none"
                :stroke="
                  node.is_enabled ? 'rgba(212, 163, 115, 0.25)' : 'rgba(255, 255, 255, 0.06)'
                "
                stroke-width="2"
              />

              <!-- خط الطاقة المتدفق المتحرك للعقد النشطة -->
              <path
                v-if="node.is_enabled"
                :d="generateConduitPath(500, 310, node.x, node.y)"
                fill="none"
                :stroke="getCategoryColor(node.category)"
                stroke-width="2.5"
                stroke-linecap="round"
                class="energy-flowing-beam"
                :class="{
                  'active-selected': selectedNodeId === node.id,
                  'is-firing': triggeringId === node.id,
                }"
              />

              <!-- جزيئة الطاقة المتحركة على المسار -->
              <circle
                v-if="node.is_enabled"
                r="3.5"
                :fill="getCategoryColor(node.category)"
                filter="url(#glow-gold)"
                class="pulsing-energy-particle"
              >
                <animateMotion
                  :path="generateConduitPath(500, 310, node.x, node.y)"
                  :dur="getParticleSpeed(node.id)"
                  repeatCount="indefinite"
                />
              </circle>
            </template>
          </g>

          <!-- 3. العقدة المركزية: قلب بن العجوز الذكي (Central AI Core) -->
          <g
            class="central-core-node"
            transform="translate(500, 310)"
            @click="selectedNodeId = null"
          >
            <!-- حلقات النبض الدائرية المتوسعة -->
            <circle class="core-pulse-outer" r="54" />
            <circle class="core-pulse-middle" r="44" />
            <circle class="core-base-circle" r="36" />

            <!-- أيقونة ونص المركز -->
            <text text-anchor="middle" y="6" class="core-icon">☕</text>
            <text text-anchor="middle" y="55" class="core-label">محرك الأتمتة المركزي</text>
            <text text-anchor="middle" y="70" class="core-sublabel">
              {{ activeCount }} مسار نشط 24/7
            </text>
          </g>

          <!-- 4. محطات وعقد الأتمتة الموزعة (Automation Station Nodes) -->
          <g class="automation-nodes-layer">
            <g
              v-for="node in nodeLayouts"
              :key="`node-${node.id}`"
              class="automation-node-group"
              :class="{
                'is-selected': selectedNodeId === node.id,
                'is-disabled': !node.is_enabled,
                'is-firing': triggeringId === node.id,
                'is-dimmed': selectedCategory !== 'all' && node.category !== selectedCategory,
              }"
              :transform="`translate(${node.x}, ${node.y})`"
              @click.stop="handleNodeClick(node)"
            >
              <!-- هالة التحديد والتوهج عند التحديد أو التشغيل -->
              <circle
                v-if="selectedNodeId === node.id || triggeringId === node.id"
                r="38"
                class="node-selected-halo"
                :stroke="getCategoryColor(node.category)"
              />

              <!-- جسم العقدة الزجاجي المجسم -->
              <circle
                r="28"
                class="node-card-body"
                :fill="node.is_enabled ? '#20130b' : '#140c07'"
                :stroke="
                  node.is_enabled ? getCategoryColor(node.category) : 'rgba(255,255,255,0.15)'
                "
              />

              <!-- حلقة الحالة المضيئة -->
              <circle
                cx="18"
                cy="-18"
                r="6"
                class="node-status-dot"
                :fill="node.is_enabled ? '#22c55e' : '#6b7280'"
              />

              <!-- أيقونة العملية -->
              <text text-anchor="middle" y="6" class="node-icon">
                {{ getScenarioEmoji(node.key) }}
              </text>

              <!-- اسم العملية أسفل العقدة -->
              <rect
                :x="-Math.min(node.name_ar.length * 4.5, 65)"
                y="34"
                :width="Math.min(node.name_ar.length * 9, 130)"
                height="22"
                rx="6"
                class="node-title-bg"
              />
              <text text-anchor="middle" y="49" class="node-title-text">
                {{ formatNodeTitle(node.name_ar) }}
              </text>

              <!-- شارة نوع المحفز -->
              <text text-anchor="middle" y="66" class="node-trigger-text">
                {{ node.trigger_type === 'cron' ? '⏰ مجدول' : '⚡ حدث فوري' }}
              </text>
            </g>
          </g>
        </svg>

        <!-- ═══════════════════ بطاقة العقدة المحددة التفاعلية السريعة (HUD Node Card) ═══════════════════ -->
        <transition name="pop-in">
          <div v-if="selectedNode" class="node-hud-card">
            <div class="hud-header">
              <div class="hud-title-wrap">
                <span class="hud-emoji">{{ getScenarioEmoji(selectedNode.key) }}</span>
                <div>
                  <h4 class="hud-title">{{ selectedNode.name_ar }}</h4>
                  <div class="hud-badges">
                    <span :class="`category-pill ${selectedNode.category}`">
                      {{ getCategoryLabel(selectedNode.category) }}
                    </span>
                    <span class="trigger-type-pill" :class="selectedNode.trigger_type">
                      {{
                        selectedNode.trigger_type === 'cron'
                          ? '⏰ ' + formatCronHuman(selectedNode.cron_expression)
                          : '⚡ حدث فوري'
                      }}
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" class="hud-close-btn" @click="selectedNodeId = null">✕</button>
            </div>

            <p class="hud-desc">{{ selectedNode.description_ar }}</p>

            <div class="hud-meta-row">
              <div class="hud-meta-item">
                <span class="meta-lbl">الحالة:</span>
                <span :class="`status-tag ${selectedNode.is_enabled ? 'success' : 'failed'}`">
                  {{ selectedNode.is_enabled ? 'مفعل ونشط 🟢' : 'معطل مؤقتاً ⚪' }}
                </span>
              </div>
              <div class="hud-meta-item" v-if="selectedNode.last_run_at">
                <span class="meta-lbl">آخر تشغيل:</span>
                <span class="meta-val">{{ formatRelativeTime(selectedNode.last_run_at) }}</span>
              </div>
            </div>

            <div class="hud-actions-row">
              <button
                type="button"
                class="btn btn-sm btn-outline"
                @click="toggleAutomation(selectedNode)"
              >
                {{ selectedNode.is_enabled ? '⏸️ إيقاف مؤقت' : '▶️ تفعيل المسار' }}
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline"
                @click="openConfigModal(selectedNode)"
              >
                ⚙️ الإعدادات
              </button>

              <button
                type="button"
                class="btn btn-sm btn-primary"
                :disabled="triggeringId === selectedNode.id"
                @click="triggerTestRun(selectedNode)"
              >
                <span>{{
                  triggeringId === selectedNode.id ? 'جاري التنفيذ...' : '⚡ تشغيل فوري'
                }}</span>
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- ═══════════════════ استوديو مسارات الأتمتة (Automation Pipelines Studio) ═══════════════════ -->
    <div class="section-card card">
      <div class="section-header">
        <div class="section-title-wrap">
          <AppIcon name="cpu" :size="20" />
          <h3 class="text-lg font-black text-strong">
            مسارات الأتمتة التفصيلية (Workflow Pipelines)
          </h3>
        </div>

        <!-- 📂 تبويبات التصنيف الذكية -->
        <div class="category-filters-tabs">
          <button
            v-for="cat in categoryTabs"
            :key="cat.key"
            type="button"
            class="cat-tab-btn"
            :class="{ active: selectedCategory === cat.key }"
            @click="selectedCategory = cat.key"
          >
            <span class="tab-icon">{{ cat.icon }}</span>
            <span class="tab-label">{{ cat.label }}</span>
            <span class="tab-count">{{ getCategoryCount(cat.key) }}</span>
          </button>
        </div>
      </div>

      <!-- حالة التحميل -->
      <div v-if="isLoading" class="loading-state">
        <span class="spinner"></span>
        <span>جاري تحميل مسارات الأتمتة...</span>
      </div>

      <!-- شبكة بطاقات خطوط الأنابيب التفاعلية (Pipeline Flow Cards) -->
      <div v-else class="pipelines-grid">
        <div
          v-for="item in filteredAutomations"
          :key="item.id"
          class="pipeline-card"
          :class="{
            'is-disabled': !item.is_enabled,
            'is-firing': triggeringId === item.id,
            'is-selected-card': selectedNodeId === item.id,
          }"
          @click="selectedNodeId = item.id"
        >
          <!-- ترويسة الكارت -->
          <div class="pipeline-header">
            <div class="pipeline-title-group">
              <div class="pipeline-scenario-icon">
                {{ getScenarioEmoji(item.key) }}
              </div>
              <div>
                <h4 class="pipeline-name">{{ item.name_ar }}</h4>
                <div class="pipeline-badges-row">
                  <span :class="`category-pill ${item.category}`">
                    {{ getCategoryLabel(item.category) }}
                  </span>
                  <span class="trigger-type-pill" :class="item.trigger_type">
                    {{ item.trigger_type === 'cron' ? '⏰ مجدول دورياً' : '⚡ حدث فوري لحظي' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- مفتاح التشغيل والإيقاف السريع -->
            <div class="toggle-switch-wrap" @click.stop="toggleAutomation(item)">
              <div class="toggle-track" :class="{ 'is-on': item.is_enabled }">
                <div class="toggle-knob"></div>
              </div>
              <span class="toggle-status-text">{{ item.is_enabled ? 'مفعل' : 'معطل' }}</span>
            </div>
          </div>

          <!-- وصف المسار -->
          <p class="pipeline-desc">{{ item.description_ar }}</p>

          <!-- ═══════════════════ مسار التدفق البصري (4-Stage Visual Pipeline Flow) ═══════════════════ -->
          <div class="pipeline-flow-container">
            <!-- المرحلة 1: المحفز (Trigger) -->
            <div class="flow-step-node">
              <span class="node-badge trigger">1. المحفز</span>
              <div class="node-content">
                <span class="node-icon">{{ item.trigger_type === 'cron' ? '⏰' : '⚡' }}</span>
                <span class="node-text">{{ formatTriggerSummary(item) }}</span>
              </div>
            </div>

            <!-- موصل التدفق البصري 1 -->
            <div class="flow-connector">
              <div class="connector-line">
                <span class="pulse-dot"></span>
              </div>
            </div>

            <!-- المرحلة 2: الشروط والذكاء (Logic & Rules) -->
            <div class="flow-step-node">
              <span class="node-badge rule">2. الشروط والذكاء</span>
              <div class="node-content">
                <span class="node-icon">🧠</span>
                <span class="node-text">{{ formatLogicSummary(item) }}</span>
              </div>
            </div>

            <!-- موصل التدفق البصري 2 -->
            <div class="flow-connector">
              <div class="connector-line">
                <span class="pulse-dot"></span>
              </div>
            </div>

            <!-- المرحلة 3: الإجراء (Action) -->
            <div class="flow-step-node">
              <span class="node-badge action">3. الإجراء</span>
              <div class="node-content">
                <span class="node-icon">🚀</span>
                <span class="node-text">{{ formatActionSummary(item) }}</span>
              </div>
            </div>

            <!-- موصل التدفق البصري 3 -->
            <div class="flow-connector">
              <div class="connector-line">
                <span class="pulse-dot"></span>
              </div>
            </div>

            <!-- المرحلة 4: قنوات التوزيع (Delivery) -->
            <div class="flow-step-node">
              <span class="node-badge channel">4. القنوات</span>
              <div class="node-content channels-list">
                <span
                  class="chan-pill"
                  :class="{ active: item.channels?.telegram }"
                  title="إشعار عبر تليجرام"
                >
                  📲 تليجرام
                </span>
                <span
                  class="chan-pill"
                  :class="{ active: item.channels?.in_app }"
                  title="إشعار داخل النظام"
                >
                  🔔 داخلي
                </span>
              </div>
            </div>
          </div>

          <!-- تذييل الكارت والإجراءات السريعة -->
          <div class="pipeline-footer">
            <div class="last-run-info">
              <span v-if="item.last_run_at">
                آخر تشغيل: <b>{{ formatRelativeTime(item.last_run_at) }}</b>
                <span
                  :class="`status-tag ${item.last_status === 'success' ? 'success' : 'failed'}`"
                >
                  {{ item.last_status === 'success' ? 'نجح ✨' : 'فشل ❌' }}
                </span>
              </span>
              <span v-else class="text-muted text-xs">لم يتم التشغيل بعد</span>
            </div>

            <div class="pipeline-actions-group">
              <button
                type="button"
                class="btn btn-xs btn-outline"
                @click.stop="openConfigModal(item)"
                title="تعديل المواعيد والحدود والقنوات"
              >
                <AppIcon name="settings" :size="12" />
                <span>تعديل الإعدادات</span>
              </button>

              <button
                type="button"
                class="btn btn-xs btn-primary btn-trigger-test"
                :disabled="triggeringId === item.id"
                @click.stop="triggerTestRun(item)"
                title="تشغيل تجريبي فوري لهذا المسار"
              >
                <AppIcon name="play" :size="12" />
                <span>{{ triggeringId === item.id ? 'جاري التنفيذ...' : '⚡ تشغيل فوري' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════════════ سجل عمليات وتشغيل الأتمتة (Live Execution Logs) ═══════════════════ -->
    <div class="section-card card">
      <div class="section-header">
        <div class="flex items-center gap-2">
          <AppIcon name="invoices" :size="20" />
          <h3 class="text-lg font-black text-strong">
            سجل العمليات والإنذارات اللحظية (Automation Live Stream)
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
              <th style="width: 240px">المسار والحدث</th>
              <th style="width: 110px">الحالة</th>
              <th>ملخص الرسالة والنتيجة</th>
              <th style="width: 100px; text-align: center">معاينة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!logsList.length">
              <td colspan="5" class="text-center py-6 text-muted">
                لا توجد سجلات تشغيل بعد. جرب الضغط على "⚡ تشغيل فوري" لأي مسار أعلاه.
              </td>
            </tr>
            <tr v-for="log in visibleLogs" :key="log.id" class="log-row">
              <td class="text-xs font-bold text-muted">
                {{ formatDateTime(log.created_at) }}
              </td>
              <td>
                <div class="flex items-center gap-2">
                  <span class="scenario-mini-emoji">{{
                    getScenarioEmoji(log.automation_key || log.event_name)
                  }}</span>
                  <span class="text-sm font-extrabold text-strong">{{
                    log.automation_name || log.event_name
                  }}</span>
                </div>
              </td>
              <td>
                <span :class="`badge-status ${log.status}`">
                  {{
                    log.status === 'success'
                      ? 'نجحت ✨'
                      : log.status === 'warning'
                        ? 'تنبيه ⚠️'
                        : 'فشلت ❌'
                  }}
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

    <!-- ═══════════════════ مودال تخصيص إعدادات المسار (Automation Config Modal) ═══════════════════ -->
    <div v-if="editingAutomation" class="modal-overlay" @click.self="editingAutomation = null">
      <div class="modal-box config-modal">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="text-xl">{{ getScenarioEmoji(editingAutomation.key) }}</span>
            <div>
              <h3 class="font-black text-base">إعدادات مسار: {{ editingAutomation.name_ar }}</h3>
              <span class="text-xs text-muted"
                >تخصيص مواعيد التشغيل وقنوات الإشعار والحدود الحاكمة</span
              >
            </div>
          </div>
          <button type="button" class="btn-close" @click="editingAutomation = null">✕</button>
        </div>

        <div class="modal-body">
          <!-- 1. تفعيل / تعطيل المسار -->
          <div class="form-group mb-3">
            <label class="form-label font-bold">حالة المسار:</label>
            <div class="flex items-center gap-3">
              <label class="radio-label">
                <input type="radio" :value="true" v-model="editingAutomation.is_enabled" />
                <span>مفعل ونشط 🟢</span>
              </label>
              <label class="radio-label">
                <input type="radio" :value="false" v-model="editingAutomation.is_enabled" />
                <span>معطل مؤقتاً ⚪</span>
              </label>
            </div>
          </div>

          <!-- 2. التوقيت المجدول إذا كان من نوع cron -->
          <div v-if="editingAutomation.trigger_type === 'cron'" class="form-group mb-3">
            <label class="form-label font-bold">توقيت التشغيل المجدول (Cron Expression):</label>
            <input
              v-model="editingAutomation.cron_expression"
              type="text"
              class="form-input font-mono text-sm"
              placeholder="مثال: 30 23 * * *"
            />
            <div class="cron-presets-row mt-2">
              <span class="text-xs text-muted">مواعيد سريعة:</span>
              <button
                type="button"
                class="btn btn-xs btn-outline"
                @click="editingAutomation.cron_expression = '30 23 * * *'"
              >
                يومياً 11:30 م
              </button>
              <button
                type="button"
                class="btn btn-xs btn-outline"
                @click="editingAutomation.cron_expression = '0 10,18 * * *'"
              >
                مرتين يومياً (10ص و 6م)
              </button>
              <button
                type="button"
                class="btn btn-xs btn-outline"
                @click="editingAutomation.cron_expression = '0 9 * * 1'"
              >
                كل إثنين 9:00 ص
              </button>
            </div>
          </div>

          <!-- 3. قنوات الإرسال -->
          <div class="form-group mb-4">
            <label class="form-label font-bold">قنوات الإشعار المعتمدة:</label>
            <div class="channels-checkbox-group">
              <label class="channel-check-item">
                <input type="checkbox" v-model="editingAutomation.channels.telegram" />
                <span>📲 بوت تليجرام الفوري</span>
              </label>

              <label class="channel-check-item">
                <input type="checkbox" v-model="editingAutomation.channels.in_app" />
                <span>🔔 إشعارات النظام الداخلية</span>
              </label>
            </div>
          </div>

          <!-- أزرار الإجراءات -->
          <div class="flex gap-2">
            <button type="button" class="btn btn-outline flex-1" @click="editingAutomation = null">
              إلغاء
            </button>
            <button
              type="button"
              class="btn btn-primary flex-1"
              :disabled="isSavingConfig"
              @click="saveAutomationConfig"
            >
              <span>{{ isSavingConfig ? 'جاري الحفظ...' : '💾 حفظ التعديلات' }}</span>
            </button>
          </div>
        </div>
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
            <p class="text-xs leading-relaxed">
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
import { ref, computed, onMounted } from 'vue';
import { automations as automationsApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';

const automationsList = ref<any[]>([]);
const logsList = ref<any[]>([]);
const isLoading = ref(false);
const triggeringId = ref<number | null>(null);
const isFiringAll = ref(false);

const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

const selectedCategory = ref<string>('all');
const showTelegramModal = ref(false);
const isTestingTelegram = ref(false);
const selectedLog = ref<any | null>(null);
const editingAutomation = ref<any | null>(null);
const isSavingConfig = ref(false);

// ─── اللوحة التفاعلية البصرية ───
const canvasLayout = ref<'orbit' | 'matrix'>('orbit');
const selectedNodeId = ref<number | null>(null);
const isNetworkPulsing = ref(false);

const showAllLogs = ref(false);
const logsPageSize = 15;
const visibleLogs = computed(() =>
  showAllLogs.value ? logsList.value : logsList.value.slice(0, logsPageSize),
);

const telegramForm = ref({
  botToken: '',
  chatId: '',
});

// ─── فئات وتصنيفات الأتمتة ───
const categoryTabs = [
  { key: 'all', label: 'كافة المسارات', icon: '🌟' },
  { key: 'sales', label: 'المبيعات والسيولة', icon: '☕' },
  { key: 'inventory', label: 'المخزون والتحميص والهدر', icon: '🫘' },
  { key: 'security', label: 'الرقابة والأمان والشيفت', icon: '🛡️' },
  { key: 'system', label: 'النظام والنسخ الاحتياطي', icon: '⚙️' },
];

const filteredAutomations = computed(() => {
  const list = Array.isArray(automationsList.value) ? automationsList.value : [];
  if (selectedCategory.value === 'all') return list;
  return list.filter((a) => a.category === selectedCategory.value);
});

const activeCount = computed(() => {
  const list = Array.isArray(automationsList.value) ? automationsList.value : [];
  return list.filter((a) => a.is_enabled).length;
});

const isTelegramConfigured = computed(() => {
  return Boolean(telegramForm.value.botToken && telegramForm.value.chatId);
});

const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null;
  const list = Array.isArray(automationsList.value) ? automationsList.value : [];
  return list.find((a) => a.id === selectedNodeId.value) || null;
});

const getCategoryCount = (catKey: string) => {
  const list = Array.isArray(automationsList.value) ? automationsList.value : [];
  if (catKey === 'all') return list.length;
  return list.filter((a) => a.category === catKey).length;
};

const getCategoryLabel = (category: string) => {
  const map: Record<string, string> = {
    sales: 'مبيعات وسيولة',
    inventory: 'مخزون وتحميص',
    security: 'رقابة وأمان',
    system: 'نظام وخادم',
    general: 'عام',
  };
  return map[category] || category;
};

const getCategoryColor = (category: string) => {
  const map: Record<string, string> = {
    sales: '#f59e0b',
    inventory: '#22c55e',
    security: '#ef4444',
    system: '#38bdf8',
    general: '#d4a373',
  };
  return map[category] || '#d4a373';
};

const getScenarioEmoji = (key: string) => {
  const map: Record<string, string> = {
    daily_sales_report: '📊',
    low_stock_alert: '🚨',
    void_invoice_alert: '⚠️',
    large_discount_alert: '💸',
    daily_backup_reminder: '🛡️',
    branch_stock_balancing: '🔄',
    cashflow_risk_shield: '💰',
    shift_handover_reconciliation: '💵',
    roastery_recipe_waste_guard: '🫘',
    supplier_payment_due_alert: '🚚',
    customer_loyalty_dormant_winback: '🎁',
    daily_profit_margin_anomaly: '📈',
  };
  return map[key] || '⚡';
};

const formatNodeTitle = (title: string) => {
  if (!title) return '';
  return title.length > 18 ? title.slice(0, 16) + '...' : title;
};

const getParticleSpeed = (id: number) => {
  const speeds = ['3.5s', '4.2s', '3.8s', '4.6s', '3.2s', '4s'];
  return speeds[id % speeds.length];
};

// ─── الحسابات الهندسية الدقيقة لمواقع العقد في اللوحة التفاعلية ───
const nodeLayouts = computed(() => {
  const list = Array.isArray(automationsList.value) ? automationsList.value : [];
  const count = list.length;
  if (!count) return [];

  const centerX = 500;
  const centerY = 310;

  if (canvasLayout.value === 'orbit') {
    // 🌐 مدار متناسق ثنائي الحلقات (Inner & Outer Orbit)
    const innerRadius = 175;
    const outerRadius = 265;

    return list.map((item, idx) => {
      const isOuter = idx % 2 === 1;
      const radius = isOuter ? outerRadius : innerRadius;
      const angleStep = (2 * Math.PI) / count;
      const angle = idx * angleStep - Math.PI / 2;

      const x = Math.round(centerX + radius * Math.cos(angle));
      const y = Math.round(centerY + radius * Math.sin(angle));

      return {
        ...item,
        x,
        y,
      };
    });
  } else {
    // 🔀 شبكي مصفوفي متوازن (Matrix Grid)
    const cols = Math.min(count, 4);
    const rows = Math.ceil(count / cols);
    const startX = 140;
    const endX = 860;
    const startY = 110;
    const endY = 520;
    const stepX = (endX - startX) / Math.max(cols - 1, 1);
    const stepY = (endY - startY) / Math.max(rows - 1, 1);

    return list.map((item, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = Math.round(startX + col * stepX);
      const y = Math.round(startY + row * stepY);

      return {
        ...item,
        x,
        y,
      };
    });
  }
});

// توليد مسار انسيابي سلس (Smooth Cubic Bézier Conduit)
const generateConduitPath = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx1 = x1 + dx * 0.35;
  const cy1 = y1 + dy * 0.15;
  const cx2 = x1 + dx * 0.65;
  const cy2 = y1 + dy * 0.85;

  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
};

const handleNodeClick = (node: any) => {
  selectedNodeId.value = node.id;
};

const pulseNetwork = () => {
  isNetworkPulsing.value = true;
  setTimeout(() => {
    isNetworkPulsing.value = false;
  }, 2500);
};

// ─── ملخص مراحل التدفق الأربعة (4-Stage Summaries) ───
const formatTriggerSummary = (item: any) => {
  if (item.trigger_type === 'cron') {
    return formatCronHuman(item.cron_expression);
  }
  if (item.key === 'void_invoice_alert') return 'عند إلغاء فاتورة مبيعات';
  if (item.key === 'large_discount_alert') return 'عند تطبيق خصم مرتفع';
  if (item.key === 'shift_handover_reconciliation') return 'عند إغلاق شيفت الكاشير';
  return 'حدث لحظي 24/7';
};

const formatLogicSummary = (item: any) => {
  if (item.key === 'daily_sales_report') return 'تجميع المبيعات والأرباح والمصروفات';
  if (item.key === 'low_stock_alert') return 'فحص خامات البن تحت حد الطلب';
  if (item.key === 'void_invoice_alert') return 'التحقق من هوية الكاشير وسبب الإلغاء';
  if (item.key === 'large_discount_alert') return 'مقارنة الخصم بالحد الأقصى (15%)';
  if (item.key === 'branch_stock_balancing') return 'تحليل معدلات السحب الراكد والنشط';
  if (item.key === 'cashflow_risk_shield') return 'توقع السيولة والالتزامات لـ 14 يوماً';
  if (item.key === 'shift_handover_reconciliation') return 'مطابقة الدرج مع الفواتير المسجلة';
  if (item.key === 'roastery_recipe_waste_guard') return 'مقارنة الاستهلاك الفعلي مع الوصفة (3%)';
  if (item.key === 'supplier_payment_due_alert') return 'حصر الفواتير المستحقة خلال 3 أيام';
  if (item.key === 'customer_loyalty_dormant_winback')
    return 'حصر العملاء الغائبين لأكثر من 30 يوماً';
  if (item.key === 'daily_profit_margin_anomaly') return 'حساب متوسط هامش الربح اليومي (28%)';
  return 'معالجة الشروط المحددة';
};

const formatActionSummary = (item: any) => {
  if (item.key === 'daily_sales_report') return 'توليد تقرير الإغلاق المالي الشامل';
  if (item.key === 'low_stock_alert') return 'إصدار قائمة النواقص ومشتريات البن';
  if (item.key === 'void_invoice_alert') return 'بث إنذار أمني فوري للمالك';
  if (item.key === 'large_discount_alert') return 'تنبيه مالي بتفاصيل الفاتورة';
  if (item.key === 'branch_stock_balancing') return 'إعداد مقترحات أوامر المناقلة';
  if (item.key === 'cashflow_risk_shield') return 'توليد تقرير استباقي لتفادي العجز';
  if (item.key === 'shift_handover_reconciliation') return 'اعتماد الإغلاق أو تسجيل تنبيه عجز';
  if (item.key === 'roastery_recipe_waste_guard') return 'توصيات ضبط عيار الطحن والكيل';
  if (item.key === 'supplier_payment_due_alert') return 'تجهيز جدول سداد دفعات الموردين';
  if (item.key === 'customer_loyalty_dormant_winback') return 'توليد أكواد خصم وعروض استعادة';
  if (item.key === 'daily_profit_margin_anomaly') return 'إنذار تدقيق التكاليف والأسعار';
  return 'تنفيذ الإجراء التلقائي';
};

const formatCronHuman = (cronStr: string) => {
  if (!cronStr) return 'حدث فوري';
  if (cronStr === '30 23 * * *') return 'يومياً 11:30 م';
  if (cronStr === '0 10,18 * * *') return 'مرتين يومياً (10 ص و 6 م)';
  if (cronStr === '0 9 * * *') return 'يومياً 9:00 ص';
  if (cronStr === '0 10 * * 1') return 'كل إثنين 10:00 ص';
  if (cronStr === '0 3 * * *') return 'يومياً 3:00 ص';
  if (cronStr === '0 22 * * *') return 'يومياً 10:00 م';
  if (cronStr === '0 11 * * *') return 'يومياً 11:00 ص';
  if (cronStr === '0 12 * * 0') return 'كل أحد 12:00 م';
  return cronStr;
};

const formatRelativeTime = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  return `منذ ${diffDays} يوم`;
};

const formatDateTime = (isoString: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const setFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  setTimeout(() => {
    feedbackMessage.value = '';
  }, 4500);
};

// ─── جلب البيانات ───
const fetchAutomations = async () => {
  isLoading.value = true;
  try {
    const res = await automationsApi.list();
    const raw = res.data?.data || res.data || {};
    automationsList.value = Array.isArray(raw) ? raw : raw.automations || [];

    // استخراج إعدادات تليجرام من أول أتمتة
    const firstWithConfig = (automationsList.value || []).find(
      (a: any) => a.config?.bot_token || a.config?.chat_id,
    );
    if (firstWithConfig) {
      telegramForm.value.botToken = firstWithConfig.config?.bot_token || '';
      telegramForm.value.chatId = firstWithConfig.config?.chat_id || '';
    }
  } catch (err: any) {
    console.error('Failed to fetch automations:', err);
    setFeedback('فشل تحميل إعدادات الأتمتة: ' + err.message, 'error');
  } finally {
    isLoading.value = false;
  }
};

const fetchLogs = async () => {
  try {
    const res = await automationsApi.getLogs();
    const raw = res.data?.data || res.data || {};
    logsList.value = Array.isArray(raw) ? raw : raw.logs || [];
  } catch (err: any) {
    console.error('Failed to fetch logs:', err);
  }
};

const toggleAutomation = async (item: any) => {
  const newStatus = !item.is_enabled;
  item.is_enabled = newStatus;
  try {
    await automationsApi.update(item.id, { is_enabled: newStatus });
    setFeedback(`تم ${newStatus ? 'تفعيل 🟢' : 'تعطيل ⚪'} مسار (${item.name_ar}) بنجاح`);
  } catch (err: any) {
    item.is_enabled = !newStatus; // revert
    setFeedback('فشل تعديل حالة المسار: ' + err.message, 'error');
  }
};

const openConfigModal = (item: any) => {
  editingAutomation.value = JSON.parse(JSON.stringify(item));
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
    await fetchAutomations();
  } catch (err: any) {
    setFeedback('فشل حفظ الإعدادات: ' + err.message, 'error');
  } finally {
    isSavingConfig.value = false;
  }
};

const triggerTestRun = async (item: any) => {
  triggeringId.value = item.id;
  try {
    const res = await automationsApi.trigger(item.id, { isManualRun: true });
    setFeedback(`✨ ${res.data?.message || 'تم تشغيل المسار بنجاح وإرسال الإشعارات'}`);
    await fetchLogs();
  } catch (err: any) {
    setFeedback('فشل التشغيل: ' + (err.response?.data?.message || err.message), 'error');
  } finally {
    triggeringId.value = null;
  }
};

const triggerAllAutomations = async () => {
  isFiringAll.value = true;
  setFeedback('جاري فحص وضخ كافة مسارات الأتمتة المجدولة...');
  try {
    const list = Array.isArray(automationsList.value) ? automationsList.value : [];
    for (const auto of list) {
      if (auto.is_enabled) {
        await automationsApi.trigger(auto.id, { isManualRun: true });
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

const saveTelegramConfig = async () => {
  try {
    const list = Array.isArray(automationsList.value) ? automationsList.value : [];
    for (const item of list) {
      const newConfig = {
        ...(item.config || {}),
        bot_token: telegramForm.value.botToken,
        chat_id: telegramForm.value.chatId,
      };
      await automationsApi.update(item.id, { config: newConfig });
    }
    setFeedback('تم حفظ وتحديث إعدادات بوت تليجرام لكافة المسارات بنجاح ✨');
    showTelegramModal.value = false;
  } catch (err: any) {
    setFeedback('فشل حفظ إعدادات البوت: ' + err.message, 'error');
  }
};

const handleTestTelegram = async () => {
  if (!telegramForm.value.botToken || !telegramForm.value.chatId) {
    setFeedback('يرجى إدخال Bot Token و Chat ID أولاً', 'error');
    return;
  }
  isTestingTelegram.value = true;
  try {
    const res = await automationsApi.testTelegram({
      botToken: telegramForm.value.botToken,
      chatId: telegramForm.value.chatId,
    });
    if (res.data?.success) {
      setFeedback('تم إرسال الرسالة التجريبية إلى تليجرام بنجاح! تفقد هاتفك 📲');
    } else {
      setFeedback(`فشل إرسال تليجرام: ${res.data?.error || 'تحقق من صحة التوكن والشات'}`, 'error');
    }
  } catch (err: any) {
    setFeedback('فشل الاتصال بتليجرام: ' + (err.response?.data?.message || err.message), 'error');
  } finally {
    isTestingTelegram.value = false;
  }
};

const openMessageModal = (log: any) => {
  selectedLog.value = log;
};

onMounted(async () => {
  await Promise.all([fetchAutomations(), fetchLogs()]);
});
</script>

<style lang="scss" scoped>
/* ═══════════════════════════════════════════════════════════════════
   MASTER AUTOMATION STUDIO & LIVE PIPELINES (Cyber-Glass Bento)
   ═══════════════════════════════════════════════════════════════════ */

.automations-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 40px;
}

/* ── Top Header ── */
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
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.2;
  }
  100% {
    transform: scale(0.95);
    opacity: 0.8;
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

/* ── Feedback Alert ── */
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

/* ── Stats Grid ── */
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
      font-weight: 700;
    }

    .stat-value {
      margin: 2px 0 0;
      font-size: 1.15rem;
      font-weight: 900;
      color: #faedcd;

      small {
        font-size: 0.74rem;
        color: var(--text-muted, #a89f91);
        font-weight: normal;
      }
    }
  }
}

.status-pulse-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  margin-left: 6px;

  &.active {
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   اللوحة التفاعلية البصرية المطورة (VISUAL MATRIX CANVAS)
   ═══════════════════════════════════════════════════════════════════ */

.canvas-section-card {
  padding: 20px;
  background: radial-gradient(circle at 50% 50%, #20130b 0%, #120904 100%);
  border: 1.5px solid rgba(212, 163, 115, 0.35);
  border-radius: 20px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}

.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
}

.canvas-badge-live {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 900;
  color: #faedcd;

  .live-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 10px #22c55e;
    animation: livePulse 1.8s infinite;
  }
}

@keyframes livePulse {
  0% {
    transform: scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.7;
  }
}

.canvas-subtitle {
  font-size: 0.78rem;
  color: var(--text-muted, #a89f91);
  display: block;
  margin-top: 2px;
}

.canvas-controls-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.layout-toggle-pill {
  display: flex;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 10px;
  padding: 2px;

  .layout-btn {
    border: none;
    background: transparent;
    color: var(--text-muted, #a89f91);
    font-size: 0.76rem;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;

    &.active {
      background: #d4a373;
      color: #140d08;
      font-weight: 900;
    }
  }
}

.canvas-categories-bar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.canvas-cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 10px;
  color: var(--text-muted, #a89f91);
  font-size: 0.76rem;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  .cat-pill-count {
    background: rgba(255, 255, 255, 0.1);
    font-size: 0.68rem;
    padding: 1px 6px;
    border-radius: 8px;
  }

  &:hover {
    background: rgba(212, 163, 115, 0.12);
    color: #faedcd;
  }

  &.active {
    background: #d4a373;
    color: #140d08;
    border-color: #faedcd;
    font-weight: 850;

    .cat-pill-count {
      background: #140d08;
      color: #faedcd;
    }
  }
}

.svg-canvas-container {
  position: relative;
  width: 100%;
  min-height: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
}

.automation-svg-board {
  width: 100%;
  height: auto;
  max-height: 620px;
  overflow: visible;
  user-select: none;
}

/* ── Central Core Node ── */
.central-core-node {
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: translate(500px, 310px) scale(1.05);
  }

  .core-pulse-outer {
    fill: none;
    stroke: rgba(212, 163, 115, 0.25);
    stroke-width: 1.5;
    animation: corePulseOuter 3s infinite ease-out;
  }

  .core-pulse-middle {
    fill: none;
    stroke: rgba(212, 163, 115, 0.4);
    stroke-width: 2;
    animation: corePulseMiddle 2.2s infinite ease-out;
  }

  .core-base-circle {
    fill: #2c1a0e;
    stroke: #d4a373;
    stroke-width: 3;
    filter: drop-shadow(0 0 14px rgba(212, 163, 115, 0.6));
  }

  .core-icon {
    font-size: 24px;
  }

  .core-label {
    fill: #faedcd;
    font-size: 11px;
    font-weight: 900;
  }

  .core-sublabel {
    fill: #a89f91;
    font-size: 9.5px;
    font-weight: 700;
  }
}

@keyframes corePulseOuter {
  0% {
    r: 40px;
    opacity: 0.8;
  }
  100% {
    r: 68px;
    opacity: 0;
  }
}

@keyframes corePulseMiddle {
  0% {
    r: 36px;
    opacity: 0.9;
  }
  100% {
    r: 52px;
    opacity: 0;
  }
}

/* ── Energy Conduits & Particles ── */
.energy-flowing-beam {
  stroke-dasharray: 8, 8;
  animation: beamFlow 1.6s linear infinite;

  &.active-selected {
    stroke-width: 4;
    filter: drop-shadow(0 0 8px currentColor);
  }

  &.is-firing {
    stroke-width: 5;
    animation: beamFire 0.4s linear infinite;
  }
}

@keyframes beamFlow {
  from {
    stroke-dashoffset: 32;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes beamFire {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.4;
  }
}

/* ── Automation Station Nodes ── */
.automation-node-group {
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    transform: scale(1.12);

    .node-card-body {
      filter: drop-shadow(0 0 12px rgba(212, 163, 115, 0.7));
    }
  }

  &.is-selected {
    .node-card-body {
      stroke-width: 3.5;
      filter: drop-shadow(0 0 16px rgba(212, 163, 115, 0.9));
    }
  }

  &.is-disabled {
    opacity: 0.45;
    filter: grayscale(0.5);
  }

  &.is-dimmed {
    opacity: 0.2;
    filter: grayscale(0.8);
  }

  &.is-firing {
    animation: firingBounce 0.6s infinite alternate;
  }

  .node-selected-halo {
    fill: none;
    stroke-width: 2;
    stroke-dasharray: 6, 4;
    animation: spinHalo 8s linear infinite;
  }

  .node-card-body {
    stroke-width: 2.2;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6));
  }

  .node-status-dot {
    stroke: #120904;
    stroke-width: 1.5;
  }

  .node-icon {
    font-size: 18px;
  }

  .node-title-bg {
    fill: rgba(18, 9, 4, 0.88);
    stroke: rgba(212, 163, 115, 0.3);
    stroke-width: 1;
  }

  .node-title-text {
    fill: #faedcd;
    font-size: 9.5px;
    font-weight: 800;
  }

  .node-trigger-text {
    fill: #a89f91;
    font-size: 8px;
    font-weight: 700;
  }
}

@keyframes spinHalo {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes firingBounce {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.18);
  }
}

/* ── HUD Node Card (Floating Info Card) ── */
.node-hud-card {
  position: absolute;
  bottom: 16px;
  right: 16px;
  background: rgba(22, 13, 7, 0.94);
  backdrop-filter: blur(12px);
  border: 1.5px solid #d4a373;
  border-radius: 16px;
  padding: 16px;
  width: 330px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.7);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hud-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.hud-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;

  .hud-emoji {
    font-size: 1.6rem;
    padding: 6px;
    background: rgba(212, 163, 115, 0.15);
    border-radius: 10px;
  }

  .hud-title {
    margin: 0 0 4px;
    font-size: 0.96rem;
    font-weight: 850;
    color: #faedcd;
  }

  .hud-badges {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
}

.hud-close-btn {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 0.75rem;
  cursor: pointer;

  &:hover {
    background: rgba(239, 68, 68, 0.3);
    color: #f87171;
  }
}

.hud-desc {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted, #d4a373);
  line-height: 1.4;
}

.hud-meta-row {
  display: flex;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.74rem;

  .meta-lbl {
    color: var(--text-muted, #a89f91);
    font-weight: 700;
  }

  .meta-val {
    color: #faedcd;
    font-weight: 800;
  }
}

.hud-actions-row {
  display: flex;
  gap: 6px;
}

/* ═══════════════════════════════════════════════════════════════════
   SECTION CARDS & 4-STAGE PIPELINES
   ═══════════════════════════════════════════════════════════════════ */

.section-card {
  padding: 20px;
  background: var(--surface, #1b120c);
  border: 1px solid var(--border, rgba(212, 163, 115, 0.2));
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-filters-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.cat-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 12px;
  color: var(--text-muted, #a89f91);
  font-size: 0.8rem;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.15s ease;

  .tab-count {
    background: rgba(255, 255, 255, 0.1);
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 10px;
  }

  &:hover {
    background: rgba(212, 163, 115, 0.12);
    color: #faedcd;
  }

  &.active {
    background: #d4a373;
    color: #140d08;
    border-color: #faedcd;
    font-weight: 850;

    .tab-count {
      background: #140d08;
      color: #faedcd;
    }
  }
}

.pipelines-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 1200px) {
  .pipelines-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.pipeline-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: linear-gradient(180deg, #22150d 0%, #170d07 100%);
  border: 1.5px solid rgba(212, 163, 115, 0.25);
  border-radius: 18px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  cursor: pointer;

  &:hover {
    border-color: rgba(212, 163, 115, 0.55);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
  }

  &.is-selected-card {
    border-color: #d4a373;
    box-shadow: 0 0 18px rgba(212, 163, 115, 0.4);
  }

  &.is-disabled {
    opacity: 0.65;
    filter: grayscale(0.3);
  }

  &.is-firing {
    border-color: #22c55e;
    box-shadow: 0 0 20px rgba(34, 197, 94, 0.35);
  }
}

.pipeline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.pipeline-title-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;

  .pipeline-scenario-icon {
    font-size: 1.6rem;
    padding: 8px;
    background: rgba(212, 163, 115, 0.12);
    border: 1px solid rgba(212, 163, 115, 0.3);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pipeline-name {
    margin: 0 0 6px;
    font-size: 1.05rem;
    font-weight: 850;
    color: #faedcd;
    line-height: 1.3;
  }

  .pipeline-badges-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
}

.category-pill {
  font-size: 0.72rem;
  font-weight: 750;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(212, 163, 115, 0.15);
  color: #d4a373;

  &.sales {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }
  &.inventory {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }
  &.security {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }
  &.system {
    background: rgba(56, 189, 248, 0.15);
    color: #7dd3fc;
  }
}

.trigger-type-pill {
  font-size: 0.72rem;
  font-weight: 750;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #a89f91);

  &.cron {
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }
  &.event {
    color: #f43f5e;
    border: 1px solid rgba(244, 63, 94, 0.3);
  }
}

.toggle-switch-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.toggle-track {
  width: 44px;
  height: 24px;
  background: #332014;
  border: 1px solid rgba(212, 163, 115, 0.3);
  border-radius: 12px;
  position: relative;
  transition: all 0.2s ease;

  .toggle-knob {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    background: #a89f91;
    border-radius: 50%;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &.is-on {
    background: #22c55e;
    border-color: #86efac;

    .toggle-knob {
      right: 22px;
      background: #ffffff;
      box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
    }
  }
}

.toggle-status-text {
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--text-muted, #a89f91);
}

.pipeline-desc {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text-muted, #d4a373);
}

.pipeline-flow-container {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: center;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(212, 163, 115, 0.2);
  border-radius: 14px;
  padding: 12px 10px;
  gap: 4px;
}

@media (max-width: 768px) {
  .pipeline-flow-container {
    grid-template-columns: 1fr;
    gap: 8px;

    .flow-connector {
      display: none;
    }
  }
}

.flow-step-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 8px 6px;
  text-align: center;
  min-height: 68px;
  justify-content: space-between;

  .node-badge {
    font-size: 0.65rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 4px;

    &.trigger {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
    }
    &.rule {
      color: #a855f7;
      background: rgba(168, 85, 247, 0.12);
    }
    &.action {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.12);
    }
    &.channel {
      color: #22c55e;
      background: rgba(34, 197, 94, 0.12);
    }
  }

  .node-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;

    .node-icon {
      font-size: 0.95rem;
    }

    .node-text {
      font-size: 0.72rem;
      font-weight: 700;
      color: #f7ede2;
      line-height: 1.2;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    &.channels-list {
      flex-direction: column;
      gap: 3px;
    }
  }
}

.chan-pill {
  font-size: 0.68rem;
  font-weight: 750;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #a89f91;

  &.active {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
    border: 1px solid rgba(34, 197, 94, 0.4);
  }
}

.flow-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;

  .connector-line {
    position: relative;
    width: 100%;
    height: 2px;
    background: rgba(212, 163, 115, 0.35);

    .pulse-dot {
      position: absolute;
      top: -3px;
      right: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #d4a373;
      box-shadow: 0 0 6px #d4a373;
      animation: pipePulse 1.8s infinite linear;
    }
  }
}

@keyframes pipePulse {
  0% {
    right: 0;
    opacity: 1;
  }
  100% {
    right: 100%;
    opacity: 0.2;
  }
}

.pipeline-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(212, 163, 115, 0.2);
}

.last-run-info {
  font-size: 0.78rem;
  color: var(--text-muted, #a89f91);

  b {
    color: #faedcd;
  }

  .status-tag {
    font-size: 0.7rem;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 6px;
    margin-right: 6px;

    &.success {
      background: rgba(34, 197, 94, 0.2);
      color: #86efac;
    }
    &.failed {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }
  }
}

.pipeline-actions-group {
  display: flex;
  gap: 6px;
}

.btn-trigger-test {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 800;
}

/* ═══════════════════════════════════════════════════════════════════
   LOGS TABLE & MODALS
   ═══════════════════════════════════════════════════════════════════ */

.logs-count-badge {
  background: rgba(212, 163, 115, 0.15);
  color: #d4a373;
  font-size: 0.74rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 8px;
}

.logs-table-wrapper {
  overflow-x: auto;
}

.scenario-mini-emoji {
  font-size: 1.1rem;
}

.log-title-text {
  font-size: 0.84rem;
  font-weight: 700;
  color: #faedcd;
}

.badge-status {
  font-size: 0.74rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 8px;

  &.success {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
  }
  &.warning {
    background: rgba(245, 158, 11, 0.2);
    color: #fde047;
  }
  &.failed {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
  }
}

.logs-pagination-bar {
  display: flex;
  justify-content: center;
  padding-top: 10px;
}

/* ── Modals ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-box {
  background: #1b120c;
  border: 1.5px solid #d4a373;
  border-radius: 18px;
  padding: 20px;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.25);
  margin-bottom: 14px;

  h3 {
    margin: 0;
    color: #faedcd;
  }
}

.btn-close {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #fff;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 0.9rem;
  cursor: pointer;

  &:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }
}

.channels-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.channel-check-item,
.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #faedcd;
  cursor: pointer;
}

.cron-presets-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.rendered-message-box {
  background: #120904;
  border: 1px solid rgba(212, 163, 115, 0.25);
  border-radius: 12px;
  padding: 16px;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.6;
  color: #f7ede2;
  max-height: 55vh;
  overflow-y: auto;
  white-space: pre-line;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px;
  color: var(--text-muted, #d4a373);
  font-weight: 750;
}

/* ── Pop-in Animation ── */
.pop-in-enter-active,
.pop-in-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.pop-in-enter-from,
.pop-in-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>
