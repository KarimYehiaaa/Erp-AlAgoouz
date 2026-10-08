<template>
  <div class="luxury-mobile-container" dir="rtl">
    <!-- ═══════════════════════════════════════════════════════════════
         1. TOP NAVIGATION & BRAND EXECUTIVE HEADER
         ═══════════════════════════════════════════════════════════════ -->
    <header class="app-header">
      <div class="header-inner">
        <div class="brand-identity">
          <div class="brand-emblem">
            <img src="/logo-transparent.png" alt="شعار بن العجوز" />
          </div>
          <div class="brand-text">
            <h1 class="brand-name">{{ companyName }}</h1>
            <span class="brand-tagline">
              الإدارة التنفيذية •
              {{ auth.user?.full_name || auth.user?.username || 'لوحة المراقبة' }}
            </span>
          </div>
        </div>

        <div class="header-quick-actions">
          <!-- Dark / Light Theme Toggle -->
          <button
            class="header-btn"
            @click="appStore.toggleDarkMode"
            :title="appStore.darkMode ? 'التحويل للوضع الفاتح' : 'التحويل للوضع الداكن'"
            type="button"
          >
            <span class="btn-icon">
              <AppIcon :name="appStore.darkMode ? 'sun' : 'moon'" :size="18" />
            </span>
          </button>

          <!-- Real-time Refresh -->
          <button
            class="header-btn"
            @click="refreshAll"
            :disabled="loading"
            title="تحديث البيانات اللحظية"
            type="button"
          >
            <span class="btn-icon" :class="{ 'spin-active': loading }">
              <AppIcon name="refresh" :size="18" />
            </span>
          </button>

          <!-- Executive Settings & Session Modal -->
          <button
            class="header-btn"
            @click="showServerConfig = true"
            title="إعدادات النظام والحساب"
            type="button"
          >
            <span class="btn-icon"><AppIcon name="settings" :size="18" /></span>
          </button>
        </div>
      </div>

      <!-- Live Connection & Fast Date Selection Strip -->
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
          <button
            type="button"
            class="date-pill-btn"
            :class="{ active: isTodaySelected }"
            @click="selectToday"
          >
            اليوم
          </button>
          <button
            type="button"
            class="date-pill-btn"
            :class="{ active: isYesterdaySelected }"
            @click="selectYesterday"
          >
            أمس
          </button>
          <label class="date-picker-label" title="اختيار تاريخ مخصص">
            <AppIcon name="calendar" :size="15" />
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

    <!-- ═══════════════════════════════════════════════════════════════
         2. CONNECTION DIAGNOSTICS & RETRY BANNER
         ═══════════════════════════════════════════════════════════════ -->
    <div v-if="fetchError" class="diagnostic-banner">
      <div class="diagnostic-header">
        <span class="diag-icon"><AppIcon name="warning" :size="20" /></span>
        <div class="diag-text">
          <strong>تعذر سحب البيانات من السيرفر</strong>
          <p>{{ fetchError }}</p>
        </div>
      </div>
      <div class="diag-actions">
        <button type="button" class="btn-diag-cfg" @click="showServerConfig = true">
          <AppIcon name="settings" :size="14" /> تعديل الرابط
        </button>
        <button type="button" class="btn-diag-demo" @click="loadDemoData">
          <AppIcon name="sparkles" :size="14" /> بيانات تجريبية
        </button>
        <button type="button" class="btn-diag-retry" @click="refreshAll">
          <AppIcon name="refresh" :size="14" /> إعادة المحاولة
        </button>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         3. MAIN EXECUTIVE VIEWPORT
         ═══════════════════════════════════════════════════════════════ -->
    <main class="mobile-viewport">
      <!-- Loading Skeleton -->
      <div v-if="loading && !summaryData" class="skeleton-wrapper">
        <div class="skeleton-shimmer hero-shimmer"></div>
        <div class="skeleton-shimmer card-shimmer"></div>
        <div class="skeleton-shimmer card-shimmer"></div>
      </div>

      <!-- ═════════════ TAB 1: EXECUTIVE SALES OVERVIEW ═════════════ -->
      <section
        v-else-if="
          (activeTab === 'sales' && !summaryData) || (activeTab === 'inventory' && !inventoryData)
        "
        class="tab-pane"
      >
        <p>البيانات غير متاحة حاليًا. أعد المحاولة بعد التحقق من الاتصال والصلاحيات.</p>
      </section>
      <section v-else-if="activeTab === 'sales'" class="tab-pane">
        <!-- Master Consolidated Executive Hero Card -->
        <div class="executive-hero-card">
          <div class="hero-top-row">
            <div class="hero-date-chip">
              <AppIcon name="calendar" :size="14" />
              <span>إيرادات {{ selectedDateFormatted }}</span>
            </div>
            <div
              class="hero-growth-chip"
              :class="currentSummary.growthPercent >= 0 ? 'growth-up' : 'growth-down'"
            >
              <AppIcon
                :name="currentSummary.growthPercent >= 0 ? 'trendingUp' : 'trendingDown'"
                :size="13"
              />
              <span
                >{{ currentSummary.growthPercent >= 0 ? '+' : ''
                }}{{ currentSummary.growthPercent }}% عن الأمس</span
              >
            </div>
          </div>

          <div class="hero-revenue-display">
            <span class="currency-tag">ج.م</span>
            <span class="revenue-number">{{ formatMoney(currentSummary.grandTotal) }}</span>
          </div>

          <div class="hero-kpi-grid">
            <div class="kpi-cell">
              <span class="kpi-label">عدد الطلبات</span>
              <strong class="kpi-value"
                >{{ currentSummary.totalCount }} <small>فاتورة</small></strong
              >
            </div>
            <div class="kpi-cell-divider"></div>
            <div class="kpi-cell">
              <span class="kpi-label">متوسط الفاتورة</span>
              <strong class="kpi-value"
                >{{ formatMoney(currentSummary.averageOrderValue || 0) }} <small>ج.م</small></strong
              >
            </div>
            <div class="kpi-cell-divider"></div>
            <div class="kpi-cell">
              <span class="kpi-label">صافي السيولة</span>
              <strong
                class="kpi-value"
                :class="(currentSummary.netCashflow || 0) >= 0 ? 'val-positive' : 'val-negative'"
              >
                {{ formatMoney(currentSummary.netCashflow || 0) }} <small>ج.م</small>
              </strong>
            </div>
          </div>
        </div>

        <!-- Sales Distribution: Retail vs Wholesale -->
        <div class="executive-card">
          <div class="card-head">
            <div class="card-head-title">
              <AppIcon name="reports" :size="17" />
              <h3>توزيع المبيعات حسب القناة</h3>
            </div>
            <span class="card-head-sub">
              {{ retailPercent }}% محل • {{ wholesalePercent }}% جملة
            </span>
          </div>

          <!-- Comparative Proportional Bar -->
          <div class="comparative-ratio-bar">
            <div
              class="bar-segment retail-segment"
              :style="{ width: retailPercent + '%' }"
              :title="'تجزئة: ' + retailPercent + '%'"
            ></div>
            <div
              class="bar-segment wholesale-segment"
              :style="{ width: wholesalePercent + '%' }"
              :title="'جملة: ' + wholesalePercent + '%'"
            ></div>
          </div>

          <div class="channel-cards-grid">
            <!-- Retail (POS) Card -->
            <div class="channel-card retail-theme">
              <div class="channel-header">
                <span class="channel-icon-pill"><AppIcon name="shop" :size="16" /></span>
                <span class="channel-name">مبيعات المحل (POS)</span>
              </div>
              <div class="channel-amount">
                {{ formatMoney(currentSummary.retail?.total || 0) }} <small>ج.م</small>
              </div>
              <div class="channel-footer">
                <span>{{ currentSummary.retail?.count || 0 }} فاتورة</span>
                <span v-if="currentSummary.retail?.discount" class="discount-tag">
                  خصم: {{ formatMoney(currentSummary.retail.discount) }}
                </span>
              </div>
            </div>

            <!-- Wholesale Card -->
            <div class="channel-card wholesale-theme">
              <div class="channel-header">
                <span class="channel-icon-pill"><AppIcon name="truck" :size="16" /></span>
                <span class="channel-name">مبيعات الجملة</span>
              </div>
              <div class="channel-amount">
                {{ formatMoney(currentSummary.wholesale?.total || 0) }} <small>ج.م</small>
              </div>
              <div class="channel-footer">
                <span>{{ currentSummary.wholesale?.count || 0 }} فاتورة</span>
                <span v-if="currentSummary.wholesale?.discount" class="discount-tag">
                  خصم: {{ formatMoney(currentSummary.wholesale.discount) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Payment Breakdown (Collection Channels) -->
        <div class="executive-card">
          <div class="card-head">
            <div class="card-head-title">
              <AppIcon name="creditCard" :size="17" />
              <h3>طرق التحصيل المالي في الخزينة</h3>
            </div>
            <span class="card-head-sub">إجمالي المقبوضات</span>
          </div>

          <div class="payment-methods-stack">
            <!-- Cash -->
            <div class="payment-method-row">
              <div class="pm-icon-wrap icon-cash"><AppIcon name="cash" :size="18" /></div>
              <div class="pm-info">
                <span class="pm-title">نقداً (كاش)</span>
                <span class="pm-desc">في درج المحل والخزينة النقدية</span>
              </div>
              <div class="pm-amount">
                {{ formatMoney(currentSummary.paymentTotals?.cash || 0) }} <small>ج.م</small>
              </div>
            </div>

            <!-- InstaPay & E-Wallets -->
            <div class="payment-method-row">
              <div class="pm-icon-wrap icon-instapay"><AppIcon name="monitor" :size="18" /></div>
              <div class="pm-info">
                <span class="pm-title">انستاباي والمحافظ</span>
                <span class="pm-desc">تحويلات بنكية ومحافظ ذكية</span>
              </div>
              <div class="pm-amount">
                {{ formatMoney(currentSummary.paymentTotals?.instapay || 0) }} <small>ج.م</small>
              </div>
            </div>

            <!-- Cards & Electronic POS -->
            <div class="payment-method-row">
              <div class="pm-icon-wrap icon-card"><AppIcon name="creditCard" :size="18" /></div>
              <div class="pm-info">
                <span class="pm-title">فيزا وبطاقات دفع</span>
                <span class="pm-desc">ماكينات نقاط البيع الإلكترونية</span>
              </div>
              <div class="pm-amount">
                {{ formatMoney(currentSummary.paymentTotals?.card || 0) }} <small>ج.م</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Expenses & Net Liquidity -->
        <div class="executive-card">
          <div class="card-head">
            <div class="card-head-title">
              <AppIcon name="trendingDown" :size="17" />
              <h3>المصروفات وصافي السيولة النقدية</h3>
            </div>
            <span class="card-head-sub">{{ selectedDateFormatted }}</span>
          </div>

          <div class="finance-dual-grid">
            <div class="finance-block exp-block">
              <span class="fin-label">مصروفات اليوم</span>
              <strong class="fin-val val-danger">
                {{ formatMoney(currentSummary.expenses?.total || 0) }} <small>ج.م</small>
              </strong>
              <span class="fin-sub">{{ currentSummary.expenses?.count || 0 }} بنود مسجلة</span>
            </div>

            <div class="finance-block net-block">
              <span class="fin-label">صافي السيولة النقدية</span>
              <strong
                class="fin-val"
                :class="(currentSummary.netCashflow || 0) >= 0 ? 'val-positive' : 'val-danger'"
              >
                {{ formatMoney(currentSummary.netCashflow || 0) }} <small>ج.م</small>
              </strong>
              <span class="fin-sub">(المقبوض نقداً - المصروفات)</span>
            </div>
          </div>
        </div>

        <!-- Active Shift & Drawer Cash Float -->
        <div class="executive-card">
          <div class="card-head">
            <div class="card-head-title">
              <span
                class="status-pulse-dot"
                :class="currentSummary.activeShift ? 'pulse-active' : 'pulse-inactive'"
              ></span>
              <AppIcon name="shop" :size="17" />
              <h3>وردية المحل الحالية</h3>
            </div>
            <span v-if="currentSummary.activeShift" class="shift-state-pill shift-open">
              <AppIcon name="check" :size="13" /> وردية نشطة
            </span>
            <span v-else class="shift-state-pill shift-closed">
              <AppIcon name="lock" :size="13" /> مغلقة
            </span>
          </div>

          <div v-if="currentSummary.activeShift" class="shift-details-body">
            <div class="shift-info-grid">
              <div class="shift-info-cell">
                <span class="shift-lbl">الكاشير:</span>
                <strong class="shift-val">{{ currentSummary.activeShift.cashier_name }}</strong>
              </div>
              <div class="shift-info-cell">
                <span class="shift-lbl">رقم الوردية:</span>
                <strong class="shift-val">#{{ currentSummary.activeShift.shift_number }}</strong>
              </div>
              <div class="shift-info-cell">
                <span class="shift-lbl">وقت البدء:</span>
                <span class="shift-val">{{
                  formatTime(currentSummary.activeShift.opened_at)
                }}</span>
              </div>
              <div class="shift-info-cell">
                <span class="shift-lbl">عهدة البداية:</span>
                <span class="shift-val"
                  >{{ formatMoney(currentSummary.activeShift.opening_cash) }} ج.م</span
                >
              </div>
            </div>

            <!-- Expected Cash in Drawer Highlight Box -->
            <div class="expected-cash-banner">
              <div class="ec-header">
                <AppIcon name="cash" :size="16" />
                <span>النقدية المتوقعة في الدرج الآن (Expected Cash):</span>
              </div>
              <div class="ec-amount">
                {{ formatMoney(currentSummary.activeShift.current_expected_cash) }}
                <small>ج.م</small>
              </div>
            </div>
          </div>

          <div v-else class="shift-empty-state">
            <AppIcon name="lock" :size="20" />
            <span>لا توجد وردية مفتوحة حالياً. يتم تحديث بيانات الدرج تلقائياً فور بدء الشفت.</span>
          </div>
        </div>

        <!-- Recent Sales Stream (Live Pulse) -->
        <div v-if="currentSummary.recentSales?.length" class="executive-card">
          <div class="card-head">
            <div class="card-head-title">
              <AppIcon name="zap" :size="17" />
              <h3>أحدث فواتير اليوم</h3>
            </div>
            <span class="card-head-sub">{{ currentSummary.recentSales.length }} فواتير</span>
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
                  :size="16"
                />
              </div>
              <div class="sale-details">
                <div class="sale-primary-line">
                  <strong class="sale-num">{{ s.saleNumber }}</strong>
                  <strong class="sale-amt">{{ formatMoney(s.totalAmount) }} ج.م</strong>
                </div>
                <div class="sale-secondary-line">
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
        <!-- Inventory Valuation Master Hero Card -->
        <div class="executive-hero-card inventory-hero-theme">
          <div class="hero-top-row">
            <div class="hero-date-chip">
              <AppIcon name="boxes" :size="14" />
              <span>تقييم المخزون المالي</span>
            </div>
            <div class="hero-growth-chip growth-neutral">
              <span>رأس مال مربوط</span>
            </div>
          </div>

          <div class="hero-revenue-display">
            <span class="currency-tag">ج.م</span>
            <span class="revenue-number">{{ formatMoney(currentInventory.totalValuation) }}</span>
          </div>

          <div class="hero-kpi-grid">
            <div class="kpi-cell">
              <span class="kpi-label">الأصناف المتوفرة</span>
              <strong class="kpi-value"
                >{{ currentInventory.productsInStock }} <small>صنف</small></strong
              >
            </div>
            <div class="kpi-cell-divider"></div>
            <div class="kpi-cell">
              <span class="kpi-label">القيمة البيعية المتوقعة</span>
              <strong class="kpi-value"
                >{{ formatMoney(currentInventory.totalRetailValue) }} <small>ج.م</small></strong
              >
            </div>
            <div class="kpi-cell-divider"></div>
            <div class="kpi-cell">
              <span class="kpi-label">مجمل الربح التقديري</span>
              <strong class="kpi-value val-positive">
                {{
                  formatMoney(
                    Math.max(
                      0,
                      currentInventory.totalRetailValue - currentInventory.totalValuation,
                    ),
                  )
                }}
                <small>ج.م</small>
              </strong>
            </div>
          </div>
        </div>

        <!-- Categories Capital Distribution -->
        <div class="executive-card">
          <div class="card-head">
            <div class="card-head-title">
              <AppIcon name="layers" :size="17" />
              <h3>توزيع رأس المال حسب الأقسام</h3>
            </div>
            <span class="card-head-sub">{{ currentInventory.categories?.length || 0 }} أقسام</span>
          </div>

          <div class="category-breakdown-list">
            <div
              v-for="cat in currentInventory.categories || []"
              :key="cat.name"
              class="category-stat-row"
            >
              <div class="cat-headline">
                <span class="cat-name">{{ cat.name }}</span>
                <strong class="cat-amount">{{ formatMoney(cat.valuation) }} ج.م</strong>
              </div>
              <div class="cat-progress-track">
                <div
                  class="cat-progress-fill"
                  :style="{ width: getCategoryPercent(cat.valuation) + '%' }"
                ></div>
              </div>
              <div class="cat-footer-sub">
                <span>{{ cat.productCount }} أصناف • {{ formatQty(cat.totalQuantity) }} وحدة</span>
                <span class="cat-ratio-badge"
                  >{{ getCategoryPercent(cat.valuation) }}% من القيمة</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Critical Low Stock Radar -->
        <div class="executive-card alert-card">
          <div class="card-head">
            <div class="card-head-title">
              <span class="status-pulse-dot pulse-warning"></span>
              <AppIcon name="warning" :size="17" />
              <h3 class="title-warning">رادار النواقص وتنبيهات إعادة الطلب</h3>
            </div>
            <span class="alert-count-badge">
              {{ currentInventory.lowStockItems?.length || 0 }} صنف
            </span>
          </div>

          <div v-if="currentInventory.lowStockItems?.length" class="low-stock-items-list">
            <div
              v-for="item in currentInventory.lowStockItems"
              :key="item.id"
              class="low-stock-item-row"
            >
              <div class="stock-item-info">
                <strong class="stock-item-name">{{ item.name }}</strong>
                <span class="stock-item-meta">{{ item.category }} • كود: {{ item.sku }}</span>
              </div>
              <div class="stock-item-levels">
                <span class="stock-level-badge">
                  المتبقي: {{ formatQty(item.currentStock) }} {{ item.unit }}
                </span>
                <span class="stock-limit-note">حد الأمان: {{ item.minLimit }}</span>
              </div>
            </div>
          </div>

          <div v-else class="stock-healthy-state">
            <AppIcon name="check" :size="18" />
            <span>المخزون متزن — لا توجد أصناف تحت حد الأمان حالياً.</span>
          </div>
        </div>
      </section>

      <!-- ═════════════ TAB 3: REMOTE APPROVALS ═════════════ -->
      <section v-else-if="activeTab === 'approvals'" class="tab-pane">
        <!-- Header Banner -->
        <div class="approvals-top-banner">
          <div>
            <h2 class="banner-title"><AppIcon name="bell" :size="18" /> طلبات موافقة الكاشير</h2>
            <p class="banner-desc">اعتماد أو رفض طلبات الخصم والاستثناءات بضغطة زر</p>
          </div>
          <button type="button" class="banner-refresh-btn" @click="fetchApprovals">
            <AppIcon name="refresh" :size="14" />
            <span>تحديث</span>
          </button>
        </div>

        <!-- Filter Pills -->
        <div class="approval-filter-tabs">
          <button
            type="button"
            class="appr-filter-pill"
            :class="{ active: approvalFilter === 'pending' }"
            @click="approvalFilter = 'pending'"
          >
            <AppIcon name="clock" :size="14" />
            <span>المعلقة ({{ pendingApprovalsCount }})</span>
          </button>
          <button
            type="button"
            class="appr-filter-pill"
            :class="{ active: approvalFilter === 'all' }"
            @click="approvalFilter = 'all'"
          >
            <AppIcon name="recipes" :size="14" />
            <span>كل الطلبات</span>
          </button>
        </div>

        <!-- Approvals Stream -->
        <div v-if="filteredApprovals.length" class="approvals-stream">
          <div
            v-for="req in filteredApprovals"
            :key="req.id"
            class="approval-ticket-card"
            :class="'ticket-' + req.status"
          >
            <div class="ticket-header">
              <div class="ticket-requester">
                <span class="requester-icon"><AppIcon name="userCheck" :size="15" /></span>
                <div>
                  <strong class="requester-name">{{ req.requester_name || 'الكاشير' }}</strong>
                  <span class="ticket-time">{{ formatRelativeTime(req.created_at) }}</span>
                </div>
              </div>
              <span class="status-ticket-badge" :class="'badge-' + req.status">
                {{ getStatusLabel(req.status) }}
              </span>
            </div>

            <div class="ticket-body">
              <h4 class="ticket-action-title">{{ req.action_label }}</h4>

              <div class="ticket-details-box" v-if="req.details">
                <div v-if="req.details.discount_amount" class="detail-pair">
                  <span class="dp-key">الخصم المطلوب:</span>
                  <strong class="dp-val val-warning"
                    >{{ formatMoney(req.details.discount_amount) }} ج.م</strong
                  >
                </div>
                <div v-if="req.details.amount" class="detail-pair">
                  <span class="dp-key">إجمالي الفاتورة:</span>
                  <strong class="dp-val">{{ formatMoney(req.details.amount) }} ج.م</strong>
                </div>
                <div v-if="req.details.reason" class="detail-pair dp-full">
                  <span class="dp-key">السبب المسجل:</span>
                  <span class="dp-val dp-desc">{{ req.details.reason }}</span>
                </div>
              </div>
            </div>

            <!-- Action Buttons if Pending -->
            <div v-if="req.status === 'pending'" class="ticket-actions">
              <button
                type="button"
                class="btn-ticket-reject"
                :disabled="decidingId !== null"
                @click="handleDecide(req.id, 'rejected')"
              >
                <AppIcon name="close" :size="15" />
                <span>رفض الخصم</span>
              </button>

              <button
                type="button"
                class="btn-ticket-approve"
                :disabled="decidingId !== null"
                @click="handleDecide(req.id, 'approved')"
              >
                <span v-if="decidingId === req.id">جاري الاعتماد...</span>
                <span v-else class="btn-inner-flex">
                  <AppIcon name="check" :size="15" />
                  <span>موافقة وفك القفل</span>
                </span>
              </button>
            </div>

            <!-- Decided Info Foot -->
            <div v-else class="ticket-decided-footer">
              <span
                >تم بواسطة: <strong>{{ req.decided_by_name || 'المدير' }}</strong></span
              >
              <span>{{ formatTime(req.decided_at || '') }}</span>
            </div>
          </div>
        </div>

        <div v-else class="approvals-empty-state">
          <div class="empty-sparkle"><AppIcon name="check" :size="28" /></div>
          <h3>لا توجد طلبات معلقة</h3>
          <p>كافة عمليات الكاشير والمحل تسير بالأسعار والخصومات المعتمدة تلقائياً.</p>
        </div>
      </section>
    </main>

    <!-- ═══════════════════════════════════════════════════════════════
         4. BOTTOM LUXURY NAVIGATION BAR
         ═══════════════════════════════════════════════════════════════ -->
    <nav class="luxury-bottom-nav">
      <button
        type="button"
        class="nav-tab-item"
        :class="{ active: activeTab === 'sales' }"
        @click="activeTab = 'sales'"
      >
        <span class="nav-icon"><AppIcon name="reports" :size="20" /></span>
        <span class="nav-text">نظرة عامة</span>
      </button>

      <button
        type="button"
        class="nav-tab-item"
        :class="{ active: activeTab === 'inventory' }"
        @click="activeTab = 'inventory'"
      >
        <span class="nav-icon"><AppIcon name="products" :size="20" /></span>
        <span class="nav-text">المخزون</span>
      </button>

      <button
        type="button"
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
         5. BACKEND SERVER CONFIGURATION MODAL
         ═══════════════════════════════════════════════════════════════ -->
    <div v-if="showServerConfig" class="modal-overlay" @click.self="showServerConfig = false">
      <div class="modal-card">
        <div class="modal-head">
          <div class="modal-title-flex">
            <span class="modal-icon"><AppIcon name="settings" :size="18" /></span>
            <h3>إعدادات المنظومة والاتصال</h3>
          </div>
          <button type="button" class="modal-close-btn" @click="showServerConfig = false">
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Active User & Session Profile Card -->
          <div class="modal-user-card">
            <div class="user-avatar-wrap">
              <AppIcon name="userCheck" :size="20" />
            </div>
            <div class="user-info-text">
              <strong>{{ auth.user?.full_name || auth.user?.username || 'مدير المنظومة' }}</strong>
              <span class="user-role-badge">صلاحيات الإدارة التنفيذية والرقابة</span>
            </div>
          </div>

          <!-- Quick Navigation & Logout Actions -->
          <div class="modal-quick-nav">
            <RouterLink to="/" class="btn-modal-action" title="العودة لمنظومة سطح المكتب">
              <AppIcon name="monitor" :size="16" />
              <span>منظومة سطح المكتب والـ POS</span>
            </RouterLink>
            <button type="button" class="btn-modal-action btn-modal-logout" @click="handleLogout">
              <AppIcon name="logout" :size="16" />
              <span>تسجيل الخروج من المنظومة</span>
            </button>
          </div>

          <div class="modal-section-divider">
            <span>إعدادات خادم النظام (Backend Server)</span>
          </div>

          <p class="modal-desc">
            حدد رابط السيرفر الذي ترغب بربط التطبيق به لضمان مزامنة البيانات اللحظية والتحكم في
            المحل.
          </p>

          <div class="form-group">
            <label class="form-label">رابط السيرفر (Server URL / IP):</label>
            <input
              v-model="customServerUrl"
              type="text"
              class="form-input"
              :placeholder="serverUrlPlaceholder"
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
              :class="{ 'chip-active': customServerUrl === 'http://localhost:3000' }"
              v-if="isValidServerUrl('http://localhost:3000')"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  managerMobileApi,
  type ExecutiveSummaryData,
  type InventoryValuationData,
  type ManagerApprovalRequest,
} from '@/api/managerMobile.api';
import {
  assertValidServerUrl,
  ServerAddressError,
  isValidServerUrl,
  getApiCacheScope,
  getBaseServerUrl,
  setBaseServerUrl,
} from '@/api/client';
import { initNativeMobile, triggerHaptic } from '@/services/nativeMobileService';
import { brandingState } from '@/design-system/themes/themeEngine';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useRouter } from 'vue-router';
import axios from 'axios';

const auth = useAuthStore();
const appStore = useAppStore();
const router = useRouter();

const companyName = computed(() => brandingState.companyName || 'بن العجوز');

const handleLogout = async () => {
  if (window.confirm('هل ترغب بتسجيل الخروج من المنظومة؟')) {
    triggerHaptic('medium');
    try {
      await auth.logout();
      await router.replace('/login');
    } catch {
      appStore.addToast('تعذر إتمام تسجيل الخروج. تحقق من الاتصال وحاول مرة أخرى.', 'error');
    }
  }
};

// ─── Reactive State ─────────────────────────────────────────
const activeTab = ref<'sales' | 'inventory' | 'approvals'>('sales');
const loading = ref(false);
const fetchError = ref('');
const decidingId = ref<number | null>(null);
const isLiveConnected = ref(false);
const approvalFilter = ref<'pending' | 'all'>('pending');

// ─── Date Selection ─────────────────────────────────────────
const cairoDay = (offset = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const selectedDateStr = ref<string>(cairoDay());
const customSelectedDate = ref<string>(cairoDay());
const isTodaySelected = computed(() => selectedDateStr.value === cairoDay());
const isYesterdaySelected = computed(() => selectedDateStr.value === cairoDay(-1));
const selectedDateFormatted = computed(() =>
  isTodaySelected.value ? 'اليوم' : isYesterdaySelected.value ? 'أمس' : selectedDateStr.value,
);
const selectToday = () => {
  selectedDateStr.value = cairoDay();
  customSelectedDate.value = selectedDateStr.value;
  refreshAll();
};
const selectYesterday = () => {
  selectedDateStr.value = cairoDay(-1);
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
const serverUrlPlaceholder = 'رابط HTTPS أو عنوان الشبكة المحلية للسيرفر';
const testingConn = ref(false);
const testResultMsg = ref('');
const testResultStatus = ref<'success' | 'error' | ''>('');
let diagnosticRequest = 0;

// ─── Data Holders ───────────────────────────────────────────
const summaryData = ref<ExecutiveSummaryData | null>(null);
const inventoryData = ref<InventoryValuationData | null>(null);
const approvalsList = ref<ManagerApprovalRequest[]>([]);
const isDemoMode = ref(false);

// Fallback Default Data (Prevents Blank Screens)
const fallbackSummary: ExecutiveSummaryData = {
  date: cairoDay(),
  grandTotal: 0,
  totalCount: 0,
  yesterdayTotal: 0,
  growthPercent: 0,
  averageOrderValue: 0,
  retail: { total: 0, discount: 0, count: 0, cash: 0, instapay: 0, card: 0, other: 0 },
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

const retailPercent = computed(() => {
  const g = currentSummary.value.grandTotal || 0;
  if (g <= 0) return 50;
  const retail = currentSummary.value.retail?.total || 0;
  return Math.min(100, Math.max(0, Math.round((retail / g) * 100)));
});

const wholesalePercent = computed(() => {
  return Math.max(0, 100 - retailPercent.value);
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
  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  });
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
      return 'قيد الانتظار';
    case 'approved':
      return 'معتمد';
    case 'rejected':
      return 'مرفوض';
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
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // Audio feedback is optional
  }
};

// ─── Server Diagnostics ─────────────────────────────────────
const diagnosticTarget = () =>
  (customServerUrl.value || getBaseServerUrl() || window.location.origin).replace(/\/+$/, '');
const testServerConnection = async () => {
  const request = ++diagnosticRequest;
  testingConn.value = true;
  testResultMsg.value = '';
  testResultStatus.value = '';

  const target = diagnosticTarget();
  const startTime = Date.now();
  try {
    assertValidServerUrl(target);
    let res: any;
    try {
      res = await axios.get(`${target}/api/v1/health`, { timeout: 12000 });
    } catch {
      res = await axios.get(`${target}/health`, { timeout: 12000 });
    }
    const latency = Date.now() - startTime;
    if (disposed || request !== diagnosticRequest || target !== diagnosticTarget()) return;
    if (res.status === 200 && res.data?.success === true && res.data?.db?.connected === true) {
      testResultStatus.value = 'success';
      const isCloud = target.includes('agoouz') || target.includes('https');
      const isDbOk = res.data.db?.connected ? ' • قاعدة البيانات متصلة' : '';
      testResultMsg.value = `الاتصال ناجح! (${isCloud ? 'سيرفر سحابي' : 'سيرفر محلي'} • استجابة: ${latency}ms${isDbOk})`;
      triggerHaptic('success');
    } else {
      throw new Error('استجابة غير متوقعة');
    }
  } catch (error) {
    if (disposed || request !== diagnosticRequest || target !== diagnosticTarget()) return;
    testResultStatus.value = 'error';
    testResultMsg.value =
      error instanceof ServerAddressError
        ? error.message
        : `تعذر الاتصال بالسيرفر (${target}). يرجى التأكد من تشغيل السيرفر وعنوان الـ IP.`;
    triggerHaptic('error');
  } finally {
    if (request === diagnosticRequest) testingConn.value = false;
  }
};

const saveServerConfig = () => {
  try {
    const scope = getApiCacheScope();
    setBaseServerUrl(customServerUrl.value.trim());
    showServerConfig.value = false;
    testResultMsg.value = '';
    triggerHaptic('success');
    if (scope === getApiCacheScope() && auth.user?.id) {
      refreshAll();
      initLiveConnection();
    }
  } catch (err: any) {
    testResultStatus.value = 'error';
    testResultMsg.value = err.message || 'عنوان السيرفر غير صالح';
  }
};

// ─── Data Fetching ──────────────────────────────────────────
let disposed = false;
let viewRevision = 0;
let summaryRequest = 0;
let inventoryRequest = 0;
let approvalsRequest = 0;
let refreshRequest = 0;
let decisionRequest = 0;
const context = () => ({ scope: getApiCacheScope(), revision: viewRevision });
const isCurrent = (captured: ReturnType<typeof context>) =>
  !disposed && captured.revision === viewRevision && captured.scope === getApiCacheScope();
const saveCache = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* العرض الناجح لا يعتمد على توفر التخزين */
  }
};
const readCache = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};
const fetchSummary = async () => {
  const captured = context();
  const date = selectedDateStr.value;
  const request = ++summaryRequest;
  const data = await managerMobileApi.getSummary(date);
  if (data && isCurrent(captured) && request === summaryRequest && date === selectedDateStr.value) {
    summaryData.value = data;
    saveCache(`binalagoouz_cached_summary:${captured.scope}:${date}`, data);
  }
};
const fetchInventory = async () => {
  const captured = context();
  const request = ++inventoryRequest;
  const data = await managerMobileApi.getInventoryValuation();
  if (data && isCurrent(captured) && request === inventoryRequest) {
    inventoryData.value = data;
    saveCache(`binalagoouz_cached_inventory:${captured.scope}`, data);
  }
};
const fetchApprovals = async () => {
  const captured = context();
  const request = ++approvalsRequest;
  const data = await managerMobileApi.getApprovals('all');
  if (Array.isArray(data) && isCurrent(captured) && request === approvalsRequest)
    approvalsList.value = data;
};
const refreshAll = async () => {
  const captured = context();
  const wasDemo = isDemoMode.value;
  const date = selectedDateStr.value;
  const request = ++refreshRequest;
  loading.value = true;
  fetchError.value = '';
  const results = await Promise.allSettled([fetchSummary(), fetchInventory(), fetchApprovals()]);
  if (!isCurrent(captured) || request !== refreshRequest || date !== selectedDateStr.value) return;
  isDemoMode.value = false;
  const denied = (result: PromiseSettledResult<unknown>) =>
    result.status === 'rejected' &&
    [401, 403].includes(Number(result.reason?.response?.status || result.reason?.status));
  if (results[0].status === 'rejected') {
    const cached = denied(results[0])
      ? null
      : readCache(`binalagoouz_cached_summary:${captured.scope}:${date}`);
    summaryData.value =
      cached?.date === date &&
      cached?.retail &&
      cached?.wholesale &&
      cached?.paymentTotals &&
      cached?.expenses &&
      Number.isFinite(cached?.grandTotal)
        ? cached
        : null;
  }
  if (results[1].status === 'rejected') {
    const cached = denied(results[1])
      ? null
      : readCache(`binalagoouz_cached_inventory:${captured.scope}`);
    inventoryData.value =
      Array.isArray(cached?.categories) &&
      Array.isArray(cached?.lowStockItems) &&
      Number.isFinite(cached?.totalValuation)
        ? cached
        : null;
  }
  if (results[2].status === 'rejected') approvalsList.value = [];
  if (results.some((result) => result.status === 'rejected')) {
    fetchError.value = results.some(denied)
      ? 'بعض البيانات غير مصرح بها للجلسة الحالية؛ أعد تسجيل الدخول أو راجع الصلاحيات.'
      : 'تعذر تحديث بعض البيانات. البيانات المخزنة، إن وجدت، قد تكون قديمة.';
  }
  loading.value = false;
  if (wasDemo) initLiveConnection();
};

// ─── Demo Data Loader (for offline preview) ─────────────────
const loadDemoData = () => {
  resetViewContext();
  isDemoMode.value = true;
  fetchError.value = '';
  summaryData.value = {
    date: selectedDateStr.value,
    grandTotal: 18450,
    totalCount: 68,
    yesterdayTotal: 15200,
    growthPercent: 21.4,
    averageOrderValue: 271.3,
    retail: {
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
  if (decidingId.value !== null) return;
  const captured = context();
  const request = ++decisionRequest;
  const demo = isDemoMode.value;
  decidingId.value = id;
  try {
    if (!demo) {
      const updated = await managerMobileApi.decideApproval(id, decision);
      if (!isCurrent(captured) || request !== decisionRequest) return;
      const item = approvalsList.value.find((approval) => approval.id === id);
      if (item && updated) Object.assign(item, updated);
      void fetchSummary().catch(() => {
        if (isCurrent(captured))
          fetchError.value = 'تم حفظ القرار، لكن تعذر تحديث الملخص. أعد تحميل البيانات.';
      });
    } else {
      const item = approvalsList.value.find((approval) => approval.id === id);
      if (item)
        Object.assign(item, {
          status: decision,
          decided_by_name: 'المدير التنفيذي',
          decided_at: new Date().toISOString(),
        });
    }
    if (isCurrent(captured)) triggerHaptic(decision === 'approved' ? 'success' : 'medium');
  } catch (err: any) {
    if (isCurrent(captured) && request === decisionRequest) {
      triggerHaptic('error');
      alert(err?.response?.data?.message || 'حدث خطأ أثناء حفظ القرار');
    }
  } finally {
    if (isCurrent(captured) && request === decisionRequest) decidingId.value = null;
  }
};

// ─── Real-time WebSocket ────────────────────────────────────
let ws: WebSocket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const stopLiveConnection = () => {
  const previous = ws;
  ws = null;
  previous?.close();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  isLiveConnected.value = false;
};
const resetViewContext = () => {
  viewRevision++;
  summaryRequest++;
  inventoryRequest++;
  approvalsRequest++;
  refreshRequest++;
  decisionRequest++;
  diagnosticRequest++;
  testingConn.value = false;
  testResultMsg.value = '';
  testResultStatus.value = '';
  summaryData.value = null;
  inventoryData.value = null;
  approvalsList.value = [];
  loading.value = false;
  decidingId.value = null;
  fetchError.value = '';
  isDemoMode.value = false;
  stopLiveConnection();
};
const initLiveConnection = () => {
  stopLiveConnection();
  if (disposed || !auth.user?.id || isDemoMode.value) return;
  const captured = context();
  try {
    const url = new URL('/ws', getBaseServerUrl() || window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url.toString());
    ws = socket;
    const active = () => isCurrent(captured) && ws === socket;
    socket.onopen = () => {
      if (active()) isLiveConnected.value = true;
    };
    socket.onclose = socket.onerror = () => {
      if (active()) isLiveConnected.value = false;
    };
    socket.onmessage = (event) => {
      if (!active()) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'approval:requested' && Number.isSafeInteger(msg.data?.id)) {
          approvalsRequest++;
          if (!approvalsList.value.some((item) => item.id === msg.data.id)) {
            playAlertSound();
            approvalsList.value.unshift(msg.data);
          }
          void fetchSummary().catch(() => {});
        } else if (msg.event === 'approval:decided' && Number.isSafeInteger(msg.data?.id)) {
          approvalsRequest++;
          const idx = approvalsList.value.findIndex((item) => item.id === msg.data.id);
          if (idx !== -1) approvalsList.value[idx] = msg.data;
          void fetchSummary().catch(() => {});
        }
      } catch {
        /* تجاهل الرسائل غير الصالحة */
      }
    };
  } catch {
    isLiveConnected.value = false;
  }
  pollTimer = setInterval(() => {
    if (!isCurrent(captured) || isDemoMode.value || loading.value) return;
    const date = selectedDateStr.value;
    void Promise.allSettled([
      fetchSummary(),
      ...(activeTab.value === 'approvals' ? [fetchApprovals()] : []),
    ]).then((results) => {
      if (!isCurrent(captured) || date !== selectedDateStr.value) return;
      for (const [index, result] of results.entries()) {
        if (result.status !== 'rejected') continue;
        const denied = [401, 403].includes(
          Number(result.reason?.response?.status || result.reason?.status),
        );
        if (denied && index === 0) summaryData.value = null;
        if (denied && index === 1) approvalsList.value = [];
        fetchError.value = denied
          ? 'بعض البيانات غير مصرح بها للجلسة الحالية.'
          : 'تعذر التحديث التلقائي؛ البيانات المعروضة قد تكون قديمة.';
      }
    });
  }, 12000);
};
const onServerChanged = () => resetViewContext();
watch(
  () => auth.user?.id,
  () => {
    resetViewContext();
    if (!disposed && auth.user?.id) {
      void refreshAll();
      initLiveConnection();
    }
  },
);
watch(selectedDateStr, () => {
  summaryData.value = null;
});
onMounted(() => {
  initNativeMobile();
  window.addEventListener('erp:server-changed', onServerChanged);
  void refreshAll();
  initLiveConnection();
});
onUnmounted(() => {
  disposed = true;
  resetViewContext();
  window.removeEventListener('erp:server-changed', onServerChanged);
});
</script>

<style scoped lang="scss">
/* ═══════════════════════════════════════════════════════════════
   UNIFIED EXECUTIVE MOBILE DESIGN SYSTEM
   Brand Alignment: Al-Agoouz ERP (Warm Roasted Coffee & Luxury Gold)
   ═══════════════════════════════════════════════════════════════ */

.luxury-mobile-container {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--color-bg, #f7f3ec);
  color: var(--color-text, #2d1e16);
  font-family: inherit;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.12);
  padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;

  /* Smooth Transitions */
  transition:
    background-color 0.25s ease,
    color 0.25s ease;
}

[data-theme='dark'] .luxury-mobile-container {
  background-color: var(--color-bg, #120c08);
  color: var(--color-text, #f4ece1);
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.85);
}

/* ══════════════ 1. HEADER & BRAND IDENTITY ══════════════ */
.app-header {
  background: var(--color-surface, #ffffff);
  border-bottom: 1px solid var(--color-border-subtle, #efe9df);
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 12px;
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

[data-theme='dark'] .app-header {
  background: rgba(33, 23, 16, 0.92);
  border-bottom-color: var(--color-border, #3a2a20);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brand-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.brand-emblem {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--color-primary, #5a3825) 0%, #3b2418 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--color-gold-border, rgba(181, 138, 74, 0.35));
  box-shadow: 0 4px 12px rgba(90, 56, 37, 0.2);

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }
}

.brand-text {
  min-width: 0;
}

.brand-name {
  font-size: 17px;
  font-weight: 800;
  color: var(--color-text-strong, #1d120b);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

[data-theme='dark'] .brand-name {
  color: #ffffff;
}

.brand-tagline {
  font-size: 11px;
  color: var(--color-gold, #b58a4a);
  font-weight: 600;
  display: block;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.header-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd);
  color: var(--color-text, #2d1e16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  padding: 0;

  &:active {
    transform: scale(0.92);
    background: var(--color-primary-soft, #f5efe9);
  }
}

[data-theme='dark'] .header-btn {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text, #f4ece1);

  &:active {
    background: rgba(209, 176, 107, 0.18);
  }
}

.btn-logout {
  color: var(--color-danger, #b9382e);
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

/* Live Status & Date Selector */
.live-status-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--color-divider, rgba(59, 36, 24, 0.08));
  gap: 8px;
}

[data-theme='dark'] .live-status-strip {
  border-top-color: var(--color-border-subtle, #2a1e16);
}

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #7e685a);
}

.live-badge.connected {
  color: var(--color-success, #28724c);
}

[data-theme='dark'] .live-badge.connected {
  color: #48b87f;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--color-text-muted, #7e685a);
}

.live-badge.connected .live-dot {
  background-color: var(--color-success, #28724c);
  box-shadow: 0 0 8px var(--color-success, #28724c);
  animation: pulse-glow 2s infinite;
}

[data-theme='dark'] .live-badge.connected .live-dot {
  background-color: #349c68;
  box-shadow: 0 0 8px #349c68;
}

@keyframes pulse-glow {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
}

.date-quick-selector {
  display: flex;
  align-items: center;
  gap: 5px;
}

.date-pill-btn {
  min-height: 44px;
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd);
  color: var(--color-text-secondary, #553f33);
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    background: var(--color-primary, #5a3825);
    color: var(--color-text-inverse, #ffffff);
    border-color: var(--color-primary, #5a3825);
    box-shadow: 0 2px 8px rgba(90, 56, 37, 0.25);
  }
}

[data-theme='dark'] .date-pill-btn {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text-secondary, #d6c5b5);

  &.active {
    background: var(--color-primary, #d1b06b);
    color: #120c08;
    border-color: var(--color-primary, #d1b06b);
    box-shadow: 0 2px 8px rgba(209, 176, 107, 0.3);
  }
}

.date-picker-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd);
  color: var(--color-text-secondary, #553f33);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

[data-theme='dark'] .date-picker-label {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text-secondary, #d6c5b5);
}

.hidden-date-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

/* ══════════════ 2. DIAGNOSTICS BANNER ══════════════ */
.diagnostic-banner {
  margin: 12px 14px 0;
  background: var(--color-warning-soft, #fef7ee);
  border: 1px solid var(--color-warning-border, rgba(182, 109, 27, 0.3));
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

[data-theme='dark'] .diagnostic-banner {
  background: rgba(217, 130, 43, 0.12);
  border-color: rgba(217, 130, 43, 0.35);
}

.diagnostic-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.diag-icon {
  color: var(--color-warning, #b66d1b);
  flex-shrink: 0;
  margin-top: 2px;
}

.diag-text {
  min-width: 0;

  strong {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: var(--color-warning, #b66d1b);
  }

  p {
    margin: 3px 0 0;
    font-size: 11px;
    color: var(--color-text-secondary, #553f33);
    line-height: 1.4;
  }
}

[data-theme='dark'] .diag-text p {
  color: var(--color-text-secondary, #d6c5b5);
}

.diag-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  button {
    min-height: 44px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    transition: all 0.2s ease;
  }
}

.btn-diag-cfg {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e3dacd) !important;
  color: var(--color-text, #2d1e16);
}

.btn-diag-demo {
  background: var(--color-gold-subtle, rgba(181, 138, 74, 0.15));
  color: var(--color-gold, #b58a4a);
}

.btn-diag-retry {
  background: var(--color-primary, #5a3825);
  color: #ffffff;
}

[data-theme='dark'] .btn-diag-retry {
  background: var(--color-primary, #d1b06b);
  color: #120c08;
}

/* ══════════════ 3. MAIN VIEWPORT & SECTIONS ══════════════ */
.mobile-viewport {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Skeletons ── */
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-bg-subtle, #efe9df) 25%,
    var(--color-surface-hover, #faf6f0) 50%,
    var(--color-bg-subtle, #efe9df) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 16px;
}

[data-theme='dark'] .skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-surface, #211710) 25%,
    var(--color-surface-raised, #2c1f17) 50%,
    var(--color-surface, #211710) 75%
  );
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.hero-shimmer {
  height: 160px;
}
.card-shimmer {
  height: 110px;
}

/* ── 3.1 CONSOLIDATED MASTER EXECUTIVE HERO CARD ── */
.executive-hero-card {
  background: linear-gradient(
    135deg,
    var(--color-surface, #ffffff) 0%,
    var(--color-surface-hover, #faf6f0) 100%
  );
  border: 1px solid var(--color-border, #e3dacd);
  border-radius: 18px;
  padding: 16px 18px;
  box-shadow: 0 6px 20px rgba(90, 56, 37, 0.08);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 4px;
    background: linear-gradient(
      90deg,
      var(--color-gold, #b58a4a) 0%,
      var(--color-primary, #5a3825) 100%
    );
  }
}

[data-theme='dark'] .executive-hero-card {
  background: linear-gradient(145deg, #251912 0%, #19100a 100%);
  border-color: var(--color-border, #3a2a20);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);

  &::before {
    background: linear-gradient(90deg, #d1b06b 0%, #5a3825 100%);
  }
}

.hero-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.hero-date-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary, #5a3825);
  background: var(--color-primary-subtle, rgba(90, 56, 37, 0.08));
  padding: 4px 10px;
  border-radius: 20px;
}

[data-theme='dark'] .hero-date-chip {
  color: var(--color-gold, #d1b06b);
  background: rgba(209, 176, 107, 0.12);
}

.hero-growth-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
}

.growth-up {
  color: var(--color-success, #28724c);
  background: var(--color-success-soft, #eef7f2);
}

[data-theme='dark'] .growth-up {
  color: #48b87f;
  background: rgba(52, 156, 104, 0.18);
}

.growth-down {
  color: var(--color-danger, #b9382e);
  background: var(--color-danger-soft, #fdf2f0);
}

[data-theme='dark'] .growth-down {
  color: #e2675e;
  background: rgba(212, 76, 66, 0.18);
}

.growth-neutral {
  color: var(--color-gold, #b58a4a);
  background: var(--color-gold-subtle, rgba(181, 138, 74, 0.12));
}

.hero-revenue-display {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 16px;
}

.currency-tag {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-gold, #b58a4a);
}

.revenue-number {
  font-size: 34px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1;
  color: var(--color-text-strong, #1d120b);
  font-variant-numeric: tabular-nums;
}

[data-theme='dark'] .revenue-number {
  color: #ffffff;
}

.hero-kpi-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--color-divider, rgba(59, 36, 24, 0.08));
}

[data-theme='dark'] .hero-kpi-grid {
  border-top-color: var(--color-border-subtle, #2a1e16);
}

.kpi-cell {
  flex: 1;
  text-align: center;
  min-width: 0;

  &:first-child {
    text-align: right;
  }
  &:last-child {
    text-align: left;
  }
}

.kpi-cell-divider {
  width: 1px;
  height: 28px;
  background: var(--color-divider, rgba(59, 36, 24, 0.1));
}

[data-theme='dark'] .kpi-cell-divider {
  background: var(--color-border-subtle, #2a1e16);
}

.kpi-label {
  display: block;
  font-size: 11px;
  color: var(--color-text-muted, #7e685a);
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
}

[data-theme='dark'] .kpi-label {
  color: var(--color-text-muted, #9e8c7f);
}

.kpi-value {
  display: block;
  font-size: 14px;
  font-weight: 800;
  color: var(--color-text-strong, #1d120b);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  small {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted, #7e685a);
  }
}

[data-theme='dark'] .kpi-value {
  color: #ffffff;
}

.val-positive {
  color: var(--color-success, #28724c) !important;
}

[data-theme='dark'] .val-positive {
  color: #48b87f !important;
}

.val-negative,
.val-danger {
  color: var(--color-danger, #b9382e) !important;
}

[data-theme='dark'] .val-negative,
[data-theme='dark'] .val-danger {
  color: #e2675e !important;
}

.val-warning {
  color: var(--color-warning, #b66d1b) !important;
}

[data-theme='dark'] .val-warning {
  color: #ea9642 !important;
}

/* ── 3.2 UNIFIED EXECUTIVE CARD CONTAINER ── */
.executive-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e3dacd);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

[data-theme='dark'] .executive-card {
  background: var(--color-surface, #211710);
  border-color: var(--color-border, #3a2a20);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 8px;
}

.card-head-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-primary, #5a3825);

  h3 {
    font-size: 14px;
    font-weight: 800;
    color: var(--color-text-strong, #1d120b);
    margin: 0;
  }
}

[data-theme='dark'] .card-head-title {
  color: var(--color-gold, #d1b06b);

  h3 {
    color: #ffffff;
  }
}

.card-head-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .card-head-sub {
  color: var(--color-text-muted, #9e8c7f);
}

/* Proportional Ratio Bar */
.comparative-ratio-bar {
  height: 8px;
  background: var(--color-bg-subtle, #efe9df);
  border-radius: 6px;
  display: flex;
  overflow: hidden;
  margin-bottom: 12px;
}

[data-theme='dark'] .comparative-ratio-bar {
  background: var(--color-surface-sunken, #170f0a);
}

.bar-segment {
  height: 100%;
  transition: width 0.5s ease;
}

.retail-segment {
  background: linear-gradient(90deg, var(--color-gold, #b58a4a), #d1b06b);
}

.wholesale-segment {
  background: linear-gradient(90deg, var(--color-primary, #5a3825), #3b2418);
}

[data-theme='dark'] .wholesale-segment {
  background: linear-gradient(90deg, #7a4b22, #4a2e1e);
}

/* Channel Cards Grid */
.channel-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.channel-card {
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--color-border, #e3dacd);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.retail-theme {
  background: var(--color-gold-soft, #faf4ea);
  border-color: var(--color-gold-border, rgba(181, 138, 74, 0.32));
}

[data-theme='dark'] .retail-theme {
  background: rgba(209, 176, 107, 0.08);
  border-color: rgba(209, 176, 107, 0.28);
}

.wholesale-theme {
  background: var(--color-primary-soft, #f5efe9);
  border-color: var(--color-primary-border, rgba(90, 56, 37, 0.28));
}

[data-theme='dark'] .wholesale-theme {
  background: rgba(90, 56, 37, 0.16);
  border-color: rgba(90, 56, 37, 0.35);
}

.channel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.channel-icon-pill {
  color: var(--color-primary, #5a3825);
}

[data-theme='dark'] .channel-icon-pill {
  color: var(--color-gold, #d1b06b);
}

.channel-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary, #553f33);
}

[data-theme='dark'] .channel-name {
  color: var(--color-text-secondary, #d6c5b5);
}

.channel-amount {
  font-size: 19px;
  font-weight: 900;
  color: var(--color-text-strong, #1d120b);
  margin-bottom: 6px;
  font-variant-numeric: tabular-nums;

  small {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-gold, #b58a4a);
  }
}

[data-theme='dark'] .channel-amount {
  color: #ffffff;
}

.channel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .channel-footer {
  color: var(--color-text-muted, #9e8c7f);
}

.discount-tag {
  color: var(--color-warning, #b66d1b);
  font-weight: 700;
}

/* ── 3.3 PAYMENT METHODS STACK ── */
.payment-methods-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.payment-method-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border-subtle, #efe9df);
  border-radius: 12px;
}

[data-theme='dark'] .payment-method-row {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border-subtle, #2a1e16);
}

.pm-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-cash {
  background: var(--color-success-soft, #eef7f2);
  color: var(--color-success, #28724c);
}

.icon-instapay {
  background: var(--color-gold-soft, #faf4ea);
  color: var(--color-gold, #b58a4a);
}

.icon-card {
  background: var(--color-info-soft, #eff5f8);
  color: var(--color-info, #466b7d);
}

[data-theme='dark'] .icon-cash {
  background: rgba(52, 156, 104, 0.16);
  color: #48b87f;
}

[data-theme='dark'] .icon-instapay {
  background: rgba(209, 176, 107, 0.16);
  color: #d1b06b;
}

[data-theme='dark'] .icon-card {
  background: rgba(92, 143, 165, 0.16);
  color: #72a4ba;
}

.pm-info {
  flex: 1;
  min-width: 0;
}

.pm-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
}

[data-theme='dark'] .pm-title {
  color: #ffffff;
}

.pm-desc {
  display: block;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .pm-desc {
  color: var(--color-text-muted, #9e8c7f);
}

.pm-amount {
  font-size: 15px;
  font-weight: 800;
  color: var(--color-text-strong, #1d120b);
  font-variant-numeric: tabular-nums;
  text-align: left;

  small {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-text-muted, #7e685a);
  }
}

[data-theme='dark'] .pm-amount {
  color: #ffffff;
}

/* ── 3.4 FINANCE DUAL GRID (EXPENSES & NET) ── */
.finance-dual-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.finance-block {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border, #e3dacd);
}

.exp-block {
  background: var(--color-danger-soft, #fdf2f0);
  border-color: var(--color-danger-border, rgba(185, 56, 46, 0.25));
}

[data-theme='dark'] .exp-block {
  background: rgba(212, 76, 66, 0.1);
  border-color: rgba(212, 76, 66, 0.28);
}

.net-block {
  background: var(--color-success-soft, #eef7f2);
  border-color: var(--color-success-border, rgba(40, 114, 76, 0.25));
}

[data-theme='dark'] .net-block {
  background: rgba(52, 156, 104, 0.1);
  border-color: rgba(52, 156, 104, 0.28);
}

.fin-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary, #553f33);
  margin-bottom: 4px;
}

[data-theme='dark'] .fin-label {
  color: var(--color-text-secondary, #d6c5b5);
}

.fin-val {
  display: block;
  font-size: 17px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  margin-bottom: 2px;

  small {
    font-size: 10px;
    font-weight: 600;
  }
}

.fin-sub {
  display: block;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .fin-sub {
  color: var(--color-text-muted, #9e8c7f);
}

/* ── 3.5 ACTIVE SHIFT MONITORING ── */
.status-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.pulse-active {
  background-color: var(--color-success, #28724c);
  box-shadow: 0 0 6px var(--color-success, #28724c);
}

.pulse-inactive {
  background-color: var(--color-warning, #b66d1b);
}

.pulse-warning {
  background-color: var(--color-danger, #b9382e);
  box-shadow: 0 0 6px var(--color-danger, #b9382e);
}

.shift-state-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 20px;
}

.shift-open {
  background: var(--color-success-soft, #eef7f2);
  color: var(--color-success, #28724c);
  border: 1px solid var(--color-success-border, rgba(40, 114, 76, 0.3));
}

[data-theme='dark'] .shift-open {
  background: rgba(52, 156, 104, 0.16);
  color: #48b87f;
}

.shift-closed {
  background: var(--color-bg-subtle, #efe9df);
  color: var(--color-text-muted, #7e685a);
  border: 1px solid var(--color-border, #e3dacd);
}

[data-theme='dark'] .shift-closed {
  background: var(--color-surface-raised, #2c1f17);
  color: var(--color-text-muted, #9e8c7f);
}

.shift-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.shift-info-cell {
  background: var(--color-bg-subtle, #efe9df);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
}

[data-theme='dark'] .shift-info-cell {
  background: var(--color-surface-raised, #2c1f17);
}

.shift-lbl {
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .shift-lbl {
  color: var(--color-text-muted, #9e8c7f);
}

.shift-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
}

[data-theme='dark'] .shift-val {
  color: #ffffff;
}

.expected-cash-banner {
  background: linear-gradient(135deg, var(--color-gold-soft, #faf4ea) 0%, #f5efe9 100%);
  border: 1px solid var(--color-gold-border, rgba(181, 138, 74, 0.35));
  border-radius: 12px;
  padding: 12px;
}

[data-theme='dark'] .expected-cash-banner {
  background: linear-gradient(135deg, rgba(209, 176, 107, 0.14) 0%, rgba(90, 56, 37, 0.2) 100%);
  border-color: rgba(209, 176, 107, 0.32);
}

.ec-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary, #5a3825);
  margin-bottom: 4px;
}

[data-theme='dark'] .ec-header {
  color: var(--color-gold, #d1b06b);
}

.ec-amount {
  font-size: 24px;
  font-weight: 900;
  color: var(--color-text-strong, #1d120b);
  font-variant-numeric: tabular-nums;

  small {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-gold, #b58a4a);
  }
}

[data-theme='dark'] .ec-amount {
  color: #ffffff;
}

.shift-empty-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  background: var(--color-bg-subtle, #efe9df);
  border-radius: 12px;
  color: var(--color-text-muted, #7e685a);
  font-size: 12px;
  line-height: 1.4;
}

[data-theme='dark'] .shift-empty-state {
  background: var(--color-surface-raised, #2c1f17);
  color: var(--color-text-muted, #9e8c7f);
}

/* ── 3.6 RECENT SALES STREAM ── */
.recent-sales-stream {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-sale-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border-subtle, #efe9df);
  border-radius: 12px;
}

[data-theme='dark'] .recent-sale-row {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border-subtle, #2a1e16);
}

.sale-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--color-surface, #ffffff);
  color: var(--color-primary, #5a3825);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

[data-theme='dark'] .sale-icon-box {
  background: var(--color-surface, #211710);
  color: var(--color-gold, #d1b06b);
}

.sale-details {
  flex: 1;
  min-width: 0;
}

.sale-primary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sale-num {
  font-size: 12px;
  font-weight: 800;
  color: var(--color-text-strong, #1d120b);
}

[data-theme='dark'] .sale-num {
  color: #ffffff;
}

.sale-amt {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-gold, #b58a4a);
  font-variant-numeric: tabular-nums;
}

.sale-secondary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
  margin-top: 2px;
}

[data-theme='dark'] .sale-secondary-line {
  color: var(--color-text-muted, #9e8c7f);
}

/* ══════════════ TAB 2: INVENTORY STYLING ══════════════ */
.inventory-hero-theme::before {
  background: linear-gradient(
    90deg,
    var(--color-primary, #5a3825),
    var(--color-gold, #b58a4a)
  ) !important;
}

.category-breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-stat-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cat-headline {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cat-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
}

[data-theme='dark'] .cat-name {
  color: #ffffff;
}

.cat-amount {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-text-strong, #1d120b);
  font-variant-numeric: tabular-nums;
}

[data-theme='dark'] .cat-amount {
  color: #ffffff;
}

.cat-progress-track {
  height: 6px;
  background: var(--color-bg-subtle, #efe9df);
  border-radius: 4px;
  overflow: hidden;
}

[data-theme='dark'] .cat-progress-track {
  background: var(--color-surface-sunken, #170f0a);
}

.cat-progress-fill {
  height: 100%;
  background: var(--color-primary, #5a3825);
  border-radius: 4px;
  transition: width 0.5s ease;
}

[data-theme='dark'] .cat-progress-fill {
  background: var(--color-gold, #d1b06b);
}

.cat-footer-sub {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .cat-footer-sub {
  color: var(--color-text-muted, #9e8c7f);
}

.cat-ratio-badge {
  font-weight: 700;
  color: var(--color-gold, #b58a4a);
}

/* Low Stock Radar */
.alert-card {
  border-color: var(--color-danger-border, rgba(185, 56, 46, 0.3));
}

.title-warning {
  color: var(--color-danger, #b9382e) !important;
}

.alert-count-badge {
  background: var(--color-danger-soft, #fdf2f0);
  color: var(--color-danger, #b9382e);
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid var(--color-danger-border, rgba(185, 56, 46, 0.25));
}

[data-theme='dark'] .alert-count-badge {
  background: rgba(212, 76, 66, 0.2);
  color: #e2675e;
}

.low-stock-items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.low-stock-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--color-danger-soft, #fdf2f0);
  border: 1px solid var(--color-danger-border, rgba(185, 56, 46, 0.25));
  border-radius: 12px;
}

[data-theme='dark'] .low-stock-item-row {
  background: rgba(212, 76, 66, 0.12);
  border-color: rgba(212, 76, 66, 0.3);
}

.stock-item-info {
  display: flex;
  flex-direction: column;
}

.stock-item-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
}

[data-theme='dark'] .stock-item-name {
  color: #ffffff;
}

.stock-item-meta {
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .stock-item-meta {
  color: var(--color-text-muted, #9e8c7f);
}

.stock-item-levels {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.stock-level-badge {
  background: var(--color-danger, #b9382e);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}

.stock-limit-note {
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .stock-limit-note {
  color: var(--color-text-muted, #9e8c7f);
}

.stock-healthy-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  background: var(--color-success-soft, #eef7f2);
  border-radius: 12px;
  color: var(--color-success, #28724c);
  font-size: 12px;
  font-weight: 600;
}

[data-theme='dark'] .stock-healthy-state {
  background: rgba(52, 156, 104, 0.14);
  color: #48b87f;
}

/* ══════════════ TAB 3: APPROVALS STYLING ══════════════ */
.approvals-top-banner {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e3dacd);
  border-radius: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

[data-theme='dark'] .approvals-top-banner {
  background: var(--color-surface, #211710);
  border-color: var(--color-border, #3a2a20);
}

.banner-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-text-strong, #1d120b);
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

[data-theme='dark'] .banner-title {
  color: #ffffff;
}

.banner-desc {
  margin: 3px 0 0;
  font-size: 11px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .banner-desc {
  color: var(--color-text-muted, #9e8c7f);
}

.banner-refresh-btn {
  min-height: 44px;
  padding: 6px 14px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd);
  color: var(--color-text, #2d1e16);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}

[data-theme='dark'] .banner-refresh-btn {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text, #f4ece1);
}

.approval-filter-tabs {
  display: flex;
  gap: 8px;
}

.appr-filter-pill {
  flex: 1;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e3dacd);
  color: var(--color-text-muted, #7e685a);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    background: var(--color-primary, #5a3825);
    color: #ffffff;
    border-color: var(--color-primary, #5a3825);
    box-shadow: 0 4px 12px rgba(90, 56, 37, 0.2);
  }
}

[data-theme='dark'] .appr-filter-pill {
  background: var(--color-surface, #211710);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text-muted, #9e8c7f);

  &.active {
    background: var(--color-primary, #d1b06b);
    color: #120c08;
    border-color: var(--color-primary, #d1b06b);
    box-shadow: 0 4px 12px rgba(209, 176, 107, 0.3);
  }
}

.approvals-stream {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.approval-ticket-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e3dacd);
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

[data-theme='dark'] .approval-ticket-card {
  background: var(--color-surface, #211710);
  border-color: var(--color-border, #3a2a20);
}

.ticket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ticket-requester {
  display: flex;
  align-items: center;
  gap: 8px;
}

.requester-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary-soft, #f5efe9);
  color: var(--color-primary, #5a3825);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

[data-theme='dark'] .requester-icon {
  background: rgba(209, 176, 107, 0.16);
  color: var(--color-gold, #d1b06b);
}

.requester-name {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
}

[data-theme='dark'] .requester-name {
  color: #ffffff;
}

.ticket-time {
  display: block;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .ticket-time {
  color: var(--color-text-muted, #9e8c7f);
}

.status-ticket-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
}

.badge-pending {
  background: var(--color-warning-soft, #fef7ee);
  color: var(--color-warning, #b66d1b);
}

.badge-approved {
  background: var(--color-success-soft, #eef7f2);
  color: var(--color-success, #28724c);
}

.badge-rejected {
  background: var(--color-danger-soft, #fdf2f0);
  color: var(--color-danger, #b9382e);
}

[data-theme='dark'] .badge-pending {
  background: rgba(217, 130, 43, 0.18);
  color: #ea9642;
}

[data-theme='dark'] .badge-approved {
  background: rgba(52, 156, 104, 0.18);
  color: #48b87f;
}

[data-theme='dark'] .badge-rejected {
  background: rgba(212, 76, 66, 0.18);
  color: #e2675e;
}

.ticket-action-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
  line-height: 1.4;
}

[data-theme='dark'] .ticket-action-title {
  color: #ffffff;
}

.ticket-details-box {
  background: var(--color-bg-subtle, #efe9df);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

[data-theme='dark'] .ticket-details-box {
  background: var(--color-surface-raised, #2c1f17);
}

.detail-pair {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.dp-key {
  color: var(--color-text-muted, #7e685a);
}

[data-theme='dark'] .dp-key {
  color: var(--color-text-muted, #9e8c7f);
}

.dp-val {
  font-weight: 700;
  color: var(--color-text-strong, #1d120b);
  font-variant-numeric: tabular-nums;
}

[data-theme='dark'] .dp-val {
  color: #ffffff;
}

.dp-full {
  flex-direction: column;
  gap: 2px;
}

.dp-desc {
  font-weight: normal;
  color: var(--color-text-secondary, #553f33);
}

[data-theme='dark'] .dp-desc {
  color: var(--color-text-secondary, #d6c5b5);
}

.ticket-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;

  button {
    flex: 1;
    min-height: 44px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    transition: all 0.2s ease;
  }
}

.btn-ticket-reject {
  background: var(--color-danger-soft, #fdf2f0);
  color: var(--color-danger, #b9382e);
  border: 1px solid var(--color-danger-border, rgba(185, 56, 46, 0.3)) !important;
}

[data-theme='dark'] .btn-ticket-reject {
  background: rgba(212, 76, 66, 0.16);
  color: #e2675e;
}

.btn-ticket-approve {
  background: var(--color-success, #28724c);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(40, 114, 76, 0.25);
}

[data-theme='dark'] .btn-ticket-approve {
  background: var(--color-success, #349c68);
}

.btn-inner-flex {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ticket-decided-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--color-text-muted, #7e685a);
  padding-top: 6px;
  border-top: 1px solid var(--color-divider, rgba(59, 36, 24, 0.08));
}

[data-theme='dark'] .ticket-decided-footer {
  border-top-color: var(--color-border-subtle, #2a1e16);
  color: var(--color-text-muted, #9e8c7f);
}

.approvals-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 20px;
  background: var(--color-surface, #ffffff);
  border: 1px dashed var(--color-border, #e3dacd);
  border-radius: 16px;

  h3 {
    margin: 10px 0 4px;
    font-size: 15px;
    font-weight: 800;
    color: var(--color-text-strong, #1d120b);
  }

  p {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted, #7e685a);
    max-width: 280px;
    line-height: 1.5;
  }
}

[data-theme='dark'] .approvals-empty-state {
  background: var(--color-surface, #211710);
  border-color: var(--color-border, #3a2a20);

  h3 {
    color: #ffffff;
  }
  p {
    color: var(--color-text-muted, #9e8c7f);
  }
}

.empty-sparkle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-success-soft, #eef7f2);
  color: var(--color-success, #28724c);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

[data-theme='dark'] .empty-sparkle {
  background: rgba(52, 156, 104, 0.18);
  color: #48b87f;
}

/* ══════════════ 4. BOTTOM NAVIGATION ══════════════ */
.luxury-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 480px;
  margin: 0 auto;
  background: var(--color-surface, #ffffff);
  border-top: 1px solid var(--color-border-subtle, #efe9df);
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px));
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 50;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
}

[data-theme='dark'] .luxury-bottom-nav {
  background: rgba(33, 23, 16, 0.95);
  border-top-color: var(--color-border, #3a2a20);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
}

.nav-tab-item {
  flex: 1;
  min-height: 44px;
  padding: 6px 12px;
  border-radius: 12px;
  background: transparent;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--color-text-muted, #7e685a);
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    color: var(--color-primary, #5a3825);
    background: var(--color-primary-subtle, rgba(90, 56, 37, 0.08));

    .nav-icon {
      transform: translateY(-1px);
    }
  }
}

[data-theme='dark'] .nav-tab-item {
  color: var(--color-text-muted, #9e8c7f);

  &.active {
    color: var(--color-gold, #d1b06b);
    background: rgba(209, 176, 107, 0.12);
  }
}

.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}

.nav-text {
  font-size: 11px;
  font-weight: 700;
}

.nav-icon-badge-wrap {
  position: relative;
  display: inline-flex;
}

.nav-badge-pill {
  position: absolute;
  top: -4px;
  right: -8px;
  background: var(--color-danger, #b9382e);
  color: #ffffff;
  font-size: 9px;
  font-weight: 800;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 1px solid var(--color-surface, #ffffff);
}

/* ══════════════ 5. MODAL OVERLAY & CARD ══════════════ */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.modal-card {
  width: 100%;
  max-width: 480px;
  background: var(--color-surface, #ffffff);
  border-radius: 20px 20px 0 0;
  padding: 20px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

[data-theme='dark'] .modal-card {
  background: var(--color-surface, #211710);
  border: 1px solid var(--color-border, #3a2a20);
  border-bottom: none;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title-flex {
  display: flex;
  align-items: center;
  gap: 8px;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    color: var(--color-text-strong, #1d120b);
  }
}

[data-theme='dark'] .modal-title-flex h3 {
  color: #ffffff;
}

.modal-icon {
  color: var(--color-primary, #5a3825);
}

[data-theme='dark'] .modal-icon {
  color: var(--color-gold, #d1b06b);
}

.modal-close-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--color-bg-subtle, #efe9df);
  border: none;
  color: var(--color-text, #2d1e16);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

[data-theme='dark'] .modal-close-btn {
  background: var(--color-surface-raised, #2c1f17);
  color: var(--color-text, #f4ece1);
}

.modal-user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
}

[data-theme='dark'] .modal-user-card {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border-subtle, #2a1e16);
}

.user-avatar-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--color-primary-soft, #f5efe9);
  color: var(--color-primary, #5a3825);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

[data-theme='dark'] .user-avatar-wrap {
  background: rgba(209, 176, 107, 0.16);
  color: var(--color-gold, #d1b06b);
}

.user-info-text {
  display: flex;
  flex-direction: column;
  min-width: 0;

  strong {
    font-size: 14px;
    font-weight: 800;
    color: var(--color-text-strong, #1d120b);
  }
}

[data-theme='dark'] .user-info-text strong {
  color: #ffffff;
}

.user-role-badge {
  font-size: 11px;
  color: var(--color-gold, #b58a4a);
  font-weight: 600;
}

.modal-quick-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.btn-modal-action {
  min-height: 44px;
  border-radius: 12px;
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd);
  color: var(--color-text, #2d1e16);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.98);
  }
}

[data-theme='dark'] .btn-modal-action {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text, #f4ece1);
}

.btn-modal-logout {
  color: var(--color-danger, #b9382e);
  background: var(--color-danger-soft, #fdf2f0);
  border-color: var(--color-danger-border, rgba(185, 56, 46, 0.25));
}

[data-theme='dark'] .btn-modal-logout {
  background: rgba(212, 76, 66, 0.12);
  border-color: rgba(212, 76, 66, 0.3);
  color: #e2675e;
}

.modal-section-divider {
  display: flex;
  align-items: center;
  margin: 12px 0 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted, #7e685a);

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-divider, rgba(59, 36, 24, 0.1));
  }

  span {
    padding: 0 10px;
  }
}

[data-theme='dark'] .modal-section-divider {
  color: var(--color-text-muted, #9e8c7f);

  &::before,
  &::after {
    background: var(--color-border-subtle, #2a1e16);
  }
}

.modal-desc {
  font-size: 12px;
  color: var(--color-text-muted, #7e685a);
  margin: 0 0 12px;
  line-height: 1.5;
}

[data-theme='dark'] .modal-desc {
  color: var(--color-text-muted, #9e8c7f);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #553f33);
}

[data-theme='dark'] .form-label {
  color: var(--color-text-secondary, #d6c5b5);
}

.form-input {
  min-height: 44px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border, #e3dacd);
  background: var(--color-bg, #f7f3ec);
  color: var(--color-text, #2d1e16);
  font-size: 14px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--color-primary, #5a3825);
    box-shadow: 0 0 0 3px var(--color-primary-halo, rgba(90, 56, 37, 0.16));
  }
}

[data-theme='dark'] .form-input {
  background: var(--color-surface-sunken, #170f0a);
  border-color: var(--color-border, #3a2a20);
  color: #ffffff;

  &:focus {
    border-color: var(--color-gold, #d1b06b);
    box-shadow: 0 0 0 3px rgba(209, 176, 107, 0.2);
  }
}

.presets-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.preset-chip {
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border, #e3dacd);
  background: var(--color-bg-subtle, #efe9df);
  color: var(--color-text-secondary, #553f33);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: right;
  transition: all 0.2s ease;

  &.chip-active {
    border-color: var(--color-primary, #5a3825);
    background: var(--color-primary-soft, #f5efe9);
    color: var(--color-primary, #5a3825);
    font-weight: 700;
  }
}

[data-theme='dark'] .preset-chip {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20);
  color: var(--color-text-secondary, #d6c5b5);

  &.chip-active {
    border-color: var(--color-gold, #d1b06b);
    background: rgba(209, 176, 107, 0.14);
    color: var(--color-gold, #d1b06b);
  }
}

.test-result-box {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 6px;
}

.res-success {
  background: var(--color-success-soft, #eef7f2);
  border: 1px solid var(--color-success-border, rgba(40, 114, 76, 0.3));
  color: var(--color-success, #28724c);
}

.res-error {
  background: var(--color-danger-soft, #fdf2f0);
  border: 1px solid var(--color-danger-border, rgba(185, 56, 46, 0.3));
  color: var(--color-danger, #b9382e);
}

[data-theme='dark'] .res-success {
  background: rgba(52, 156, 104, 0.16);
  color: #48b87f;
}

[data-theme='dark'] .res-error {
  background: rgba(212, 76, 66, 0.16);
  color: #e2675e;
}

.modal-foot {
  display: flex;
  gap: 10px;
  padding-top: 10px;

  button {
    flex: 1;
    min-height: 44px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: none;
    transition: all 0.2s ease;
  }
}

.btn-test-conn {
  background: var(--color-bg-subtle, #efe9df);
  border: 1px solid var(--color-border, #e3dacd) !important;
  color: var(--color-text, #2d1e16);
}

[data-theme='dark'] .btn-test-conn {
  background: var(--color-surface-raised, #2c1f17);
  border-color: var(--color-border, #3a2a20) !important;
  color: var(--color-text, #f4ece1);
}

.btn-save-conn {
  background: var(--color-primary, #5a3825);
  color: #ffffff;
}

[data-theme='dark'] .btn-save-conn {
  background: var(--color-primary, #d1b06b);
  color: #120c08;
}

/* Responsive optimizations for small screens (320px - 380px) */
@media (max-width: 380px) {
  .app-header {
    padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
  }

  .brand-name {
    font-size: 15px;
  }

  .brand-emblem {
    width: 36px;
    height: 36px;
    border-radius: 10px;

    img {
      width: 24px;
      height: 24px;
    }
  }

  .header-btn {
    width: 38px;
    height: 38px;
  }

  .mobile-viewport {
    padding: 10px 10px;
    gap: 10px;
  }

  .executive-hero-card {
    padding: 14px 14px;
  }

  .revenue-number {
    font-size: 26px;
  }

  .channel-cards-grid,
  .finance-dual-grid,
  .shift-info-grid {
    gap: 8px;
  }

  .channel-card,
  .finance-block {
    padding: 10px;
  }

  .channel-amount {
    font-size: 16px;
  }

  .ec-amount {
    font-size: 20px;
  }
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
