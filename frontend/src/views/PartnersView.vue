<template>
  <div class="partners-page animate-in">
    <!-- Header Section -->
    <div class="page-header-card">
      <div class="header-content">
        <div class="title-with-icon">
          <div class="icon-bubble">
            <AppIcon name="money" :size="24" />
          </div>
          <div>
            <h1 class="page-title">جاري ومسحوبات الشركاء وتسوية الأرباح</h1>
            <p class="page-subtitle">
              إدارة حصص الشركاء، توثيق المسحوبات النقدية من الخزينة، وتوزيع الأرباح الصافية بدقة
              محاسبية
            </p>
          </div>
        </div>

        <!-- Tabs Navigation -->
        <div class="tabs-nav-wrapper">
          <button
            type="button"
            class="tab-nav-btn"
            :class="{ active: activeTab === 'settlement' }"
            @click="activeTab = 'settlement'"
          >
            <AppIcon name="trendingUp" :size="17" />
            <span>تسوية وتوزيع الأرباح</span>
          </button>
          <button
            type="button"
            class="tab-nav-btn"
            :class="{ active: activeTab === 'drawings' }"
            @click="activeTab = 'drawings'"
          >
            <AppIcon name="invoices" :size="17" />
            <span>سندات مسحوبات الشركاء</span>
          </button>
          <button
            type="button"
            class="tab-nav-btn"
            :class="{ active: activeTab === 'partners' }"
            @click="activeTab = 'partners'"
          >
            <AppIcon name="users" :size="17" />
            <span>إدارة الشركاء والحصص</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==============================================
         TAB 1: PROFIT SETTLEMENT & DISTRIBUTION
         ============================================== -->
    <div v-if="activeTab === 'settlement'" class="tab-pane animate-in">
      <!-- Date Filters -->
      <div class="filter-card">
        <div class="filters-inline">
          <div class="filter-field">
            <label>من تاريخ</label>
            <input
              v-model="settlementDates.from_date"
              type="date"
              class="input-control"
              @change="loadSettlement"
            />
          </div>
          <div class="filter-field">
            <label>إلى تاريخ</label>
            <input
              v-model="settlementDates.to_date"
              type="date"
              class="input-control"
              @change="loadSettlement"
            />
          </div>
          <div class="filter-field month-btn-field">
            <label>اختر الشهر بالكامل</label>
            <div class="month-selector-pill">
              <AppIcon name="reports" :size="16" />
              <span>تحديد شهر</span>
              <input type="month" class="hidden-month-input" @change="onMonthSelected" />
            </div>
          </div>
          <button
            type="button"
            class="btn btn-outline refresh-btn"
            @click="loadSettlement"
            :disabled="loadingSettlement"
          >
            <AppIcon name="refresh" :size="15" />
            <span>{{ loadingSettlement ? 'جاري الحساب...' : 'تحديث الحسبة' }}</span>
          </button>
        </div>
      </div>

      <!-- Overview Stats -->
      <div class="grid grid-4 stats-row">
        <StatCard
          label="صافي أرباح المشروع بالفترة"
          :value="formatMoney(settlementSummary?.pl_summary?.net_profit || 0)"
          icon="trendingUp"
          format="currency"
        />
        <StatCard
          label="إجمالي مسحوبات الشركاء بالفترة"
          :value="formatMoney(settlementSummary?.settlement_summary?.total_drawings || 0)"
          icon="money"
          format="currency"
        />
        <StatCard
          label="المتبقي في الخزينة بعد المسحوبات"
          :value="formatMoney(settlementSummary?.settlement_summary?.net_undistributed_cash || 0)"
          icon="costs"
          format="currency"
        />
        <StatCard
          label="إجمالي الحصص الموزعة"
          :value="(settlementSummary?.settlement_summary?.total_share_percentage || 0) + '%'"
          icon="users"
          format="number"
        />
      </div>

      <!-- Partners Settlement Cards -->
      <div class="settlement-partners-section">
        <div class="section-title-row">
          <div class="section-title-tag">
            <AppIcon name="calculator" :size="18" />
            <h3>
              كشف حساب وتسوية كل شريك للفترة ({{ settlementDates.from_date }} إلى
              {{ settlementDates.to_date }})
            </h3>
          </div>
          <span class="partners-count-pill">{{ settlementPartners.length }} شركاء نشطين</span>
        </div>

        <div v-if="loadingSettlement" class="loading-state-card">
          <div class="skeleton-shimmer" style="height: 140px; border-radius: 12px"></div>
        </div>

        <div v-else-if="!settlementPartners.length" class="empty-state-card">
          <AppIcon name="users" :size="42" />
          <p>
            لم يتم تسجيل أي شركاء بعد. يمكنك إضافة الشركاء وتحديد نسبهم من تبويب «إدارة الشركاء».
          </p>
          <button type="button" class="btn btn-primary" @click="activeTab = 'partners'">
            + إضافة شريك جديد
          </button>
        </div>

        <div v-else class="grid grid-3 partner-cards-grid">
          <div
            v-for="partner in settlementPartners"
            :key="partner.id"
            class="partner-settlement-card"
            :class="{
              'is-payable': partner.status === 'payable',
              'is-overdrawn': partner.status === 'overdrawn',
              'is-settled': partner.status === 'settled',
            }"
          >
            <div class="card-partner-header">
              <div class="partner-avatar">
                {{ partner.name_ar.slice(0, 1) }}
              </div>
              <div class="partner-info">
                <h4>{{ partner.name_ar }}</h4>
                <span class="share-badge">الحصة: {{ partner.share_percentage }}% من الأرباح</span>
              </div>
              <div class="status-indicator-badge" :class="partner.status">
                <span v-if="partner.status === 'payable'"> مستحق للاستلام</span>
                <span v-else-if="partner.status === 'overdrawn'"> مسحوبات زائدة</span>
                <span v-else> مسوّى</span>
              </div>
            </div>

            <div class="card-metric-divider"></div>

            <div class="card-financial-metrics">
              <div class="metric-line">
                <span class="metric-lbl">حصة الشريك من صافي الربح:</span>
                <span class="metric-val text-profit">{{
                  formatMoney(partner.share_profit_amount)
                }}</span>
              </div>
              <div class="metric-line">
                <span class="metric-lbl">إجمالي ما سحبه خلال الفترة:</span>
                <span class="metric-val text-drawings">{{
                  formatMoney(partner.period_drawings)
                }}</span>
              </div>
              <div class="metric-line">
                <span class="metric-lbl">عدد عمليات السحب:</span>
                <span class="metric-val">{{ partner.drawings_count }} عمليات</span>
              </div>
            </div>

            <!-- Visual Profit Consumption Progress Bar -->
            <div class="drawings-progress-wrapper">
              <div class="progress-labels">
                <span>نسبة استهلاك الحصة</span>
                <span>
                  {{
                    partner.share_profit_amount > 0
                      ? Math.min(
                          100,
                          Math.round((partner.period_drawings / partner.share_profit_amount) * 100),
                        )
                      : partner.period_drawings > 0
                        ? 100
                        : 0
                  }}%
                </span>
              </div>
              <div class="progress-bar-track">
                <div
                  class="progress-bar-fill"
                  :style="{
                    width:
                      partner.share_profit_amount > 0
                        ? Math.min(
                            100,
                            (partner.period_drawings / partner.share_profit_amount) * 100,
                          ) + '%'
                        : partner.period_drawings > 0
                          ? '100%'
                          : '0%',
                    backgroundColor:
                      partner.status === 'overdrawn'
                        ? 'var(--danger)'
                        : partner.period_drawings / partner.share_profit_amount > 0.85
                          ? 'var(--warning)'
                          : 'var(--accent)',
                  }"
                ></div>
              </div>
            </div>

            <div class="card-net-balance-row">
              <div class="net-lbl">
                <span v-if="partner.status === 'payable'">المتبقي الصافي للشريك للاستلام:</span>
                <span v-else-if="partner.status === 'overdrawn'"
                  >مديونية زائدة على الشريك للخزينة:</span
                >
                <span v-else>الرصيد مسوّى تماماً:</span>
              </div>
              <div class="net-amount" :class="partner.status">
                {{ formatMoney(Math.abs(partner.net_balance)) }}
              </div>
            </div>

            <div class="card-actions">
              <button
                type="button"
                class="btn btn-outline btn-sm"
                @click="openNewDrawingForPartner(partner)"
                title="تسجيل سحب جديد للشريك"
              >
                <AppIcon name="money" :size="14" />
                <span>+ سحب نقدية</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==============================================
         TAB 2: DRAWINGS LEDGER & VOUCHERS
         ============================================== -->
    <div v-if="activeTab === 'drawings'" class="tab-pane animate-in">
      <div class="toolbar-card">
        <div class="filters-bar">
          <div class="filter-item">
            <label>الشريك</label>
            <select
              v-model="drawingsFilters.partner_id"
              class="input-control"
              @change="loadDrawings"
            >
              <option :value="undefined">— كل الشركاء —</option>
              <option v-for="p in partnersList" :key="p.id" :value="p.id">{{ p.name_ar }}</option>
            </select>
          </div>
          <div class="filter-item">
            <label>من تاريخ</label>
            <input
              v-model="drawingsFilters.from_date"
              type="date"
              class="input-control"
              @change="loadDrawings"
            />
          </div>
          <div class="filter-item">
            <label>إلى تاريخ</label>
            <input
              v-model="drawingsFilters.to_date"
              type="date"
              class="input-control"
              @change="loadDrawings"
            />
          </div>
          <div class="filter-item">
            <label>الخزينة / المصدر</label>
            <select
              v-model="drawingsFilters.source_type"
              class="input-control"
              @change="loadDrawings"
            >
              <option :value="undefined">— كل الخزائن —</option>
              <option value="cash_drawer">درج الكاشير / الفرع</option>
              <option value="main_treasury">الخزينة الرئيسية</option>
              <option value="bank_account">الحساب البنكي</option>
            </select>
          </div>
        </div>

        <div class="actions-bar">
          <button type="button" class="btn btn-primary" @click="openDrawingModal()">
            <AppIcon name="money" :size="16" />
            <span>+ تسجيل سند سحب شريك</span>
          </button>
        </div>
      </div>

      <!-- Drawings Table -->
      <div class="table-card">
        <div class="table-header-info">
          <span class="count-text">إجمالي السندات: {{ drawingsTotalCount }} سند</span>
          <span class="total-drawings-text">
            إجمالي المبالغ المنصرفة: <strong>{{ formatMoney(drawingsTotalAmount) }}</strong>
          </span>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>رقم السند</th>
                <th>التاريخ</th>
                <th>اسم الشريك</th>
                <th>المبلغ المنصرف</th>
                <th>مصدر الصرف</th>
                <th>المستلم</th>
                <th>البيان / الملاحظات</th>
                <th>المسؤول</th>
                <th style="text-align: center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingDrawings" v-for="n in 4" :key="'drw-sk-' + n">
                <td colspan="9"><div class="skeleton-shimmer" style="height: 24px"></div></td>
              </tr>
              <tr v-else-if="!drawingsList.length">
                <td colspan="9" class="empty-cell">لا توجد سندات مسحوبات مسجلة بالفترة المحددة</td>
              </tr>
              <tr v-else v-for="drw in drawingsList" :key="drw.id">
                <td class="voucher-code-cell">
                  <span class="voucher-tag">{{ drw.voucher_number }}</span>
                </td>
                <td>{{ drw.drawing_date }}</td>
                <td class="partner-name-cell">
                  <strong>{{ drw.partner_name }}</strong>
                  <small v-if="drw.partner_share">({{ drw.partner_share }}%)</small>
                </td>
                <td class="amount-cell">{{ formatMoney(drw.amount) }}</td>
                <td>
                  <span v-if="drw.source_type === 'cash_drawer'" class="badge badge-cash">
                    درج الكاشير ({{ drw.warehouse_name || 'فرع' }})
                  </span>
                  <span
                    v-else-if="drw.source_type === 'main_treasury'"
                    class="badge badge-treasury"
                  >
                    الخزينة الرئيسية
                  </span>
                  <span v-else class="badge badge-bank"> الحساب البنكي </span>
                </td>
                <td>{{ drw.recipient_name || drw.partner_name }}</td>
                <td class="notes-cell" :title="drw.notes">{{ drw.notes || '—' }}</td>
                <td>
                  <small>{{ drw.created_by_name || '—' }}</small>
                </td>
                <td class="actions-cell">
                  <button
                    type="button"
                    class="icon-action-btn print"
                    @click="printVoucher(drw)"
                    title="طباعة سند صرف نقدية"
                  >
                    <AppIcon name="invoices" :size="15" />
                  </button>
                  <button
                    type="button"
                    class="icon-action-btn delete"
                    @click="deleteDrawing(drw)"
                    title="حذف السند"
                  >
                    <AppIcon name="delete" :size="15" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ==============================================
         TAB 3: PARTNERS MANAGEMENT
         ============================================== -->
    <div v-if="activeTab === 'partners'" class="tab-pane animate-in">
      <div class="toolbar-card">
        <div class="shares-meter-box">
          <div class="meter-info">
            <span>مجموع حصص الشركاء المسجلة:</span>
            <strong :class="{ 'text-danger': totalSharesSum > 100 }"
              >{{ totalSharesSum }}% من 100%</strong
            >
          </div>
          <div class="meter-bar-track">
            <div
              class="meter-bar-fill"
              :style="{ width: Math.min(100, totalSharesSum) + '%' }"
              :class="{ 'over-capacity': totalSharesSum > 100 }"
            ></div>
          </div>
        </div>

        <button type="button" class="btn btn-primary" @click="openPartnerModal()">
          <AppIcon name="users" :size="16" />
          <span>+ إضافة شريك جديد</span>
        </button>
      </div>

      <!-- Partners Grid -->
      <div class="grid grid-3 partner-profiles-grid">
        <div
          v-for="p in partnersList"
          :key="p.id"
          class="partner-profile-card"
          :class="{ 'is-inactive': !p.is_active }"
        >
          <div class="profile-header">
            <div class="profile-avatar">{{ p.name_ar.slice(0, 1) }}</div>
            <div class="profile-titles">
              <h3>{{ p.name_ar }}</h3>
              <span class="phone-text">{{ p.phone || 'بدون هاتف' }}</span>
            </div>
            <div class="active-badge" :class="p.is_active ? 'active' : 'inactive'">
              {{ p.is_active ? 'نشط' : 'معطل' }}
            </div>
          </div>

          <div class="profile-details-list">
            <div class="detail-row">
              <span>نسبة الشراكة بالأرباح:</span>
              <strong class="highlight-share">{{ p.share_percentage }}%</strong>
            </div>
            <div class="detail-row">
              <span>رأس المال المساهم به:</span>
              <strong>{{ formatMoney(p.capital_contribution) }}</strong>
            </div>
            <div class="detail-row">
              <span>الرصيد الافتتاحي:</span>
              <strong>{{ formatMoney(p.opening_balance) }}</strong>
            </div>
            <div class="detail-row">
              <span>إجمالي المسحوبات التاريخية:</span>
              <strong class="text-drawings">{{ formatMoney(p.total_drawings) }}</strong>
            </div>
            <div v-if="p.notes" class="notes-box">
              <small>{{ p.notes }}</small>
            </div>
          </div>

          <div class="profile-card-actions">
            <button type="button" class="btn btn-outline btn-sm" @click="openPartnerModal(p)">
              <AppIcon name="edit" :size="14" />
              <span>تعديل</span>
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm btn-danger"
              @click="deletePartner(p)"
            >
              <AppIcon name="delete" :size="14" />
              <span>حذف/تعطيل</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ==============================================
         MODAL: CREATE / EDIT DRAWING VOUCHER
         ============================================== -->
    <div v-if="showDrawingModal" class="modal-overlay" @click.self="showDrawingModal = false">
      <div class="modal-dialog card animate-pop">
        <div class="modal-header">
          <h3>
            <AppIcon name="money" :size="20" />
            <span>تسجيل سند صرف مسحوبات شريك</span>
          </h3>
          <button type="button" class="close-btn" @click="showDrawingModal = false"></button>
        </div>

        <form @submit.prevent="saveDrawing">
          <div class="modal-body">
            <div class="form-group">
              <label>الشريك <span class="required">*</span></label>
              <select
                v-model="drawingForm.partner_id"
                class="input-control"
                required
                @change="onPartnerSelectedInForm"
              >
                <option :value="null">— اختر الشريك —</option>
                <option v-for="p in activePartnersOnly" :key="p.id" :value="p.id">
                  {{ p.name_ar }} (نسبته: {{ p.share_percentage }}%)
                </option>
              </select>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label>المبلغ المنصرف (ج.م) <span class="required">*</span></label>
                <input
                  v-model.number="drawingForm.amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  class="input-control"
                  placeholder="0.00"
                  required
                />
              </div>
              <div class="form-group">
                <label>تاريخ الصرف <span class="required">*</span></label>
                <input
                  v-model="drawingForm.drawing_date"
                  type="date"
                  class="input-control"
                  required
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label>الخزينة المصروف منها <span class="required">*</span></label>
                <select v-model="drawingForm.source_type" class="input-control" required>
                  <option value="cash_drawer">درج الكاشير / الفرع (يخصم من الوردية فوراً)</option>
                  <option value="main_treasury">الخزينة الرئيسية للإدارة</option>
                  <option value="bank_account">
                    الحساب البنكي / تحويل فودافون كاش أو إنستاباي
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>الفرع / المخزن</label>
                <select v-model="drawingForm.warehouse_id" class="input-control">
                  <option :value="null">— بدون فرع محدد —</option>
                  <option v-for="w in warehousesList" :key="w.id" :value="w.id">
                    {{ w.name_ar }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>المستلم الفعلي للنقدية</label>
              <input
                v-model="drawingForm.recipient_name"
                type="text"
                class="input-control"
                placeholder="اسم الشريك أو المندوب المستلم"
              />
            </div>

            <div class="form-group">
              <label>البيان / ملاحظات الصرف</label>
              <textarea
                v-model="drawingForm.notes"
                rows="2"
                class="input-control textarea-control"
                placeholder="أسباب الصرف أو تفاصيل إضافية..."
              ></textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button type="submit" class="btn btn-primary" :disabled="savingDrawing">
              <AppIcon name="check" :size="16" />
              <span>{{
                savingDrawing ? 'جاري الصرف والتقييد...' : 'اعتماد السند وخصم النقدية'
              }}</span>
            </button>
            <button type="button" class="btn btn-outline" @click="showDrawingModal = false">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ==============================================
         MODAL: CREATE / EDIT PARTNER
         ============================================== -->
    <div v-if="showPartnerModal" class="modal-overlay" @click.self="showPartnerModal = false">
      <div class="modal-dialog card animate-pop">
        <div class="modal-header">
          <h3>
            <AppIcon name="users" :size="20" />
            <span>{{ editingPartnerId ? 'تعديل بيانات الشريك' : 'إضافة شريك جديد' }}</span>
          </h3>
          <button type="button" class="close-btn" @click="showPartnerModal = false"></button>
        </div>

        <form @submit.prevent="savePartner">
          <div class="modal-body">
            <div class="form-group">
              <label>اسم الشريك <span class="required">*</span></label>
              <input
                v-model="partnerForm.name_ar"
                type="text"
                class="input-control"
                placeholder="الاسم الثلاثي أو اللقب"
                required
              />
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label>رقم الهاتف</label>
                <input
                  v-model="partnerForm.phone"
                  type="text"
                  class="input-control"
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div class="form-group">
                <label>نسبة الشراكة بالأرباح (%) <span class="required">*</span></label>
                <input
                  v-model.number="partnerForm.share_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  class="input-control"
                  placeholder="مثال: 50"
                  required
                />
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label>رأس المال المساهم به (ج.م)</label>
                <input
                  v-model.number="partnerForm.capital_contribution"
                  type="number"
                  step="0.01"
                  class="input-control"
                  placeholder="0.00"
                />
              </div>
              <div class="form-group">
                <label>الرصيد الافتتاحي (ج.م)</label>
                <input
                  v-model.number="partnerForm.opening_balance"
                  type="number"
                  step="0.01"
                  class="input-control"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div class="form-group">
              <label>ملاحظات الشراكة</label>
              <textarea
                v-model="partnerForm.notes"
                rows="2"
                class="input-control textarea-control"
                placeholder="شروط أو تفاصيل عقد الشراكة..."
              ></textarea>
            </div>

            <div class="form-group checkbox-group" v-if="editingPartnerId">
              <label class="checkbox-label">
                <input v-model="partnerForm.is_active" type="checkbox" />
                <span>حساب الشريك نشط ويستحق أرباحاً</span>
              </label>
            </div>
          </div>

          <div class="modal-footer">
            <button type="submit" class="btn btn-primary" :disabled="savingPartner">
              <span>{{ savingPartner ? 'جاري الحفظ...' : 'حفظ بيانات الشريك' }}</span>
            </button>
            <button type="button" class="btn btn-outline" @click="showPartnerModal = false">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ==============================================
         PRINT VOUCHER MODAL (RECEIPT PREVIEW)
         ============================================== -->
    <div
      v-if="printVoucherData"
      class="modal-overlay print-modal-overlay"
      @click.self="printVoucherData = null"
    >
      <div class="voucher-paper card animate-pop">
        <div class="voucher-header">
          <div class="brand">
            <h2>بن العجوز ERP</h2>
            <small>محامص وكافيهات بن العجوز</small>
          </div>
          <div class="doc-title">
            <h3>سند صرف مسحوبات شريك</h3>
            <span class="vch-no">رقم: {{ printVoucherData.voucher_number }}</span>
          </div>
        </div>

        <div class="voucher-body">
          <div class="voucher-info-grid">
            <div class="vch-item">
              <span class="lbl">التاريخ:</span>
              <span class="val">{{ printVoucherData.drawing_date }}</span>
            </div>
            <div class="vch-item">
              <span class="lbl">اسم الشريك:</span>
              <span class="val font-bold">{{ printVoucherData.partner_name }}</span>
            </div>
            <div class="vch-item">
              <span class="lbl">المبلغ المصروف:</span>
              <span class="val amount-box">{{ formatMoney(printVoucherData.amount) }}</span>
            </div>
            <div class="vch-item">
              <span class="lbl">الخزينة المسحوب منها:</span>
              <span class="val">{{
                printVoucherData.source_type === 'cash_drawer' ? 'درج الكاشير' : 'الخزينة الرئيسية'
              }}</span>
            </div>
            <div class="vch-item full-width">
              <span class="lbl">المستلم الفعلي:</span>
              <span class="val">{{
                printVoucherData.recipient_name || printVoucherData.partner_name
              }}</span>
            </div>
            <div class="vch-item full-width" v-if="printVoucherData.notes">
              <span class="lbl">البيان / الغرض:</span>
              <span class="val">{{ printVoucherData.notes }}</span>
            </div>
          </div>

          <div class="voucher-signatures">
            <div class="sig-box">
              <span>أمين الخزينة / الكاشير</span>
              <div class="sig-line"></div>
            </div>
            <div class="sig-box">
              <span>توقيع المستلم</span>
              <div class="sig-line"></div>
            </div>
            <div class="sig-box">
              <span>اعتماد الإدارة</span>
              <div class="sig-line"></div>
            </div>
          </div>
        </div>

        <div class="voucher-actions no-print">
          <button type="button" class="btn btn-primary" @click="triggerBrowserPrint">
            <AppIcon name="invoices" :size="16" />
            <span>طباعة السند الآن</span>
          </button>
          <button type="button" class="btn btn-outline" @click="printVoucherData = null">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { partnersApi } from '@/api/partners.api';
import { inventory as inventoryApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import AppIcon from '@/components/AppIcon.vue';
import StatCard from '@/components/StatCard.vue';

// ── State & Tabs ──
const activeTab = ref<'settlement' | 'drawings' | 'partners'>('settlement');
const todayStr = new Date().toISOString().split('T')[0]!;
const firstDayOfMonth = todayStr.slice(0, 8) + '01';

// ── Settlement Data ──
const loadingSettlement = ref(false);
const settlementDates = reactive({
  from_date: firstDayOfMonth,
  to_date: todayStr,
});
const settlementSummary = ref<any>(null);
const settlementPartners = computed(() => settlementSummary.value?.partners || []);

// ── Drawings Data ──
const loadingDrawings = ref(false);
const drawingsList = ref<any[]>([]);
const drawingsTotalAmount = ref(0);
const drawingsTotalCount = ref(0);
const drawingsFilters = reactive({
  partner_id: undefined as number | undefined,
  from_date: firstDayOfMonth,
  to_date: todayStr,
  source_type: undefined as string | undefined,
});

// ── Partners Data ──
const loadingPartners = ref(false);
const partnersList = ref<any[]>([]);
const activePartnersOnly = computed(() => partnersList.value.filter((p) => p.is_active));
const totalSharesSum = computed(() =>
  partnersList.value
    .filter((p) => p.is_active)
    .reduce((acc, p) => acc + Number(p.share_percentage || 0), 0),
);

// ── Warehouses List ──
const warehousesList = ref<any[]>([]);

// ── Modals State ──
const showDrawingModal = ref(false);
const savingDrawing = ref(false);
const drawingForm = reactive({
  partner_id: null as number | null,
  amount: null as number | null,
  drawing_date: todayStr,
  source_type: 'cash_drawer',
  warehouse_id: null as number | null,
  recipient_name: '',
  notes: '',
});

const showPartnerModal = ref(false);
const editingPartnerId = ref<number | null>(null);
const savingPartner = ref(false);
const partnerForm = reactive({
  name_ar: '',
  phone: '',
  share_percentage: null as number | null,
  capital_contribution: null as number | null,
  opening_balance: null as number | null,
  notes: '',
  is_active: true,
});

const printVoucherData = ref<any>(null);

// ── Methods ──

const loadSettlement = async () => {
  loadingSettlement.value = true;
  try {
    const res = await partnersApi.getSettlement(settlementDates);
    settlementSummary.value = res.data?.data || res.data || null;
  } catch (err: any) {
    console.error('فشل جلب تسوية الأرباح:', err);
  } finally {
    loadingSettlement.value = false;
  }
};

const onMonthSelected = (e: any) => {
  const ym = e.target.value;
  if (!ym) return;
  const [year, month] = ym.split('-');
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  settlementDates.from_date = `${ym}-01`;
  settlementDates.to_date = `${ym}-${String(lastDay).padStart(2, '0')}`;
  loadSettlement();
};

const loadDrawings = async () => {
  loadingDrawings.value = true;
  try {
    const res = await partnersApi.listDrawings(drawingsFilters);
    const data = res.data?.data || res.data || {};
    drawingsList.value = data.drawings || [];
    drawingsTotalAmount.value = data.total_amount || 0;
    drawingsTotalCount.value = data.count || 0;
  } catch (err: any) {
    console.error('فشل جلب سندات المسحوبات:', err);
  } finally {
    loadingDrawings.value = false;
  }
};

const loadPartners = async () => {
  loadingPartners.value = true;
  try {
    const res = await partnersApi.list();
    partnersList.value = res.data?.data || res.data || [];
  } catch (err: any) {
    console.error('فشل جلب الشركاء:', err);
  } finally {
    loadingPartners.value = false;
  }
};

const loadWarehouses = async () => {
  try {
    const res = await inventoryApi.warehouses();
    warehousesList.value = res.data?.data || res.data || [];
  } catch (err: any) {
    console.error('فشل جلب المخازن:', err);
  }
};

// ── Drawing Modal Handlers ──
const openDrawingModal = (partnerId?: number) => {
  drawingForm.partner_id = partnerId || (activePartnersOnly.value[0]?.id ?? null);
  drawingForm.amount = null;
  drawingForm.drawing_date = new Date().toISOString().split('T')[0]!;
  drawingForm.source_type = 'cash_drawer';
  drawingForm.warehouse_id = warehousesList.value[0]?.id || null;
  drawingForm.recipient_name = '';
  drawingForm.notes = '';

  onPartnerSelectedInForm();
  showDrawingModal.value = true;
};

const openNewDrawingForPartner = (partner: any) => {
  openDrawingModal(partner.id);
};

const onPartnerSelectedInForm = () => {
  const p = partnersList.value.find((x) => x.id === drawingForm.partner_id);
  if (p && !drawingForm.recipient_name) {
    drawingForm.recipient_name = p.name_ar;
  }
};

const saveDrawing = async () => {
  if (!drawingForm.partner_id || !drawingForm.amount) return;
  savingDrawing.value = true;
  try {
    const res = await partnersApi.createDrawing(drawingForm);
    showDrawingModal.value = false;
    await Promise.all([loadDrawings(), loadSettlement(), loadPartners()]);

    const created = res.data?.data || res.data;
    if (created && confirm('تم اعتماد السند بنجاح! هل تريد طباعة إيصال الصرف الآن؟')) {
      printVoucher(created);
    }
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل حفظ سند المسحوبات');
  } finally {
    savingDrawing.value = false;
  }
};

const deleteDrawing = async (drw: any) => {
  if (
    !confirm(
      `هل أنت متأكد من حذف سند الصرف رقم (${drw.voucher_number}) بمبلغ ${formatMoney(drw.amount)}؟`,
    )
  ) {
    return;
  }
  try {
    await partnersApi.deleteDrawing(drw.id);
    await Promise.all([loadDrawings(), loadSettlement(), loadPartners()]);
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل حذف السند');
  }
};

// ── Partner Modal Handlers ──
const openPartnerModal = (partner?: any) => {
  if (partner) {
    editingPartnerId.value = partner.id;
    partnerForm.name_ar = partner.name_ar;
    partnerForm.phone = partner.phone || '';
    partnerForm.share_percentage = partner.share_percentage;
    partnerForm.capital_contribution = partner.capital_contribution;
    partnerForm.opening_balance = partner.opening_balance;
    partnerForm.notes = partner.notes || '';
    partnerForm.is_active = partner.is_active;
  } else {
    editingPartnerId.value = null;
    partnerForm.name_ar = '';
    partnerForm.phone = '';
    partnerForm.share_percentage = null;
    partnerForm.capital_contribution = null;
    partnerForm.opening_balance = null;
    partnerForm.notes = '';
    partnerForm.is_active = true;
  }
  showPartnerModal.value = true;
};

const savePartner = async () => {
  savingPartner.value = true;
  try {
    if (editingPartnerId.value) {
      await partnersApi.update(editingPartnerId.value, partnerForm);
    } else {
      await partnersApi.create(partnerForm);
    }
    showPartnerModal.value = false;
    await Promise.all([loadPartners(), loadSettlement()]);
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل حفظ الشريك');
  } finally {
    savingPartner.value = false;
  }
};

const deletePartner = async (partner: any) => {
  if (!confirm(`هل تريد بالتأكيد حذف/تعطيل الشريك (${partner.name_ar})؟`)) return;
  try {
    await partnersApi.delete(partner.id);
    await Promise.all([loadPartners(), loadSettlement()]);
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل حذف الشريك');
  }
};

// ── Printing Handlers ──
const printVoucher = (drw: any) => {
  printVoucherData.value = drw;
};

const triggerBrowserPrint = () => {
  window.print();
};

onMounted(() => {
  loadPartners();
  loadSettlement();
  loadDrawings();
  loadWarehouses();
});
</script>

<style lang="scss" scoped>
.partners-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  direction: rtl;
}

/* Header Card */
.page-header-card {
  background: var(--bg-card, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: var(--radius-lg, 16px);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
  }

  .title-with-icon {
    display: flex;
    align-items: center;
    gap: 16px;

    .icon-bubble {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(234, 179, 8, 0.05));
      border: 1px solid rgba(234, 179, 8, 0.4);
      color: #eab308;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .page-title {
      font-size: 1.4rem;
      font-weight: 850;
      color: var(--text-strong, #f8fafc);
      margin: 0;
    }

    .page-subtitle {
      font-size: 0.85rem;
      color: var(--text-muted, #94a3b8);
      margin: 4px 0 0;
    }
  }

  .tabs-nav-wrapper {
    display: flex;
    gap: 6px;
    background: rgba(15, 23, 42, 0.6);
    padding: 5px;
    border-radius: 12px;
    border: 1px solid var(--border, #334155);

    .tab-nav-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-muted, #94a3b8);
      font-size: 0.88rem;
      font-weight: 750;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        color: var(--text-strong, #fff);
      }

      &.active {
        background: var(--primary, #0284c7);
        color: #fff;
        box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
      }
    }
  }
}

/* Filter Card */
.filter-card {
  background: var(--bg-card, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: var(--radius-md, 12px);
  padding: 14px 20px;

  .filters-inline {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;

    .filter-field {
      display: flex;
      flex-direction: column;
      gap: 6px;

      label {
        font-size: 0.8rem;
        font-weight: 750;
        color: var(--text-muted, #94a3b8);
      }
    }

    .month-selector-pill {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px dashed var(--border, #475569);
      padding: 8px 14px;
      border-radius: 8px;
      color: var(--text, #e2e8f0);
      font-size: 0.84rem;
      cursor: pointer;

      .hidden-month-input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
        width: 100%;
      }
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-right: auto;
    }
  }
}

/* Stats Row */
.stats-row {
  gap: 16px;
}

/* Settlement Section */
.settlement-partners-section {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .section-title-tag {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-strong, #fff);

      h3 {
        font-size: 1.05rem;
        font-weight: 800;
        margin: 0;
      }
    }

    .partners-count-pill {
      background: rgba(255, 255, 255, 0.07);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted, #94a3b8);
    }
  }

  .partner-cards-grid {
    gap: 20px;
  }

  .partner-settlement-card {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, #334155);
    border-radius: var(--radius-lg, 16px);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    position: relative;
    overflow: hidden;
    transition:
      transform 0.2s,
      box-shadow 0.2s;

    &:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }

    &.is-payable {
      border-top: 4px solid #10b981;
    }

    &.is-overdrawn {
      border-top: 4px solid #ef4444;
    }

    &.is-settled {
      border-top: 4px solid #64748b;
    }

    .card-partner-header {
      display: flex;
      align-items: center;
      gap: 12px;

      .partner-avatar {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary, #0284c7), #38bdf8);
        color: #fff;
        font-weight: 850;
        font-size: 1.1rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .partner-info {
        flex: 1;

        h4 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text-strong, #fff);
        }

        .share-badge {
          font-size: 0.78rem;
          color: var(--accent, #f59e0b);
          font-weight: 750;
        }
      }

      .status-indicator-badge {
        font-size: 0.74rem;
        font-weight: 800;
        padding: 4px 8px;
        border-radius: 6px;

        &.payable {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }
        &.overdrawn {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
        }
        &.settled {
          background: rgba(100, 116, 139, 0.15);
          color: #94a3b8;
        }
      }
    }

    .card-metric-divider {
      height: 1px;
      background: var(--border, #334155);
    }

    .card-financial-metrics {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .metric-line {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;

        .metric-lbl {
          color: var(--text-muted, #94a3b8);
        }

        .metric-val {
          font-weight: 750;
          color: var(--text, #e2e8f0);

          &.text-profit {
            color: #10b981;
          }
          &.text-drawings {
            color: #f59e0b;
          }
        }
      }
    }

    .drawings-progress-wrapper {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .progress-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--text-muted, #94a3b8);
      }

      .progress-bar-track {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        overflow: hidden;

        .progress-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.4s ease;
        }
      }
    }

    .card-net-balance-row {
      background: rgba(15, 23, 42, 0.4);
      padding: 10px 12px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .net-lbl {
        font-size: 0.76rem;
        color: var(--text-muted, #94a3b8);
        font-weight: 700;
      }

      .net-amount {
        font-size: 1.25rem;
        font-weight: 900;
        font-family: monospace;

        &.payable {
          color: #10b981;
        }
        &.overdrawn {
          color: #ef4444;
        }
        &.settled {
          color: var(--text-muted, #94a3b8);
        }
      }
    }

    .card-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: auto;
    }
  }
}

/* Toolbar Card */
.toolbar-card {
  background: var(--bg-card, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: var(--radius-md, 12px);
  padding: 14px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;

  .filters-bar {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;

    .filter-item {
      display: flex;
      flex-direction: column;
      gap: 4px;

      label {
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--text-muted, #94a3b8);
      }
    }
  }

  .shares-meter-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 260px;

    .meter-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.82rem;
      font-weight: 750;
      color: var(--text, #e2e8f0);
    }

    .meter-bar-track {
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      overflow: hidden;

      .meter-bar-fill {
        height: 100%;
        background: var(--primary, #0284c7);
        border-radius: 4px;
        transition: width 0.3s;

        &.over-capacity {
          background: var(--danger, #ef4444);
        }
      }
    }
  }
}

/* Table Card */
.table-card {
  background: var(--bg-card, #1e293b);
  border: 1px solid var(--border, #334155);
  border-radius: var(--radius-lg, 16px);
  overflow: hidden;

  .table-header-info {
    padding: 14px 20px;
    background: rgba(15, 23, 42, 0.4);
    border-bottom: 1px solid var(--border, #334155);
    display: flex;
    justify-content: space-between;
    font-size: 0.88rem;
    font-weight: 750;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;

    th {
      background: rgba(15, 23, 42, 0.6);
      padding: 12px 16px;
      font-size: 0.82rem;
      font-weight: 800;
      color: var(--text-muted, #94a3b8);
      text-align: right;
      border-bottom: 1px solid var(--border, #334155);
    }

    td {
      padding: 12px 16px;
      font-size: 0.86rem;
      border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      color: var(--text, #e2e8f0);
    }

    .voucher-tag {
      font-family: monospace;
      font-weight: 800;
      background: rgba(2, 132, 199, 0.15);
      color: #38bdf8;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
    }

    .amount-cell {
      font-weight: 850;
      font-family: monospace;
      color: var(--accent, #f59e0b);
      font-size: 0.95rem;
    }

    .badge-cash {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 700;
    }

    .badge-treasury {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 700;
    }

    .badge-bank {
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 700;
    }

    .actions-cell {
      display: flex;
      gap: 6px;
      justify-content: center;

      .icon-action-btn {
        width: 30px;
        height: 30px;
        border-radius: 6px;
        border: 1px solid var(--border, #475569);
        background: transparent;
        color: var(--text-muted, #94a3b8);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;

        &:hover.print {
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          border-color: #38bdf8;
        }

        &:hover.delete {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border-color: #ef4444;
        }
      }
    }
  }
}

/* Partners Profile Grid */
.partner-profiles-grid {
  gap: 20px;

  .partner-profile-card {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, #334155);
    border-radius: var(--radius-lg, 16px);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;

    &.is-inactive {
      opacity: 0.6;
    }

    .profile-header {
      display: flex;
      align-items: center;
      gap: 12px;

      .profile-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff;
        font-weight: 850;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .profile-titles {
        flex: 1;

        h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text-strong, #fff);
        }

        .phone-text {
          font-size: 0.78rem;
          color: var(--text-muted, #94a3b8);
        }
      }

      .active-badge {
        font-size: 0.74rem;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: 4px;

        &.active {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }
        &.inactive {
          background: rgba(100, 116, 139, 0.15);
          color: #94a3b8;
        }
      }
    }

    .profile-details-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 0.85rem;

      .detail-row {
        display: flex;
        justify-content: space-between;
        color: var(--text-muted, #94a3b8);

        strong {
          color: var(--text, #e2e8f0);

          &.highlight-share {
            color: #38bdf8;
            font-size: 0.95rem;
          }
          &.text-drawings {
            color: #f59e0b;
          }
        }
      }

      .notes-box {
        background: rgba(15, 23, 42, 0.4);
        padding: 8px 10px;
        border-radius: 6px;
        color: var(--text-muted, #94a3b8);
        margin-top: 4px;
      }
    }

    .profile-card-actions {
      display: flex;
      gap: 10px;
      margin-top: auto;

      button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
    }
  }
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;

  .modal-dialog {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border, #334155);
    border-radius: var(--radius-lg, 16px);
    width: min(520px, 95vw);
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border, #334155);
      padding-bottom: 12px;

      h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 850;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-strong, #fff);
      }

      .close-btn {
        background: transparent;
        border: none;
        color: var(--text-muted, #94a3b8);
        font-size: 1.2rem;
        cursor: pointer;
      }
    }

    .modal-body {
      display: flex;
      flex-direction: column;
      gap: 14px;

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;

        label {
          font-size: 0.82rem;
          font-weight: 750;
          color: var(--text-muted, #94a3b8);

          .required {
            color: var(--danger, #ef4444);
          }
        }
      }

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      border-top: 1px solid var(--border, #334155);
      padding-top: 14px;
    }
  }
}

/* Controls */
.input-control {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border, #334155);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text, #e2e8f0);
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--primary, #0284c7);
  }
}

.textarea-control {
  resize: vertical;
}

/* Print Voucher Styling */
.voucher-paper {
  background: #ffffff !important;
  color: #0f172a !important;
  width: min(580px, 95vw);
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  direction: rtl;

  .voucher-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 14px;
    margin-bottom: 20px;

    .brand {
      h2 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 900;
        color: #0f172a;
      }
      small {
        color: #64748b;
        font-weight: 700;
      }
    }

    .doc-title {
      text-align: left;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 900;
        color: #0284c7;
      }
      .vch-no {
        font-family: monospace;
        font-weight: 800;
        font-size: 0.85rem;
        color: #475569;
      }
    }
  }

  .voucher-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 30px;

    .vch-item {
      display: flex;
      flex-direction: column;
      gap: 2px;

      &.full-width {
        grid-column: span 2;
      }

      .lbl {
        font-size: 0.78rem;
        color: #64748b;
        font-weight: 750;
      }

      .val {
        font-size: 0.95rem;
        color: #0f172a;
        font-weight: 750;

        &.amount-box {
          font-size: 1.3rem;
          font-weight: 900;
          color: #0284c7;
          font-family: monospace;
        }
      }
    }
  }

  .voucher-signatures {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
    padding-top: 20px;
    border-top: 1px dashed #cbd5e1;

    .sig-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
      font-size: 0.8rem;
      font-weight: 800;
      color: #475569;

      .sig-line {
        width: 100%;
        height: 1px;
        background: #94a3b8;
      }
    }
  }

  .voucher-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 24px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
  }
}

@media print {
  body * {
    visibility: hidden;
  }
  .voucher-paper,
  .voucher-paper * {
    visibility: visible;
  }
  .voucher-paper {
    position: fixed;
    top: 0;
    left: 0;
    width: 100% !important;
    box-shadow: none !important;
  }
  .no-print {
    display: none !important;
  }
}
</style>
