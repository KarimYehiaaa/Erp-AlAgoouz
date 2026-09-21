<template>
  <div class="luxury-mobile-container" dir="rtl">
    <!-- ═══════════════════════════════════════════════════════════════
         TOP NAVIGATION & EXECUTIVE BRAND HEADER
         ═══════════════════════════════════════════════════════════════ -->
    <header class="app-header">
      <div class="header-inner">
        <div class="brand-identity">
          <div class="brand-emblem">
            <img src="/logo-transparent.png" alt="شعار بن العجوز" />
          </div>
          <div class="brand-text">
            <h1 class="brand-name">{{ companyName }}</h1>
            <span class="brand-tagline">الإدارة التنفيذية • لوحة المراقبة</span>
          </div>
        </div>

        <div class="header-quick-actions">
          <button
            class="header-btn"
            @click="showServerConfig = true"
            title="إعدادات الاتصال بالسيرفر"
          >
            <span class="btn-icon"><AppIcon name="settings" :size="18" /></span>
          </button>

          <button
            class="header-btn"
            @click="refreshAll"
            :disabled="loading"
            title="تحديث البيانات اللحظية"
          >
            <span class="btn-icon" :class="{ 'spin-active': loading }">
              <AppIcon name="refresh" :size="18" />
            </span>
          </button>

          <RouterLink to="/" class="header-btn" title="العودة لمنظومة سطح المكتب">
            <span class="btn-icon"><AppIcon name="monitor" :size="18" /></span>
          </RouterLink>
        </div>
      </div>

      <!-- Live Connection & Fast Status Strip -->
      <div class="live-status-strip">
        <div class="live-badge" :class="{ connected: isLiveConnected && !fetchError }">
          <span class="live-dot"></span>
          <span class="live-label">
            {{
              isLiveConnected && !fetchError
                ? serverTypeBadge + ' • متصل لحظياً'
                : 'جاري الاتصال بالسيرفر...'
            }}
          </span>
        </div>
        <div class="date-quick-selector">
          <button class="date-pill-btn" :class="{ active: isTodaySelected }" @click="selectToday">
            اليوم
          </button>
          <button
            class="date-pill-btn"
            :class="{ active: isYesterdaySelected }"
            @click="selectYesterday"
          >
            أمس
          </button>
          <label class="date-picker-label" title="اختيار تاريخ مخصص">
            <AppIcon name="calendar" :size="16" />
            <input
              type="date"
              v-model="customSelectedDate"
              @change="onDateChange"
              class="hidden-date-input"
            />
          </label>
        </div>
      </div>
    </header>

    <section class="report-context-card" aria-label="ملخص حالة التقارير">
      <div class="report-context-main">
        <span class="report-context-kicker"><AppIcon name="chart" :size="14" /> مركز التقارير</span>
        <strong>قراءة تنفيذية سريعة</strong>
        <span class="report-context-caption">كل الأرقام للمتابعة واتخاذ القرار فقط</span>
      </div>
      <div class="report-context-status" :class="{ offline: fetchError, demo: isDemoMode }">
        <span class="report-context-dot"></span>
        <span>{{ isDemoMode ? 'معاينة' : fetchError ? 'آخر نسخة محفوظة' : 'بيانات مباشرة' }}</span>
      </div>
    </section>

    <div class="report-kpi-strip" aria-label="مؤشرات التقرير الرئيسية">
      <div class="report-kpi-item">
        <span class="report-kpi-label">الإيراد</span>
        <strong>{{ formatMoney(currentSummary.grandTotal) }} <small>ج.م</small></strong>
      </div>
      <div class="report-kpi-item">
        <span class="report-kpi-label">الفواتير</span>
        <strong>{{ currentSummary.totalCount }}</strong>
      </div>
      <div class="report-kpi-item">
        <span class="report-kpi-label">صافي السيولة</span>
        <strong :class="(currentSummary.netCashflow || 0) >= 0 ? 'positive' : 'negative'">
          {{ formatMoney(currentSummary.netCashflow) }} <small>ج.م</small>
        </strong>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         CONNECTION DIAGNOSTICS & RETRY BANNER
         ═══════════════════════════════════════════════════════════════ -->
    <div v-if="fetchError" class="diagnostic-banner">
      <div class="diagnostic-header">
        <span class="diag-icon"><AppIcon name="activity" :size="20" /></span>
        <div class="diag-text">
          <strong>تعذر سحب البيانات من السيرفر</strong>
          <p>{{ fetchError }}</p>
        </div>
      </div>
      <div class="diag-actions">
        <button class="btn-diag-cfg" @click="showServerConfig = true">
          <AppIcon name="settings" :size="14" /> تعديل رابط السيرفر
        </button>
        <button class="btn-diag-demo" @click="loadDemoData">
          <AppIcon name="sparkles" :size="14" /> معاينة التقرير
        </button>
        <button class="btn-diag-retry" @click="refreshAll">
          <AppIcon name="refresh" :size="14" /> إعادة المحاولة
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         MAIN DYNAMIC VIEWPORT
         ═══════════════════════════════════════════════════════════════ -->
    <main class="mobile-viewport">
      <!-- Loading Skeleton -->
      <div v-if="loading && !currentSummary" class="skeleton-wrapper">
        <div class="skeleton-shimmer hero-shimmer"></div>
        <div class="skeleton-shimmer card-shimmer"></div>
        <div class="skeleton-shimmer card-shimmer"></div>
      </div>

      <!-- ═════════════ TAB 1: EXECUTIVE SALES ═════════════ -->
      <section v-else-if="activeTab === 'sales'" class="tab-pane">
        <!-- 1. Master Hero Revenue Card -->
        <div class="luxury-hero-card">
          <div class="card-glow-orb"></div>
          <div class="hero-header-row">
            <span class="hero-title-badge"
              ><AppIcon name="money" :size="15" /> إجمالي الإيرادات ({{
                selectedDateFormatted
              }})</span
            >
            <div
              class="growth-chip"
              :class="currentSummary.growthPercent >= 0 ? 'chip-up' : 'chip-down'"
            >
              {{ currentSummary.growthPercent >= 0 ? '▲ +' : '▼ '
              }}{{ currentSummary.growthPercent }}% عن الأمس
            </div>
          </div>

          <div class="hero-amount-display">
            <span class="currency-prefix">ج.م</span>
            <span class="amount-number">{{ formatMoney(currentSummary.grandTotal) }}</span>
          </div>

          <div class="hero-stats-subbar">
            <div class="sub-stat">
              <span class="sub-label">عدد الفواتير</span>
              <strong class="sub-val">{{ currentSummary.totalCount }} طلب</strong>
            </div>
            <div class="sub-divider"></div>
            <div class="sub-stat">
              <span class="sub-label">متوسط الفاتورة</span>
              <strong class="sub-val"
                >{{ formatMoney(currentSummary.averageOrderValue || 0) }} ج.م</strong
              >
            </div>
            <div class="sub-divider"></div>
            <div class="sub-stat">
              <span class="sub-label">مبيعات الأمس</span>
              <strong class="sub-val">{{ formatMoney(currentSummary.yesterdayTotal) }} ج.م</strong>
            </div>
          </div>
        </div>

        <!-- 2. Dual Breakdown: Branch vs Wholesale -->
        <div class="dual-distribution-section">
          <div class="section-heading">
            <h3><AppIcon name="chart" :size="18" /> توزيع المبيعات حسب القناة</h3>
            <span class="channel-ratio">
              {{ branchPercent }}% محل / {{ wholesalePercent }}% جملة
            </span>
          </div>

          <!-- Comparative Visual Bar -->
          <div class="comparative-ratio-bar">
            <div class="bar-fill branch-fill" :style="{ width: branchPercent + '%' }"></div>
            <div class="bar-fill wholesale-fill" :style="{ width: wholesalePercent + '%' }"></div>
          </div>

          <div class="channel-cards-grid">
            <!-- Branch Card -->
            <div class="channel-metric-card branch-theme">
              <div class="card-top-icon">
                <span class="icon-wrap"><AppIcon name="shop" :size="20" /></span>
                <span class="card-label">مبيعات المحل (POS)</span>
              </div>
              <div class="channel-val">
                {{ formatMoney(currentSummary.branch?.total || 0) }} <small>ج.م</small>
              </div>
              <div class="channel-foot">
                <span
                  ><AppIcon name="receipt" :size="14" />
                  {{ currentSummary.branch?.count || 0 }} فاتورة</span
                >
                <span v-if="currentSummary.branch?.discount" class="discount-pill">
                  خصم: {{ formatMoney(currentSummary.branch.discount) }}
                </span>
              </div>
            </div>

            <!-- Wholesale Card -->
            <div class="channel-metric-card wholesale-theme">
              <div class="card-top-icon">
                <span class="icon-wrap"><AppIcon name="truck" :size="20" /></span>
                <span class="card-label">مبيعات الجملة</span>
              </div>
              <div class="channel-val">
                {{ formatMoney(currentSummary.wholesale?.total || 0) }} <small>ج.م</small>
              </div>
              <div class="channel-foot">
                <span
                  ><AppIcon name="receipt" :size="14" />
                  {{ currentSummary.wholesale?.count || 0 }} فاتورة</span
                >
                <span v-if="currentSummary.wholesale?.discount" class="discount-pill">
                  خصم: {{ formatMoney(currentSummary.wholesale.discount) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Payment Methods Breakdown -->
        <div class="glass-content-card">
          <div class="card-header-flex">
            <h3 class="card-title">
              <AppIcon name="creditCard" :size="18" /> تفصيل طرق التحصيل المالي
            </h3>
            <span class="card-meta-tag">تحصيل الخزينة</span>
          </div>

          <div class="payment-stack">
            <!-- Cash -->
            <div class="payment-row cash-row">
              <div class="payment-symbol"><AppIcon name="cash" :size="18" /></div>
              <div class="payment-text-group">
                <span class="p-name">نـقـداً (كـاش)</span>
                <span class="p-sub">في درج المحل والخزينة</span>
              </div>
              <div class="payment-val">
                {{ formatMoney(currentSummary.paymentTotals?.cash || 0) }} <small>ج.م</small>
              </div>
            </div>

            <!-- InstaPay -->
            <div class="payment-row instapay-row">
              <div class="payment-symbol"><AppIcon name="monitor" :size="18" /></div>
              <div class="payment-text-group">
                <span class="p-name">انـسـتـابـاي ومحافظ</span>
                <span class="p-sub">تحويلات بنكية فورية</span>
              </div>
              <div class="payment-val text-cyan">
                {{ formatMoney(currentSummary.paymentTotals?.instapay || 0) }} <small>ج.م</small>
              </div>
            </div>

            <!-- Card / POS -->
            <div class="payment-row card-row">
              <div class="payment-symbol"><AppIcon name="creditCard" :size="18" /></div>
              <div class="payment-text-group">
                <span class="p-name">فيزا وبطاقات بنكية</span>
                <span class="p-sub">ماكينات الدفع الإلكتروني</span>
              </div>
              <div class="payment-val text-purple">
                {{ formatMoney(currentSummary.paymentTotals?.card || 0) }} <small>ج.م</small>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Expenses & Net Cashflow Pulse -->
        <div class="glass-content-card">
          <div class="card-header-flex">
            <h3 class="card-title">
              <AppIcon name="trendingDown" :size="18" /> المصروفات وصافي السيولة
            </h3>
            <span class="card-meta-tag">اليوم</span>
          </div>

          <div class="finance-grid">
            <div class="finance-cell exp-cell">
              <span class="fin-lbl">مصروفات اليوم:</span>
              <strong class="fin-val text-rose"
                >{{ formatMoney(currentSummary.expenses?.total || 0) }} ج.م</strong
              >
              <small class="fin-sub">{{ currentSummary.expenses?.count || 0 }} بنود مسجلة</small>
            </div>

            <div class="finance-cell net-cell">
              <span class="fin-lbl">صافي السيولة النقدية:</span>
              <strong
                class="fin-val"
                :class="(currentSummary.netCashflow || 0) >= 0 ? 'text-emerald' : 'text-rose'"
              >
                {{ formatMoney(currentSummary.netCashflow || 0) }} ج.م
              </strong>
              <small class="fin-sub">(المقبوض نقداً - المصروفات)</small>
            </div>
          </div>
        </div>

        <!-- 5. Active Shift & Cash Drawer -->
        <div class="glass-content-card shift-monitoring-card">
          <div class="card-header-flex">
            <div class="title-with-pulse">
              <span :class="currentSummary.activeShift ? 'pulse-green' : 'pulse-amber'"></span>
              <h3 class="card-title">
                <AppIcon name="shop" :size="18" /> الوردية الحالية في المحل
              </h3>
            </div>
            <span v-if="currentSummary.activeShift" class="status-badge-active">شفت نشط 🟢</span>
            <span v-else class="status-badge-closed">الوردية مغلقة 🔒</span>
          </div>

          <div v-if="currentSummary.activeShift" class="shift-info-body">
            <div class="shift-meta-grid">
              <div class="meta-cell">
                <span class="cell-lbl">الكاشير المناوب:</span>
                <strong class="cell-val">{{ currentSummary.activeShift.cashier_name }}</strong>
              </div>
              <div class="meta-cell">
                <span class="cell-lbl">رقم الوردية:</span>
                <strong class="cell-val">#{{ currentSummary.activeShift.shift_number }}</strong>
              </div>
              <div class="meta-cell">
                <span class="cell-lbl">وقت الفتح:</span>
                <span class="cell-val">{{ formatTime(currentSummary.activeShift.opened_at) }}</span>
              </div>
              <div class="meta-cell">
                <span class="cell-lbl">عهدة البداية:</span>
                <span class="cell-val"
                  >{{ formatMoney(currentSummary.activeShift.opening_cash) }} ج.م</span
                >
              </div>
            </div>

            <!-- Glowing Expected Cash Display -->
            <div class="drawer-cash-highlight">
              <div class="drawer-lbl">النقدية المتوقعة في الدرج الآن (Expected Cash):</div>
              <div class="drawer-amount">
                {{ formatMoney(currentSummary.activeShift.current_expected_cash) }}
                <small>ج.م</small>
              </div>
            </div>
          </div>

          <div v-else class="empty-shift-notice">
            <span>🔒 لا توجد وردية مفتوحة حالياً بالمحل. يتم تحديث الدرج فور بدء الشفت.</span>
          </div>
        </div>

        <!-- 6. Recent Sales Stream (Live Pulse) -->
        <div v-if="currentSummary.recentSales?.length" class="glass-content-card">
          <div class="card-header-flex">
            <h3 class="card-title">
              <AppIcon name="zap" :size="18" /> أحدث الفواتير المسجلة اليوم
            </h3>
            <span class="card-meta-tag">{{ currentSummary.recentSales.length }} فواتير</span>
          </div>

          <div class="recent-sales-stream">
            <div v-for="s in currentSummary.recentSales" :key="s.id" class="recent-sale-row">
              <div class="sale-icon-box">
                <AppIcon
                  :name="
                    s.paymentMethod === 'cash'
                      ? 'cash'
                      : s.paymentMethod === 'instapay'
                        ? 'monitor'
                        : 'creditCard'
                  "
                  :size="18"
                />
              </div>
              <div class="sale-details">
                <div class="sale-main-line">
                  <strong class="sale-num">{{ s.saleNumber }}</strong>
                  <strong class="sale-amt">{{ formatMoney(s.totalAmount) }} ج.م</strong>
                </div>
                <div class="sale-sub-line">
                  <span>{{ s.cashierName }} • {{ s.customerName }}</span>
                  <span class="sale-time">{{ formatTime(s.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═════════════ TAB 2: INVENTORY & VALUATION ═════════════ -->
      <section v-else-if="activeTab === 'inventory'" class="tab-pane">
        <!-- 1. Total Stock Valuation Hero Card -->
        <div class="luxury-hero-card inventory-gold-theme">
          <div class="card-glow-orb gold-glow"></div>
          <div class="hero-header-row">
            <span class="hero-title-badge"
              ><AppIcon name="inventory" :size="15" /> إجمالي القيمة المالية للمخزون</span
            >
            <div class="growth-chip chip-gold">رأس مال مربوط</div>
          </div>

          <div class="hero-amount-display">
            <span class="currency-prefix">ج.م</span>
            <span class="amount-number">{{ formatMoney(currentInventory.totalValuation) }}</span>
          </div>

          <div class="hero-stats-subbar">
            <div class="sub-stat">
              <span class="sub-label">الأصناف بالمخازن</span>
              <strong class="sub-val">{{ currentInventory.productsInStock }} صنف</strong>
            </div>
            <div class="sub-divider"></div>
            <div class="sub-stat">
              <span class="sub-label">القيمة البيعية</span>
              <strong class="sub-val"
                >{{ formatMoney(currentInventory.totalRetailValue) }} ج.م</strong
              >
            </div>
            <div class="sub-divider"></div>
            <div class="sub-stat">
              <span class="sub-label">الربح المتوقع</span>
              <strong class="sub-val text-emerald">
                {{
                  formatMoney(
                    Math.max(
                      0,
                      currentInventory.totalRetailValue - currentInventory.totalValuation,
                    ),
                  )
                }}
                ج.م
              </strong>
            </div>
          </div>
        </div>

        <!-- 2. Categories Capital Distribution -->
        <div class="glass-content-card">
          <div class="card-header-flex">
            <h3 class="card-title">
              <AppIcon name="boxes" :size="18" /> توزيع رأس المال حسب الأقسام
            </h3>
            <span class="card-meta-tag">{{ currentInventory.categories?.length || 0 }} أقسام</span>
          </div>

          <div class="categories-breakdown-list">
            <div
              v-for="cat in currentInventory.categories || []"
              :key="cat.name"
              class="category-stat-item"
            >
              <div class="cat-header-line">
                <span class="cat-title">{{ cat.name }}</span>
                <strong class="cat-money">{{ formatMoney(cat.valuation) }} ج.م</strong>
              </div>
              <div class="cat-progress-track">
                <div
                  class="cat-progress-fill"
                  :style="{ width: getCategoryPercent(cat.valuation) + '%' }"
                ></div>
              </div>
              <div class="cat-footer-sub">
                <span>{{ cat.productCount }} أصناف • {{ formatQty(cat.totalQuantity) }} وحدة</span>
                <span>{{ getCategoryPercent(cat.valuation) }}% من رأس المال</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Critical Low Stock Radar -->
        <div class="glass-content-card alert-border-card">
          <div class="card-header-flex">
            <div class="title-with-pulse">
              <span class="pulse-red"></span>
              <h3 class="card-title text-red">
                <AppIcon name="warning" :size="18" /> رادار النواقص وتنبيهات إعادة الطلب
              </h3>
            </div>
            <span class="badge-count-red"
              >{{ currentInventory.lowStockItems?.length || 0 }} صنف</span
            >
          </div>

          <div v-if="currentInventory.lowStockItems?.length" class="low-stock-cards-list">
            <div
              v-for="item in currentInventory.lowStockItems"
              :key="item.id"
              class="low-stock-row"
            >
              <div class="stock-item-info">
                <strong class="stock-item-name">{{ item.name }}</strong>
                <span class="stock-item-meta">{{ item.category }} • كود: {{ item.sku }}</span>
              </div>
              <div class="stock-item-levels">
                <span class="stock-critical-badge">
                  المتبقي: {{ formatQty(item.currentStock) }} {{ item.unit }}
                </span>
                <span class="stock-limit-note">حد الأمان: {{ item.minLimit }}</span>
              </div>
            </div>
          </div>

          <div v-else class="clean-empty-state">
            <span
              ><AppIcon name="check" :size="16" /> المخزون سليم — لا توجد نواقص تحت حد الأمان
              حالياً</span
            >
          </div>
        </div>
      </section>

      <!-- ═════════════ TAB 3: REMOTE APPROVALS ═════════════ -->
      <section v-else-if="activeTab === 'approvals'" class="tab-pane">
        <div class="approvals-header-banner">
          <div>
            <h2 class="banner-title">
              <AppIcon name="bell" :size="20" /> طلبات موافقات الكاشير اللحظية
            </h2>
            <p class="banner-desc">اعتماد أو رفض طلبات الخصم والاستثناءات بضغطة زر</p>
          </div>
          <button class="banner-refresh-btn" @click="fetchApprovals">
            <AppIcon name="refresh" :size="15" /> تحديث
          </button>
        </div>

        <!-- Approval Status Filter Tabs -->
        <div class="approval-filter-strip">
          <button
            class="appr-filter-btn"
            :class="{ active: approvalFilter === 'pending' }"
            @click="approvalFilter = 'pending'"
          >
            المعلقة ({{ pendingApprovalsCount }}) ⏳
          </button>
          <button
            class="appr-filter-btn"
            :class="{ active: approvalFilter === 'all' }"
            @click="approvalFilter = 'all'"
          >
            كل الطلبات 📋
          </button>
        </div>

        <!-- Approvals Stream -->
        <div v-if="filteredApprovals.length" class="approvals-card-stream">
          <div
            v-for="req in filteredApprovals"
            :key="req.id"
            class="approval-ticket-card"
            :class="'ticket-' + req.status"
          >
            <div class="ticket-head">
              <div class="ticket-user">
                <span class="user-avatar-circle"><AppIcon name="user" :size="16" /></span>
                <div>
                  <strong class="user-display-name">{{ req.requester_name || 'الكاشير' }}</strong>
                  <span class="ticket-time">{{ formatRelativeTime(req.created_at) }}</span>
                </div>
              </div>
              <span class="status-ticket-pill" :class="'pill-' + req.status">
                {{ getStatusLabel(req.status) }}
              </span>
            </div>

            <div class="ticket-body">
              <div class="action-bold-title">
                {{ req.action_label }}
              </div>

              <div class="ticket-details-box" v-if="req.details">
                <div v-if="req.details.discount_amount" class="detail-item">
                  <span class="detail-k">قيمة الخصم المطلوب:</span>
                  <strong class="detail-v text-amber"
                    >{{ formatMoney(req.details.discount_amount) }} ج.م</strong
                  >
                </div>
                <div v-if="req.details.amount" class="detail-item">
                  <span class="detail-k">إجمالي الفاتورة:</span>
                  <strong class="detail-v">{{ formatMoney(req.details.amount) }} ج.م</strong>
                </div>
                <div v-if="req.details.reason" class="detail-item full-width">
                  <span class="detail-k">السبب المسجل:</span>
                  <span class="detail-v">{{ req.details.reason }}</span>
                </div>
              </div>
            </div>

            <!-- Action Buttons if Pending -->
            <div v-if="req.status === 'pending'" class="ticket-actions-row">
              <button
                class="btn-reject-ticket"
                :disabled="decidingId === req.id"
                @click="handleDecide(req.id, 'rejected')"
              >
                <AppIcon name="x" :size="14" />
                <span>رفـض الخصم</span>
              </button>

              <button
                class="btn-approve-ticket"
                :disabled="decidingId === req.id"
                @click="handleDecide(req.id, 'approved')"
              >
                <span v-if="decidingId === req.id">جاري الاعتماد...</span>
                <span v-else>
                  <AppIcon name="check" :size="14" />
                  <span>مـوافـقـة وفك القفل</span>
                </span>
              </button>
            </div>

            <!-- Footer if Decided -->
            <div v-else class="ticket-decided-foot">
              <span
                >تم بواسطة: <strong>{{ req.decided_by_name || 'المدير' }}</strong></span
              >
              <span>{{ formatTime(req.decided_at || '') }}</span>
            </div>
          </div>
        </div>

        <div v-else class="clean-empty-approvals">
          <div class="empty-sparkle-icon"><AppIcon name="sparkles" :size="32" /></div>
          <h3>لا توجد طلبات معلقة</h3>
          <p>كافة عمليات الكاشير والمحل تسير بالأسعار والخصومات المعتمدة تلقائياً.</p>
        </div>
      </section>
    </main>

    <!-- ═══════════════════════════════════════════════════════════════
         BOTTOM LUXURY NAVIGATION BAR
         ═══════════════════════════════════════════════════════════════ -->
    <nav class="luxury-bottom-nav">
      <button
        class="nav-tab-item"
        :class="{ active: activeTab === 'sales' }"
        @click="activeTab = 'sales'"
      >
        <span class="nav-icon"><AppIcon name="chart" :size="20" /></span>
        <span class="nav-text">نظرة عامة</span>
      </button>

      <button
        class="nav-tab-item"
        :class="{ active: activeTab === 'inventory' }"
        @click="activeTab = 'inventory'"
      >
        <span class="nav-icon"><AppIcon name="package" :size="20" /></span>
        <span class="nav-text">المخزون</span>
      </button>

      <button
        class="nav-tab-item"
        :class="{ active: activeTab === 'approvals' }"
        @click="activeTab = 'approvals'"
      >
        <div class="nav-icon-badge-wrap">
          <span class="nav-icon"><AppIcon name="bell" :size="20" /></span>
          <span v-if="pendingApprovalsCount > 0" class="nav-badge-pill">
            {{ pendingApprovalsCount }}
          </span>
        </div>
        <span class="nav-text">الموافقات</span>
      </button>
    </nav>

    <!-- ═══════════════════════════════════════════════════════════════
         SERVER CONFIGURATION MODAL
         ═══════════════════════════════════════════════════════════════ -->
    <div v-if="showServerConfig" class="modal-overlay" @click.self="showServerConfig = false">
      <div class="modal-card">
        <div class="modal-head">
          <div class="modal-title-flex">
            <span class="modal-icon"><AppIcon name="settings" :size="20" /></span>
            <h3>إعدادات خادم النظام (Backend Server)</h3>
          </div>
          <button class="modal-close-btn" @click="showServerConfig = false">
            <AppIcon name="x" :size="16" />
          </button>
        </div>

        <div class="modal-body">
          <p class="modal-desc">
            اختر عنوان السيرفر الذي ترغب بربط التطبيق به لضمان مزامنة البيانات اللحظية والتحكم في
            المحل.
          </p>

          <div class="form-group">
            <label class="form-label">رابط السيرفر (Server URL / IP):</label>
            <input
              v-model="customServerUrl"
              type="text"
              class="form-input"
              placeholder="مثال: https://agoouz.vercel.app أو http://192.168.1.14:3000"
              dir="ltr"
            />
          </div>

          <!-- Presets -->
          <div class="presets-row">
            <button
              type="button"
              class="preset-chip"
              :class="{ 'chip-active': customServerUrl === 'https://agoouz.vercel.app' }"
              @click="customServerUrl = 'https://agoouz.vercel.app'"
            >
              <AppIcon name="database" :size="13" />
              <span>السيرفر السحابي (أونلاين)</span>
            </button>
            <button
              type="button"
              class="preset-chip"
              :class="{ 'chip-active': customServerUrl === 'http://192.168.1.14:3000' }"
              @click="customServerUrl = 'http://192.168.1.14:3000'"
            >
              <AppIcon name="store" :size="13" />
              <span>سيرفر المحل (192.168.1.14:3000)</span>
            </button>
            <button
              type="button"
              class="preset-chip"
              :class="{ 'chip-active': customServerUrl === 'http://localhost:3000' }"
              @click="customServerUrl = 'http://localhost:3000'"
            >
              <AppIcon name="monitor" :size="13" />
              <span>الكمبيوتر المباشر (Localhost:3000)</span>
            </button>
          </div>

          <!-- Connection Test Feedback -->
          <div v-if="testResultMsg" class="test-result-box" :class="'res-' + testResultStatus">
            {{ testResultMsg }}
          </div>
        </div>

        <div class="modal-foot">
          <button
            type="button"
            class="btn-test-conn"
            :disabled="testingConn"
            @click="testServerConnection"
          >
            <AppIcon name="zap" :size="14" />
            <span>{{ testingConn ? 'جاري الفحص...' : 'فحص الاتصال' }}</span>
          </button>
          <button type="button" class="btn-save-conn" @click="saveServerConfig">
            <AppIcon name="save" :size="14" />
            <span>حفظ والاتصال</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  managerMobileApi,
  type ExecutiveSummaryData,
  type InventoryValuationData,
  type ManagerApprovalRequest,
} from '@/api/managerMobile.api';
import { getBaseServerUrl, setBaseServerUrl } from '@/api/client';
import { initNativeMobile, triggerHaptic } from '@/services/nativeMobileService';
import { brandingState } from '@/design-system/themes/themeEngine';
import axios from 'axios';

const companyName = computed(() => brandingState.companyName || 'Al-Agoouz ERP');

// ─── Reactive State ─────────────────────────────────────────
const activeTab = ref<'sales' | 'inventory' | 'approvals'>('sales');
const loading = ref(false);
const fetchError = ref('');
const decidingId = ref<number | null>(null);
const isLiveConnected = ref(true);
const approvalFilter = ref<'pending' | 'all'>('pending');

// ─── Date Selection ─────────────────────────────────────────
const selectedDateStr = ref<string>(new Date().toISOString().slice(0, 10));
const customSelectedDate = ref<string>(new Date().toISOString().slice(0, 10));

const isTodaySelected = computed(() => {
  return selectedDateStr.value === new Date().toISOString().slice(0, 10);
});

const isYesterdaySelected = computed(() => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return selectedDateStr.value === y.toISOString().slice(0, 10);
});

const selectedDateFormatted = computed(() => {
  if (isTodaySelected.value) return 'اليوم';
  if (isYesterdaySelected.value) return 'أمس';
  return selectedDateStr.value;
});

const selectToday = () => {
  selectedDateStr.value = new Date().toISOString().slice(0, 10);
  customSelectedDate.value = selectedDateStr.value;
  refreshAll();
};

const selectYesterday = () => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  selectedDateStr.value = y.toISOString().slice(0, 10);
  customSelectedDate.value = selectedDateStr.value;
  refreshAll();
};

const onDateChange = () => {
  if (customSelectedDate.value) {
    selectedDateStr.value = customSelectedDate.value;
    refreshAll();
  }
};

// ─── Server Config State ────────────────────────────────────
const showServerConfig = ref(false);
const customServerUrl = ref(getBaseServerUrl() || 'https://agoouz.vercel.app');
const testingConn = ref(false);
const testResultMsg = ref('');
const testResultStatus = ref<'success' | 'error' | ''>('');

// ─── Data Holders ───────────────────────────────────────────
const summaryData = ref<ExecutiveSummaryData | null>(null);
const inventoryData = ref<InventoryValuationData | null>(null);
const approvalsList = ref<ManagerApprovalRequest[]>([]);
const isDemoMode = ref(false);

// Fallback Default Data (Prevents Blank Screens)
const fallbackSummary: ExecutiveSummaryData = {
  date: new Date().toISOString().slice(0, 10),
  grandTotal: 0,
  totalCount: 0,
  yesterdayTotal: 0,
  growthPercent: 0,
  averageOrderValue: 0,
  branch: { total: 0, discount: 0, count: 0, cash: 0, instapay: 0, card: 0, other: 0 },
  wholesale: { total: 0, discount: 0, count: 0, cash: 0, instapay: 0, card: 0, other: 0 },
  paymentTotals: { cash: 0, instapay: 0, card: 0, other: 0 },
  expenses: { total: 0, count: 0 },
  netCashflow: 0,
  activeShift: null,
  recentSales: [],
  pendingApprovalsCount: 0,
};

const fallbackInventory: InventoryValuationData = {
  totalValuation: 0,
  totalRetailValue: 0,
  totalQuantity: 0,
  productsInStock: 0,
  categories: [],
  lowStockItems: [],
};

const currentSummary = computed<ExecutiveSummaryData>(() => summaryData.value || fallbackSummary);
const currentInventory = computed<InventoryValuationData>(
  () => inventoryData.value || fallbackInventory,
);

const filteredApprovals = computed(() => {
  if (approvalFilter.value === 'pending') {
    return approvalsList.value.filter((a) => a.status === 'pending');
  }
  return approvalsList.value;
});

// ─── Computed Helpers ───────────────────────────────────────
const serverTypeBadge = computed(() => {
  const url = getBaseServerUrl();
  if (!url || url.includes('agoouz.vercel.app') || url.startsWith('https://')) {
    return 'سحابي أونلاين';
  }
  if (url.includes('192.168.') || url.includes('localhost') || url.includes('127.0.0.1')) {
    return 'سيرفر محلي';
  }
  return 'سيرفر مخصص';
});

const pendingApprovalsCount = computed(() => {
  return (
    currentSummary.value?.pendingApprovalsCount ||
    approvalsList.value.filter((a) => a.status === 'pending').length
  );
});

const branchPercent = computed(() => {
  const g = currentSummary.value.grandTotal || 0;
  if (g <= 0) return 50;
  const b = currentSummary.value.branch?.total || 0;
  return Math.min(100, Math.max(0, Math.round((b / g) * 100)));
});

const wholesalePercent = computed(() => {
  return Math.max(0, 100 - branchPercent.value);
});

const getCategoryPercent = (val: number) => {
  const total = currentInventory.value.totalValuation || 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((val / total) * 100)));
};

// ─── Formatters ─────────────────────────────────────────────
const formatMoney = (num: number | string | undefined | null) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatQty = (num: number | string | undefined | null) => {
  const val = Number(num) || 0;
  return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const formatTime = (isoStr: string) => {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
};

const formatRelativeTime = (isoStr: string) => {
  if (!isoStr) return '';
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
  return formatTime(isoStr);
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return 'قيد الانتظار ⏳';
    case 'approved':
      return 'تمت الموافقة ✅';
    case 'rejected':
      return 'مرفوض ❌';
    default:
      return status;
  }
};

// ─── Audio & Haptic Alerts ──────────────────────────────────
const playAlertSound = () => {
  triggerHaptic('warning');
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio feedback is optional and may be blocked by the browser.
  }
};

// ─── Server Diagnostics ─────────────────────────────────────
const testServerConnection = async () => {
  testingConn.value = true;
  testResultMsg.value = '';
  testResultStatus.value = '';

  const target = (customServerUrl.value || getBaseServerUrl()).replace(/\/+$/, '');
  const startTime = Date.now();
  try {
    const res = await axios.get(`${target}/api/v1/health`, { timeout: 6000 });
    const latency = Date.now() - startTime;
    if (res.data && res.data.success) {
      testResultStatus.value = 'success';
      const isCloud = target.includes('agoouz') || target.includes('https');
      const isDbOk = res.data.db?.connected ? ' • قاعدة البيانات متصلة ✅' : '';
      testResultMsg.value = `✅ الاتصال ناجح! (${isCloud ? 'سيرفر سحابي ☁️' : 'سيرفر محلي 🏢'} • استجابة: ${latency}ms${isDbOk})`;
      triggerHaptic('success');
    } else {
      throw new Error('استجابة غير متوقعة');
    }
  } catch {
    testResultStatus.value = 'error';
    testResultMsg.value = `❌ تعذر الاتصال بالسيرفر (${target}). يرجى التأكد من تشغيل السيرفر وعنوان الـ IP.`;
    triggerHaptic('error');
  } finally {
    testingConn.value = false;
  }
};

const saveServerConfig = () => {
  setBaseServerUrl(customServerUrl.value);
  showServerConfig.value = false;
  testResultMsg.value = '';
  triggerHaptic('success');
  refreshAll();
  initLiveConnection();
};

// ─── Data Fetching ──────────────────────────────────────────
const fetchSummary = async () => {
  const data = await managerMobileApi.getSummary(selectedDateStr.value);
  if (data) {
    summaryData.value = data;
    localStorage.setItem('binalagoouz_cached_summary', JSON.stringify(data));
  }
};

const fetchInventory = async () => {
  const data = await managerMobileApi.getInventoryValuation();
  if (data) {
    inventoryData.value = data;
    localStorage.setItem('binalagoouz_cached_inventory', JSON.stringify(data));
  }
};

const fetchApprovals = async () => {
  const data = await managerMobileApi.getApprovals('all');
  if (Array.isArray(data)) approvalsList.value = data;
};

const refreshAll = async () => {
  loading.value = true;
  fetchError.value = '';
  try {
    await Promise.all([fetchSummary(), fetchInventory(), fetchApprovals()]);
    isDemoMode.value = false;
  } catch (err: any) {
    console.warn('Mobile API fetch error:', err);
    // حاول استعادة النسخة المخبأة في الذاكرة لتفادي الشاشة الفارغة
    const cachedSum = localStorage.getItem('binalagoouz_cached_summary');
    const cachedInv = localStorage.getItem('binalagoouz_cached_inventory');
    if (cachedSum) summaryData.value = JSON.parse(cachedSum);
    if (cachedInv) inventoryData.value = JSON.parse(cachedInv);

    const target = getBaseServerUrl() || 'السيرفر المعتمد';
    fetchError.value = `تعذر الاتصال بالسيرفر (${target}). يرجى التحقق من الشبكة أو ضبط السيرفر.`;
  } finally {
    loading.value = false;
  }
};

// ─── Demo Data Loader (for offline preview) ─────────────────
const loadDemoData = () => {
  isDemoMode.value = true;
  fetchError.value = '';
  summaryData.value = {
    date: selectedDateStr.value,
    grandTotal: 18450,
    totalCount: 68,
    yesterdayTotal: 15200,
    growthPercent: 21.4,
    averageOrderValue: 271.3,
    branch: {
      total: 11250,
      discount: 350,
      count: 52,
      cash: 8400,
      instapay: 1950,
      card: 900,
      other: 0,
    },
    wholesale: {
      total: 7200,
      discount: 200,
      count: 16,
      cash: 4000,
      instapay: 3200,
      card: 0,
      other: 0,
    },
    paymentTotals: { cash: 12400, instapay: 5150, card: 900, other: 0 },
    expenses: { total: 1850, count: 3 },
    netCashflow: 10550,
    activeShift: {
      id: 101,
      shift_number: 'SHF-2026-0831-01',
      status: 'open',
      opening_cash: 500,
      opened_at: new Date().toISOString(),
      cashier_name: 'أحمد محمود',
      warehouse_name: 'مخزن البيع',
      terminal_code: 'POS-01',
      current_expected_cash: 8900,
    },
    recentSales: [
      {
        id: 1,
        saleNumber: 'SAL-0092',
        saleType: 'pos',
        paymentMethod: 'cash',
        totalAmount: 380,
        createdAt: new Date().toISOString(),
        cashierName: 'أحمد محمود',
        customerName: 'عميل نقدي',
      },
      {
        id: 2,
        saleNumber: 'SAL-0091',
        saleType: 'wholesale',
        paymentMethod: 'instapay',
        totalAmount: 1450,
        createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
        cashierName: 'محمد كمال',
        customerName: 'كافيه السعادة',
      },
      {
        id: 3,
        saleNumber: 'SAL-0090',
        saleType: 'pos',
        paymentMethod: 'card',
        totalAmount: 620,
        createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
        cashierName: 'أحمد محمود',
        customerName: 'عميل نقدي',
      },
    ],
    pendingApprovalsCount: 1,
  };
  inventoryData.value = {
    totalValuation: 248600,
    totalRetailValue: 365000,
    totalQuantity: 1820,
    productsInStock: 48,
    categories: [
      {
        name: 'بن تركي وفاتح',
        slug: 'turkish-coffee',
        valuation: 112000,
        totalQuantity: 750,
        productCount: 14,
      },
      {
        name: 'إسبريسو وحبوب خاصة',
        slug: 'specialty-beans',
        valuation: 84500,
        totalQuantity: 420,
        productCount: 18,
      },
      {
        name: 'إضافات ونكهات',
        slug: 'syrups-flavors',
        valuation: 32100,
        totalQuantity: 380,
        productCount: 10,
      },
      {
        name: 'أكواب ومستلزمات',
        slug: 'supplies',
        valuation: 20000,
        totalQuantity: 270,
        productCount: 6,
      },
    ],
    lowStockItems: [
      {
        id: 1,
        name: 'بن برازيلي سانتوس فاخر',
        sku: 'BRZ-001',
        unit: 'كجم',
        category: 'بن تركي',
        minLimit: 15,
        currentStock: 4.5,
        costPrice: 320,
        stockValue: 1440,
      },
      {
        id: 2,
        name: 'بن كولومبي سوبريمو',
        sku: 'COL-002',
        unit: 'كجم',
        category: 'إسبريسو',
        minLimit: 10,
        currentStock: 2.2,
        costPrice: 480,
        stockValue: 1056,
      },
    ],
  };
  approvalsList.value = [
    {
      id: 99,
      request_type: 'discount',
      requester_user_id: 2,
      requester_name: 'أحمد محمود (كاشير)',
      action_label: 'طلب خصم استثنائي 15% على فاتورة عميل دائم',
      details: { amount: 850, discount_amount: 127.5, reason: 'عميل VIP يشتري كميات دورية' },
      status: 'pending',
      created_at: new Date().toISOString(),
    },
  ];
  triggerHaptic('medium');
};

// ─── Approval Decision ──────────────────────────────────────
const handleDecide = async (id: number, decision: 'approved' | 'rejected') => {
  decidingId.value = id;
  try {
    if (!isDemoMode.value) {
      const updated = await managerMobileApi.decideApproval(id, decision);
      const item = approvalsList.value.find((a) => a.id === id);
      if (item && updated) {
        Object.assign(item, updated);
      }
      await fetchSummary();
    } else {
      const item = approvalsList.value.find((a) => a.id === id);
      if (item) {
        item.status = decision;
        item.decided_by_name = 'المدير التنفيذي';
        item.decided_at = new Date().toISOString();
      }
    }
    triggerHaptic(decision === 'approved' ? 'success' : 'medium');
  } catch (err: any) {
    triggerHaptic('error');
    alert(err?.response?.data?.message || 'حدث خطأ أثناء حفظ القرار');
  } finally {
    decidingId.value = null;
  }
};

// ─── Real-time WebSocket ────────────────────────────────────
let ws: WebSocket | null = null;
let pollTimer: any = null;

const initLiveConnection = () => {
  if (ws) {
    ws.close();
    ws = null;
  }

  const serverUrl = getBaseServerUrl();
  const wsUrl = serverUrl
    ? `${serverUrl.startsWith('https') ? 'wss:' : 'ws:'}//${serverUrl.replace(/^https?:\/\//, '')}/ws`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      isLiveConnected.value = true;
    };
    ws.onclose = () => {
      isLiveConnected.value = false;
    };
    ws.onerror = () => {
      isLiveConnected.value = false;
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'approval:requested') {
          playAlertSound();
          approvalsList.value.unshift(msg.data);
          if (summaryData.value) summaryData.value.pendingApprovalsCount++;
        } else if (msg.event === 'approval:decided') {
          const idx = approvalsList.value.findIndex((a) => a.id === msg.data.id);
          if (idx !== -1) {
            approvalsList.value[idx] = msg.data;
          }
        }
      } catch {
        // Ignore malformed realtime messages and keep the connection alive.
      }
    };
  } catch {
    isLiveConnected.value = false;
  }

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    fetchSummary();
    if (activeTab.value === 'approvals') fetchApprovals();
  }, 12000);
};

// ─── Lifecycle ──────────────────────────────────────────────
onMounted(() => {
  initNativeMobile();
  refreshAll();
  initLiveConnection();
});

onUnmounted(() => {
  if (ws) ws.close();
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped lang="scss">
/* ═══════════════════════════════════════════════════════════════
   ULTRA-LUXURY EXECUTIVE MOBILE THEME (Obsidian & Gold)
   ═══════════════════════════════════════════════════════════════ */
.luxury-mobile-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg-base, #0b0f17);
  color: var(--color-text-primary, #f8fafc);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.95);
  position: relative;
  padding-bottom: 95px;
}

/* Header */
.app-header {
  background: rgba(11, 15, 23, 0.95);
  border-bottom: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.08));
  padding: 16px 18px 12px;
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(20px);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-emblem {
  width: 42px;
  height: 42px;
  background: linear-gradient(
    135deg,
    var(--color-primary, #5a3825) 0%,
    var(--color-primary-active, #3b2418) 100%
  );
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(90, 56, 37, 0.35);
  color: #ffffff;

  img {
    width: 30px;
    height: 30px;
    object-fit: contain;
  }
}

.brand-name {
  font-size: 19px;
  font-weight: 900;
  color: #ffffff;
  margin: 0;
  letter-spacing: -0.3px;
}

.brand-tagline {
  font-size: 11px;
  color: var(--color-primary-400, #60a5fa);
  font-weight: 700;
  display: block;
}

.header-quick-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
}

.header-btn:active {
  transform: scale(0.9);
  background: rgba(217, 168, 108, 0.25);
}

.spin-active {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.live-status-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
}

.live-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a89f91;
}

.live-badge.connected {
  color: #34d399;
}

.live-dot {
  width: 8px;
  height: 8px;
  background-color: #34d399;
  border-radius: 50%;
  box-shadow: 0 0 10px #34d399;
  animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
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

.date-quick-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-pill-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #c4b9a8;
  min-height: 44px;
  padding: 7px 12px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.report-context-card {
  margin: 12px 14px 0;
  padding: 15px 16px;
  border: 1px solid rgba(217, 168, 108, 0.22);
  border-radius: 20px;
  background:
    radial-gradient(circle at 10% 0%, rgba(217, 168, 108, 0.18), transparent 42%),
    linear-gradient(135deg, rgba(42, 27, 16, 0.95), rgba(18, 16, 14, 0.98));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
}

.report-context-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.report-context-kicker {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #e7bc83;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.2px;
}

.report-context-main strong {
  color: #fffaf3;
  font-size: 16px;
  line-height: 1.25;
}

.report-context-caption {
  color: #b4a594;
  font-size: 10px;
  line-height: 1.4;
}

.report-context-status {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(52, 211, 153, 0.26);
  border-radius: 999px;
  color: #75e3b5;
  background: rgba(16, 185, 129, 0.1);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.report-context-status.offline {
  color: #fbbf75;
  border-color: rgba(251, 191, 36, 0.3);
  background: rgba(245, 158, 11, 0.1);
}

.report-context-status.demo {
  color: #8bd8ff;
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(14, 165, 233, 0.1);
}

.report-context-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 9px currentColor;
}

.report-kpi-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 14px 0;
}

.report-kpi-item {
  min-width: 0;
  min-height: 76px;
  padding: 11px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.report-kpi-label {
  color: #a99d8d;
  font-size: 10px;
  font-weight: 700;
}

.report-kpi-item strong {
  color: #fff8ee;
  font-size: clamp(15px, 4.4vw, 21px);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.report-kpi-item small {
  color: #c6b49e;
  font-size: 9px;
  font-weight: 700;
}

.report-kpi-item strong.positive {
  color: #65ddb0;
}

.report-kpi-item strong.negative {
  color: #fb8c8c;
}

.date-pill-btn.active {
  background: rgba(217, 168, 108, 0.25);
  border-color: #d9a86c;
  color: #ffffff;
}

.date-picker-label {
  cursor: pointer;
  font-size: 13px;
  position: relative;
  display: flex;
  align-items: center;
}

.hidden-date-input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

/* Diagnostic Banner */
.diagnostic-banner {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 16px;
  margin: 12px 14px 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diagnostic-header {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.diag-icon {
  font-size: 20px;
}

.diag-text strong {
  color: #f87171;
  font-size: 13px;
  display: block;
}

.diag-text p {
  margin: 2px 0 0;
  font-size: 11px;
  color: #d1d5db;
  line-height: 1.4;
}

.diag-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-diag-cfg {
  background: rgba(217, 168, 108, 0.2);
  border: 1px solid rgba(217, 168, 108, 0.4);
  color: #d9a86c;
  border-radius: 8px;
  min-height: 44px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.btn-diag-demo {
  background: rgba(56, 189, 248, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  border-radius: 8px;
  min-height: 44px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.btn-diag-retry {
  background: #ef4444;
  border: none;
  color: #ffffff;
  border-radius: 8px;
  min-height: 44px;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

/* Viewport */
.mobile-viewport {
  padding: 14px;
  flex: 1;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Skeleton Loading */
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.04) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 18px;
}

.hero-shimmer {
  height: 180px;
}
.card-shimmer {
  height: 120px;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

/* Luxury Hero Card */
.luxury-hero-card {
  background: linear-gradient(145deg, rgba(74, 44, 20, 0.75) 0%, rgba(26, 15, 8, 0.95) 100%);
  border: 1px solid rgba(217, 168, 108, 0.45);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65);
  position: relative;
  overflow: hidden;
}

.card-glow-orb {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 140px;
  height: 140px;
  background: radial-gradient(circle, rgba(217, 168, 108, 0.3) 0%, transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}

.card-glow-orb.gold-glow {
  background: radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, transparent 70%);
}

.hero-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.hero-title-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #d9a86c;
}

.growth-chip {
  font-size: 11px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 20px;
}

.chip-up {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
}
.chip-down {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}
.chip-gold {
  background: rgba(217, 168, 108, 0.25);
  color: #f59e0b;
}

.hero-amount-display {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 6px 0 14px;
}

.currency-prefix {
  font-size: 17px;
  font-weight: 800;
  color: #d9a86c;
}

.amount-number {
  font-size: 38px;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -1px;
  line-height: 1;
}

.hero-stats-subbar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 14px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.sub-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.sub-label {
  font-size: 10px;
  color: #a89f91;
}

.sub-val {
  font-size: 13px;
  font-weight: 800;
  color: #f7ede2;
}

.sub-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
}

/* Dual Distribution */
.dual-distribution-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-heading h3 {
  font-size: 14px;
  font-weight: 800;
  color: #d9a86c;
  margin: 0;
}

.channel-ratio {
  font-size: 11px;
  color: #c4b9a8;
  font-weight: 700;
}

.comparative-ratio-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  display: flex;
  overflow: hidden;
}

.bar-fill.branch-fill {
  background: linear-gradient(
    90deg,
    var(--color-gold, #b58a4a),
    var(--color-gold-soft-bright, #d1b06b)
  );
  transition: width 0.6s ease;
}

.bar-fill.wholesale-fill {
  background: linear-gradient(
    90deg,
    var(--color-primary, #5a3825),
    var(--color-primary-hover, #4a2e1e)
  );
  transition: width 0.6s ease;
}

.channel-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.channel-metric-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 16px;
}

.channel-metric-card.branch-theme {
  border-color: rgba(217, 168, 108, 0.35);
  background: linear-gradient(145deg, rgba(217, 168, 108, 0.1) 0%, rgba(20, 12, 6, 0.6) 100%);
}

.channel-metric-card.wholesale-theme {
  border-color: rgba(56, 189, 248, 0.35);
  background: linear-gradient(145deg, rgba(56, 189, 248, 0.1) 0%, rgba(20, 12, 6, 0.6) 100%);
}

.card-top-icon {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card-top-icon .card-label {
  font-size: 12px;
  color: #c4b9a8;
  font-weight: 700;
}

.channel-val {
  font-size: 22px;
  font-weight: 900;
  color: #ffffff;
  margin-bottom: 6px;
}

.channel-val small {
  font-size: 12px;
  font-weight: 600;
  color: #d9a86c;
}

.channel-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #a89f91;
}

.discount-pill {
  color: #f59e0b;
  font-weight: 700;
}

/* Glass Content Cards */
.glass-content-card {
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 20px;
  padding: 18px;
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 800;
  color: #d9a86c;
  margin: 0;
}

.card-meta-tag {
  font-size: 11px;
  color: #a89f91;
  font-weight: 600;
}

/* Payment Stack */
.payment-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.payment-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
}

.payment-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #d9a86c;
  font-size: 24px;
}
.payment-text-group {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.payment-text-group .p-name {
  font-size: 14px;
  font-weight: 700;
  color: #f7ede2;
}
.payment-text-group .p-sub {
  font-size: 10px;
  color: #8c8273;
}
.payment-val {
  font-size: 17px;
  font-weight: 800;
  color: #ffffff;
}
.payment-val small {
  font-size: 11px;
  color: #d9a86c;
}
.text-cyan {
  color: #38bdf8 !important;
}
.text-purple {
  color: #c084fc !important;
}
.text-emerald {
  color: #34d399 !important;
}
.text-rose {
  color: #f43f5e !important;
}

/* Finance Grid */
.finance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.finance-cell {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fin-lbl {
  font-size: 11px;
  color: #a89f91;
}
.fin-val {
  font-size: 17px;
  font-weight: 900;
}
.fin-sub {
  font-size: 10px;
  color: #8c8273;
}

/* Shift Monitoring Card */
.title-with-pulse {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-green {
  width: 8px;
  height: 8px;
  background: #34d399;
  border-radius: 50%;
  box-shadow: 0 0 8px #34d399;
}

.pulse-amber {
  width: 8px;
  height: 8px;
  background: #f59e0b;
  border-radius: 50%;
  box-shadow: 0 0 8px #f59e0b;
}

.pulse-red {
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  box-shadow: 0 0 8px #ef4444;
}

.status-badge-active {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
}

.status-badge-closed {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
}

.shift-info-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.shift-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.meta-cell {
  background: rgba(0, 0, 0, 0.25);
  padding: 10px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cell-lbl {
  font-size: 10px;
  color: #a89f91;
}
.cell-val {
  font-size: 12px;
  font-weight: 700;
  color: #f7ede2;
}

.drawer-cash-highlight {
  background: linear-gradient(135deg, rgba(217, 168, 108, 0.2) 0%, rgba(40, 24, 12, 0.5) 100%);
  border: 1px solid rgba(217, 168, 108, 0.4);
  border-radius: 16px;
  padding: 14px;
  text-align: center;
}

.drawer-lbl {
  font-size: 12px;
  color: #d9a86c;
  font-weight: 700;
  margin-bottom: 4px;
}
.drawer-amount {
  font-size: 26px;
  font-weight: 900;
  color: #ffffff;
}
.drawer-amount small {
  font-size: 14px;
  color: #d9a86c;
}

.empty-shift-notice {
  text-align: center;
  padding: 20px 10px;
  color: #a89f91;
  font-size: 12px;
}

/* Recent Sales Stream */
.recent-sales-stream {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-sale-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.sale-icon-box {
  font-size: 20px;
}
.sale-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sale-main-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sale-num {
  font-size: 13px;
  color: #d9a86c;
}
.sale-amt {
  font-size: 14px;
  color: #ffffff;
}
.sale-sub-line {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #8c8273;
}

/* Categories Breakdown */
.categories-breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.category-stat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cat-header-line {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 700;
}

.cat-title {
  color: #f7ede2;
}
.cat-money {
  color: #d9a86c;
}

.cat-progress-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  overflow: hidden;
}

.cat-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #d9a86c, #f59e0b);
  border-radius: 6px;
  transition: width 0.5s ease;
}

.cat-footer-sub {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #8c8273;
}

/* Low Stock Radar */
.alert-border-card {
  border-color: rgba(239, 68, 68, 0.3);
}

.badge-count-red {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
}

.low-stock-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.low-stock-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 14px;
}

.stock-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stock-item-name {
  font-size: 13px;
  color: #ffffff;
}
.stock-item-meta {
  font-size: 10px;
  color: #a89f91;
}

.stock-item-levels {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.stock-critical-badge {
  background: #ef4444;
  color: #ffffff;
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
}

.stock-limit-note {
  font-size: 10px;
  color: #a89f91;
}
.clean-empty-state {
  text-align: center;
  padding: 20px;
  color: #34d399;
  font-size: 12px;
  font-weight: 700;
}

/* Approvals Tab */
.approvals-header-banner {
  background: linear-gradient(135deg, rgba(217, 168, 108, 0.15) 0%, rgba(28, 17, 9, 0.6) 100%);
  border: 1px solid rgba(217, 168, 108, 0.3);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.banner-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 900;
  color: #ffffff;
  margin: 0 0 4px;
}
.banner-desc {
  font-size: 11px;
  color: #c4b9a8;
  margin: 0;
}

.banner-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(217, 168, 108, 0.2);
  border: 1px solid #d9a86c;
  color: #d9a86c;
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.approval-filter-strip {
  display: flex;
  gap: 8px;
}

.appr-filter-btn {
  flex: 1;
  padding: 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #c4b9a8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.appr-filter-btn.active {
  background: rgba(217, 168, 108, 0.25);
  border-color: #d9a86c;
  color: #ffffff;
}

.approvals-card-stream {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.approval-ticket-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  padding: 16px;
}

.approval-ticket-card.ticket-pending {
  border-color: rgba(245, 158, 11, 0.4);
  background: linear-gradient(145deg, rgba(245, 158, 11, 0.08) 0%, rgba(20, 14, 8, 0.5) 100%);
}

.ticket-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.ticket-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar-circle {
  width: 34px;
  height: 34px;
  background: rgba(217, 168, 108, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.user-display-name {
  font-size: 13px;
  color: #ffffff;
  display: block;
}
.ticket-time {
  font-size: 10px;
  color: #8c8273;
}

.status-ticket-pill {
  font-size: 10px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 10px;
}

.pill-pending {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}
.pill-approved {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
}
.pill-rejected {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.action-bold-title {
  font-size: 14px;
  font-weight: 800;
  color: #f7ede2;
  margin-bottom: 10px;
}

.ticket-details-box {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 12px;
  padding: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail-item.full-width {
  grid-column: span 2;
}
.detail-k {
  font-size: 10px;
  color: #a89f91;
}
.detail-v {
  font-size: 12px;
  color: #f7ede2;
}
.text-amber {
  color: #f59e0b !important;
}

.ticket-actions-row {
  display: flex;
  gap: 10px;
}

.btn-reject-ticket {
  flex: 1;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  padding: 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.btn-approve-ticket {
  flex: 2;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  color: #ffffff;
  padding: 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
}

.ticket-decided-foot {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #a89f91;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.clean-empty-approvals {
  text-align: center;
  padding: 40px 20px;
  color: #a89f91;
}

.empty-sparkle-icon {
  font-size: 36px;
  margin-bottom: 8px;
}
.clean-empty-approvals h3 {
  font-size: 16px;
  color: #d9a86c;
  margin: 0 0 4px;
}
.clean-empty-approvals p {
  font-size: 12px;
  color: #8c8273;
  margin: 0;
}

/* Luxury Bottom Navigation Bar */
.luxury-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 480px;
  margin: 0 auto;
  background: linear-gradient(180deg, rgba(20, 12, 6, 0.98) 0%, rgba(8, 5, 2, 0.98) 100%);
  border-top: 1px solid rgba(217, 168, 108, 0.25);
  backdrop-filter: blur(20px);
  display: flex;
  justify-content: space-around;
  padding: 10px 16px 16px;
  z-index: 90;
}

.nav-tab-item {
  background: transparent;
  border: none;
  color: #a89f91;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  position: relative;
  min-width: 72px;
  min-height: 48px;
  padding: 5px 12px;
  transition: all 0.2s ease;
}

.nav-icon {
  font-size: 20px;
}
.nav-text {
  font-size: 11px;
  font-weight: 700;
}

.nav-tab-item.active {
  color: #d9a86c;
}

.nav-tab-item.active .nav-icon {
  transform: scale(1.15);
}

.nav-icon-badge-wrap {
  position: relative;
  display: inline-block;
}

.nav-badge-pill {
  position: absolute;
  top: -4px;
  left: -8px;
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 900;
  padding: 1px 6px;
  border-radius: 10px;
  border: 2px solid #080604;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(12px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  background: #181008;
  border: 1px solid rgba(217, 168, 108, 0.4);
  border-radius: 22px;
  width: 100%;
  max-width: 440px;
  color: #f7ede2;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.95);
  overflow: hidden;
}

.modal-head {
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title-flex {
  display: flex;
  align-items: center;
  gap: 10px;
}
.modal-title-flex h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #d9a86c;
}
.modal-close-btn {
  background: transparent;
  border: none;
  color: #a89f91;
  font-size: 18px;
  cursor: pointer;
}

.modal-body {
  padding: 20px;
}
.modal-desc {
  font-size: 12px;
  color: #c4b9a8;
  margin: 0 0 16px;
  line-height: 1.5;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.form-label {
  font-size: 12px;
  color: #d9a86c;
  font-weight: 700;
}

.form-input {
  width: 100%;
  padding: 12px 14px;
  background: #080604;
  border: 1px solid rgba(217, 168, 108, 0.3);
  border-radius: 12px;
  color: #ffffff;
  font-size: 13px;
  outline: none;
  font-family: monospace;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #d9a86c;
  box-shadow: 0 0 12px rgba(217, 168, 108, 0.3);
}

.presets-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-chip {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px 12px;
  color: #e2d7c9;
  font-size: 11px;
  text-align: right;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-chip.chip-active {
  background: rgba(217, 168, 108, 0.25);
  border-color: #d9a86c;
  color: #ffffff;
  font-weight: 700;
}

.test-result-box {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.4;
}

.test-result-box.res-success {
  background: rgba(52, 211, 153, 0.15);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: #34d399;
}

.test-result-box.res-error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.modal-foot {
  padding: 14px 20px;
  background: rgba(0, 0, 0, 0.35);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-test-conn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f7ede2;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.btn-save-conn {
  background: linear-gradient(135deg, #d9a86c, #8a572a);
  border: none;
  color: #ffffff;
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(217, 168, 108, 0.35);
}

/* ═══════════════════════════════════════════════════════════════
   EXECUTIVE LEDGER REDESIGN — Editorial coffee house / Swiss grid
   Purpose: make the report feel like a decision instrument, not a
   collection of generic dark cards.
   ═══════════════════════════════════════════════════════════════ */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700;800&family=Noto+Naskh+Arabic:wght@500;600;700&display=swap');

.luxury-mobile-container {
  --ledger-ink: #201a16;
  --ledger-muted: #766b61;
  --ledger-paper: #f4efe8;
  --ledger-paper-strong: #fffdf9;
  --ledger-line: #ded4c8;
  --ledger-coffee: #6f4933;
  --ledger-copper: #b86d3d;
  --ledger-green: #2c7a64;
  max-width: 760px;
  min-height: 100dvh;
  margin: 0 auto;
  padding-bottom: 104px;
  color: var(--ledger-ink);
  background:
    radial-gradient(circle at 100% 0%, rgba(184, 109, 61, 0.12), transparent 28rem),
    var(--ledger-paper);
  font-family: 'Noto Sans Arabic', 'Cairo', sans-serif;
  box-shadow: 0 0 70px rgba(75, 48, 31, 0.14);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  padding: 18px clamp(18px, 4vw, 34px) 14px;
  background: rgba(244, 239, 232, 0.92);
  border-bottom: 1px solid var(--ledger-line);
  backdrop-filter: blur(18px);
}

.header-inner {
  gap: 18px;
}
.brand-identity {
  gap: 13px;
}
.brand-emblem {
  width: 48px;
  height: 48px;
  border-radius: 16px 16px 6px 16px;
  background: var(--ledger-coffee);
  box-shadow: 7px 7px 0 rgba(184, 109, 61, 0.18);
}
.brand-emblem img {
  width: 34px;
  height: 34px;
}
.brand-name {
  color: var(--ledger-ink);
  font-family: 'Noto Naskh Arabic', serif;
  font-size: 24px;
  line-height: 1;
  letter-spacing: -0.6px;
}
.brand-tagline {
  color: var(--ledger-copper);
  font-size: 11px;
}
.header-quick-actions {
  gap: 7px;
}
.header-btn {
  width: 42px;
  height: 42px;
  border: 1px solid var(--ledger-line);
  border-radius: 12px;
  color: var(--ledger-coffee);
  background: var(--ledger-paper-strong);
  box-shadow: none;
}
.header-btn:hover,
.header-btn:focus-visible {
  color: #fff;
  background: var(--ledger-coffee);
  border-color: var(--ledger-coffee);
  transform: translateY(-2px);
}
.live-status-strip {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--ledger-line);
}
.live-badge {
  color: var(--ledger-muted);
  font-size: 11px;
}
.live-badge.connected {
  color: var(--ledger-green);
}
.live-dot {
  width: 7px;
  height: 7px;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(44, 122, 100, 0.12);
}
.date-quick-selector {
  gap: 6px;
}
.date-pill-btn,
.date-picker-label {
  min-width: 48px;
  min-height: 42px;
  border: 1px solid var(--ledger-line);
  border-radius: 11px;
  color: var(--ledger-muted);
  background: var(--ledger-paper-strong);
}
.date-pill-btn.active {
  color: #fff;
  background: var(--ledger-coffee);
  border-color: var(--ledger-coffee);
}

.report-context-card,
.report-kpi-strip,
.glass-content-card,
.channel-metric-card,
.finance-grid,
.recent-sales-stream,
.luxury-hero-card,
.diagnostic-banner {
  border: 1px solid var(--ledger-line);
  border-radius: 20px;
  box-shadow: 0 12px 30px rgba(75, 48, 31, 0.07);
}
.report-context-card {
  margin: 24px clamp(16px, 4vw, 34px) 12px;
  padding: 18px 20px;
  background: var(--ledger-coffee);
  color: #fffaf4;
  border-color: var(--ledger-coffee);
  position: relative;
  overflow: hidden;
}
.report-context-card::after {
  content: 'REPORT / 01';
  position: absolute;
  left: 18px;
  bottom: 12px;
  color: rgba(255, 250, 244, 0.42);
  direction: ltr;
  font:
    600 9px/1.2 ui-monospace,
    monospace;
  letter-spacing: 1.5px;
}
.report-context-kicker {
  color: #f1c4a4;
}
.report-context-main strong {
  display: block;
  font-family: 'Noto Naskh Arabic', serif;
  font-size: 24px;
}
.report-context-caption {
  color: rgba(255, 250, 244, 0.68);
}
.report-context-status {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.16);
}
.report-context-status.offline {
  background: #9b463e;
  border-color: #9b463e;
}
.report-kpi-strip {
  margin: 0 clamp(16px, 4vw, 34px) 18px;
  padding: 0;
  overflow: hidden;
  background: var(--ledger-paper-strong);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.report-kpi-item {
  padding: 15px 14px;
  border-inline-start: 1px solid var(--ledger-line);
}
.report-kpi-item:first-child {
  border-inline-start: 0;
}
.report-kpi-label {
  color: var(--ledger-muted);
  font-size: 11px;
}
.report-kpi-item strong {
  color: var(--ledger-ink);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.report-kpi-item strong small {
  color: var(--ledger-muted);
  font-size: 10px;
}
.report-kpi-item strong.positive {
  color: var(--ledger-green);
}
.report-kpi-item strong.negative {
  color: #a44c42;
}

.diagnostic-banner {
  margin: 0 clamp(16px, 4vw, 34px) 18px;
  padding: 16px;
  color: var(--ledger-ink);
  background: #fff7ee;
  border-color: #e7b28a;
  box-shadow: none;
}
.diag-icon {
  color: var(--ledger-copper);
  background: #f8dfc9;
}
.diag-text strong {
  color: #8f4933;
}
.diag-text p {
  color: var(--ledger-muted);
}
.diag-actions {
  gap: 7px;
}
.btn-diag-cfg,
.btn-diag-demo,
.btn-diag-retry {
  min-height: 42px;
  border-radius: 11px;
  font-family: inherit;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}
.btn-diag-cfg {
  color: var(--ledger-coffee);
  background: #f3e2d2;
  border-color: #e6c7ae;
}
.btn-diag-demo {
  color: #fff;
  background: var(--ledger-coffee);
  border-color: var(--ledger-coffee);
}
.btn-diag-retry {
  color: #fff;
  background: var(--ledger-copper);
  border-color: var(--ledger-copper);
}
.btn-diag-cfg:hover,
.btn-diag-demo:hover,
.btn-diag-retry:hover {
  transform: translateY(-2px);
}

.mobile-viewport {
  padding: 0 clamp(16px, 4vw, 34px);
}
.luxury-hero-card {
  padding: clamp(22px, 5vw, 34px);
  background: var(--ledger-ink);
  border-color: var(--ledger-ink);
  box-shadow: 10px 12px 0 rgba(184, 109, 61, 0.2);
}
.luxury-hero-card::before {
  background: linear-gradient(90deg, var(--ledger-copper), transparent);
  opacity: 0.8;
}
.hero-title-badge {
  color: #f2c6a5;
}
.growth-chip {
  border-radius: 8px;
}
.hero-amount-display {
  margin: 26px 0 22px;
}
.amount-number {
  color: #fffaf4;
  font-size: clamp(42px, 12vw, 72px);
  letter-spacing: -3px;
}
.currency-prefix {
  color: #d79a70;
}
.hero-stats-subbar {
  border-top-color: rgba(255, 255, 255, 0.15);
}
.sub-label {
  color: rgba(255, 255, 255, 0.55);
}
.sub-val {
  color: #fffaf4;
}
.section-heading h3,
.card-title {
  color: var(--ledger-ink);
  font-family: 'Noto Naskh Arabic', serif;
  font-size: 21px;
}
.channel-ratio,
.card-meta-tag {
  color: var(--ledger-muted);
}
.comparative-ratio-bar {
  background: #e5dcd2;
}
.bar-fill.branch-fill {
  background: var(--ledger-coffee);
}
.bar-fill.wholesale-fill {
  background: var(--ledger-copper);
}
.channel-metric-card {
  background: var(--ledger-paper-strong);
  color: var(--ledger-ink);
  box-shadow: none;
}
.channel-metric-card.branch-theme {
  border-top: 4px solid var(--ledger-coffee);
}
.channel-metric-card.wholesale-theme {
  border-top: 4px solid var(--ledger-copper);
}
.card-top-icon .icon-wrap {
  color: var(--ledger-coffee);
  background: #f1e5d9;
}
.card-label,
.channel-foot {
  color: var(--ledger-muted);
}
.channel-val {
  color: var(--ledger-ink);
  font-variant-numeric: tabular-nums;
}
.channel-val small,
.payment-val small {
  color: var(--ledger-muted);
}
.glass-content-card,
.finance-grid,
.recent-sales-stream {
  background: var(--ledger-paper-strong);
  color: var(--ledger-ink);
}
.payment-row,
.finance-cell,
.recent-sale-row,
.category-stat-item {
  border-color: var(--ledger-line);
}
.payment-text-group .p-name,
.fin-val,
.sale-amt,
.cat-money,
.cell-val {
  color: var(--ledger-ink);
}
.payment-text-group .p-sub,
.fin-lbl,
.fin-sub,
.sale-sub-line,
.cat-footer-sub,
.cell-lbl {
  color: var(--ledger-muted);
}
.text-cyan,
.text-purple,
.text-emerald,
.text-rose {
  color: var(--ledger-copper);
}
.bottom-navigation {
  background: rgba(255, 253, 249, 0.95);
  border-top: 1px solid var(--ledger-line);
  box-shadow: 0 -12px 28px rgba(75, 48, 31, 0.08);
}
.bottom-nav-item {
  color: var(--ledger-muted);
  min-height: 58px;
}
.bottom-nav-item.active {
  color: var(--ledger-coffee);
}
.bottom-nav-item.active::before {
  background: var(--ledger-copper);
}

@media (min-width: 700px) {
  .luxury-mobile-container {
    border-inline: 1px solid var(--ledger-line);
  }
  .channel-cards-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dual-distribution-section {
    padding-inline: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .luxury-mobile-container *,
  .luxury-mobile-container *::before,
  .luxury-mobile-container *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>

<style scoped lang="scss">
/* Contrast pass: keep the warm palette, but make every label readable at a glance. */
.luxury-mobile-container {
  --ledger-ink: #211c18;
  --ledger-muted: #5e554d;
}

.app-header,
.report-context-card,
.luxury-mobile-container,
.luxury-mobile-container button {
  color: #211c18;
}

.header-tagline,
.report-context-caption,
.sub-label,
.channel-ratio,
.card-label,
.card-meta-tag,
.channel-foot,
.fin-lbl,
.fin-sub,
.payment-text-group .p-sub,
.section-heading .section-note {
  color: #5e554d !important;
}

.report-context-kicker,
.hero-title-badge,
.section-heading h3,
.card-title,
.luxury-hero-card .amount-number,
.channel-val,
.payment-text-group .p-name,
.fin-val,
.cell-val,
.sub-val {
  color: #211c18 !important;
}

.date-pill-btn {
  color: #5e554d !important;
  border-color: #cfc3b8 !important;
  background: #fffdfa !important;
}

.date-pill-btn.active {
  color: #fffdfa !important;
  background: #76513a !important;
  border-color: #76513a !important;
}

.card-meta-tag,
.report-kpi-label {
  font-weight: 700;
}

.report-kpi-label {
  color: #5e554d !important;
}

.report-kpi-item strong,
.report-kpi-item strong small {
  color: #211c18 !important;
}

.report-context-status {
  color: #23634f !important;
  background: #e2f2e9 !important;
  border-color: #acd7c1 !important;
}

.growth-chip.chip-up {
  color: #23634f !important;
  background: #d9f0e3 !important;
}

.nav-tab-item,
.nav-tab-item .nav-label {
  color: #5e554d !important;
}

.nav-tab-item.active,
.nav-tab-item.active .nav-label {
  color: #76513a !important;
}

.payment-val,
.payment-val small {
  font-variant-numeric: tabular-nums;
}

.channel-val,
.amount-number,
.payment-val,
.fin-val {
  font-weight: 900;
}
</style>

<style scoped lang="scss">
/* Normalize nested report surfaces so no legacy dark cards leak into the light system. */
.dual-distribution-section {
  background: transparent;
}

.section-heading h3,
.card-title {
  color: #26221f;
}

.channel-metric-card {
  background: #fffdfa;
  border: 1px solid #e4ddd4;
  box-shadow: 0 8px 18px rgba(75, 55, 39, 0.05);
}

.channel-metric-card.branch-theme,
.channel-metric-card.wholesale-theme {
  background: #fffdfa;
}

.channel-metric-card.branch-theme {
  border-top: 3px solid #a96b45;
}

.channel-metric-card.wholesale-theme {
  border-top: 3px solid #5b8f9b;
}

.card-label,
.channel-foot,
.card-meta-tag,
.payment-text-group .p-sub,
.fin-lbl,
.fin-sub {
  color: #756d65;
}

.channel-val,
.payment-text-group .p-name,
.fin-val,
.cell-val {
  color: #26221f;
}

.payment-row,
.finance-grid,
.finance-cell,
.drawer-cash-highlight,
.recent-sale-row,
.shift-cell {
  background: #f6f1eb;
  border-color: #e4ddd4;
}

.payment-row {
  box-shadow: none;
}

.payment-symbol {
  background: #fffdfa;
  border-color: #e4ddd4;
}

.cash-row .payment-symbol {
  color: #a96b45;
}
.instapay-row .payment-symbol {
  color: #3f8792;
}
.card-row .payment-symbol {
  color: #7567a0;
}

.text-cyan {
  color: #3f8792 !important;
}
.text-purple {
  color: #7567a0 !important;
}
.text-rose {
  color: #b45d55 !important;
}
.text-emerald {
  color: #2d7762 !important;
}

.drawer-cash-highlight {
  color: #26221f;
  background: #f7eee6;
  border: 1px solid #ead4c4;
}

.card-glow-orb {
  display: none;
}

.comparative-ratio-bar {
  background: #e8ded3;
}

.branch-fill {
  background: #a96b45;
}
.wholesale-fill {
  background: #5b8f9b;
}

.luxury-hero-card {
  padding: 20px;
}

.hero-amount-display {
  min-height: 72px;
  align-items: center;
}
</style>

<style scoped lang="scss">
/* Hard override for the legacy dark nested surfaces. */
.payment-row,
.finance-cell,
.recent-sale-row,
.shift-cell {
  background: #f6f1eb !important;
  border-color: #e4ddd4 !important;
}

.payment-text-group .p-name,
.payment-val,
.fin-val,
.cell-val {
  color: #26221f !important;
}

.payment-text-group .p-sub,
.fin-lbl,
.fin-sub,
.channel-foot,
.card-meta-tag {
  color: #756d65 !important;
}

.payment-symbol {
  color: #a96b45 !important;
  background: #fffdfa !important;
  border-color: #e4ddd4 !important;
}

.instapay-row .payment-symbol {
  color: #3f8792 !important;
}
.card-row .payment-symbol {
  color: #7567a0 !important;
}
.text-cyan {
  color: #3f8792 !important;
}
.text-purple {
  color: #7567a0 !important;
}
.text-rose {
  color: #b45d55 !important;
}
.text-emerald {
  color: #2d7762 !important;
}
</style>

<style scoped lang="scss">
.hero-stats-subbar {
  background: #f6f1eb;
  border: 1px solid #e8ded3;
  border-radius: 14px;
}

.luxury-bottom-nav {
  background: rgba(255, 253, 250, 0.98);
  border-top: 1px solid #ded5cb;
  box-shadow: 0 -10px 28px rgba(75, 55, 39, 0.1);
}

.nav-tab-item {
  color: #82766d;
  min-height: 66px;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.nav-tab-item.active {
  color: #76513a;
  background: #f7eee6;
}

.nav-tab-item.active::after {
  background: #a96b45;
}
</style>

<style scoped lang="scss">
/* Final visual correction: one calm surface system, one brand accent. */
:global(body) {
  background: #eee9e2;
}

.luxury-mobile-container {
  --ledger-ink: #26221f;
  --ledger-muted: #756d65;
  --ledger-paper: #f3efe9;
  --ledger-paper-strong: #fffdfa;
  --ledger-line: #e4ddd4;
  --ledger-coffee: #76513a;
  --ledger-copper: #a96b45;
  --ledger-green: #2d7762;
  background: var(--ledger-paper);
  color: var(--ledger-ink);
}

.app-header {
  background: rgba(255, 253, 250, 0.94);
  border-bottom-color: var(--ledger-line);
}

.report-context-card {
  color: var(--ledger-ink);
  background: var(--ledger-paper-strong);
  border: 1px solid var(--ledger-line);
  border-inline-start: 5px solid var(--ledger-copper);
  box-shadow: 0 8px 20px rgba(75, 55, 39, 0.06);
}

.report-context-card::after {
  color: #b6aaa0;
}
.report-context-kicker {
  color: var(--ledger-copper);
}
.report-context-main strong {
  color: var(--ledger-ink);
}
.report-context-caption {
  color: var(--ledger-muted);
}
.report-context-status {
  color: var(--ledger-green);
  background: #edf7f1;
  border-color: #cde4d8;
}
.report-context-status.offline {
  color: #9a4d40;
  background: #fff0ec;
  border-color: #efc9c0;
}

.report-kpi-strip {
  background: var(--ledger-paper-strong);
  box-shadow: 0 8px 20px rgba(75, 55, 39, 0.05);
}

.luxury-hero-card {
  color: var(--ledger-ink);
  background: var(--ledger-paper-strong);
  border: 1px solid var(--ledger-line);
  border-top: 4px solid var(--ledger-coffee);
  box-shadow: 0 10px 24px rgba(75, 55, 39, 0.07);
}

.luxury-hero-card::before {
  display: none;
}
.hero-title-badge {
  color: var(--ledger-coffee);
}
.amount-number {
  color: var(--ledger-ink);
}
.currency-prefix {
  color: var(--ledger-copper);
}
.hero-stats-subbar {
  border-top-color: var(--ledger-line);
}
.sub-label {
  color: var(--ledger-muted);
}
.sub-val {
  color: var(--ledger-ink);
}
.sub-divider {
  background: var(--ledger-line);
}

.section-heading h3,
.card-title {
  color: var(--ledger-ink);
}
.channel-metric-card {
  box-shadow: 0 8px 18px rgba(75, 55, 39, 0.05);
}
.glass-content-card,
.finance-grid,
.recent-sales-stream {
  box-shadow: 0 8px 18px rgba(75, 55, 39, 0.05);
}

.bottom-navigation {
  background: rgba(255, 253, 250, 0.97);
  border-top-color: var(--ledger-line);
}

@media (max-width: 520px) {
  .luxury-mobile-container {
    box-shadow: none;
  }
  .report-context-card {
    border-radius: 14px;
  }
  .luxury-hero-card {
    border-radius: 16px;
  }
}
</style>

<style scoped lang="scss">
/* Final contrast pass for labels and values. */
.luxury-mobile-container {
  --ledger-ink: #211c18;
  --ledger-muted: #5e554d;
}

.luxury-mobile-container,
.luxury-mobile-container button,
.app-header,
.report-context-card {
  color: #211c18;
}

.header-tagline,
.report-context-caption,
.sub-label,
.channel-ratio,
.card-label,
.card-meta-tag,
.channel-foot,
.fin-lbl,
.fin-sub,
.payment-text-group .p-sub,
.report-kpi-label {
  color: #5e554d !important;
}

.report-context-kicker,
.hero-title-badge,
.section-heading h3,
.card-title,
.amount-number,
.channel-val,
.payment-text-group .p-name,
.fin-val,
.cell-val,
.sub-val,
.report-kpi-item strong,
.report-kpi-item strong small {
  color: #211c18 !important;
}

.date-pill-btn {
  color: #5e554d !important;
  border-color: #cfc3b8 !important;
  background: #fffdfa !important;
}

.date-pill-btn.active {
  color: #fffdfa !important;
  background: #76513a !important;
  border-color: #76513a !important;
}

.report-context-status {
  color: #23634f !important;
  background: #e2f2e9 !important;
  border-color: #acd7c1 !important;
}

.growth-chip.chip-up {
  color: #23634f !important;
  background: #d9f0e3 !important;
}

.nav-tab-item,
.nav-tab-item .nav-label {
  color: #5e554d !important;
}

.nav-tab-item.active,
.nav-tab-item.active .nav-label {
  color: #76513a !important;
}

.channel-val,
.amount-number,
.payment-val,
.fin-val {
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
</style>

<style scoped lang="scss">
/* Inventory contrast pass: restore readable text on the light report surfaces. */
.inventory-gold-theme .hero-title-badge,
.inventory-gold-theme .amount-number,
.inventory-gold-theme .sub-val,
.inventory-gold-theme .sub-label {
  color: #211c18 !important;
}

.inventory-gold-theme .currency-prefix {
  color: #a96b45 !important;
}

.inventory-gold-theme .chip-gold {
  color: #7a4b22 !important;
  background: #f8e9cf !important;
}

.category-stat-item .cat-title,
.category-stat-item .cat-money {
  color: #211c18 !important;
}

.category-stat-item .cat-money {
  font-weight: 900;
}

.cat-progress-track {
  background: #e4d9ce !important;
}

.cat-progress-fill {
  background: #a96b45 !important;
}

.category-stat-item .cat-footer-sub {
  color: #5e554d !important;
}

.alert-border-card {
  border-color: #e6b7b0 !important;
}

.badge-count-red {
  color: #a33f36 !important;
  background: #fbe3df !important;
  border: 1px solid #efbdb6;
}

.low-stock-row {
  background: #fff0ed !important;
  border-color: #efc8c2 !important;
}

.stock-item-name {
  color: #211c18 !important;
}

.stock-item-meta,
.stock-limit-note {
  color: #6c5d56 !important;
}

.stock-critical-badge {
  color: #fffdfa !important;
  background: #c24f45 !important;
}
</style>
