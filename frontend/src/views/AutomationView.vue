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

    <!-- ═══════════════════ العرض الأول: المنظومة الكونية ثلاثية الأبعاد (Cosmic 3D Orbs Network) ═══════════════════ -->
    <div v-if="viewMode === 'graph'" class="cosmic-canvas-wrapper card">
      <!-- شريط القيادة الفضائي العائم (Cosmic Glass HUD) -->
      <div class="cosmic-hud-bar">
        <div class="hud-left-group">
          <div class="cosmic-badge">
            <span class="cosmic-pulse-dot"></span>
            <span class="cosmic-badge-title">COSMIC 3D NETWORK</span>
          </div>
          <div class="hud-meta">
            <span class="hud-title">المنظومة العصبية الكونية للأتمتة</span>
            <span class="hud-subtitle"
              >✨ أجرام زجاجية ثلاثية الأبعاد تدور بفيزياء الجاذبية الحية مع جزيئات الفضاء</span
            >
          </div>
        </div>

        <div class="hud-controls">
          <!-- زر تشغيل/إيقاف الدوران المداري -->
          <button
            type="button"
            class="hud-btn"
            :class="{ active: isRotating }"
            :title="isRotating ? 'إيقاف الدوران المداري' : 'تشغيل الدوران المداري'"
            @click="toggleRotation"
          >
            <span>{{ isRotating ? '⏸️ إيقاف الدوران' : '▶️ تشغيل الدوران' }}</span>
          </button>

          <!-- زر ضخ طاقة سوبرنوفا -->
          <button
            type="button"
            class="hud-btn hud-btn-supernova"
            :disabled="isFiringAll"
            @click="simulateFullNetworkPulse"
          >
            <span>{{ isFiringAll ? '⚡ سريان السوبرنوفا...' : '🚀 ضخ طاقة كونية' }}</span>
          </button>

          <!-- أدوات التكبير والتصغير -->
          <div class="hud-zoom-pill">
            <button type="button" class="hud-icon-btn" title="تصغير" @click="zoomOut">➖</button>
            <span class="hud-zoom-val">{{ Math.round(zoomLevel * 100) }}%</span>
            <button type="button" class="hud-icon-btn" title="تكبير" @click="zoomIn">➕</button>
          </div>

          <!-- زر إعادة التمركز -->
          <button
            type="button"
            class="hud-btn"
            title="إعادة ضبط وتمركز المنظومة"
            @click="resetPhysicsAndCenter"
          >
            <span>🎯 إعادة التمركز</span>
          </button>
        </div>
      </div>

      <!-- مساحة الكانفاس الفضائية التفاعلية (3D Deep Space Viewport) -->
      <div
        ref="canvasContainerRef"
        class="cosmic-viewport"
        :class="{ dragging: isPanning }"
        @mousedown="handleCanvasMouseDown"
        @mousemove="handleCanvasMouseMove"
        @mouseup="handleCanvasMouseUp"
        @mouseleave="handleCanvasMouseUp"
        @wheel.prevent="handleCanvasWheel"
      >
        <!-- سحب السديم الكوني متعدد الطبقات (Multi-Layer Cosmic Nebulae) -->
        <div class="cosmic-nebula nebula-core"></div>
        <div class="cosmic-nebula nebula-amber"></div>
        <div class="cosmic-nebula nebula-cyan"></div>
        <div class="cosmic-nebula nebula-rose"></div>

        <!-- حقل النجوم والجزيئات المتطايرة (Floating Stardust Particles) -->
        <div class="stardust-field">
          <div
            v-for="star in cosmicStars"
            :key="star.id"
            class="stardust-particle"
            :style="{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
              backgroundColor: star.color,
            }"
          ></div>
        </div>

        <!-- شبكة الفضاء النقطية المتقاطعة -->
        <div
          class="cosmic-grid-pattern"
          :style="{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }"
        ></div>

        <!-- مساحة التحويل ثلاثية الأبعاد (3D Transform Layer) -->
        <div
          class="cosmic-transform-layer"
          :style="{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
          }"
        >
          <!-- طبقة مسارات الجاذبية والأشعة الليزرية SVG -->
          <svg class="cosmic-svg-layer" width="3000" height="2000">
            <defs>
              <!-- تدرجات الأشعة الكونية -->
              <linearGradient id="laser-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.9" />
                <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.6" />
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.9" />
              </linearGradient>

              <linearGradient id="laser-active" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f43f5e" stop-opacity="1" />
                <stop offset="50%" stop-color="#fbbf24" stop-opacity="1" />
                <stop offset="100%" stop-color="#34d399" stop-opacity="1" />
              </linearGradient>

              <!-- فلتر التوهج النيون للأشعة -->
              <filter id="beam-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur1" />
                <feGaussianBlur stdDeviation="6" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <!-- مدارات الجاذبية الإهليلجية ثلاثية الأبعاد -->
            <ellipse
              :cx="centerCoord.x"
              :cy="centerCoord.y"
              rx="170"
              ry="125"
              class="gravity-orbit-track orbit-inner"
            />
            <ellipse
              :cx="centerCoord.x"
              :cy="centerCoord.y"
              rx="265"
              ry="190"
              class="gravity-orbit-track orbit-outer"
            />

            <!-- كابلات الأشعة العصبية المنسابة بين الأجرام -->
            <g v-for="link in graphLinks" :key="link.id" class="beam-group">
              <!-- شعاع الخلفية الهادئ -->
              <line
                :x1="getNodePos(link.from).x"
                :y1="getNodePos(link.from).y"
                :x2="getNodePos(link.to).x"
                :y2="getNodePos(link.to).y"
                class="cosmic-beam-base"
                :class="{
                  highlighted:
                    hoveredNodeId === link.from ||
                    hoveredNodeId === link.to ||
                    selectedNode?.id === link.from ||
                    selectedNode?.id === link.to,
                  dimmed: hoveredNodeId && hoveredNodeId !== link.from && hoveredNodeId !== link.to,
                }"
              />

              <!-- تيار الفوتونات الضوئية الجاري على الشعاع -->
              <line
                :x1="getNodePos(link.from).x"
                :y1="getNodePos(link.from).y"
                :x2="getNodePos(link.to).x"
                :y2="getNodePos(link.to).y"
                class="cosmic-beam-laser"
                :class="{
                  active: isFiringAll || triggeringId === link.automationId,
                  highlighted:
                    hoveredNodeId === link.from ||
                    hoveredNodeId === link.to ||
                    selectedNode?.id === link.from ||
                    selectedNode?.id === link.to,
                }"
                filter="url(#beam-glow)"
              />
            </g>
          </svg>

          <!-- طبقة الأجرام الكروية الزجاجية ثلاثية الأبعاد (3D Glass Orbs) -->
          <div
            v-for="node in graphNodes"
            :key="node.id"
            class="cosmic-orb-body"
            :class="[
              node.category,
              {
                'is-nucleus': node.isCenter,
                'is-active': selectedNode?.id === node.id,
                'is-hovered': hoveredNodeId === node.id,
                'is-dimmed':
                  hoveredNodeId && hoveredNodeId !== node.id && !isNeighbor(hoveredNodeId, node.id),
                'is-supernova': isFiringAll || triggeringId === node.automationId,
                'is-dragging': draggedNodeId === node.id,
              },
            ]"
            :style="{
              transform: `translate3d(${node.x - node.radius}px, ${node.y - node.radius}px, 0) scale(${node.scale3d || 1})`,
              width: `${node.radius * 2}px`,
              height: `${node.radius * 2}px`,
              zIndex: node.zIndex || 2,
            }"
            @mousedown.stop="handleNodeMouseDown(node, $event)"
            @mouseenter="hoveredNodeId = node.id"
            @mouseleave="hoveredNodeId = null"
            @click.stop="selectNode(node)"
          >
            <!-- الهالة الإشعاعية الكونية (Volumetric Corona Aura) -->
            <div class="orb-corona-aura"></div>

            <!-- حلقات الطاقة النبضية للسوبرنوفا -->
            <div
              v-if="isFiringAll || triggeringId === node.automationId"
              class="supernova-shockwave"
            ></div>

            <!-- الكوكب الزجاجي ثلاثي الأبعاد مع انعكاس الضوء الكروي -->
            <div class="glass-sphere-3d">
              <!-- لمعان الضوء العلوي المنعكس (Specular Glass Glint) -->
              <div class="sphere-specular-shine"></div>

              <!-- لمعان قوسي محيطي سفلي (Bottom Ambient Rim) -->
              <div class="sphere-rim-light"></div>

              <!-- أيقونة العقدة المركزية -->
              <span class="sphere-icon">{{ node.icon }}</span>

              <!-- نقطة الاستشعار الحية (Live Telemetry LED) -->
              <span v-if="node.hasLed" class="sphere-live-led"></span>
            </div>

            <!-- التسمية الكونية العائمة تحت الجرم (Cosmic Floating Label) -->
            <div class="cosmic-label-wrap">
              <span class="cosmic-label-pill">{{ node.title }}</span>
              <span
                v-if="hoveredNodeId === node.id || selectedNode?.id === node.id"
                class="cosmic-sub-pill"
              >
                {{ node.subLabel }}
              </span>
            </div>
          </div>
        </div>

        <!-- اللوحة الزجاجية لمعاينة بيانات الجرم المحدد (Celestial Inspector HUD) -->
        <transition name="slide-left">
          <div v-if="selectedNode" class="celestial-inspector-card">
            <div class="inspector-top-bar">
              <div class="flex items-center gap-2">
                <span class="text-3xl">{{ selectedNode.icon }}</span>
                <div>
                  <h4 class="font-black text-sm text-white">{{ selectedNode.title }}</h4>
                  <span class="text-xs text-cyan-300 font-mono">{{ selectedNode.typeLabel }}</span>
                </div>
              </div>
              <button type="button" class="btn-close-cosmic" @click="selectedNode = null">✕</button>
            </div>

            <div class="inspector-card-body">
              <p class="text-xs text-neutral-300 mb-3 leading-relaxed">{{ selectedNode.desc }}</p>

              <div class="cosmic-meta-row">
                <span class="meta-label">حالة الجرم الفلكي:</span>
                <span class="meta-badge on">🟢 مدار نشط ومستقر</span>
              </div>

              <div class="cosmic-meta-row">
                <span class="meta-label">المدار والتردد:</span>
                <span class="meta-val font-mono">{{
                  selectedNode.isCenter ? 'نواة الجاذبية 0 AU' : `${selectedNode.orbitRadius} px`
                }}</span>
              </div>

              <div v-if="selectedNode.cron" class="cosmic-meta-row">
                <span class="meta-label">توقيت الإطلاق:</span>
                <span class="meta-val text-amber-300 font-bold">{{ selectedNode.cron }}</span>
              </div>

              <div class="inspector-action-wrap mt-4">
                <button
                  v-if="selectedNode.automationId"
                  type="button"
                  class="btn btn-primary btn-sm w-full btn-fire-orb"
                  :disabled="triggeringId === selectedNode.automationId"
                  @click="triggerTestRunById(selectedNode.automationId)"
                >
                  <span>{{
                    triggeringId === selectedNode.automationId
                      ? '⚡ جاري ضخ السوبرنوفا...'
                      : '🚀 تشغيل ومحاكاة الجرم الآن'
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

/* ═══════════════════ محرك فيزياء الأجرام الكونية ثلاثية الأبعاد (Cosmic 3D Orbs Engine) ═══════════════════ */
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

// حقل جزيئات ونجوم الفضاء المتلألئة (Stardust Particles)
const starColors = ['#ffffff', '#fbbf24', '#38bdf8', '#c084fc', '#f43f5e', '#34d399'];
const cosmicStars = ref<any[]>(
  Array.from({ length: 65 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() > 0.85 ? 3 : Math.random() > 0.5 ? 2 : 1.2,
    opacity: 0.2 + Math.random() * 0.75,
    duration: 2 + Math.random() * 4,
    delay: Math.random() * 3,
    color: starColors[Math.floor(Math.random() * starColors.length)],
  })),
);

// تعريف الأجرام الزجاجية المتوهجة (3D Cosmic Celestial Orbs)
const graphNodes = ref<any[]>([
  {
    id: 'node-brain',
    typeLabel: 'Supermassive Nucleus • عقل الأتمتة',
    category: 'core-cat',
    icon: '🧠',
    title: 'عقل الأتمتة المركزي',
    subLabel: 'محرك التحليل والقرارات',
    desc: 'تجميع إيرادات اليوم، صافي الأرباح، وأعلى الأصناف طلباً وضخ التوجيهات',
    radius: 32,
    x: 500,
    y: 320,
    vx: 0,
    vy: 0,
    orbitRadius: 0,
    orbitSpeed: 0,
    orbitAngle: 0,
    isCenter: true,
    hasLed: true,
    scale3d: 1.1,
    zIndex: 10,
    automationId: null,
  },
  {
    id: 'node-pos',
    typeLabel: 'Solar Trigger • كاشير الفروع',
    category: 'trigger-cat',
    icon: '☕',
    title: 'كاشير ومبيعات الفروع',
    subLabel: 'مبيعات حية ولحظية',
    desc: 'متابعة الفواتير والتحصيل وورديات الكاشير الحية في كافة الفروع',
    radius: 23,
    x: 340,
    y: 200,
    vx: 0,
    vy: 0,
    orbitRadius: 170,
    orbitSpeed: 0.0028,
    orbitAngle: 0,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 3,
    automationId: null,
  },
  {
    id: 'node-inv',
    typeLabel: 'Emerald Nebula • مخازن البن',
    category: 'emerald-cat',
    icon: '🫘',
    title: 'مخازن البن والتحميص',
    subLabel: 'رصد الخامات والجرد',
    desc: 'مراقبة أرصدة البن الأخضر والمحمص وحركات الصرف والاستهلاك',
    radius: 22,
    x: 660,
    y: 200,
    vx: 0,
    vy: 0,
    orbitRadius: 185,
    orbitSpeed: 0.0024,
    orbitAngle: 1.25,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 3,
    automationId: null,
  },
  {
    id: 'node-cron',
    typeLabel: 'Cyan Chrono • محرك الجدولة',
    category: 'cyan-cat',
    icon: '⏰',
    title: 'محرك الجدولة (Cron)',
    subLabel: '11:30 م يومياً',
    desc: 'إطلاق تقرير الإغلاق وفحص النواقص الدوري في المواعيد المحددة',
    cron: 'يومياً 11:30 م',
    radius: 20,
    x: 360,
    y: 440,
    vx: 0,
    vy: 0,
    orbitRadius: 175,
    orbitSpeed: 0.0025,
    orbitAngle: 2.45,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 3,
    automationId: null,
  },
  {
    id: 'node-fraud',
    typeLabel: 'Ruby Shield • كشف التلاعب',
    category: 'ruby-cat',
    icon: '🛡️',
    title: 'منظومة الرقابة والأمان',
    subLabel: 'حماية وتدقيق 24/7',
    desc: 'رصد فوري لإلغاء الفواتير والخصومات المشبوهة وتنبيه الإدارة',
    radius: 23,
    x: 640,
    y: 440,
    vx: 0,
    vy: 0,
    orbitRadius: 180,
    orbitSpeed: 0.0026,
    orbitAngle: 3.65,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 3,
    automationId: null,
  },
  {
    id: 'node-balancing',
    typeLabel: 'Sapphire Flow • مناقلات الفروع',
    category: 'sapphire-cat',
    icon: '🔄',
    title: 'توازن مخزون الفروع',
    subLabel: 'مناقلات ذكية',
    desc: 'تحليل معدل الاستهلاك واقتراح نقل البن بين الفروع لتفادي الشراء',
    radius: 23,
    x: 230,
    y: 320,
    vx: 0,
    vy: 0,
    orbitRadius: 265,
    orbitSpeed: -0.0016,
    orbitAngle: 4.85,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 2,
    automationId: null,
  },
  {
    id: 'node-cashflow',
    typeLabel: 'Imperial Gold • درع السيولة',
    category: 'gold-cat',
    icon: '💰',
    title: 'درع حماية السيولة',
    subLabel: 'توقعات 14 يوم',
    desc: 'التنبؤ بالعجز المالي ومقارنة التدفقات النقدية بالالتزامات',
    radius: 24,
    x: 770,
    y: 320,
    vx: 0,
    vy: 0,
    orbitRadius: 275,
    orbitSpeed: -0.0018,
    orbitAngle: 0.65,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 2,
    automationId: null,
  },
  {
    id: 'node-db',
    typeLabel: 'Amethyst Vault • قاعدة البيانات',
    category: 'amethyst-cat',
    icon: '🗄️',
    title: 'سحابة PostgreSQL',
    subLabel: 'أرشفة فورية آمنة',
    desc: 'أرشفة حركات البيع، التوريدات، القيود المحاسبية وسلسلة الجرد',
    radius: 20,
    x: 500,
    y: 110,
    vx: 0,
    vy: 0,
    orbitRadius: 215,
    orbitSpeed: 0.002,
    orbitAngle: 5.45,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 2,
    automationId: null,
  },
  {
    id: 'node-tg',
    typeLabel: 'Azure Bot • بوت تليجرام',
    category: 'azure-cat',
    icon: '🤖',
    title: 'بوت تليجرام التفاعلي',
    subLabel: 'استماع وتفاعل 24/7',
    desc: 'توصيل التقارير والرد اللحظي على أوامر المالك /sales /stock /cash',
    radius: 26,
    x: 500,
    y: 530,
    vx: 0,
    vy: 0,
    orbitRadius: 235,
    orbitSpeed: 0.0021,
    orbitAngle: 1.85,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 2,
    automationId: null,
  },
  {
    id: 'node-logs',
    typeLabel: 'Rose Stream • سجل المراقبة',
    category: 'rose-cat',
    icon: '📜',
    title: 'سجل العمليات الحي',
    subLabel: 'Audit Telemetry',
    desc: 'أرشفة متواصلة لكافة الأنشطة والتقارير المنفذة مع النتائج',
    radius: 20,
    x: 280,
    y: 170,
    vx: 0,
    vy: 0,
    orbitRadius: 255,
    orbitSpeed: -0.0015,
    orbitAngle: 3.1,
    hasLed: true,
    scale3d: 1.0,
    zIndex: 2,
    automationId: null,
  },
]);

// خيوط وأشعة الشبكة العصبية (Cosmic Neural Links)
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

/* ═══════════════════ محرك الدوران المداري والعمق ثلاثي الأبعاد (3D Depth Orbit Loop) ═══════════════════ */
const startPhysicsLoop = () => {
  const step = () => {
    if (isRotating.value) {
      for (const node of graphNodes.value) {
        if (node.isCenter || draggedNodeId.value === node.id) continue;

        // تقدم الزاوية المدارية للكوكب
        node.orbitAngle += node.orbitSpeed;

        // حساب الإحداثيات المستهدفة بناء على المسار الإهليلجي
        const targetX = centerCoord.x + Math.cos(node.orbitAngle) * node.orbitRadius;
        const targetY = centerCoord.y + Math.sin(node.orbitAngle) * node.orbitRadius * 0.72;

        // اقتراب ناعم وفيزيائي (Smooth Spring Easing)
        node.x += (targetX - node.x) * 0.03;
        node.y += (targetY - node.y) * 0.03;

        // حساب العمق البصري ثلاثي الأبعاد (3D Perspective Scale & Z-Index)
        const depth = Math.sin(node.orbitAngle); // -1 (خلف) إلى +1 (أمام)
        node.scale3d = 0.88 + (depth + 1) * 0.14; // scale بين 0.88 و 1.16
        node.zIndex = depth > 0 ? 5 : 2;
      }
    }
    animationFrameId = requestAnimationFrame(step);
  };
  animationFrameId = requestAnimationFrame(step);
};

const toggleRotation = () => {
  isRotating.value = !isRotating.value;
  showFeedback(
    isRotating.value ? 'تم تفعيل الدوران المداري ثلاثي الأبعاد 🪐' : 'تم إيقاف الدوران مؤقتاً ⏸️',
  );
};

const resetPhysicsAndCenter = () => {
  for (const node of graphNodes.value) {
    if (node.isCenter) {
      node.x = centerCoord.x;
      node.y = centerCoord.y;
    } else {
      node.x = centerCoord.x + Math.cos(node.orbitAngle) * node.orbitRadius;
      node.y = centerCoord.y + Math.sin(node.orbitAngle) * node.orbitRadius * 0.72;
    }
  }
  panOffset.x = 0;
  panOffset.y = 0;
  zoomLevel.value = 1.0;
  showFeedback('تمت إعادة تمركز المنظومة ثلاثية الأبعاد بالكامل! 🎯');
};

const simulateFullNetworkPulse = () => {
  isFiringAll.value = true;
  showFeedback('⚡ انفجار سوبرنوفا: ضخ نبضات الطاقة الكونية في كامل المنظومة!');
  setTimeout(() => {
    isFiringAll.value = false;
    showFeedback('اكتمل تدفق الطاقة بنجاح في جميع المسارات والأجرام! ✨');
  }, 2400);
};

/* تفاعلات الكانفاس والتحريك (Pan & Zoom) */
const handleCanvasMouseDown = (e: MouseEvent) => {
  if (
    e.target !== canvasContainerRef.value &&
    !(e.target as HTMLElement).classList.contains('cosmic-grid-pattern') &&
    !(e.target as HTMLElement).classList.contains('cosmic-svg-layer') &&
    !(e.target as HTMLElement).classList.contains('stardust-field')
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

      // تحديث نصف القطر المداري وزاوية الكوكب بناء على الموقع المسحوب
      if (!node.isCenter) {
        const dx = node.x - centerCoord.x;
        const dy = (node.y - centerCoord.y) / 0.72;
        node.orbitRadius = Math.max(90, Math.sqrt(dx * dx + dy * dy));
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

/* ═══════════════════ Cosmic 3D Orbs Network Masterpiece ═══════════════════ */
.cosmic-canvas-wrapper {
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(251, 191, 36, 0.15);
  overflow: hidden;
  border-radius: var(--radius-lg);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.8),
    0 0 40px rgba(139, 92, 246, 0.08);
  background: #06040d;
}

/* Cosmic Glass HUD Bar */
.cosmic-hud-bar {
  background: rgba(10, 8, 20, 0.92);
  backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  z-index: 10;
}

.hud-left-group {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cosmic-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(139, 92, 246, 0.15));
  border: 1px solid rgba(251, 191, 36, 0.35);
  padding: 4px 12px;
  border-radius: 999px;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.2);
}

.cosmic-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow:
    0 0 8px #fbbf24,
    0 0 16px #f59e0b;
  animation: cosmic-star-pulse 1.8s infinite;
}

@keyframes cosmic-star-pulse {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
    box-shadow:
      0 0 12px #fbbf24,
      0 0 24px #f59e0b;
  }
}

.cosmic-badge-title {
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 1.2px;
  color: #fbbf24;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
}

.hud-meta {
  display: flex;
  flex-direction: column;
}

.hud-title {
  font-size: 0.95rem;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: 0.2px;
}

.hud-subtitle {
  font-size: 0.72rem;
  color: #a1a1aa;
}

.hud-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hud-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e4e4e7;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.hud-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
  transform: translateY(-1px);
}

.hud-btn.active {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(139, 92, 246, 0.2));
  border-color: #fbbf24;
  color: #fbbf24;
  box-shadow: 0 0 16px rgba(245, 158, 11, 0.25);
}

.hud-btn-supernova {
  background: linear-gradient(135deg, #d97706, #7c3aed);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
  font-weight: 900;
  box-shadow: 0 0 20px rgba(217, 119, 6, 0.4);
}

.hud-btn-supernova:hover {
  box-shadow:
    0 0 30px rgba(217, 119, 6, 0.7),
    0 0 40px rgba(124, 58, 237, 0.5);
  transform: translateY(-2px);
}

.hud-zoom-pill {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  gap: 4px;
}

.hud-icon-btn {
  background: transparent;
  border: none;
  color: #a1a1aa;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.75rem;
  transition: color 0.15s;
}

.hud-icon-btn:hover {
  color: #fbbf24;
}

.hud-zoom-val {
  font-size: 0.72rem;
  font-weight: 800;
  color: #fbbf24;
  min-width: 36px;
  text-align: center;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

/* 3D Deep Space Viewport */
.cosmic-viewport {
  width: 100%;
  height: 660px;
  background: radial-gradient(circle at center, #0f0a21 0%, #06040d 70%, #020105 100%);
  position: relative;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.cosmic-viewport.dragging {
  cursor: grabbing;
}

/* Multi-Layer Cosmic Nebulae */
.cosmic-nebula {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  pointer-events: none;
  opacity: 0.22;
  mix-blend-mode: screen;
}

.nebula-core {
  width: 550px;
  height: 550px;
  background: #7c3aed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  animation: nebula-breathe 8s ease-in-out infinite alternate;
}

.nebula-amber {
  width: 480px;
  height: 480px;
  background: #f59e0b;
  left: 15%;
  top: 20%;
  animation: nebula-breathe 10s ease-in-out infinite alternate 1s;
}

.nebula-cyan {
  width: 520px;
  height: 520px;
  background: #06b6d4;
  right: 12%;
  bottom: 15%;
  animation: nebula-breathe 12s ease-in-out infinite alternate 2s;
}

.nebula-rose {
  width: 420px;
  height: 420px;
  background: #f43f5e;
  right: 25%;
  top: 15%;
  opacity: 0.16;
}

@keyframes nebula-breathe {
  0% {
    transform: scale(0.9) rotate(0deg);
    opacity: 0.18;
  }
  100% {
    transform: scale(1.15) rotate(15deg);
    opacity: 0.28;
  }
}

/* Stardust Field */
.stardust-field {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.stardust-particle {
  position: absolute;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
  animation: star-twinkle infinite ease-in-out;
}

@keyframes star-twinkle {
  0%,
  100% {
    opacity: 0.2;
    transform: scale(0.7);
  }
  50% {
    opacity: 1;
    transform: scale(1.4);
  }
}

/* Space Grid Pattern */
.cosmic-grid-pattern {
  position: absolute;
  width: 4000px;
  height: 4000px;
  left: -1000px;
  top: -1000px;
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
  background-size:
    40px 40px,
    120px 120px,
    120px 120px;
  pointer-events: none;
}

.cosmic-transform-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  pointer-events: none;
}

/* SVG Laser Beams & Orbits Layer */
.cosmic-svg-layer {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  z-index: 1;
}

.gravity-orbit-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.05);
  stroke-width: 1;
  stroke-dasharray: 6 10;
  transition: all 0.3s;
}

.orbit-inner {
  stroke: rgba(245, 158, 11, 0.08);
}

.orbit-outer {
  stroke: rgba(56, 189, 248, 0.08);
}

/* Beams */
.cosmic-beam-base {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1.2;
  transition: all 0.3s ease;
}

.cosmic-beam-base.highlighted {
  stroke: #fbbf24;
  stroke-width: 2.4;
  opacity: 0.9;
}

.cosmic-beam-base.dimmed {
  opacity: 0.12;
}

.cosmic-beam-laser {
  stroke: url(#laser-gold);
  stroke-width: 1.8;
  stroke-dasharray: 6 18;
  animation: beam-flow 1.2s linear infinite;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.cosmic-beam-laser.highlighted {
  stroke: url(#laser-gold);
  stroke-width: 3;
  opacity: 1;
  animation: beam-flow 0.6s linear infinite;
}

.cosmic-beam-laser.active {
  stroke: url(#laser-active);
  stroke-width: 4;
  opacity: 1;
  animation: beam-flow 0.3s linear infinite;
}

@keyframes beam-flow {
  from {
    stroke-dashoffset: 48;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* ═══════════════════ 3D Glass Orbs (الأجرام الزجاجية المتوهجة) ═══════════════════ */
.cosmic-orb-body {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  cursor: grab;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity 0.3s ease,
    filter 0.3s ease,
    transform 0.1s linear;
}

.cosmic-orb-body.is-dimmed {
  opacity: 0.18;
  filter: grayscale(0.7) brightness(0.5);
}

.cosmic-orb-body.is-dragging {
  cursor: grabbing;
  z-index: 20 !important;
}

/* Volumetric Corona Aura */
.orb-corona-aura {
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  opacity: 0.55;
  filter: blur(10px);
  pointer-events: none;
  transition: all 0.3s ease;
}

.cosmic-orb-body:hover .orb-corona-aura,
.cosmic-orb-body.is-hovered .orb-corona-aura,
.cosmic-orb-body.is-active .orb-corona-aura {
  inset: -22px;
  opacity: 0.95;
  filter: blur(14px);
}

/* Supernova Shockwave */
.supernova-shockwave {
  position: absolute;
  inset: -18px;
  border-radius: 50%;
  border: 2px solid #fbbf24;
  animation: shockwave-expand 1s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
  pointer-events: none;
}

@keyframes shockwave-expand {
  0% {
    transform: scale(0.8);
    opacity: 1;
    border-color: #fbbf24;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
    border-color: #34d399;
  }
}

/* 3D Glass Sphere Structure */
.glass-sphere-3d {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.7),
    inset 0 -4px 8px rgba(0, 0, 0, 0.6),
    inset 0 2px 4px rgba(255, 255, 255, 0.6);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.cosmic-orb-body:hover .glass-sphere-3d,
.cosmic-orb-body.is-active .glass-sphere-3d {
  transform: scale(1.18);
}

/* Specular Glass Highlight Glint */
.sphere-specular-shine {
  position: absolute;
  top: 14%;
  left: 20%;
  width: 42%;
  height: 28%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(255, 255, 255, 0.1) 75%,
    transparent 100%
  );
  transform: rotate(-35deg);
  pointer-events: none;
}

/* Ambient Rim Light */
.sphere-rim-light {
  position: absolute;
  bottom: 0;
  left: 10%;
  right: 10%;
  height: 35%;
  border-radius: 50%;
  background: radial-gradient(ellipse at bottom, rgba(255, 255, 255, 0.4) 0%, transparent 80%);
  pointer-events: none;
}

.sphere-icon {
  font-size: 1.15rem;
  line-height: 1;
  z-index: 2;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  transition: transform 0.2s;
}

.cosmic-orb-body:hover .sphere-icon {
  transform: scale(1.1);
}

.sphere-live-led {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
  box-shadow:
    0 0 6px #34d399,
    0 0 12px #10b981;
  z-index: 3;
}

/* ═══════════════════ Distinct Celestial Palettes ═══════════════════ */

/* 🧠 Nucleus Brain Core */
.cosmic-orb-body.core-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #e9d5ff 0%,
    #a855f7 35%,
    #581c87 75%,
    #2e1065 100%
  );
  border: 1.5px solid rgba(233, 213, 255, 0.7);
}
.cosmic-orb-body.core-cat .orb-corona-aura {
  background: radial-gradient(circle, #a855f7 0%, #7c3aed 50%, transparent 75%);
}
.cosmic-orb-body.core-cat .sphere-icon {
  font-size: 1.5rem;
}
.cosmic-orb-body.is-nucleus .glass-sphere-3d {
  animation: nucleus-pulse 3s infinite ease-in-out;
}
@keyframes nucleus-pulse {
  0%,
  100% {
    box-shadow:
      0 0 30px rgba(168, 85, 247, 0.5),
      inset 0 -4px 8px rgba(0, 0, 0, 0.6),
      inset 0 2px 4px rgba(255, 255, 255, 0.8);
  }
  50% {
    box-shadow:
      0 0 50px rgba(233, 213, 255, 0.8),
      inset 0 -4px 8px rgba(0, 0, 0, 0.6),
      inset 0 2px 4px rgba(255, 255, 255, 0.95);
  }
}

/* ☕ Solar Amber Trigger (POS) */
.cosmic-orb-body.trigger-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #fef3c7 0%,
    #f59e0b 40%,
    #b45309 80%,
    #451a03 100%
  );
  border: 1.5px solid rgba(254, 243, 199, 0.6);
}
.cosmic-orb-body.trigger-cat .orb-corona-aura {
  background: radial-gradient(circle, #f59e0b 0%, #d97706 50%, transparent 75%);
}

/* 🫘 Emerald Nebula (Inventory) */
.cosmic-orb-body.emerald-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #d1fae5 0%,
    #10b981 40%,
    #047857 80%,
    #064e3b 100%
  );
  border: 1.5px solid rgba(209, 250, 229, 0.6);
}
.cosmic-orb-body.emerald-cat .orb-corona-aura {
  background: radial-gradient(circle, #10b981 0%, #059669 50%, transparent 75%);
}

/* ⏰ Cyan Chrono (Scheduler) */
.cosmic-orb-body.cyan-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #cffafe 0%,
    #06b6d4 40%,
    #0e7490 80%,
    #164e63 100%
  );
  border: 1.5px solid rgba(207, 250, 254, 0.6);
}
.cosmic-orb-body.cyan-cat .orb-corona-aura {
  background: radial-gradient(circle, #06b6d4 0%, #0891b2 50%, transparent 75%);
}

/* 🛡️ Ruby Shield (Security) */
.cosmic-orb-body.ruby-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #ffe4e6 0%,
    #f43f5e 40%,
    #be123c 80%,
    #4c0519 100%
  );
  border: 1.5px solid rgba(255, 228, 230, 0.6);
}
.cosmic-orb-body.ruby-cat .orb-corona-aura {
  background: radial-gradient(circle, #f43f5e 0%, #e11d48 50%, transparent 75%);
}

/* 🔄 Sapphire Flow (Balancing) */
.cosmic-orb-body.sapphire-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #dbeafe 0%,
    #3b82f6 40%,
    #1d4ed8 80%,
    #172554 100%
  );
  border: 1.5px solid rgba(219, 234, 254, 0.6);
}
.cosmic-orb-body.sapphire-cat .orb-corona-aura {
  background: radial-gradient(circle, #3b82f6 0%, #2563eb 50%, transparent 75%);
}

/* 💰 Imperial Gold (Cash Flow) */
.cosmic-orb-body.gold-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #fef08a 0%,
    #eab308 40%,
    #a16207 80%,
    #422006 100%
  );
  border: 1.5px solid rgba(254, 240, 138, 0.7);
}
.cosmic-orb-body.gold-cat .orb-corona-aura {
  background: radial-gradient(circle, #eab308 0%, #ca8a04 50%, transparent 75%);
}

/* 🗄️ Amethyst Vault (Database) */
.cosmic-orb-body.amethyst-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #ede9fe 0%,
    #8b5cf6 40%,
    #6d28d9 80%,
    #2e1065 100%
  );
  border: 1.5px solid rgba(237, 233, 254, 0.6);
}
.cosmic-orb-body.amethyst-cat .orb-corona-aura {
  background: radial-gradient(circle, #8b5cf6 0%, #7c3aed 50%, transparent 75%);
}

/* 🤖 Azure Bot (Telegram) */
.cosmic-orb-body.azure-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #e0f2fe 0%,
    #0284c7 40%,
    #0369a1 80%,
    #082f49 100%
  );
  border: 1.5px solid rgba(224, 242, 254, 0.7);
}
.cosmic-orb-body.azure-cat .orb-corona-aura {
  background: radial-gradient(circle, #0284c7 0%, #0369a1 50%, transparent 75%);
}

/* 📜 Rose Stream (Logs) */
.cosmic-orb-body.rose-cat .glass-sphere-3d {
  background: radial-gradient(
    circle at 35% 30%,
    #fce7f3 0%,
    #ec4899 40%,
    #be185d 80%,
    #500724 100%
  );
  border: 1.5px solid rgba(252, 231, 243, 0.6);
}
.cosmic-orb-body.rose-cat .orb-corona-aura {
  background: radial-gradient(circle, #ec4899 0%, #db2777 50%, transparent 75%);
}

/* Cosmic Floating Label */
.cosmic-label-wrap {
  position: absolute;
  top: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  white-space: nowrap;
}

.cosmic-label-pill {
  font-size: 0.74rem;
  font-weight: 800;
  color: #f4f4f5;
  background: rgba(10, 8, 20, 0.82);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 2px 9px;
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7);
  transition: all 0.2s;
}

.cosmic-orb-body:hover .cosmic-label-pill,
.cosmic-orb-body.is-active .cosmic-label-pill {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 14px rgba(251, 191, 36, 0.35);
}

.cosmic-sub-pill {
  font-size: 0.58rem;
  font-weight: 700;
  color: #a1a1aa;
}

/* Celestial Inspector HUD Card */
.celestial-inspector-card {
  position: absolute;
  top: 18px;
  left: 18px;
  width: 290px;
  background: rgba(12, 10, 24, 0.94);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius-lg);
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.8),
    0 0 30px rgba(245, 158, 11, 0.15);
  z-index: 30;
  overflow: hidden;
}

.inspector-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(139, 92, 246, 0.1));
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-close-cosmic {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #d4d4d8;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.btn-close-cosmic:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
  border-color: #ef4444;
}

.inspector-card-body {
  padding: 16px;
}

.cosmic-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}

.meta-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #a1a1aa;
}

.meta-val {
  font-size: 0.75rem;
  color: #f4f4f5;
}

.meta-badge {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.3);
}

.btn-fire-orb {
  background: linear-gradient(135deg, #d97706, #7c3aed);
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-weight: 900;
  box-shadow: 0 0 16px rgba(217, 119, 6, 0.4);
  transition: all 0.2s;
}

.btn-fire-orb:hover {
  box-shadow: 0 0 25px rgba(217, 119, 6, 0.7);
  transform: translateY(-1px);
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
