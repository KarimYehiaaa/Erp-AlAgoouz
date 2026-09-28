<template>
  <div class="automation-command-center" dir="rtl">
    <!-- ── 1. الهيدر والتحكم السريع ── -->
    <header class="hub-header">
      <div class="header-main">
        <div class="header-icon-badge">
          <AppIcon name="bot" :size="28" />
        </div>
        <div class="header-titles">
          <div class="title-with-badge">
            <h2>محرك الأتمتة والوكلاء الأذكياء</h2>
            <span class="engine-status-pill" :class="engineHealthClass">
              <span class="status-pulse" />
              {{ engineHealthLabel }}
            </span>
          </div>
          <p class="header-subtitle">
            مركز القيادة والرقابة التشغيلية: إدارة الوكلاء، مكافحة الاحتيال، مطابقة الورديات،
            وتنبيهات تليجرام لبن العجوز
          </p>
        </div>
      </div>

      <div class="header-quick-actions">
        <button
          class="btn btn-outline-soft"
          :class="{ 'btn-guide-active': showArchitectureGuide }"
          @click="showArchitectureGuide = !showArchitectureGuide"
          title="دليل الدورة التشغيلية الكاملة: إيه مربوط بإيه؟"
        >
          <AppIcon name="layers" :size="16" />
          <span>{{ showArchitectureGuide ? 'إخفاء الدليل' : 'دليل الدورة التشغيلية' }}</span>
        </button>
        <button
          class="btn btn-outline-soft"
          :disabled="loading"
          @click="loadAllData"
          title="تحديث كافة البيانات والسجلات"
        >
          <AppIcon name="refresh" :size="16" :class="{ 'spin-anim': loading }" />
          <span>تحديث شامل</span>
        </button>
        <button
          class="btn btn-primary-soft"
          @click="openTelegramModal"
          title="فحص فوري لاتصال بوت تليجرام"
        >
          <AppIcon name="send" :size="16" />
          <span>فحص تليجرام</span>
        </button>
      </div>
    </header>

    <!-- ── 2. لوحة المؤشرات التشغيلية الحية (Live KPI Command Bar) ── -->
    <section class="kpi-command-grid" aria-label="مؤشرات الأداء للأتمتة">
      <div class="kpi-card" :class="engineHealthClass">
        <div class="kpi-icon-wrap">
          <AppIcon name="activity" :size="22" />
        </div>
        <div class="kpi-data">
          <span class="kpi-label">حالة المحرك والمجدول</span>
          <strong class="kpi-value">{{ enabledTaskCount }} / {{ tasks.length }}</strong>
          <span class="kpi-subtext">وكيل نشط يعمل تلقائياً</span>
        </div>
      </div>

      <div class="kpi-card success">
        <div class="kpi-icon-wrap">
          <AppIcon name="check" :size="22" />
        </div>
        <div class="kpi-data">
          <span class="kpi-label">معدل نجاح التشغيل</span>
          <strong class="kpi-value">{{ successRatePct }}%</strong>
          <span class="kpi-subtext"
            >{{ successfulExecutionCount }} ناجح من آخر {{ executionLogs.length }}</span
          >
        </div>
      </div>

      <div class="kpi-card" :class="failedExecutionCount > 0 ? 'danger' : 'neutral'">
        <div class="kpi-icon-wrap">
          <AppIcon name="alertTriangle" :size="22" />
        </div>
        <div class="kpi-data">
          <span class="kpi-label">تنبيهات وملاحظات الرقابة</span>
          <strong class="kpi-value">{{ failedExecutionCount }}</strong>
          <span class="kpi-subtext">{{
            failedExecutionCount === 0 ? 'كل الفحوصات آمنة ومطابقة' : 'عمليات تتطلب المراجعة'
          }}</span>
        </div>
      </div>

      <div class="kpi-card accent">
        <div class="kpi-icon-wrap">
          <AppIcon name="clock" :size="22" />
        </div>
        <div class="kpi-data">
          <span class="kpi-label">متوسط سرعة الاستجابة</span>
          <strong class="kpi-value">{{ averageExecutionMs }}ms</strong>
          <span class="kpi-subtext">آخر نشاط: {{ latestExecutionLabel }}</span>
        </div>
      </div>
    </section>

    <!-- ── 2b. بطاقة الدورة التشغيلية الشاملة والترابط (إيه مربوط بإيه؟) ── -->
    <transition name="slide-fade">
      <section
        v-if="showArchitectureGuide"
        class="architecture-guide-card"
        aria-label="دليل الدورة التشغيلية لمحرك الأتمتة"
      >
        <div class="guide-header">
          <div class="guide-title-wrap">
            <div class="guide-icon-badge">
              <AppIcon name="layers" :size="22" />
            </div>
            <div>
              <h3>الدورة التشغيلية لمحرك الأتمتة: إيه مربوط بإيه؟</h3>
              <p>
                خريطة متكاملة توضح مسار تدفق البيانات، من لحظة البيع بالمحل حتى إرسال الإشعارات
                وقرارات الرقابة
              </p>
            </div>
          </div>
          <button
            class="btn btn-ghost-sm"
            @click="showArchitectureGuide = false"
            title="إغلاق الدليل"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <!-- خطوات الدورة التشغيلية -->
        <div class="guide-flow-steps">
          <div class="flow-step-box">
            <div class="step-num">1</div>
            <div class="step-content">
              <strong>المدخلات والعمليات الحية</strong>
              <span>مبيعات POS، فواتير جملة، إغلاق وردية، مشتريات، وحركات المخزن</span>
            </div>
          </div>
          <div class="flow-arrow">➔</div>
          <div class="flow-step-box">
            <div class="step-num">2</div>
            <div class="step-content">
              <strong>محرك الرصد والمجدول</strong>
              <span>مشغلات فورية (Event) ومشغلات زمنية دورية (Cron) بتوقيت القاهرة</span>
            </div>
          </div>
          <div class="flow-arrow">➔</div>
          <div class="flow-step-box">
            <div class="step-num">3</div>
            <div class="step-content">
              <strong>معالجة القواعد والرقابة</strong>
              <span>تفكيك الوصفات، تدقيق الخصم والعهدة، رصد النواقص، درع السيولة</span>
            </div>
          </div>
          <div class="flow-arrow">➔</div>
          <div class="flow-step-box highlight">
            <div class="step-num">4</div>
            <div class="step-content">
              <strong>قنوات التنبيه والتوثيق</strong>
              <span>بوت تليجرام للمالك + إشعارات النظام الداخلية + توثيق كامل بالسجلات</span>
            </div>
          </div>
        </div>

        <!-- أعمدة الترابط الأربعة -->
        <div class="guide-pillars-grid">
          <div class="pillar-card sales">
            <div class="pillar-header">
              <span class="pillar-tag">💰 محور المبيعات والإغلاق</span>
            </div>
            <h4>ربط حركات البيع اليومية بالتقارير</h4>
            <p>
              كل عملية بيع تخصم فورياً من المخزن عبر الوصفات، وعند نهاية اليوم يجمع المجدول
              الإحصائيات الشاملة.
            </p>
            <ul class="pillar-list">
              <li>
                <strong>تقرير الإغلاق اليومي:</strong> يرسل 11:30 ليلاً للمالك بأعلى الأصناف مبيعاً
                وصافي الأرباح والمصروفات.
              </li>
              <li>
                <strong>كاشف هوامش الأرباح:</strong> يراقب هامش الربح اليومي وينبه فوراً إذا انخفض
                عن 28%.
              </li>
              <li>
                <strong>استعادة العملاء المنقطعين:</strong> ينبه أسبوعياً بالعملاء الدائمين
                المنقطعين لأكثر من 30 يوماً.
              </li>
              <li>
                <strong>حارس المديونيات والائتمان:</strong> رصد دوري لمديونيات عملاء الجملة والتجزئة
                والإنذار عند تجاوز الحد الائتماني.
              </li>
            </ul>
          </div>

          <div class="pillar-card security">
            <div class="pillar-header">
              <span class="pillar-tag">🛡️ محور الرقابة ومكافحة الاحتيال</span>
            </div>
            <h4>كشف فوري للتلاعب المالي والخصومات</h4>
            <p>
              حماية لحظية غير قابلة للتجاوز — أي حركة غير طبيعية في الكاشير تنطلق فورياً دون انتظار
              نهاية اليوم.
            </p>
            <ul class="pillar-list">
              <li>
                <strong>كشف إلغاء الفواتير:</strong> إنذار لحظي فوري عند إلغاء أي فاتورة بعد إصدارها
                بالـ POS.
              </li>
              <li>
                <strong>تنبيه الخصومات المرتفعة:</strong> رصد لحظي فوري لأي خصم يتجاوز 15% مع اسم
                الكاشير.
              </li>
              <li>
                <strong>مطابقة عهدة الوردية:</strong> فحص فوري عند إغلاق الشيفت لكشف أي عجز نقدية ≥
                10 ج.م.
              </li>
              <li>
                <strong>حارس الاحتيال اليومي:</strong> تدقيق ليلي مجمّع لكل العمليات المشبوهة لآخر
                24 ساعة.
              </li>
            </ul>
          </div>

          <div class="pillar-card inventory">
            <div class="pillar-header">
              <span class="pillar-tag">📦 محور المخزون وخامات التحميص</span>
            </div>
            <h4>ضبط أرصدة البن وموازنة المخازن</h4>
            <p>
              ربط خامات حبوب البن الخضراء والمحمصة ومستلزمات البار بحدود الأمان ومحرك تفكيك الوصفات.
            </p>
            <ul class="pillar-list">
              <li>
                <strong>إنذار نقص المخزون:</strong> فحص مرتين يومياً (10 ص و 6 م) لتفادي نفاد خامات
                القهوة.
              </li>
              <li>
                <strong>حارس المشتريات وتوريد المخزن:</strong> التحقق من دخول مشتريات البن والخامات
                للمخزن آلياً وتنبيه الإدارة عند ارتفاع سعر التكلفة.
              </li>
              <li>
                <strong>مدقق أكياس البن ومطابقة الأكواب:</strong> مطابقة عدد الأكواب والمشروبات
                المباعة ومبيعات أكياس البن لرصد الهدر والتسريب.
              </li>
              <li>
                <strong>المناقلات الذكية:</strong> اقتراح مناقلة بضاعة من المخزن الرئيسي إلى مخزن
                الصالة بدلاً من الشراء.
              </li>
              <li>
                <strong>حارس الهدر والفاقد:</strong> رصد حركات التالف والهدر ومقارنتها بالمعيار
                لحماية تكلفة التشغيل.
              </li>
            </ul>
          </div>

          <div class="pillar-card system">
            <div class="pillar-header">
              <span class="pillar-tag">🖥️ محور السيولة واستقرار النظام</span>
            </div>
            <h4>تأمين السيولة وسلامة السيرفر والذكاء</h4>
            <p>
              مراقبة استباقية للالتزامات المالية والنسخ الاحتياطي وحالة السيرفر والذكاء الاصطناعي.
            </p>
            <ul class="pillar-list">
              <li>
                <strong>مستحقات الموردين:</strong> تذكير بالدفعات الآجلة قبل تاريخ استحقاقها بـ 3
                أيام.
              </li>
              <li>
                <strong>درع السيولة:</strong> توقع الرصيد النقدي والالتزامات لـ 30 يوماً والتنبيه
                بالعجز مقدماً.
              </li>
              <li>
                <strong>النسخ الاحتياطي:</strong> التحقق من عمر آخر نسخة احتياطية مشفرة خلال 24
                ساعة.
              </li>
              <li>
                <strong>Gemini AI Copilot:</strong> ملخص تحليلي يومي ذكي وتوصيات عملية لإدارة المحل.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </transition>

    <!-- ── 3. تبويبات التنظيم الكبرى (Hub Navigation Tabs) ── -->
    <nav class="hub-tabs-nav" role="tablist">
      <button
        type="button"
        class="tab-nav-btn"
        :class="{ active: activeHubTab === 'agents' }"
        @click="switchTab('agents')"
        role="tab"
        :aria-selected="activeHubTab === 'agents'"
      >
        <AppIcon name="shield" :size="18" />
        <span>وكلاء الأتمتة والمهام</span>
        <span class="tab-counter">{{ tasks.length }}</span>
      </button>

      <button
        type="button"
        class="tab-nav-btn"
        :class="{ active: activeHubTab === 'workflow' }"
        @click="switchTab('workflow')"
        role="tab"
        :aria-selected="activeHubTab === 'workflow'"
      >
        <AppIcon name="layers" :size="18" />
        <span>خريطة سير العمليات التفاعلية</span>
      </button>

      <button
        type="button"
        class="tab-nav-btn"
        :class="{ active: activeHubTab === 'logs' }"
        @click="switchTab('logs')"
        role="tab"
        :aria-selected="activeHubTab === 'logs'"
      >
        <AppIcon name="clipboardList" :size="18" />
        <span>سجل التشغيل والتدقيق</span>
        <span class="tab-counter" v-if="executionLogs.length">{{ executionLogs.length }}</span>
      </button>

      <button
        type="button"
        class="tab-nav-btn"
        :class="{ active: activeHubTab === 'telegram' }"
        @click="switchTab('telegram')"
        role="tab"
        :aria-selected="activeHubTab === 'telegram'"
      >
        <AppIcon name="send" :size="18" />
        <span>قنوات تليجرام والإشعارات</span>
        <span
          class="badge-dot-live"
          :class="telegramConfigured.hasToken ? 'online' : 'offline'"
          :title="telegramConfigured.hasToken ? 'البوت متصل' : 'البوت غير مضبوط'"
        />
      </button>

      <button
        type="button"
        class="tab-nav-btn"
        :class="{ active: activeHubTab === 'copilot' }"
        @click="switchTab('copilot')"
        role="tab"
        :aria-selected="activeHubTab === 'copilot'"
      >
        <AppIcon name="brain" :size="18" />
        <span>المساعد الذكي Gemini</span>
      </button>
    </nav>

    <!-- ═════════════════════════════════════════════════════════
         التبويب الأول: وكلاء الأتمتة والمهام (AGENTS & TASKS)
         ═════════════════════════════════════════════════════════ -->
    <div v-show="activeHubTab === 'agents'" class="hub-tab-body">
      <!-- شريط التصفية والبحث -->
      <div class="tasks-toolbar">
        <div class="filter-pills-list" role="radiogroup" aria-label="تصفية الوكلاء حسب القسم">
          <button
            type="button"
            class="filter-pill"
            :class="{ active: selectedCategory === 'all' }"
            @click="selectedCategory = 'all'"
          >
            الكل ({{ tasks.length }})
          </button>
          <button
            type="button"
            class="filter-pill"
            :class="{ active: selectedCategory === 'sales' }"
            @click="selectedCategory = 'sales'"
          >
            💰 مبيعات وإغلاق ({{ getCategoryCount('sales') }})
          </button>
          <button
            type="button"
            class="filter-pill"
            :class="{ active: selectedCategory === 'inventory' }"
            @click="selectedCategory = 'inventory'"
          >
            📦 مخزون وخامات البن ({{ getCategoryCount('inventory') }})
          </button>
          <button
            type="button"
            class="filter-pill"
            :class="{ active: selectedCategory === 'security' }"
            @click="selectedCategory = 'security'"
          >
            🛡️ رقابة ومكافحة الاحتيال ({{ getCategoryCount('security') }})
          </button>
          <button
            type="button"
            class="filter-pill"
            :class="{ active: selectedCategory === 'system' }"
            @click="selectedCategory = 'system'"
          >
            🖥️ نظام ونسخ احتياطي ({{ getCategoryCount('system') }})
          </button>
        </div>

        <div class="search-box-wrap">
          <AppIcon name="search" :size="16" class="search-icon" />
          <input
            v-model="tasksSearchQuery"
            type="text"
            class="search-input"
            placeholder="بحث في أسماء ومهام الوكلاء..."
          />
          <button
            v-if="tasksSearchQuery"
            class="search-clear-btn"
            @click="tasksSearchQuery = ''"
            title="مسح"
          >
            <AppIcon name="close" :size="14" />
          </button>
        </div>
      </div>

      <!-- شبكة بطاقات الوكلاء الحديثة والمريحة بصرياً -->
      <div class="agent-cards-grid">
        <div
          v-for="task in filteredTasks"
          :key="task.key"
          class="agent-card-modern"
          :class="[task.category, { 'agent-disabled': !task.is_enabled }]"
        >
          <!-- رأس البطاقة: الهوية والأيقونة ومفتاح التفعيل -->
          <div class="card-top-bar">
            <div class="card-identity">
              <div class="agent-icon-avatar" :class="task.category">
                <AppIcon :name="getTaskIcon(task.key)" :size="20" />
              </div>
              <div class="agent-title-block">
                <h3 class="agent-name">{{ task.name_ar }}</h3>
                <div class="agent-tag-row">
                  <span class="category-pill" :class="task.category">
                    {{ categoryLabels[task.category] || task.category }}
                  </span>
                  <span v-if="task.trigger_type === 'cron'" class="trigger-pill scheduled">
                    <AppIcon name="clock" :size="11" />
                    <span>مجدول آلياً</span>
                  </span>
                  <span v-else class="trigger-pill event-driven">
                    <AppIcon name="zap" :size="11" />
                    <span>فوري عند الحدث</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- زر التبديل التفاعلي السلس iOS Style -->
            <label
              class="ios-toggle-switch"
              :class="{ disabled: togglingKey === task.key }"
              :title="task.is_enabled ? 'تعطيل الوكيل مؤقتاً' : 'تفعيل الوكيل'"
            >
              <input
                type="checkbox"
                :checked="task.is_enabled"
                :disabled="togglingKey === task.key"
                @change="handleToggleTask(task)"
              />
              <span class="ios-slider" />
            </label>
          </div>

          <!-- وصف المهمة بانسيابية وراحة بصرية -->
          <p class="agent-desc">{{ task.description_ar }}</p>

          <!-- شريط مسار الربط المصغر: إيه مربوط بإيه؟ -->
          <div class="visual-pipeline-strip">
            <div class="pipeline-node source" title="مصدر البيانات المشغلة">
              <span class="node-role">المصدر</span>
              <span class="node-text">{{
                taskLinkageMap[task.key]?.source || 'حركات النظام'
              }}</span>
            </div>

            <div class="pipeline-flow-connector">
              <AppIcon name="arrowLeft" :size="12" />
            </div>

            <div class="pipeline-node trigger" title="طريقة وتوقيت التشغيل">
              <span class="node-role">المشغل</span>
              <span class="node-text">{{
                taskLinkageMap[task.key]?.triggerDesc ||
                humanizeSchedule(task.cron_expression, task.trigger_type)
              }}</span>
            </div>

            <div class="pipeline-flow-connector">
              <AppIcon name="arrowLeft" :size="12" />
            </div>

            <div class="pipeline-node target" title="الوجهة والقنوات">
              <span class="node-role">الوجهة</span>
              <span class="node-text">{{
                taskLinkageMap[task.key]?.target || 'بوت تليجرام للمالك'
              }}</span>
            </div>
          </div>

          <!-- ذيل البطاقة: مؤشر الحالة وزر التشغيل الفوري -->
          <div class="agent-card-footer">
            <div class="status-indicator-block">
              <span
                class="status-dot"
                :class="task.last_status ? `dot-${task.last_status}` : 'dot-idle'"
              />
              <div class="status-meta">
                <span class="status-time" v-if="task.last_run_at">
                  آخر تشغيل: {{ formatTime(task.last_run_at) }}
                </span>
                <span class="status-time idle" v-else>بانتظار أول تشغيل</span>
                <span
                  v-if="task.last_status"
                  class="status-text-pill"
                  :class="`status-${task.last_status}`"
                >
                  {{ getStatusLabel(task.last_status) }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="btn-trigger-action"
              :disabled="runningTaskKey === task.key"
              @click="handleRunTaskNow(task)"
              title="تشغيل الوكيل فوراً واستعراض التقرير الناتج"
            >
              <AppIcon
                v-if="runningTaskKey === task.key"
                name="refresh"
                :size="13"
                class="spin-anim"
              />
              <AppIcon v-else name="play" :size="13" />
              <span>{{ runningTaskKey === task.key ? 'جاري الفحص...' : 'تشغيل فوري' }}</span>
            </button>
          </div>
        </div>

        <!-- حالة عدم وجود نتائج للبحث -->
        <div v-if="filteredTasks.length === 0" class="empty-agents-state">
          <AppIcon name="search" :size="48" class="empty-icon" />
          <h4>لا توجد مهام تطابق البحث</h4>
          <p>جرّب اختيار تصنيف آخر أو مسح كلمة البحث.</p>
          <button class="btn btn-outline btn-sm" @click="resetFilters">إعادة ضبط التصفية</button>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════
         التبويب الثاني: خريطة سير العمليات التفاعلية (WORKFLOW PIPELINE)
         ═════════════════════════════════════════════════════════ -->
    <div v-show="activeHubTab === 'workflow'" class="hub-tab-body workflow-tab">
      <!-- محرك الفيزياء والحركة الحقيقي: الكانفس والتفاعل معزولان في مكوّن مستقل -->
      <WorkflowCanvas :active="activeHubTab === 'workflow'" />
    </div>

    <!-- ═════════════════════════════════════════════════════════
         التبويب الثالث: سجل التشغيل والتدقيق (EXECUTION AUDIT LOGS)
         ═════════════════════════════════════════════════════════ -->
    <div v-show="activeHubTab === 'logs'" class="hub-tab-body">
      <div class="logs-card card">
        <div class="logs-card-header">
          <div class="logs-title-wrap">
            <AppIcon name="clipboardList" :size="20" />
            <div>
              <h3>سجل التشغيل والتدقيق الحي للوكلاء</h3>
              <p>سجل زمني موثق لكل عملية فحص أو تقرير مؤتمت تم تنفيذه مع زمن الاستجابة</p>
            </div>
          </div>

          <div class="logs-actions">
            <button class="btn btn-outline btn-xs" @click="refreshExecutionLogs">
              <AppIcon name="refresh" :size="12" /> تحديث السجل
            </button>
          </div>
        </div>

        <div class="logs-table-container">
          <table class="logs-table" v-if="executionLogs.length">
            <thead>
              <tr>
                <th>المهمة / الوكيل</th>
                <th>نوع المشغل</th>
                <th>الحالة</th>
                <th>زمن التنفيذ</th>
                <th>التاريخ والوقت</th>
                <th>الرسالة / النتيجة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in executionLogs" :key="log.id">
                <td class="log-task-name">
                  <strong>{{ log.name_ar || log.key || log.title }}</strong>
                </td>
                <td>
                  <span class="source-tag" :class="log.trigger_source">
                    {{ log.trigger_source === 'scheduler' ? 'مجدول آلي' : 'تشغيل تجريبي' }}
                  </span>
                </td>
                <td>
                  <span class="status-pill-table" :class="`status-${log.status}`">
                    {{ getStatusLabel(log.status) }}
                  </span>
                </td>
                <td class="duration-cell">
                  {{ log.duration_ms != null ? `${log.duration_ms}ms` : '—' }}
                </td>
                <td class="timestamp-cell">{{ formatTime(log.created_at) }}</td>
                <td class="log-message-cell" :title="log.message">
                  {{ log.message }}
                </td>
                <td>
                  <button
                    class="btn btn-ghost-sm"
                    @click="openReportModalFromLog(log)"
                    title="استعراض تفاصيل التقرير"
                  >
                    <AppIcon name="eye" :size="14" />
                    عرض
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-else class="logs-empty-state">
            <AppIcon name="clipboardList" :size="40" />
            <p>
              لا توجد سجلات تشغيل بعد. يمكنك تشغيل أي وكيل فوري من تبويب الوكلاء لتوثيق نتائجه هنا.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════
          التبويب الرابع: قنوات تليجرام والإشعارات (TELEGRAM & CHANNELS)
          ═════════════════════════════════════════════════════════ -->
    <div v-show="activeHubTab === 'telegram'" class="hub-tab-body">
      <!-- شريط الحالة المباشرة للاتصال -->
      <div
        class="telegram-live-banner"
        :class="telegramStatus.connected ? 'is-connected' : 'is-disconnected'"
      >
        <div class="banner-status-icon">
          <AppIcon :name="telegramStatus.connected ? 'check' : 'warning'" :size="24" />
        </div>
        <div class="banner-status-info">
          <div class="banner-title-line">
            <h4>
              {{
                telegramStatus.connected
                  ? `متصل بالبوت: @${telegramStatus.botUsername} (${telegramStatus.botFirstName || ''})`
                  : 'بوت تليجرام غير متصل حالياً'
              }}
            </h4>
            <span
              class="connection-tag"
              :class="telegramStatus.connected ? 'tag-online' : 'tag-offline'"
            >
              {{ telegramStatus.connected ? '🟢 متصل ونشط' : '🔴 غير متصل' }}
            </span>
          </div>
          <p v-if="telegramStatus.connected">
            الاستماع التفاعلي للأوامر نشط. يمكنك مراسلة البوت مباشرة من تليجرام بالأوامر:
            <code>/مبيعات</code>، <code>/خزينة</code>، <code>/نواقص</code>، <code>/مناقلات</code>،
            <code>/سيرفر</code>
          </p>
          <p v-else class="banner-error-desc">
            {{
              telegramStatus.error ||
              'يرجى إدخال رمز بوت صالح (Bot Token) من @BotFather وحفظ الإعدادات بالأسفل لتفعيل الإشعارات والأوامر.'
            }}
          </p>
        </div>
        <div class="banner-actions" v-if="telegramStatus.connected && telegramStatus.botUsername">
          <a
            :href="`https://t.me/${telegramStatus.botUsername}`"
            target="_blank"
            class="btn btn-outline btn-sm"
          >
            <AppIcon name="external-link" :size="14" />
            <span>فتح شات البوت</span>
          </a>
        </div>
      </div>

      <div class="telegram-grid">
        <!-- العمود الأول: إعدادات وربط البوت + دليل الاستخدام -->
        <div class="telegram-col">
          <!-- كارت إعداد بيانات البوت -->
          <div class="card telegram-config-card">
            <div class="card-head">
              <div class="head-with-icon">
                <AppIcon name="settings" :size="20" class="telegram-brand-icon" />
                <div>
                  <h3>إعداد وتحديث بيانات بوت تليجرام</h3>
                  <p>ربط توكن البوت وتحديد معرفات الشات المصرح لها بالوصول</p>
                </div>
              </div>
            </div>

            <form class="telegram-settings-form" @submit.prevent="handleSaveTelegramSettings">
              <!-- حقل رمز البوت -->
              <div class="form-group">
                <div class="form-label-row">
                  <label for="tg-bot-token">رمز البوت (Bot Token)</label>
                  <button type="button" class="btn-text-action" @click="showToken = !showToken">
                    <AppIcon :name="showToken ? 'eye-off' : 'eye'" :size="13" />
                    <span>{{ showToken ? 'إخفاء' : 'إظهار' }}</span>
                  </button>
                </div>
                <div class="token-input-wrapper">
                  <input
                    id="tg-bot-token"
                    v-model="telegramForm.bot_token"
                    :type="showToken ? 'text' : 'password'"
                    class="form-control ltr-input"
                    placeholder="مثال: 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    dir="ltr"
                    required
                  />
                  <button
                    type="button"
                    class="btn btn-outline btn-xs"
                    :disabled="verifyingTelegramToken || !telegramForm.bot_token.trim()"
                    @click="handleVerifyToken"
                  >
                    <AppIcon
                      v-if="verifyingTelegramToken"
                      name="refresh"
                      :size="12"
                      class="spin-anim"
                    />
                    <AppIcon v-else name="check" :size="12" />
                    <span>{{ verifyingTelegramToken ? 'جاري الفحص...' : 'فحص الرمز' }}</span>
                  </button>
                </div>
                <!-- نتيجة فحص الرمز -->
                <div
                  v-if="tokenVerificationResult"
                  class="token-verify-result"
                  :class="tokenVerificationResult.ok ? 'verify-ok' : 'verify-fail'"
                >
                  <span v-if="tokenVerificationResult.ok">
                    ✅ رمز صالح ومتصل بالبوت:
                    <strong>@{{ tokenVerificationResult.bot?.username }}</strong> ({{
                      tokenVerificationResult.bot?.firstName
                    }})
                  </span>
                  <span v-else> ❌ {{ tokenVerificationResult.error }} </span>
                </div>
              </div>

              <!-- حقل معرف الشات -->
              <div class="form-group">
                <label for="tg-chat-id">معرف الشات الافتراضي (Default Chat ID)</label>
                <input
                  id="tg-chat-id"
                  v-model="telegramForm.chat_id"
                  type="text"
                  class="form-control ltr-input"
                  placeholder="مثال: 1092703744 أو -100123456789"
                  dir="ltr"
                  required
                />
                <small class="form-hint">
                  💡 للحصول على معرفك فوراً: افتح تليجرام وابحث عن
                  <strong>@userinfobot</strong> واضغط Start، أو راسل البوت الخاص بك وسيخبرك بمعرفك.
                </small>
              </div>

              <!-- حقل الشاتات الإضافية المصرح لها -->
              <div class="form-group">
                <label for="tg-allowed-chats"
                  >شاتات إضافية مصرح لها (اختياري - مفصولة بفاصلة)</label
                >
                <input
                  id="tg-allowed-chats"
                  v-model="telegramForm.allowed_chats"
                  type="text"
                  class="form-control ltr-input"
                  placeholder="مثال: 1092703744, 987654321"
                  dir="ltr"
                />
                <small class="form-hint">
                  لحماية البيانات، البوت يرفض الرد على أي حساب غير موجود في هذه القائمة.
                </small>
              </div>

              <!-- زر الحفظ والتفعيل -->
              <div class="form-actions">
                <button
                  type="submit"
                  class="btn btn-primary btn-save-bot"
                  :disabled="
                    savingTelegramSettings ||
                    !telegramForm.bot_token.trim() ||
                    !telegramForm.chat_id.trim()
                  "
                >
                  <AppIcon
                    v-if="savingTelegramSettings"
                    name="refresh"
                    :size="14"
                    class="spin-anim"
                  />
                  <AppIcon v-else name="save" :size="14" />
                  <span>{{
                    savingTelegramSettings ? 'جاري الحفظ والتوصيل...' : 'حفظ وتفعيل البوت الآن'
                  }}</span>
                </button>
              </div>

              <!-- رسالة التغذية الراجعة بعد الحفظ -->
              <div
                v-if="telegramSaveFeedback"
                class="feedback-banner"
                :class="telegramSaveFeedback.type"
              >
                {{ telegramSaveFeedback.text }}
              </div>
            </form>
          </div>

          <!-- بطاقة دليل الإنشاء السريع للبوت -->
          <div class="card telegram-guide-card">
            <h4>📖 كيف تنشئ بوت تليجرام في دقيقة واحدة؟</h4>
            <ol class="setup-steps">
              <li>
                <strong>الخطوة 1:</strong> افتح تطبيق تليجرام وابحث عن <code>@BotFather</code>.
              </li>
              <li>
                <strong>الخطوة 2:</strong> أرسل له الأمر <code>/newbot</code> ثم اختر اسماً للبوت
                ومعرفاً ينتهي بكلمة <code>bot</code>.
              </li>
              <li>
                <strong>الخطوة 3:</strong> سينشئ BotFather الـ <strong>HTTP API Token</strong>،
                انسخه والصقه في خانة <em>رمز البوت</em> أعلاه.
              </li>
              <li>
                <strong>الخطوة 4:</strong> افتح شات البوت الجديد على تليجرام واضغط
                <strong>Start</strong> لفتح المحادثة، ثم اضغط <em>حفظ وتفعيل</em>.
              </li>
            </ol>
          </div>
        </div>

        <!-- العمود الثاني: الإرسال التجريبي + سجل الرسائل الصادرة والواردة -->
        <div class="telegram-col">
          <!-- نموذج إرسال رسالة اختبارية -->
          <div class="card telegram-status-card">
            <div class="card-head">
              <div class="head-with-icon">
                <AppIcon name="send" :size="20" class="telegram-brand-icon" />
                <div>
                  <h3>إرسال رسالة تجريبية فورية</h3>
                  <p>التحقق من وصول التنبيهات لشات المالك بنجاح</p>
                </div>
              </div>
            </div>

            <div class="telegram-tester-box">
              <div class="quick-templates-bar">
                <button
                  class="template-chip"
                  @click="
                    customTelegramMsg = 'اختبار تجريبي: محرك الأتمتة لبن العجوز يعمل بكفاءة! ☕'
                  "
                >
                  رسالة ترحيبية
                </button>
                <button
                  class="template-chip"
                  @click="
                    customTelegramMsg =
                      '📊 اختبار ملخص المبيعات:\nتم استلام حركة اليوم بنجاح وجميع الحسابات متوازنة. ✅'
                  "
                >
                  نموذج إغلاق
                </button>
              </div>
              <div class="send-input-group">
                <input
                  v-model="customTelegramMsg"
                  type="text"
                  class="telegram-input"
                  placeholder="اكتب رسالة تجريبية لتصل إلى تليجرام..."
                />
                <button
                  class="btn btn-primary"
                  :disabled="sendingTelegramTest || !telegramConfigured.hasToken"
                  @click="handleSendTelegramTest"
                >
                  <AppIcon v-if="sendingTelegramTest" name="refresh" :size="14" class="spin-anim" />
                  <AppIcon v-else name="send" :size="14" />
                  <span>{{ sendingTelegramTest ? 'جاري الإرسال...' : 'إرسال الآن' }}</span>
                </button>
              </div>

              <div
                v-if="telegramSendFeedback"
                class="feedback-banner"
                :class="telegramSendFeedback.type"
              >
                {{ telegramSendFeedback.text }}
              </div>
            </div>
          </div>

          <!-- سجل الرسائل الصادرة لتليجرام -->
          <div class="card telegram-logs-card">
            <div class="card-head">
              <div class="head-with-icon">
                <AppIcon name="clipboardList" :size="20" />
                <div>
                  <h3>آخر الرسائل والتنبيهات المرسلة</h3>
                  <p>سجل الشات التلقائي الصادر من النظام إلى تليجرام</p>
                </div>
              </div>
              <button class="btn btn-outline btn-xs" @click="refreshTelegramLogs">
                <AppIcon name="refresh" :size="12" /> تحديث
              </button>
            </div>

            <div class="telegram-messages-feed" v-if="telegramLogs.length">
              <div
                v-for="msg in telegramLogs"
                :key="msg.id"
                class="telegram-msg-bubble"
                :class="msg.direction"
              >
                <div class="bubble-header">
                  <span class="bubble-sender">{{
                    msg.direction === 'out' ? 'النظام 🤖' : 'المالك 👤'
                  }}</span>
                  <span class="bubble-time">{{ formatTime(msg.created_at) }}</span>
                </div>
                <div class="bubble-body" v-html="formatHtmlMessage(msg.message)" />
                <div v-if="msg.ai_response" class="bubble-ai-reply">
                  <strong>رد Gemini:</strong>
                  <span>{{ msg.ai_response }}</span>
                </div>
              </div>
            </div>
            <div v-else class="feed-empty-state">
              <AppIcon name="send" :size="32" />
              <p>لا توجد رسائل مرسلة مسجلة في قاعدة البيانات بعد.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════
         التبويب الخامس: المساعد الذكي Gemini (AI COPILOT)
         ═════════════════════════════════════════════════════════ -->
    <div v-show="activeHubTab === 'copilot'" class="hub-tab-body">
      <div class="copilot-container card">
        <div class="copilot-header">
          <div class="copilot-title-group">
            <span class="gemini-sparkle-icon">
              <AppIcon name="brain" :size="24" />
            </span>
            <div>
              <h3>المساعد التحليلي الذكي (Gemini AI Copilot)</h3>
              <p>
                استشارات فورية لتحليل هوامش الأرباح، توصيات خطة تحميص البن، وكشف بواقي النواقص
                والسيولة
              </p>
            </div>
          </div>
        </div>

        <div class="copilot-quick-prompts">
          <span class="prompts-label">أوامر سريعة مقترحة:</span>
          <button
            class="prompt-chip"
            @click="
              aiTestPrompt = 'حلل لي مبيعات المحل لليوم وأعطني 3 توصيات لتحسين متوسط قيمة الفاتورة.'
            "
          >
            💡 توصيات رفع مبيعات الفواتير
          </button>
          <button
            class="prompt-chip"
            @click="
              aiTestPrompt =
                'ما هي أولويات التحميص والشراء بناءً على الأرصدة الحالية وحد إعادة الطلب؟'
            "
          >
            ☕ أولويات تحميص البن
          </button>
          <button
            class="prompt-chip"
            @click="aiTestPrompt = 'ما هو التقييم المالي لمخاطر السيولة ومستحقات الموردين القادمة؟'"
          >
            💰 تقييم مخاطر السيولة
          </button>
        </div>

        <div class="copilot-input-area">
          <textarea
            v-model="aiTestPrompt"
            class="copilot-textarea"
            rows="3"
            placeholder="اكتب سؤالك أو استفسارك الإداري للمساعد الذكي..."
          />
          <div class="copilot-controls">
            <button
              class="btn btn-primary"
              :disabled="testingAi || !aiTestPrompt.trim()"
              @click="handleTestAi"
            >
              <AppIcon v-if="testingAi" name="refresh" :size="14" class="spin-anim" />
              <AppIcon v-else name="bot" :size="14" />
              <span>{{ testingAi ? 'جاري التفكير والتحليل...' : 'اسأل المساعد الذكي' }}</span>
            </button>
          </div>
        </div>

        <div v-if="aiTestReply" class="copilot-response-box">
          <div class="response-header">
            <AppIcon name="bot" :size="18" />
            <strong>إجابة وتحليل الوكيل الذكي:</strong>
          </div>
          <div class="response-body markdown-rendered" v-html="formatHtmlMessage(aiTestReply)" />
        </div>
      </div>
    </div>

    <!-- ═════════════════════════════════════════════════════════
         نافذة استعراض التقارير والنتائج (REPORT INSPECTOR MODAL)
         ═════════════════════════════════════════════════════════ -->
    <div v-if="activeReportModal" class="modal-overlay" @click.self="activeReportModal = null">
      <div class="report-modal-card card glass-card">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="report-icon-badge" :class="activeReportModal.status">
              <AppIcon
                :name="
                  activeReportModal.status === 'success'
                    ? 'check'
                    : activeReportModal.status === 'warning'
                      ? 'alertTriangle'
                      : 'close'
                "
                :size="20"
              />
            </span>
            <div>
              <h3>{{ activeReportModal.title }}</h3>
              <p class="modal-subtitle">
                {{ formatTime(activeReportModal.time) }} ·
                <span class="status-text-badge" :class="activeReportModal.status">
                  {{ getStatusLabel(activeReportModal.status) }}
                </span>
              </p>
            </div>
          </div>
          <button class="modal-close-btn" @click="activeReportModal = null" title="إغلاق">
            <AppIcon name="close" :size="18" />
          </button>
        </div>

        <div class="modal-body report-modal-content">
          <div class="report-text-view" v-html="formatHtmlMessage(activeReportModal.text)" />
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" @click="copyReportText(activeReportModal.text)">
            <AppIcon name="fileText" :size="14" />
            <span>نسخ التقرير</span>
          </button>
          <button class="btn btn-primary btn-sm" @click="activeReportModal = null">
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import WorkflowCanvas from '@/components/automation/WorkflowCanvas.vue';
import { automation } from '@/api';
import type {
  AutomationTask,
  AutomationExecutionLog,
  TelegramLogEntry,
  TelegramBotStatus,
} from '@/api/automation.api';

// ─── الحالة الرئيسية للتبويبات ───
const activeHubTab = ref<'agents' | 'workflow' | 'logs' | 'telegram' | 'copilot'>('agents');
const loading = ref(false);

// ─── بيانات المهام والوكلاء ───
const tasks = ref<AutomationTask[]>([]);
const executionLogs = ref<AutomationExecutionLog[]>([]);
const selectedCategory = ref<string>('all');
const tasksSearchQuery = ref('');
const runningTaskKey = ref<string | null>(null);
const togglingKey = ref<string | null>(null);
const showArchitectureGuide = ref(false);

// خريطة ترابط الوكلاء بالدورة التشغيلية (إيه مربوط بإيه؟)
const taskLinkageMap: Record<string, { source: string; triggerDesc: string; target: string }> = {
  daily_sales_report: {
    source: 'فواتير الكاشير والمصروفات',
    triggerDesc: 'مجدول يومياً 11:30 ليلاً',
    target: 'تليجرام للمالك + إشعار داخلي',
  },
  low_stock_alert: {
    source: 'أرصدة المخازن وخامات البن',
    triggerDesc: 'مجدول يومياً (10:00 ص و 06:00 م)',
    target: 'تليجرام + قائمة النواقص',
  },
  void_invoice_alert: {
    source: 'إلغاء الفواتير في الـ POS',
    triggerDesc: '⚡ فوري لحظياً عند قيام كاشير بإلغاء فاتورة',
    target: 'إنذار أحمر عاجل للمالك على تليجرام',
  },
  anti_fraud_sentinel: {
    source: 'حركات البيع والإلغاء والخصم (24 ساعة)',
    triggerDesc: 'مجدول يومياً 11:00 ليلاً',
    target: 'تقرير مكافحة التلاعب الشامل',
  },
  large_discount_alert: {
    source: 'مبيعات الكاشير المطبقة لخصم > 15%',
    triggerDesc: '⚡ فوري لحظياً عند تطبيق خصم استثنائي',
    target: 'إنذار فوري للمالك والمدير',
  },
  warehouse_balancing: {
    source: 'سحب المخزن الرئيسي ومخزن الصالة',
    triggerDesc: 'مجدول يومياً 09:00 صباحاً',
    target: 'توصيات مناقلة مخزنية ذكية',
  },
  system_health: {
    source: 'خادم الـ ERP وقاعدة البيانات',
    triggerDesc: 'مجدول دورياً كل 4 ساعات',
    target: 'فحص سرعة الاستجابة والاتصال',
  },
  daily_backup_reminder: {
    source: 'ملفات النسخ الاحتياطي المشفرة',
    triggerDesc: 'مجدول يومياً 10:00 ليلاً',
    target: 'تنبيه بصحة آخر ملف نسخة احتياطية',
  },
  supplier_payment_due_alert: {
    source: 'فواتير المشتريات الآجلة للموردين',
    triggerDesc: 'مجدول يومياً 11:00 صباحاً',
    target: 'تذكير بالدفعات المستحقة قبلها بـ 3 أيام',
  },
  daily_profit_margin_anomaly: {
    source: 'تكلفة المبيعات وهوامش ربح اليوم',
    triggerDesc: 'مجدول يومياً 11:45 ليلاً',
    target: 'إنذار عند انخفاض الهامش عن 28%',
  },
  cashflow_risk_shield: {
    source: 'الرصيد النقدي والالتزامات لـ 30 يوماً',
    triggerDesc: 'مجدول أسبوعياً (الإثنين 10:00 ص)',
    target: 'درع حماية السيولة وكشف العجز المسبق',
  },
  shift_handover_reconciliation: {
    source: 'إغلاق وردية الكاشير وجرد الدرج',
    triggerDesc: '⚡ فوري لحظياً عند إغلاق وردية بفارق ≥ 10 ج.م',
    target: 'إنذار عجز/زيادة عهدة للمدير والمالك',
  },
  roastery_recipe_waste_guard: {
    source: 'توالف البار واستهلاك خامات التحميص',
    triggerDesc: 'مجدول يومياً 09:00 مساءً',
    target: 'كشف الهدر غير الطبيعي للخامات',
  },
  customer_loyalty_dormant_winback: {
    source: 'سجل زيارات عملاء المحل الدائمين',
    triggerDesc: 'مجدول أسبوعياً (الخميس 02:00 م)',
    target: 'قائمة العملاء المنقطعين لـ 30 يوماً',
  },
  ai_copilot_assistant: {
    source: 'مؤشرات أداء المحل والمخزون',
    triggerDesc: 'مجدول يومياً 09:00 ص أو استعلام مباشر',
    target: 'تقرير تحليلي تنفيذي ذكي من Gemini',
  },
  error_tracker_alert: {
    source: 'استثناءات وأخطاء السيرفر وقاعدة البيانات',
    triggerDesc: '⚡ فوري لحظياً عند حدوث خطأ 500 أو انقطاع',
    target: 'تشخيص فوري وإشعار للمطور/الإدارة',
  },
  scheduled_cron_task: {
    source: 'محرك الجدولة التلقائي الداخلي',
    triggerDesc: 'مجدول يومياً 08:00 صباحاً',
    target: 'فحص نبض واستيقاظ المهام المجدولة',
  },
  telegram_notifier: {
    source: 'بوت تليجرام وقناة الاتصال المباشرة',
    triggerDesc: 'مجدول يومياً 10:00 صباحاً',
    target: 'فحص اتصال البوت واستقبال الأوامر',
  },
  webhook_listener: {
    source: 'مسارات استقبال الطلبات الخارجية',
    triggerDesc: 'مجدول يومياً 12:00 ظهراً',
    target: 'تأكيد جاهزية نقاط الـ Webhook الآمنة',
  },
  debt_credit_sentinel: {
    source: 'مديونيات العملاء وفواتير الموردين',
    triggerDesc: 'مجدول يومياً 12:00 ظهراً',
    target: 'إنذار تجاوز الحد الائتماني والديون المتأخرة',
  },
  purchase_stock_ingestion_guard: {
    source: 'فواتير المشتريات وحركات المخزن',
    triggerDesc: 'مجدول يومياً 03:00 عصراً',
    target: 'تأكيد ترحيل المخزن وإنذار ارتفاع التكلفة',
  },
  coffee_bags_cups_reconciler: {
    source: 'مبيعات الكاشير وحركات صرف الأكواب والبن',
    triggerDesc: 'مجدول يومياً 10:00 مساءً',
    target: 'كشف هدر الأكواب وتدقيق أكياس البن',
  },
};

// ─── بيانات وإعدادات تليجرام ───
const telegramActive = ref(true);
const telegramConfigured = reactive({ hasToken: false, hasDefaultChatId: false });
const telegramStatus = reactive<TelegramBotStatus>({
  isPolling: false,
  connected: false,
  hasToken: false,
  hasDefaultChatId: false,
  botUsername: null,
  botFirstName: null,
  defaultChatId: null,
  allowedChats: [],
  error: null,
});
const telegramForm = reactive({
  bot_token: '',
  chat_id: '',
  allowed_chats: '',
});
const showToken = ref(false);
const savingTelegramSettings = ref(false);
const verifyingTelegramToken = ref(false);
const tokenVerificationResult = ref<{
  ok: boolean;
  bot?: { username: string; firstName: string };
  error?: string;
} | null>(null);
const telegramSaveFeedback = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const customTelegramMsg = ref('');
const sendingTelegramTest = ref(false);
const telegramSendFeedback = ref<{ type: 'success' | 'error'; text: string } | null>(null);
const telegramLogs = ref<TelegramLogEntry[]>([]);

// ─── المساعد الذكي ───
const aiTestPrompt = ref('');
const testingAi = ref(false);
const aiTestReply = ref('');

// ─── نافذة التقرير ───
const activeReportModal = ref<{
  title: string;
  text: string;
  status: 'success' | 'warning' | 'failed';
  time: string;
} | null>(null);

// ─── ثوابت وتسميات الأقسام ───
const categoryLabels: Record<string, string> = {
  sales: '💰 مبيعات وإغلاق',
  inventory: '📦 مخزون وخامات البن',
  security: '🛡️ رقابة ومكافحة الاحتيال',
  system: '🖥️ خادم ونظام',
};

// ─── الحسابات المشتقة (Computed KPI) ───
const enabledTaskCount = computed(() => tasks.value.filter((t) => t.is_enabled).length);

const successfulExecutionCount = computed(
  () => executionLogs.value.filter((l) => l.status === 'success').length,
);

const failedExecutionCount = computed(
  () => executionLogs.value.filter((l) => l.status === 'failed' || l.status === 'warning').length,
);

const successRatePct = computed(() => {
  if (!executionLogs.value.length) return 100;
  return Math.round((successfulExecutionCount.value / executionLogs.value.length) * 100);
});

const averageExecutionMs = computed(() => {
  const durations = executionLogs.value
    .map((l) => Number(l.duration_ms))
    .filter((d) => Number.isFinite(d) && d >= 0);
  if (!durations.length) return 0;
  return Math.round(durations.reduce((sum, val) => sum + val, 0) / durations.length);
});

const latestExecutionLabel = computed(() => {
  const latest = executionLogs.value[0];
  return latest?.created_at ? formatTime(latest.created_at) : 'بانتظار أول تشغيل';
});

const engineHealthClass = computed(() => {
  if (failedExecutionCount.value > 0) return 'is-warning';
  if (enabledTaskCount.value > 0) return 'is-healthy';
  return 'is-idle';
});

const engineHealthLabel = computed(() => {
  if (failedExecutionCount.value > 0) return 'يحتاج مراجعة الملاحظات';
  if (enabledTaskCount.value > 0) return 'المحرك نشط ومستقر';
  return 'بانتظار تفعيل المهام';
});

// تصفية وبحث الوكلاء
const filteredTasks = computed(() => {
  return tasks.value.filter((task) => {
    const matchCategory =
      selectedCategory.value === 'all' || task.category === selectedCategory.value;
    const matchQuery =
      !tasksSearchQuery.value ||
      task.name_ar.toLowerCase().includes(tasksSearchQuery.value.toLowerCase()) ||
      task.description_ar.toLowerCase().includes(tasksSearchQuery.value.toLowerCase());
    return matchCategory && matchQuery;
  });
});

function getCategoryCount(cat: string): number {
  return tasks.value.filter((t) => t.category === cat).length;
}

function resetFilters() {
  selectedCategory.value = 'all';
  tasksSearchQuery.value = '';
}

// ─── دورة حياة المكون ───
onMounted(async () => {
  await loadAllData();
});

// ─── جلب البيانات ───
async function loadAllData() {
  loading.value = true;
  try {
    const [tasksRes, logsRes, statusRes, telLogsRes] = await Promise.all([
      automation.getTasks().catch(() => null),
      automation.getExecutionLogs({ limit: 30 }).catch(() => null),
      automation.getTelegramBotStatus().catch(() => null),
      automation.getTelegramLogs({ limit: 15 }).catch(() => null),
    ]);

    if (tasksRes && Array.isArray((tasksRes as any).data)) {
      tasks.value = (tasksRes as any).data;
    }

    if (logsRes && (logsRes as any).data?.logs) {
      executionLogs.value = (logsRes as any).data.logs;
    }

    if (statusRes && (statusRes as any).data) {
      Object.assign(telegramStatus, (statusRes as any).data);
      telegramActive.value = Boolean(telegramStatus.isPolling);
      telegramConfigured.hasToken = Boolean(telegramStatus.hasToken);
      telegramConfigured.hasDefaultChatId = Boolean(telegramStatus.hasDefaultChatId);
      if (telegramStatus.defaultChatId && !telegramForm.chat_id) {
        telegramForm.chat_id = telegramStatus.defaultChatId;
      }
      if (
        telegramStatus.allowedChats &&
        telegramStatus.allowedChats.length &&
        !telegramForm.allowed_chats
      ) {
        telegramForm.allowed_chats = telegramStatus.allowedChats.join(', ');
      }
    }

    if (telLogsRes && (telLogsRes as any).data?.logs) {
      telegramLogs.value = (telLogsRes as any).data.logs;
    }

    // بيانات خريطة سير العمليات يختص بها مكوّن WorkflowCanvas المعزول
  } catch (err) {
    console.error('فشل جلب بيانات الأتمتة:', err);
  } finally {
    loading.value = false;
  }
}

async function refreshExecutionLogs() {
  try {
    const res = await automation.getExecutionLogs({ limit: 30 });
    if ((res as any).data?.logs) {
      executionLogs.value = (res as any).data.logs;
    }
  } catch (err) {
    console.error('فشل تحديث سجلات التشغيل:', err);
  }
}

async function refreshTelegramLogs() {
  try {
    const res = await automation.getTelegramLogs({ limit: 15 });
    if ((res as any).data?.logs) {
      telegramLogs.value = (res as any).data.logs;
    }
  } catch (err) {
    console.error('فشل تحديث سجلات تليجرام:', err);
  }
}

// ─── تبديل وتشغيل المهام ───
async function handleToggleTask(task: AutomationTask) {
  const previousState = task.is_enabled;
  const targetState = !previousState;
  togglingKey.value = task.key;
  task.is_enabled = targetState;

  try {
    const res = await automation.toggleTask(task.key, targetState);
    if ((res as any)?.success === false) {
      task.is_enabled = previousState;
      alert((res as any)?.message || 'تعذر تبديل حالة الوكيل.');
    }
  } catch (err: any) {
    task.is_enabled = previousState;
    alert(
      err?.response?.data?.message || err?.message || 'فشل الاتصال بالخادم لتحديث حالة الوكيل.',
    );
  } finally {
    togglingKey.value = null;
  }
}

async function handleRunTaskNow(task: AutomationTask) {
  runningTaskKey.value = task.key;
  try {
    const res = await automation.runTaskNow(task.key);
    task.last_run_at = new Date().toISOString();
    task.last_status = (res as any)?.payload?.status || 'success';

    // فتح نافذة استعراض التقرير المنسق فوراً للمدير
    activeReportModal.value = {
      title: task.name_ar,
      text:
        (res as any)?.payload?.notificationText || (res as any)?.message || 'اكتملت العملية بنجاح.',
      status: (res as any)?.payload?.status || 'success',
      time: new Date().toISOString(),
    };

    await refreshExecutionLogs();
  } catch (err: any) {
    task.last_status = 'failed';
    activeReportModal.value = {
      title: `خطأ في تشغيل: ${task.name_ar}`,
      text: err?.response?.data?.message || err?.message || 'فشل تشغيل الوكيل.',
      status: 'failed',
      time: new Date().toISOString(),
    };
  } finally {
    runningTaskKey.value = null;
  }
}

// ─── تليجرام والمساعد الذكي ───
function openTelegramModal() {
  activeHubTab.value = 'telegram';
}

async function refreshTelegramStatus() {
  try {
    const statusRes = await automation.getTelegramBotStatus();
    if (statusRes && (statusRes as any).data) {
      Object.assign(telegramStatus, (statusRes as any).data);
      telegramActive.value = Boolean(telegramStatus.isPolling);
      telegramConfigured.hasToken = Boolean(telegramStatus.hasToken);
      telegramConfigured.hasDefaultChatId = Boolean(telegramStatus.hasDefaultChatId);
      if (telegramStatus.defaultChatId && !telegramForm.chat_id) {
        telegramForm.chat_id = telegramStatus.defaultChatId;
      }
      if (
        telegramStatus.allowedChats &&
        telegramStatus.allowedChats.length &&
        !telegramForm.allowed_chats
      ) {
        telegramForm.allowed_chats = telegramStatus.allowedChats.join(', ');
      }
    }
  } catch {
    // Ignore
  }
}

async function handleVerifyToken() {
  if (!telegramForm.bot_token.trim()) return;
  verifyingTelegramToken.value = true;
  tokenVerificationResult.value = null;
  try {
    const res = await automation.verifyTelegramToken(telegramForm.bot_token.trim());
    tokenVerificationResult.value = {
      ok: true,
      bot: (res as any).data,
    };
  } catch (err: any) {
    tokenVerificationResult.value = {
      ok: false,
      error:
        err?.response?.data?.message ||
        err?.message ||
        'رمز البوت غير صالح أو لم يتم قبوله من تليجرام',
    };
  } finally {
    verifyingTelegramToken.value = false;
  }
}

async function handleSaveTelegramSettings() {
  if (!telegramForm.bot_token.trim() || !telegramForm.chat_id.trim()) {
    telegramSaveFeedback.value = {
      type: 'error',
      text: 'يرجى إدخال كل من رمز البوت ومعرف الشات.',
    };
    return;
  }
  savingTelegramSettings.value = true;
  telegramSaveFeedback.value = null;
  try {
    const res = await automation.saveTelegramSettings({
      bot_token: telegramForm.bot_token.trim(),
      chat_id: telegramForm.chat_id.trim(),
      allowed_chats: telegramForm.allowed_chats.trim(),
    });
    telegramSaveFeedback.value = {
      type: 'success',
      text: (res as any)?.message || 'تم حفظ وتفعيل بوت تليجرام بنجاح! ✅',
    };
    await refreshTelegramStatus();
  } catch (err: any) {
    telegramSaveFeedback.value = {
      type: 'error',
      text: err?.response?.data?.message || err?.message || 'فشل حفظ وتفعيل إعدادات تليجرام.',
    };
  } finally {
    savingTelegramSettings.value = false;
  }
}

async function handleSendTelegramTest() {
  if (!customTelegramMsg.value.trim()) return;
  sendingTelegramTest.value = true;
  telegramSendFeedback.value = null;
  try {
    const res = await automation.sendTestMessage(customTelegramMsg.value.trim());
    telegramSendFeedback.value = {
      type: 'success',
      text: (res as any)?.message || 'تم إرسال الرسالة لتليجرام بنجاح! ✅',
    };
    customTelegramMsg.value = '';
    await refreshTelegramLogs();
    await refreshTelegramStatus();
  } catch (err: any) {
    telegramSendFeedback.value = {
      type: 'error',
      text: err?.response?.data?.message || err?.message || 'فشل إرسال الرسالة إلى تليجرام.',
    };
  } finally {
    sendingTelegramTest.value = false;
  }
}

async function handleTestAi() {
  if (!aiTestPrompt.value.trim()) return;
  testingAi.value = true;
  aiTestReply.value = '';
  try {
    const res = await automation.testAiPrompt(aiTestPrompt.value.trim());
    aiTestReply.value = (res as any)?.data?.reply || 'تم استلام رد المساعد الذكي بنجاح.';
  } catch (err: any) {
    aiTestReply.value = err?.response?.data?.message || 'تعذر الحصول على رد من المساعد الذكي.';
  } finally {
    testingAi.value = false;
  }
}

// ─── استعراض السجلات والتقارير ───
function openReportModalFromLog(log: AutomationExecutionLog) {
  activeReportModal.value = {
    title: log.title || log.name_ar || 'تقرير فحص الأتمتة',
    text: log.message,
    status: (log.status as any) || 'success',
    time: log.created_at,
  };
}

async function copyReportText(text: string) {
  try {
    const stripped = text.replace(/<[^>]*>/g, '');
    await navigator.clipboard.writeText(stripped);
    alert('تم نسخ نص التقرير إلى الحافظة بنجاح!');
  } catch {
    // fallback
  }
}

function switchTab(tab: 'agents' | 'workflow' | 'logs' | 'telegram' | 'copilot') {
  activeHubTab.value = tab;
  // إدارة تفعيل محرك الخريطة (حلقة الرسم والـ polling) تتم عبر خاصية active في WorkflowCanvas
}

// ─── دوال التنسيق والمساعدة ───
function humanizeSchedule(cron: string | null, triggerType: string): string {
  if (triggerType === 'event' || !cron) {
    return '⚡ فوري عند الحدث';
  }
  const clean = cron.trim();
  const map: Record<string, string> = {
    '30 23 * * *': '⏰ يومياً 11:30 م (إغلاق الوردية)',
    '0 10,18 * * *': '⏰ يومياً 10:00 ص و 06:00 م',
    '0 9 * * *': '⏰ يومياً 09:00 صباحاً',
    '0 11 * * *': '⏰ يومياً 11:00 صباحاً',
    '0 22 * * *': '⏰ يومياً 10:00 مساءً',
    '0 3 * * *': '⏰ يومياً 03:00 فجراً (فحص دوري)',
    '0 10 * * 1': '⏰ أسبوعياً كل إثنين 10:00 ص',
    '0 12 * * 0': '⏰ أسبوعياً كل أحد 12:00 ظهراً',
    '0 8 * * *': '⏰ يومياً 08:00 صباحاً',
  };
  return map[clean] || `⏱ جدول دوري (${clean})`;
}

function getTaskIcon(key: string): string {
  const iconMap: Record<string, string> = {
    daily_sales_report: 'receipt',
    low_stock_alert: 'package',
    void_invoice_alert: 'alertTriangle',
    anti_fraud_sentinel: 'shield',
    large_discount_alert: 'tag',
    warehouse_balancing: 'truck',
    system_health: 'activity',
    daily_backup_reminder: 'database',
    supplier_payment_due_alert: 'calendar',
    daily_profit_margin_anomaly: 'trendingUp',
    cashflow_risk_shield: 'walletCards',
    shift_handover_reconciliation: 'badgeCheck',
    roastery_recipe_waste_guard: 'flame',
    customer_loyalty_dormant_winback: 'users',
    ai_copilot_assistant: 'brain',
    error_tracker_alert: 'alertTriangle',
    scheduled_cron_task: 'clock',
    telegram_notifier: 'send',
    webhook_listener: 'activity',
    debt_credit_sentinel: 'walletCards',
    purchase_stock_ingestion_guard: 'truck',
    coffee_bags_cups_reconciler: 'coffee',
  };
  return iconMap[key] || 'bot';
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('ar-EG', {
      timeZone: 'Africa/Cairo',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

function getStatusLabel(status: string | null): string {
  switch (status) {
    case 'success':
      return 'ناجح ✅';
    case 'warning':
      return 'تنبيه ⚠️';
    case 'failed':
      return 'فشل ❌';
    case 'running':
      return 'قيد التشغيل...';
    default:
      return 'جاهز';
  }
}

// قائمة بيضاء صارمة لوسوم التنسيق الآمنة فقط — يُستخدم الناتج بـ v-html في ثلاثة مواضع
const SAFE_HTML_TAGS = new Set(['b', 'strong', 'i', 'em', 'code', 'br']);

/**
 * تعقيم كامل ضد XSS (البند 3): هروب HTML للنص أولًا (فيُعطَّل أي وسم أو خاصية واردة
 * مثل <img onerror> أو <script>)، ثم استعادة الوسوم المسموحة فقط من القائمة البيضاء —
 * بلا أي سمات، فلا مجال لحقن onerror/href/javascript:.
 */
function formatHtmlMessage(raw: string): string {
  if (!raw) return '';
  // 1) هروب كامل لكل محارف HTML
  let out = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 2) فواصل الأسطر
  out = out.replace(/\n/g, '<br/>');

  // 3) استعادة الوسوم الآمنة فقط (بلا سمات إطلاقًا) من النص المهروب
  out = out.replace(/&lt;(\/?)([a-zA-Z]+)\s*&gt;/g, (match, slash: string, tag: string) => {
    const name = tag.toLowerCase();
    if (!SAFE_HTML_TAGS.has(name)) return match;
    if (name === 'br') return '<br/>';
    if (name === 'code') {
      return slash ? '</code>' : '<code class="inline-code">';
    }
    return `<${slash}${name}>`;
  });

  return out;
}
</script>

<style scoped>
.automation-command-center {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0.5rem 0.25rem 2rem;
  font-family: inherit;
  color: var(--text-primary, #0f172a);
}

/* ── 1. الهيدر ── */
.hub-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.title-with-badge h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.engine-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.engine-status-pill.is-healthy {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}

.engine-status-pill.is-warning {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fde68a;
}

.engine-status-pill.is-idle {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #cbd5e1;
}

.status-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse-ring 2s infinite ease-in-out;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.9);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.8;
  }
}

.header-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--text-secondary, #64748b);
}

.header-quick-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.btn-outline-soft,
.btn-primary-soft {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.95rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline-soft {
  background: #f8fafc;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-outline-soft:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.btn-primary-soft {
  background: #0284c7;
  color: #ffffff;
  border: 1px solid #0284c7;
}

.btn-primary-soft:hover:not(:disabled) {
  background: #0369a1;
  border-color: #0369a1;
}

.btn-outline-soft.btn-guide-active {
  background: #ecfdf5;
  border-color: #10b981;
  color: #059669;
  font-weight: 700;
}

/* ── دليل الدورة التشغيلية (Architecture Guide) ── */
.guide-fade-enter-active,
.guide-fade-leave-active {
  transition: all 0.25s ease;
}
.guide-fade-enter-from,
.guide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.architecture-guide-card {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #cbd5e1;
  border-right: 5px solid #0284c7;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.guide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.guide-title-box {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.guide-badge {
  align-self: flex-start;
  display: inline-block;
  background: #e0f2fe;
  color: #0369a1;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
}

.guide-title-box h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}

.guide-title-box p {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.5;
}

.guide-close-btn {
  background: #f1f5f9;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.guide-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.guide-flow-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  overflow-x: auto;
}

.flow-step-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #f8fafc;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
}

.flow-step-box.highlight {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #0284c7;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  font-weight: 800;
  flex-shrink: 0;
}

.flow-step-box.highlight .step-num {
  background: #10b981;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.step-content strong {
  font-size: 0.82rem;
  color: #0f172a;
}

.step-content span {
  font-size: 0.72rem;
  color: #64748b;
  line-height: 1.35;
}

.flow-arrow {
  color: #94a3b8;
  font-size: 1.1rem;
  font-weight: 800;
  padding: 0 0.2rem;
}

.guide-pillars-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.pillar-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pillar-card.sales {
  border-top: 3px solid #10b981;
}

.pillar-card.security {
  border-top: 3px solid #ef4444;
}

.pillar-card.inventory {
  border-top: 3px solid #0284c7;
}

.pillar-card.system {
  border-top: 3px solid #8b5cf6;
}

.pillar-header {
  display: flex;
  align-items: center;
}

.pillar-tag {
  font-size: 0.75rem;
  font-weight: 700;
}

.pillar-card.sales .pillar-tag {
  color: #059669;
}
.pillar-card.security .pillar-tag {
  color: #dc2626;
}
.pillar-card.inventory .pillar-tag {
  color: #0284c7;
}
.pillar-card.system .pillar-tag {
  color: #7c3aed;
}

.pillar-card h4 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
}

.pillar-card p {
  margin: 0;
  font-size: 0.77rem;
  color: #64748b;
  line-height: 1.45;
}

.pillar-list {
  margin: 0.25rem 0 0;
  padding-right: 1.1rem;
  font-size: 0.74rem;
  color: #475569;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.pillar-list li strong {
  color: #1e293b;
}

/* ── 2. لوحة المؤشرات (KPI Grid) ── */
.kpi-command-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
}

.kpi-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #f1f5f9;
  color: #475569;
}

.kpi-card.is-healthy .kpi-icon-wrap {
  background: #ecfdf5;
  color: #059669;
}

.kpi-card.success .kpi-icon-wrap {
  background: #ecfdf5;
  color: #059669;
}

.kpi-card.danger .kpi-icon-wrap {
  background: #fef2f2;
  color: #dc2626;
}

.kpi-card.accent .kpi-icon-wrap {
  background: #f0f9ff;
  color: #0284c7;
}

.kpi-data {
  display: flex;
  flex-direction: column;
}

.kpi-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
}

.kpi-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}

.kpi-subtext {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 0.15rem;
}

/* ── 3. أشرطة التبويبات الكبرى ── */
.hub-tabs-nav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  overflow-x: auto;
}

.tab-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.1rem;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: #475569;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.tab-nav-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.tab-nav-btn.active {
  background: #0284c7;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
}

.tab-counter {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.72rem;
  background: rgba(0, 0, 0, 0.08);
}

.tab-nav-btn.active .tab-counter {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.badge-dot-live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.badge-dot-live.online {
  background: #10b981;
}

.badge-dot-live.offline {
  background: #94a3b8;
}

/* ── محتوى التبويب ── */
.hub-tab-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* شريط التصفية والبحث في الوكلاء */
.tasks-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.filter-pills-list {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.filter-pill {
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #ffffff);
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-pill:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.filter-pill.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.search-box-wrap {
  position: relative;
  min-width: 260px;
}

.search-icon {
  position: absolute;
  top: 50%;
  right: 0.75rem;
  transform: translateY(-50%);
  color: #94a3b8;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2.2rem 0.5rem 2rem;
  border-radius: 10px;
  border: 1px solid var(--border-color, #e2e8f0);
  background: var(--bg-card, #ffffff);
  font-size: 0.85rem;
  outline: none;
}

.search-input:focus {
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
}

.search-clear-btn {
  position: absolute;
  top: 50%;
  left: 0.6rem;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

/* شبكة بطاقات الوكلاء الحديثة والمريحة بصرياً */
.agent-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1.25rem;
}

.agent-card-modern {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  padding: 1.25rem 1.35rem;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.03),
    0 6px 16px -4px rgba(0, 0, 0, 0.02);
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}

.agent-card-modern::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  border-radius: 0 16px 16px 0;
  background: var(--primary, #0284c7);
}

.agent-card-modern.sales::before {
  background: #10b981;
}

.agent-card-modern.inventory::before {
  background: #0284c7;
}

.agent-card-modern.security::before {
  background: #ef4444;
}

.agent-card-modern.system::before {
  background: #8b5cf6;
}

.agent-card-modern:hover {
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--primary, #0284c7) 35%, var(--border-color, #e2e8f0));
}

.agent-card-modern.agent-disabled {
  opacity: 0.68;
  background: var(--bg-soft, #fafafa);
  filter: grayscale(0.2);
}

/* ── رأس البطاقة ── */
.card-top-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.card-identity {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.agent-icon-avatar {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.agent-card-modern:hover .agent-icon-avatar {
  transform: scale(1.05);
}

.agent-icon-avatar.sales {
  background: #ecfdf5;
  color: #059669;
}

.agent-icon-avatar.inventory {
  background: #f0f9ff;
  color: #0284c7;
}

.agent-icon-avatar.security {
  background: #fef2f2;
  color: #dc2626;
}

.agent-icon-avatar.system {
  background: #f5f3ff;
  color: #7c3aed;
}

.agent-title-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
}

.agent-name {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 800;
  color: var(--text-primary, #0f172a);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-tag-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.category-pill {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
}

.category-pill.sales {
  background: #ecfdf5;
  color: #059669;
}

.category-pill.inventory {
  background: #f0f9ff;
  color: #0284c7;
}

.category-pill.security {
  background: #fef2f2;
  color: #dc2626;
}

.category-pill.system {
  background: #f5f3ff;
  color: #7c3aed;
}

.trigger-pill {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.trigger-pill.scheduled {
  background: var(--bg-soft, #f1f5f9);
  color: var(--text-secondary, #475569);
}

.trigger-pill.event-driven {
  background: #fefce8;
  color: #a16207;
}

/* ── زر التبديل التفاعلي السلس iOS ── */
.ios-toggle-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  padding: 2px;
}

.ios-toggle-switch.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ios-toggle-switch input {
  display: none;
}

.ios-slider {
  position: relative;
  width: 40px;
  height: 22px;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

.ios-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.ios-toggle-switch input:checked + .ios-slider {
  background: #10b981;
}

.ios-toggle-switch input:checked + .ios-slider::after {
  transform: translateX(-18px);
}

/* ── وصف المهمة ── */
.agent-desc {
  margin: 0.35rem 0 0.85rem;
  font-size: 0.82rem;
  color: var(--text-secondary, #475569);
  line-height: 1.6;
  min-height: 2.6rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── شريط مسار الربط المصغر (Visual Pipeline Strip) ── */
.visual-pipeline-strip {
  display: grid;
  grid-template-columns: 1fr auto 1.15fr auto 1.15fr;
  align-items: center;
  gap: 0.35rem;
  background: var(--bg-soft, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.95rem;
}

.pipeline-node {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.node-role {
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.pipeline-node.source .node-role {
  color: #0284c7;
}

.pipeline-node.trigger .node-role {
  color: #d97706;
}

.pipeline-node.target .node-role {
  color: #059669;
}

.node-text {
  font-size: 0.73rem;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pipeline-flow-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #94a3b8);
  flex-shrink: 0;
}

/* ── ذيل البطاقة ── */
.agent-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border-color, #f1f5f9);
}

.status-indicator-block {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.dot-success {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.status-dot.dot-warning {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
}

.status-dot.dot-failed {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.status-dot.dot-idle {
  background: #cbd5e1;
}

.status-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.status-time {
  font-size: 0.72rem;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-time.idle {
  color: var(--text-muted, #94a3b8);
}

.status-text-pill {
  font-size: 0.68rem;
  font-weight: 700;
}

.status-text-pill.status-success {
  color: #059669;
}

.status-text-pill.status-warning {
  color: #d97706;
}

.status-text-pill.status-failed {
  color: #dc2626;
}

.btn-trigger-action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--primary, #0284c7);
  background: var(--primary, #0284c7);
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-trigger-action:hover:not(:disabled) {
  background: #0369a1;
  border-color: #0369a1;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);
}

.btn-trigger-action:active:not(:disabled) {
  transform: translateY(0);
}

.btn-trigger-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── التبويب الثالث: سجل التشغيل (Logs) ── */
.logs-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem;
}

.logs-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.logs-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logs-title-wrap h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.logs-title-wrap p {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.logs-table-container {
  overflow-x: auto;
}

.logs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  text-align: right;
}

.logs-table th {
  padding: 0.75rem;
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  border-bottom: 1px solid #e2e8f0;
}

.logs-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.log-task-name {
  color: #0f172a;
}

.source-tag {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
}

.source-tag.scheduler {
  background: #f1f5f9;
  color: #475569;
}

.source-tag.manual {
  background: #e0f2fe;
  color: #0369a1;
}

.status-pill-table {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
}

.status-pill-table.status-success {
  background: #ecfdf5;
  color: #059669;
}

.status-pill-table.status-warning {
  background: #fffbeb;
  color: #d97706;
}

.status-pill-table.status-failed {
  background: #fef2f2;
  color: #dc2626;
}

.duration-cell {
  font-family: monospace;
  color: #64748b;
}

.timestamp-cell {
  color: #64748b;
  white-space: nowrap;
}

.log-message-cell {
  max-width: 280px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #334155;
}

.btn-ghost-sm {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: transparent;
  color: #0284c7;
  font-weight: 600;
  font-size: 0.75rem;
  cursor: pointer;
}

.btn-ghost-sm:hover {
  background: #f0f9ff;
}

/* ── التبويب الرابع: تليجرام ── */
.telegram-live-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  margin-bottom: 1.25rem;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.telegram-live-banner.is-connected {
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border-color: #86efac;
}

.telegram-live-banner.is-disconnected {
  background: linear-gradient(135deg, #fffbeb 0%, #fef2f2 100%);
  border-color: #fca5a5;
}

.banner-status-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.is-connected .banner-status-icon {
  background: #dcfce7;
  color: #16a34a;
}

.is-disconnected .banner-status-icon {
  background: #fee2e2;
  color: #dc2626;
}

.banner-status-info {
  flex: 1;
}

.banner-title-line {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.banner-title-line h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.connection-tag {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}

.tag-online {
  background: #dcfce7;
  color: #15803d;
}

.tag-offline {
  background: #fee2e2;
  color: #b91c1c;
}

.banner-status-info p {
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}

.banner-status-info code {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #0284c7;
}

.banner-error-desc {
  color: #dc2626 !important;
  font-weight: 500;
}

.telegram-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.telegram-col {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.telegram-status-card,
.telegram-logs-card,
.telegram-config-card,
.telegram-guide-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem;
}

.telegram-settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-label-row label,
.form-group label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
}

.btn-text-action {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
}

.btn-text-action:hover {
  text-decoration: underline;
}

.token-input-wrapper {
  display: flex;
  gap: 0.5rem;
}

.token-input-wrapper .form-control {
  flex: 1;
}

.ltr-input {
  direction: ltr !important;
  text-align: left !important;
  font-family: monospace, inherit;
}

.token-verify-result {
  margin-top: 0.35rem;
  padding: 0.4rem 0.65rem;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 600;
}

.token-verify-result.verify-ok {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.token-verify-result.verify-fail {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.form-hint {
  font-size: 0.74rem;
  color: #64748b;
  line-height: 1.4;
}

.btn-save-bot {
  width: 100%;
  padding: 0.65rem 1rem;
  font-weight: 700;
}

.telegram-guide-card h4 {
  margin: 0 0 0.75rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
}

.setup-steps {
  margin: 0;
  padding-right: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #475569;
}

.setup-steps li {
  line-height: 1.5;
}

.setup-steps code {
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  color: #0284c7;
  font-size: 0.78rem;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1.25rem;
  gap: 0.75rem;
}

.head-with-icon {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.head-with-icon h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.head-with-icon p {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
}

.telegram-brand-icon {
  color: #0284c7;
}

.bot-badge {
  display: inline-block;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.bot-badge.configured {
  background: #ecfdf5;
  color: #059669;
}

.bot-badge.not-configured {
  background: #fef2f2;
  color: #dc2626;
}

.status-checklist {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 10px;
  margin-bottom: 1.25rem;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  font-size: 0.8rem;
  color: #64748b;
}

.checklist-item.ok {
  color: #059669;
}

.checklist-item strong {
  display: block;
  color: #0f172a;
}

.checklist-item small {
  display: block;
  font-size: 0.74rem;
  color: #64748b;
}

.telegram-tester-box h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
}

.quick-templates-bar {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.template-chip {
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
  background: #ffffff;
  font-size: 0.74rem;
  color: #475569;
  cursor: pointer;
}

.template-chip:hover {
  background: #f1f5f9;
  border-color: #0284c7;
}

.send-input-group {
  display: flex;
  gap: 0.5rem;
}

.telegram-input {
  flex: 1;
  padding: 0.55rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #cbd5e1;
  font-size: 0.82rem;
  outline: none;
}

.telegram-input:focus {
  border-color: #0284c7;
}

.feedback-banner {
  margin-top: 0.75rem;
  padding: 0.55rem 0.85rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
}

.feedback-banner.success {
  background: #ecfdf5;
  color: #059669;
}

.feedback-banner.error {
  background: #fef2f2;
  color: #dc2626;
}

.telegram-messages-feed {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.telegram-msg-bubble {
  padding: 0.75rem;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 0.8rem;
}

.telegram-msg-bubble.out {
  border-right: 3px solid #0284c7;
}

.telegram-msg-bubble.in {
  border-right: 3px solid #10b981;
}

.bubble-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
  font-size: 0.72rem;
  color: #64748b;
}

.bubble-body {
  color: #1e293b;
  line-height: 1.5;
}

.bubble-ai-reply {
  margin-top: 0.5rem;
  padding: 0.4rem;
  background: #f0fdf4;
  border-radius: 6px;
  font-size: 0.76rem;
  color: #166534;
}

/* ── التبويب الخامس: Gemini Copilot ── */
.copilot-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.5rem;
}

.copilot-header {
  margin-bottom: 1.25rem;
}

.copilot-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.gemini-sparkle-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  color: #ffffff;
}

.copilot-title-group h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.copilot-title-group p {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
}

.copilot-quick-prompts {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.prompts-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}

.prompt-chip {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-size: 0.76rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.prompt-chip:hover {
  background: #fdf2f8;
  border-color: #ec4899;
  color: #be185d;
}

.copilot-input-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.copilot-textarea {
  width: 100%;
  padding: 0.85rem;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-family: inherit;
  font-size: 0.88rem;
  outline: none;
  resize: vertical;
}

.copilot-textarea:focus {
  border-color: #ec4899;
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.12);
}

.copilot-controls {
  display: flex;
  justify-content: flex-end;
}

.copilot-response-box {
  padding: 1.25rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.response-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: #be185d;
}

.response-body {
  font-size: 0.88rem;
  line-height: 1.7;
  color: #1e293b;
}

/* ── نافذة التقرير المنبثقة (Report Modal) ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.report-modal-card {
  width: 100%;
  max-width: 680px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: modal-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.report-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.report-icon-badge.success {
  background: #ecfdf5;
  color: #059669;
}

.report-icon-badge.warning {
  background: #fffbeb;
  color: #d97706;
}

.report-icon-badge.failed {
  background: #fef2f2;
  color: #dc2626;
}

.modal-title-wrap h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.modal-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
}

.status-text-badge {
  font-weight: 700;
}

.status-text-badge.success {
  color: #059669;
}

.status-text-badge.warning {
  color: #d97706;
}

.status-text-badge.failed {
  color: #dc2626;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 6px;
}

.modal-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.modal-body.report-modal-content {
  padding: 1.5rem;
  max-height: 60vh;
  overflow-y: auto;
}

.report-text-view {
  font-size: 0.9rem;
  line-height: 1.8;
  color: #1e293b;
  white-space: normal;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* ── تجاوب الشاشات (Responsive) ── */
@media (max-width: 1024px) {
  .kpi-command-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .telegram-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .hub-header {
    flex-direction: column;
    align-items: stretch;
  }
  .kpi-command-grid {
    grid-template-columns: 1fr;
  }
  .tasks-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-box-wrap {
    min-width: 100%;
  }
  .agent-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
