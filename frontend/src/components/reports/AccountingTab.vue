<template>
  <div class="accounting-tab">
    <!-- Sub-navigation tabs for Accounting -->
    <div class="sub-nav-tabs">
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'trial_balance' }]"
        @click="switchSubTab('trial_balance')"
      >
        <AppIcon name="receipt" :size="16" />
        <span>ميزان المراجعة</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'general_ledger' }]"
        @click="switchSubTab('general_ledger')"
      >
        <AppIcon name="reports" :size="16" />
        <span>دفتر الأستاذ العام</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'balance_sheet' }]"
        @click="switchSubTab('balance_sheet')"
      >
        <AppIcon name="wallet" :size="16" />
        <span>الميزانية العمومية</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'coa' }]"
        @click="switchSubTab('coa')"
      >
        <AppIcon name="settings" :size="16" />
        <span>دليل الحسابات (COA)</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'new_entry' }]"
        @click="switchSubTab('new_entry')"
      >
        <AppIcon name="plus" :size="16" />
        <span>تسجيل قيد يومية</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'reconciliation' }]"
        @click="switchSubTab('reconciliation')"
      >
        <AppIcon name="receipt" :size="16" />
        <span>مطابقة البنك والخزينة</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'aging' }]"
        @click="switchSubTab('aging')"
      >
        <AppIcon name="clock" :size="16" />
        <span>أعمار الديون والمديونيات</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'proof' }]"
        @click="switchSubTab('proof')"
      >
        <AppIcon name="check" :size="16" />
        <span>مطابقة الأرباح مع الأستاذ</span>
      </button>
      <button
        type="button"
        :class="['sub-nav-btn', { active: subTab === 'periods' }]"
        @click="switchSubTab('periods')"
      >
        <AppIcon name="calendar" :size="16" />
        <span>الفترات والإقفال المالي</span>
      </button>
    </div>

    <!-- Error / Loading indicators -->
    <div v-if="error" class="error-msg card">{{ error }}</div>
    <div v-if="loading" class="loading-state card">⏳ جاري تحميل البيانات المحاسبية...</div>

    <!-- =========================================================================
         1. TRIAL BALANCE (ميزان المراجعة بالمجاميع والأرصدة)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'trial_balance'" class="card">
      <div class="card-header-row">
        <div>
          <h3>ميزان المراجعة بالأرصدة والحركات</h3>
          <p class="text-muted">التحقق من صحة وتوازن القيد المزدوج لجميع الحسابات</p>
        </div>
        <div
          class="balance-status-badge"
          :class="trialBalanceData?.totals.is_balanced ? 'balanced' : 'imbalanced'"
        >
          <span class="status-dot"></span>
          <span>{{
            trialBalanceData?.totals.is_balanced
              ? 'الميزان متوازن ومطابق (المدين = الدائن)'
              : 'يوجد فارق غير متوازن!'
          }}</span>
        </div>
      </div>

      <!-- Quick KPI Strip -->
      <div class="kpi-grid kpi-grid-4 mb-4">
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">إجمالي حركات المدين</div>
            <div class="kpi-value text-primary">
              {{ formatMoney(trialBalanceData?.totals.period_debit || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">إجمالي حركات الدائن</div>
            <div class="kpi-value text-primary">
              {{ formatMoney(trialBalanceData?.totals.period_credit || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">إجمالي الأرصدة الختامية المدينة</div>
            <div class="kpi-value text-success">
              {{ formatMoney(trialBalanceData?.totals.closing_debit || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">إجمالي الأرصدة الختامية الدائنة</div>
            <div class="kpi-value text-success">
              {{ formatMoney(trialBalanceData?.totals.closing_credit || 0) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Table Search Filter -->
      <div class="table-search-bar mb-3">
        <input
          v-model="tbSearch"
          type="text"
          class="field-like search-input"
          placeholder="ابحث بكود الحساب أو الاسم (مثال: 1101 أو الخزينة)..."
        />
      </div>

      <div class="table-responsive">
        <table class="items-table trial-balance-table">
          <thead>
            <tr>
              <th rowspan="2">الكود</th>
              <th rowspan="2">اسم الحساب</th>
              <th rowspan="2">النوع</th>
              <th colspan="2" class="text-center">رصيد أول المدة</th>
              <th colspan="2" class="text-center">حركات الفترة</th>
              <th colspan="2" class="text-center">رصيد آخر المدة</th>
            </tr>
            <tr>
              <th class="sub-th">مدين</th>
              <th class="sub-th">دائن</th>
              <th class="sub-th">مدين</th>
              <th class="sub-th">دائن</th>
              <th class="sub-th">مدين</th>
              <th class="sub-th">دائن</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="acc in filteredTbRows"
              :key="acc.id"
              @click="drillDownToGL(acc.code)"
              class="clickable-row"
            >
              <td>
                <strong>{{ acc.code }}</strong>
              </td>
              <td>{{ acc.name_ar }}</td>
              <td>
                <span class="type-pill" :class="acc.account_type">{{
                  formatAccountType(acc.account_type)
                }}</span>
              </td>
              <td class="num-cell">
                {{ acc.opening_debit ? formatMoney(acc.opening_debit) : '—' }}
              </td>
              <td class="num-cell">
                {{ acc.opening_credit ? formatMoney(acc.opening_credit) : '—' }}
              </td>
              <td class="num-cell text-primary">
                {{ acc.period_debit ? formatMoney(acc.period_debit) : '—' }}
              </td>
              <td class="num-cell text-primary">
                {{ acc.period_credit ? formatMoney(acc.period_credit) : '—' }}
              </td>
              <td class="num-cell font-bold text-success">
                {{ acc.closing_debit ? formatMoney(acc.closing_debit) : '—' }}
              </td>
              <td class="num-cell font-bold text-success">
                {{ acc.closing_credit ? formatMoney(acc.closing_credit) : '—' }}
              </td>
            </tr>
            <tr v-if="!filteredTbRows.length">
              <td colspan="9" class="text-center py-4">لا توجد حسابات مطابقة للبحث</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="summary-footer-row">
              <td colspan="3" class="text-bold">الإجمالي العام المتوازن:</td>
              <td class="num-cell font-bold">
                {{ formatMoney(trialBalanceData?.totals.opening_debit || 0) }}
              </td>
              <td class="num-cell font-bold">
                {{ formatMoney(trialBalanceData?.totals.opening_credit || 0) }}
              </td>
              <td class="num-cell font-bold">
                {{ formatMoney(trialBalanceData?.totals.period_debit || 0) }}
              </td>
              <td class="num-cell font-bold">
                {{ formatMoney(trialBalanceData?.totals.period_credit || 0) }}
              </td>
              <td class="num-cell font-bold">
                {{ formatMoney(trialBalanceData?.totals.closing_debit || 0) }}
              </td>
              <td class="num-cell font-bold">
                {{ formatMoney(trialBalanceData?.totals.closing_credit || 0) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         2. GENERAL LEDGER (دفتر الأستاذ العام التراكمي)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'general_ledger'" class="card">
      <div class="card-header-row">
        <div>
          <h3>دفتر الأستاذ العام</h3>
          <p class="text-muted">كشف حساب تفصيلي وحركة الرصيد التراكمي للعمليات المالية</p>
        </div>
        <div class="gl-account-picker">
          <label>الحساب:</label>
          <select v-model="glSelectedCode" class="field-like" @change="loadGeneralLedger">
            <option v-for="a in accountsList" :key="a.id" :value="a.code">
              {{ a.code }} - {{ a.name_ar }} ({{ formatAccountType(a.account_type) }})
            </option>
          </select>
        </div>
      </div>

      <!-- Account summary header card -->
      <div v-if="generalLedgerData?.account" class="gl-summary-strip kpi-grid kpi-grid-4 mb-4">
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">الرصيد الافتتاحي</div>
            <div class="kpi-value">{{ formatMoney(generalLedgerData.opening_balance) }}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">مجموع مدين الفترة</div>
            <div class="kpi-value text-primary">
              {{ formatMoney(generalLedgerData.period_debit) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">مجموع دائن الفترة</div>
            <div class="kpi-value text-primary">
              {{ formatMoney(generalLedgerData.period_credit) }}
            </div>
          </div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-body">
            <div class="kpi-label">الرصيد الختامي الحالي</div>
            <div class="kpi-value font-bold text-success">
              {{ formatMoney(generalLedgerData.closing_balance) }}
            </div>
          </div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="items-table gl-table">
          <thead>
            <tr>
              <th>تاريخ القيد</th>
              <th>رقم القيد</th>
              <th>المرجع</th>
              <th>البيان / الشرح</th>
              <th>مدين (دخول)</th>
              <th>دائن (خروج)</th>
              <th>الرصيد التراكمي</th>
            </tr>
          </thead>
          <tbody>
            <tr class="opening-balance-row">
              <td colspan="4"><strong>رصيد أول المدة الافتتاحي</strong></td>
              <td class="num-cell">—</td>
              <td class="num-cell">—</td>
              <td class="num-cell font-bold">
                {{ formatMoney(generalLedgerData?.opening_balance || 0) }}
              </td>
            </tr>
            <tr v-for="entry in generalLedgerData?.entries || []" :key="entry.line_id">
              <td>{{ entry.entry_date }}</td>
              <td>
                <code>{{ entry.entry_number }}</code>
              </td>
              <td>
                <span class="ref-pill"
                  >{{ entry.reference_type }}
                  {{ entry.reference_id ? '#' + entry.reference_id : '' }}</span
                >
              </td>
              <td>{{ entry.line_description || entry.entry_description }}</td>
              <td class="num-cell text-primary">
                {{ entry.debit ? formatMoney(entry.debit) : '—' }}
              </td>
              <td class="num-cell text-primary">
                {{ entry.credit ? formatMoney(entry.credit) : '—' }}
              </td>
              <td
                class="num-cell font-bold"
                :class="entry.running_balance >= 0 ? 'text-success' : 'text-danger'"
              >
                {{ formatMoney(entry.running_balance) }}
              </td>
            </tr>
            <tr v-if="!generalLedgerData?.entries?.length">
              <td colspan="7" class="text-center py-4">
                لا توجد حركات مسجلة على هذا الحساب خلال الفترة
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         3. BALANCE SHEET (الميزانية العمومية: الأصول = الالتزامات + حقوق الملكية)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'balance_sheet'" class="card">
      <div class="card-header-row">
        <div>
          <h3>الميزانية العمومية (مركز مالي)</h3>
          <p class="text-muted">الأصول = الخصوم + حقوق الملكية + صافي دخل الفترة</p>
        </div>
        <div
          class="balance-status-badge"
          :class="balanceSheetData?.is_balanced ? 'balanced' : 'imbalanced'"
        >
          <span class="status-dot"></span>
          <span>{{
            balanceSheetData?.is_balanced
              ? 'معادلة المركز المالي متطابقة تماماً'
              : 'يوجد فارق غير متوازن!'
          }}</span>
        </div>
      </div>

      <div class="bs-grid grid grid-2">
        <!-- الأصول (Assets) -->
        <div class="bs-column card-inner">
          <div class="bs-col-header">
            <h4>جانب الأصول (Assets)</h4>
            <span class="bs-total text-primary">{{
              formatMoney(balanceSheetData?.assets.total || 0)
            }}</span>
          </div>
          <table class="items-table simple-table">
            <thead>
              <tr>
                <th>كود الحساب</th>
                <th>اسم الحساب</th>
                <th class="text-left">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in balanceSheetData?.assets.items || []" :key="item.id">
                <td>
                  <code>{{ item.code }}</code>
                </td>
                <td>{{ item.name_ar }}</td>
                <td class="num-cell font-bold">{{ formatMoney(item.balance) }}</td>
              </tr>
              <tr v-if="!balanceSheetData?.assets.items?.length">
                <td colspan="3" class="text-center py-3">لا توجد أصول مسجلة</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="summary-footer-row">
                <td colspan="2"><strong>إجمالي الأصول</strong></td>
                <td class="num-cell font-bold text-primary">
                  {{ formatMoney(balanceSheetData?.assets.total || 0) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- الالتزامات وحقوق الملكية (Liabilities & Equity) -->
        <div class="bs-column card-inner">
          <!-- Liabilities -->
          <div class="bs-col-header">
            <h4>الالتزامات (Liabilities)</h4>
            <span class="bs-total text-danger">{{
              formatMoney(balanceSheetData?.liabilities.total || 0)
            }}</span>
          </div>
          <table class="items-table simple-table mb-4">
            <thead>
              <tr>
                <th>كود الحساب</th>
                <th>اسم الحساب</th>
                <th class="text-left">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in balanceSheetData?.liabilities.items || []" :key="item.id">
                <td>
                  <code>{{ item.code }}</code>
                </td>
                <td>{{ item.name_ar }}</td>
                <td class="num-cell font-bold">{{ formatMoney(item.balance) }}</td>
              </tr>
              <tr v-if="!balanceSheetData?.liabilities.items?.length">
                <td colspan="3" class="text-center py-3">لا توجد التزامات مسجلة</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="summary-footer-row">
                <td colspan="2"><strong>مجموع الالتزامات</strong></td>
                <td class="num-cell font-bold text-danger">
                  {{ formatMoney(balanceSheetData?.liabilities.total || 0) }}
                </td>
              </tr>
            </tfoot>
          </table>

          <!-- Equity -->
          <div class="bs-col-header">
            <h4>حقوق الملكية (Equity)</h4>
            <span class="bs-total text-success">{{
              formatMoney(balanceSheetData?.equity.total || 0)
            }}</span>
          </div>
          <table class="items-table simple-table">
            <thead>
              <tr>
                <th>كود الحساب</th>
                <th>اسم الحساب</th>
                <th class="text-left">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in balanceSheetData?.equity.items || []" :key="item.id">
                <td>
                  <code>{{ item.code }}</code>
                </td>
                <td>{{ item.name_ar }}</td>
                <td class="num-cell font-bold">{{ formatMoney(item.balance) }}</td>
              </tr>
              <!-- صافي ربح الفترة الحالية -->
              <tr class="highlight-income-row">
                <td><code>3999</code></td>
                <td><strong>صافي أرباح الفترة التشغيلية الحالية</strong></td>
                <td class="num-cell font-bold text-success">
                  {{ formatMoney(balanceSheetData?.equity.current_period_net_income || 0) }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="summary-footer-row">
                <td colspan="2"><strong>مجموع الالتزامات وحقوق الملكية</strong></td>
                <td class="num-cell font-bold text-primary">
                  {{ formatMoney(balanceSheetData?.total_liabilities_and_equity || 0) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- =========================================================================
         4. CHART OF ACCOUNTS (دليل الحسابات الهرمي)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'coa'" class="card">
      <div class="card-header-row">
        <div>
          <h3>شجرة ودليل الحسابات القياسي</h3>
          <p class="text-muted">الهيكل المحاسبي الشامل لنظام بن العجوز ERP</p>
        </div>
        <button type="button" class="btn btn-primary" @click="openNewAccountModal">
          <AppIcon name="plus" :size="16" />
          <span>إضافة حساب جديد</span>
        </button>
      </div>

      <div class="table-responsive">
        <table class="items-table">
          <thead>
            <tr>
              <th>كود الحساب</th>
              <th>اسم الحساب بالعربية</th>
              <th>الاسم بالإنجليزية</th>
              <th>تصنيف الحساب</th>
              <th>طبيعة الرصيد</th>
              <th>حساب رئيسي أم فرعي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="acc in accountsList" :key="acc.id">
              <td>
                <code>{{ acc.code }}</code>
              </td>
              <td>
                <strong>{{ acc.name_ar }}</strong>
              </td>
              <td class="text-muted">{{ acc.name_en || '—' }}</td>
              <td>
                <span class="type-pill" :class="acc.account_type">{{
                  formatAccountType(acc.account_type)
                }}</span>
              </td>
              <td>
                <span class="badge">{{
                  acc.normal_balance === 'debit' ? 'مدين (Debit)' : 'دائن (Credit)'
                }}</span>
              </td>
              <td>{{ acc.parent_id ? 'حساب فرعي' : 'حساب رئيسي رتبة 1' }}</td>
              <td>
                <span class="status-badge active">{{ acc.is_active ? 'نشط' : 'معطل' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         5. MANUAL JOURNAL ENTRY (نموذج إدخال قيد يومية مزدوج متوازن)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'new_entry'" class="card">
      <div class="card-header-row">
        <div>
          <h3>تسجيل قيد يومية يدوي متوازن</h3>
          <p class="text-muted">تسجيل تسويات، إيداعات، أو حركات رأس مال مع التحقق الحسابي الفوري</p>
        </div>
        <div class="live-balance-indicator" :class="isEntryBalanced ? 'balanced' : 'imbalanced'">
          <span>المدين: {{ formatMoney(entryDebitSum) }}</span>
          <span>الدائن: {{ formatMoney(entryCreditSum) }}</span>
          <span class="diff">الفارق: {{ formatMoney(entryDiff) }}</span>
        </div>
      </div>

      <form @submit.prevent="submitJournalEntry">
        <div class="grid grid-3 mb-3">
          <div class="form-group">
            <label>تاريخ القيد</label>
            <input v-model="entryForm.entry_date" type="date" class="field-like" required />
          </div>
          <div class="form-group span-2">
            <label>شرح القيد العام (البيان)</label>
            <input
              v-model="entryForm.description"
              type="text"
              class="field-like"
              placeholder="مثال: تسوية إيداع نقدية من الشريك / سداد مصروفات..."
              required
            />
          </div>
        </div>

        <div class="entry-lines-wrapper mb-4">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 35%">الحساب</th>
                <th style="width: 15%">مدين (Debit)</th>
                <th style="width: 15%">دائن (Credit)</th>
                <th style="width: 30%">شرح السطر</th>
                <th style="width: 5%">حذف</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in entryForm.lines" :key="idx">
                <td>
                  <select v-model.number="line.account_id" class="field-like" required>
                    <option :value="undefined">— اختر الحساب —</option>
                    <option v-for="a in accountsList" :key="a.id" :value="a.id">
                      {{ a.code }} - {{ a.name_ar }}
                    </option>
                  </select>
                </td>
                <td>
                  <input
                    v-model.number="line.debit"
                    type="number"
                    step="0.01"
                    min="0"
                    class="field-like num-cell"
                    placeholder="0.00"
                    @input="onDebitInput(line)"
                  />
                </td>
                <td>
                  <input
                    v-model.number="line.credit"
                    type="number"
                    step="0.01"
                    min="0"
                    class="field-like num-cell"
                    placeholder="0.00"
                    @input="onCreditInput(line)"
                  />
                </td>
                <td>
                  <input
                    v-model="line.description"
                    type="text"
                    class="field-like"
                    placeholder="شرح خاص بهذا الطرف..."
                  />
                </td>
                <td>
                  <button
                    type="button"
                    class="icon-btn danger"
                    :disabled="entryForm.lines.length <= 2"
                    @click="removeEntryLine(idx)"
                    title="حذف السطر"
                  >
                    <AppIcon name="delete" :size="16" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="mt-2">
            <button type="button" class="btn btn-secondary btn-sm" @click="addEntryLine">
              <AppIcon name="plus" :size="14" />
              <span>إضافة طرف آخر للقيد</span>
            </button>
          </div>
        </div>

        <div class="form-actions-row">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="!isEntryBalanced || entryDebitSum <= 0 || entrySubmitting"
          >
            {{ entrySubmitting ? 'جاري الترحيل...' : 'ترحيل القيد رسمياً إلى دفتر الأستاذ' }}
          </button>
          <span v-if="!isEntryBalanced" class="validation-warning text-danger">
            ⚠️ لا يمكن الترحيل إلا إذا كان إجمالي المدين مساوياً تماماً لإجمالي الدائن (الفارق 0.00)
          </span>
        </div>
      </form>
    </div>

    <!-- =========================================================================
         6. BANK & TREASURY RECONCILIATION (مطابقة وتسوية البنك والخزينة)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'reconciliation'" class="card">
      <!-- Session List View -->
      <template v-if="!selectedRec">
        <div class="card-header-row">
          <div>
            <h3>مطابقة وتسوية الحسابات البنكية والخزينة</h3>
            <p class="text-muted">
              مطابقة كشوف حسابات البنوك والخزينة مع رصيد دفتر الأستاذ العام وتوثيق الفروقات
            </p>
          </div>
          <div>
            <button type="button" class="btn btn-primary" @click="openNewRecModal">
              <AppIcon name="plus" :size="16" />
              <span>تسجيل جلسة مطابقة وتسوية</span>
            </button>
          </div>
        </div>

        <div class="table-container">
          <table class="items-table">
            <thead>
              <tr>
                <th>رقم التسوية</th>
                <th>الحساب</th>
                <th>تاريخ الكشف</th>
                <th>رصيد الكشف البنكي</th>
                <th>رصيد دفتر الأستاذ</th>
                <th>الفارق</th>
                <th>القائم بالمطابقة</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="reconciliationsList.length === 0">
                <td colspan="9" class="text-center py-4 text-muted">
                  لا توجد جلسات مطابقة سابقة مسجلة. اضغط "تسجيل جلسة مطابقة وتسوية" للبدء.
                </td>
              </tr>
              <tr v-for="rec in reconciliationsList" :key="rec.id">
                <td>
                  <strong>{{ rec.reconciliation_number }}</strong>
                </td>
                <td>{{ rec.account_code }} - {{ rec.account_name }}</td>
                <td>{{ rec.statement_date }}</td>
                <td class="num-cell">{{ formatMoney(rec.statement_balance) }}</td>
                <td class="num-cell">{{ formatMoney(rec.ledger_balance) }}</td>
                <td class="num-cell">
                  <span
                    class="badge"
                    :class="
                      Math.abs(rec.difference) <= 0.01 ? 'bg-success-light' : 'bg-warning-light'
                    "
                  >
                    {{ formatMoney(rec.difference) }}
                    <span v-if="Math.abs(rec.difference) <= 0.01"> ✓ مطابق</span>
                  </span>
                </td>
                <td>{{ rec.reconciled_by_name || '—' }}</td>
                <td>
                  <span
                    class="type-pill"
                    :class="rec.status === 'completed' ? 'revenue' : 'liability'"
                  >
                    {{ rec.status === 'completed' ? 'مكتملة ومطابقة' : 'مسودة قيد المطابقة' }}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="viewRecDetails(rec)"
                  >
                    عرض الحركات والمطابقة
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Selected Session Details & Statement Matching View -->
      <template v-else>
        <div class="card-header-row">
          <div>
            <button type="button" class="btn btn-secondary btn-sm mb-2" @click="backToRecList">
              ← العودة لقائمة جلسات التسوية
            </button>
            <h3>جلسة مطابقة: {{ selectedRec.reconciliation_number }}</h3>
            <p class="text-muted">
              {{ selectedRec.account_code }} - {{ selectedRec.account_name }} | تاريخ الكشف:
              {{ selectedRec.statement_date }}
            </p>
          </div>
          <div class="action-buttons-group">
            <input
              ref="statementFileInput"
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              style="display: none"
              @change="onStatementFileSelected"
            />
            <button
              v-if="selectedRec.status === 'draft'"
              type="button"
              class="btn btn-secondary"
              :disabled="uploadingStatement"
              @click="statementFileInput?.click()"
            >
              <AppIcon name="receipt" :size="16" />
              <span>{{
                uploadingStatement ? 'جاري الرفع...' : 'استيراد كشف حساب (CSV/Excel)'
              }}</span>
            </button>
            <button
              v-if="selectedRec.status === 'draft'"
              type="button"
              class="btn btn-primary"
              :disabled="autoMatching || statementTransactions.length === 0"
              @click="triggerAutoMatch"
            >
              <AppIcon name="check" :size="16" />
              <span>{{ autoMatching ? 'جاري المطابقة...' : 'المطابقة الآلية الذكية' }}</span>
            </button>
            <button
              v-if="selectedRec.status === 'draft'"
              type="button"
              class="btn btn-success"
              :disabled="Math.abs(selectedRec.difference) > 0.01 || finalizingRec"
              @click="finalizeRec"
            >
              <AppIcon name="check" :size="16" />
              <span>{{ finalizingRec ? 'جاري الاعتماد...' : 'اعتماد وإقفال المطابقة' }}</span>
            </button>
          </div>
        </div>

        <!-- Session KPI Strip -->
        <div class="kpi-grid kpi-grid-4 mb-4">
          <div class="kpi-card">
            <div class="kpi-body">
              <div class="kpi-label">رصيد الكشف البنكي</div>
              <div class="kpi-value text-primary">
                {{ formatMoney(selectedRec.statement_balance) }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-body">
              <div class="kpi-label">رصيد دفتر الأستاذ (GL)</div>
              <div class="kpi-value text-primary">
                {{ formatMoney(selectedRec.ledger_balance) }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-body">
              <div class="kpi-label">فارق المطابقة الحالي</div>
              <div
                class="kpi-value"
                :class="Math.abs(selectedRec.difference) <= 0.01 ? 'text-success' : 'text-danger'"
              >
                {{ formatMoney(selectedRec.difference) }}
              </div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-body">
              <div class="kpi-label">حالة الجلسة</div>
              <div class="kpi-value">
                <span
                  class="type-pill"
                  :class="selectedRec.status === 'completed' ? 'revenue' : 'liability'"
                >
                  {{ selectedRec.status === 'completed' ? 'معتمدة ومقفلة' : 'مسودة قيد العمل' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Transactions Table -->
        <div class="table-header-row mb-2">
          <h4>حركات كشف الحساب البنكي ({{ statementTransactions.length }})</h4>
        </div>
        <div class="table-container">
          <table class="items-table">
            <thead>
              <tr>
                <th>تاريخ الحركة</th>
                <th>البيان / الوصف</th>
                <th>المرجع البنكي</th>
                <th>سحب (مدين)</th>
                <th>إيداع (دائن)</th>
                <th>حالة المطابقة</th>
                <th>ملاحظات / قاعدة الربط</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="statementTransactions.length === 0">
                <td colspan="8" class="text-center py-4 text-muted">
                  لم يتم استيراد أي حركات بنكية لهذه الجلسة بعد. اضغط "استيراد كشف حساب" للرفع من
                  ملف CSV أو Excel.
                </td>
              </tr>
              <tr v-for="tx in statementTransactions" :key="tx.id">
                <td>{{ tx.transaction_date ? tx.transaction_date.slice(0, 10) : '—' }}</td>
                <td>
                  <strong>{{ tx.description }}</strong>
                </td>
                <td>
                  <code>{{ tx.reference_number || '—' }}</code>
                </td>
                <td class="num-cell text-danger">
                  {{ tx.debit > 0 ? formatMoney(tx.debit) : '—' }}
                </td>
                <td class="num-cell text-success">
                  {{ tx.credit > 0 ? formatMoney(tx.credit) : '—' }}
                </td>
                <td>
                  <span
                    class="type-pill"
                    :class="
                      tx.status === 'matched'
                        ? 'revenue'
                        : tx.status === 'excluded'
                          ? 'liability'
                          : 'expense'
                    "
                  >
                    {{
                      tx.status === 'matched'
                        ? 'مطابق ✓'
                        : tx.status === 'excluded'
                          ? 'مستبعد'
                          : 'غير مطابق'
                    }}
                  </span>
                </td>
                <td>
                  <span v-if="tx.match_rule" class="text-sm text-muted">
                    {{ tx.match_rule }} (ثقة: {{ Math.round((tx.match_confidence || 0) * 100) }}%)
                  </span>
                  <span v-else class="text-sm text-muted">{{ tx.notes || '—' }}</span>
                </td>
                <td>
                  <div v-if="selectedRec.status === 'draft'" class="action-buttons-group">
                    <button
                      v-if="tx.status === 'matched'"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="unmatchTx(tx.id)"
                      title="إلغاء مطابقة الحركة"
                    >
                      إلغاء الربط
                    </button>
                    <button
                      v-if="tx.status === 'unmatched'"
                      type="button"
                      class="btn btn-secondary btn-sm text-danger"
                      @click="excludeTx(tx.id)"
                      title="استبعاد الحركة من المطابقة"
                    >
                      استبعاد
                    </button>
                  </div>
                  <span v-else class="text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- =========================================================================
         7. CUSTOMER & SUPPLIER AGING (أعمار الديون والمديونيات)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'aging'" class="card">
      <div class="card-header-row">
        <div>
          <h3>تحليل أعمار الديون والمديونيات (Aging Analysis)</h3>
          <p class="text-muted">
            مراقبة تواريخ استحقاق المديونيات وحساب فترات التأخير (0-30، 31-60، 61-90، +90 يوماً)
          </p>
        </div>
        <div class="aging-toggle-tabs">
          <button
            type="button"
            class="btn btn-sm"
            :class="agingActiveTab === 'customers' ? 'btn-primary' : 'btn-secondary'"
            @click="switchAgingTab('customers')"
          >
            مديونيات العملاء
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="agingActiveTab === 'suppliers' ? 'btn-primary' : 'btn-secondary'"
            @click="switchAgingTab('suppliers')"
          >
            مستحقات الموردين
          </button>
        </div>
      </div>

      <!-- Subledger vs Control Account GL Reconciliation Banner -->
      <div
        v-if="agingRecData"
        class="gl-reconcile-banner card mb-4"
        :class="agingRecData.is_all_reconciled ? 'reconciled' : 'unreconciled'"
      >
        <div class="banner-header">
          <div class="banner-title">
            <span class="status-dot"></span>
            <strong>{{
              agingRecData.is_all_reconciled
                ? 'مطابقة تامة وموثقة مع حسابات المراقبة بالأستاذ العام (Zero Discrepancy)'
                : 'تنبيه: يوجد فارق بين مديونيات العمليات وحساب الأستاذ العام!'
            }}</strong>
          </div>
          <span class="text-sm text-muted">تاريخ التدقيق: {{ agingRecData.as_of_date }}</span>
        </div>
        <div class="banner-details-grid">
          <div class="banner-item">
            <span class="item-label">مديونيات العملاء:</span>
            <span class="item-val font-bold">{{
              formatMoney(agingRecData.customers.subledger_total)
            }}</span>
            <span class="item-sep">vs</span>
            <span class="item-label">حساب المراقبة (1102):</span>
            <span class="item-val font-bold">{{
              formatMoney(agingRecData.customers.control_account_balance)
            }}</span>
            <span
              class="badge"
              :class="agingRecData.customers.is_reconciled ? 'bg-success-light' : 'bg-danger-light'"
            >
              الفارق: {{ formatMoney(agingRecData.customers.variance) }}
            </span>
          </div>
          <div class="banner-item">
            <span class="item-label">مستحقات الموردين:</span>
            <span class="item-val font-bold">{{
              formatMoney(agingRecData.suppliers.subledger_total)
            }}</span>
            <span class="item-sep">vs</span>
            <span class="item-label">حساب المراقبة (2101):</span>
            <span class="item-val font-bold">{{
              formatMoney(agingRecData.suppliers.control_account_balance)
            }}</span>
            <span
              class="badge"
              :class="agingRecData.suppliers.is_reconciled ? 'bg-success-light' : 'bg-danger-light'"
            >
              الفارق: {{ formatMoney(agingRecData.suppliers.variance) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Aging KPI strip -->
      <div class="kpi-grid kpi-grid-5 mb-4">
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">جاري (0 - 30 يوم)</div>
            <div class="kpi-value text-success">
              {{ formatMoney(currentAgingTotals?.current_0_30 || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">مستحق (31 - 60 يوم)</div>
            <div class="kpi-value text-primary">
              {{ formatMoney(currentAgingTotals?.days_31_60 || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">متأخر (61 - 90 يوم)</div>
            <div class="kpi-value text-warning">
              {{ formatMoney(currentAgingTotals?.days_61_90 || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">حرج (+90 يوم)</div>
            <div class="kpi-value text-danger font-bold">
              {{ formatMoney(currentAgingTotals?.over_90 || 0) }}
            </div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-body">
            <div class="kpi-label">إجمالي الرصيد القائم</div>
            <div class="kpi-value text-main font-bold">
              {{ formatMoney(currentAgingTotals?.total_due || 0) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Aging Table -->
      <div class="table-container">
        <table class="items-table">
          <thead>
            <tr>
              <th>{{ agingActiveTab === 'customers' ? 'العميل' : 'المورد' }}</th>
              <th>الهاتف</th>
              <th>عدد الفواتير</th>
              <th>0 - 30 يوم</th>
              <th>31 - 60 يوم</th>
              <th>61 - 90 يوم</th>
              <th>+90 يوم</th>
              <th>إجمالي المستحق</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="currentAgingRows.length === 0">
              <td colspan="8" class="text-center py-4 text-muted">
                لا توجد أرصدة آجلة مستحقة في هذه الفئة.
              </td>
            </tr>
            <tr v-for="r in currentAgingRows" :key="r.id">
              <td>
                <strong>{{ r.name }}</strong>
              </td>
              <td>{{ r.phone || '—' }}</td>
              <td>{{ r.invoices_count }}</td>
              <td class="num-cell">{{ formatMoney(r.current_0_30) }}</td>
              <td class="num-cell">{{ formatMoney(r.days_31_60) }}</td>
              <td class="num-cell">{{ formatMoney(r.days_61_90) }}</td>
              <td class="num-cell text-danger font-bold">{{ formatMoney(r.over_90) }}</td>
              <td class="num-cell font-bold">{{ formatMoney(r.total_due) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="summary-footer-row">
              <td colspan="3">الإجمالي العام</td>
              <td class="num-cell">{{ formatMoney(currentAgingTotals?.current_0_30 || 0) }}</td>
              <td class="num-cell">{{ formatMoney(currentAgingTotals?.days_31_60 || 0) }}</td>
              <td class="num-cell">{{ formatMoney(currentAgingTotals?.days_61_90 || 0) }}</td>
              <td class="num-cell text-danger">
                {{ formatMoney(currentAgingTotals?.over_90 || 0) }}
              </td>
              <td class="num-cell text-primary font-bold">
                {{ formatMoney(currentAgingTotals?.total_due || 0) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         8. P&L TO GL RECONCILIATION PROOF (مطابقة الأرباح مع الأستاذ العام)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'proof'" class="card">
      <div class="card-header-row">
        <div>
          <h3>مطابقة قائمة الدخل التشغيلية مع دفتر الأستاذ العام</h3>
          <p class="text-muted">
            التحقق الرياضي الصارم من تطابق أرقام المبيعات والمصروفات والأرباح التشغيلية مع القيود
            المرحلة في دفتر الأستاذ
          </p>
        </div>
        <div
          class="balance-status-badge"
          :class="ledgerProofData?.variances.is_fully_reconciled ? 'balanced' : 'imbalanced'"
        >
          <span class="status-dot"></span>
          <span>{{
            ledgerProofData?.variances.is_fully_reconciled
              ? 'تطابق تام وموثق مع دفتر الأستاذ (Zero Variance)'
              : 'تنبيه: يوجد فارق بين السجلات التشغيلية ودفتر الأستاذ'
          }}</span>
        </div>
      </div>

      <div class="table-container">
        <table class="items-table">
          <thead>
            <tr>
              <th>البند المالي</th>
              <th>الرصيد في دفتر الأستاذ (GL)</th>
              <th>الرصيد التشغيلي (Operations)</th>
              <th>الفارق (Variance)</th>
              <th>حالة المطابقة</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>إجمالي الإيرادات (Revenue)</strong></td>
              <td class="num-cell">
                {{ formatMoney(ledgerProofData?.general_ledger.revenue || 0) }}
              </td>
              <td class="num-cell">{{ formatMoney(ledgerProofData?.operational.revenue || 0) }}</td>
              <td class="num-cell">{{ formatMoney(ledgerProofData?.variances.revenue || 0) }}</td>
              <td>
                <span
                  class="badge"
                  :class="
                    (ledgerProofData?.variances.revenue || 0) <= 0.05
                      ? 'bg-success-light'
                      : 'bg-warning-light'
                  "
                >
                  {{ (ledgerProofData?.variances.revenue || 0) <= 0.05 ? '✓ مطابق' : 'فارق' }}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>تكلفة البضاعة المباعة (COGS)</strong></td>
              <td class="num-cell">{{ formatMoney(ledgerProofData?.general_ledger.cogs || 0) }}</td>
              <td class="num-cell">{{ formatMoney(ledgerProofData?.operational.cogs || 0) }}</td>
              <td class="num-cell">{{ formatMoney(ledgerProofData?.variances.cogs || 0) }}</td>
              <td>
                <span
                  class="badge"
                  :class="
                    (ledgerProofData?.variances.cogs || 0) <= 0.05
                      ? 'bg-success-light'
                      : 'bg-warning-light'
                  "
                >
                  {{ (ledgerProofData?.variances.cogs || 0) <= 0.05 ? '✓ مطابق' : 'فارق' }}
                </span>
              </td>
            </tr>
            <tr>
              <td><strong>المصروفات التشغيلية (Operating Expenses)</strong></td>
              <td class="num-cell">
                {{ formatMoney(ledgerProofData?.general_ledger.expenses || 0) }}
              </td>
              <td class="num-cell">
                {{ formatMoney(ledgerProofData?.operational.expenses || 0) }}
              </td>
              <td class="num-cell">{{ formatMoney(ledgerProofData?.variances.expenses || 0) }}</td>
              <td>
                <span
                  class="badge"
                  :class="
                    (ledgerProofData?.variances.expenses || 0) <= 0.05
                      ? 'bg-success-light'
                      : 'bg-warning-light'
                  "
                >
                  {{ (ledgerProofData?.variances.expenses || 0) <= 0.05 ? '✓ مطابق' : 'فارق' }}
                </span>
              </td>
            </tr>
            <tr class="summary-footer-row">
              <td><strong>صافي الربح المحقق (Net Profit)</strong></td>
              <td class="num-cell font-bold text-primary">
                {{ formatMoney(ledgerProofData?.general_ledger.net_profit || 0) }}
              </td>
              <td class="num-cell font-bold text-primary">
                {{ formatMoney(ledgerProofData?.operational.net_profit || 0) }}
              </td>
              <td class="num-cell font-bold">
                {{ formatMoney(ledgerProofData?.variances.net_profit || 0) }}
              </td>
              <td>
                <span
                  class="badge"
                  :class="
                    (ledgerProofData?.variances.net_profit || 0) <= 0.05
                      ? 'bg-success-light'
                      : 'bg-danger-light'
                  "
                >
                  {{
                    (ledgerProofData?.variances.net_profit || 0) <= 0.05
                      ? '✓ تطابق تام'
                      : 'غير متطابق'
                  }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- =========================================================================
         9. FINANCIAL PERIODS (الفترات المحاسبية وإقفال الحسابات)
         ========================================================================= -->
    <div v-if="!loading && subTab === 'periods'" class="card">
      <div class="card-header-row">
        <div>
          <h3>الفترات المحاسبية وإقفال الحسابات (Financial Periods)</h3>
          <p class="text-muted">
            إدارة الفترات المالية وتدقيق الاشتراطات المحاسبية قبل الإقفال النهائي وحماية السجلات من
            التعديل
          </p>
        </div>
        <div>
          <button type="button" class="btn btn-primary" @click="showNewPeriodModal = true">
            <AppIcon name="plus" :size="16" />
            <span>إنشاء فترة مالية جديدة</span>
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="items-table">
          <thead>
            <tr>
              <th>كود الفترة</th>
              <th>اسم الفترة</th>
              <th>السنة المالية</th>
              <th>تاريخ البدء</th>
              <th>تاريخ الانتهاء</th>
              <th>الحالة</th>
              <th>تاريخ الإقفال</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="periodsList.length === 0">
              <td colspan="8" class="text-center py-4 text-muted">
                لا توجد فترات مالية مسجلة حالياً. اضغط "إنشاء فترة مالية جديدة" للبدء.
              </td>
            </tr>
            <tr v-for="p in periodsList" :key="p.id">
              <td>
                <code>{{ p.period_code }}</code>
              </td>
              <td>
                <strong>{{ p.period_name }}</strong>
              </td>
              <td>{{ p.fiscal_year }}</td>
              <td>{{ p.start_date }}</td>
              <td>{{ p.end_date }}</td>
              <td>
                <span class="type-pill" :class="p.status === 'open' ? 'revenue' : 'liability'">
                  {{
                    p.status === 'open'
                      ? 'مفتوحة (Open)'
                      : p.status === 'closed'
                        ? 'مقفلة (Closed)'
                        : 'مغلقة تماماً (Locked)'
                  }}
                </span>
              </td>
              <td>{{ p.closed_at ? p.closed_at.slice(0, 10) : '—' }}</td>
              <td>
                <div class="action-buttons-group">
                  <button type="button" class="btn btn-secondary btn-sm" @click="openChecklist(p)">
                    قائمة التدقيق
                  </button>
                  <button
                    v-if="p.status === 'open'"
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="openChecklist(p)"
                  >
                    إقفال
                  </button>
                  <button
                    v-if="p.status === 'closed'"
                    type="button"
                    class="btn btn-warning btn-sm"
                    @click="openReopenModal(p)"
                  >
                    إعادة فتح
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: إضافة حساب جديد في شجرة الحسابات -->
    <Teleport to="body">
      <div
        v-if="showNewAccountModal"
        class="modal-overlay"
        @click.self="showNewAccountModal = false"
      >
        <div class="modal-card card">
          <div class="modal-header">
            <h3>إضافة حساب محاسبي جديد</h3>
            <button type="button" class="icon-btn" @click="showNewAccountModal = false">✕</button>
          </div>
          <form @submit.prevent="submitCreateAccount">
            <div class="form-group mb-3">
              <label>الحساب الرئيسي (الأب)</label>
              <select
                v-model.number="newAccountForm.parent_id"
                class="field-like"
                @change="onParentAccountChange"
              >
                <option :value="null">— حساب رئيسي رتبة 1 —</option>
                <option v-for="a in accountsList" :key="a.id" :value="a.id">
                  {{ a.code }} - {{ a.name_ar }} ({{ formatAccountType(a.account_type) }})
                </option>
              </select>
            </div>
            <div class="grid grid-2 mb-3">
              <div class="form-group">
                <label>كود الحساب (فريد)</label>
                <input
                  v-model="newAccountForm.code"
                  type="text"
                  class="field-like"
                  placeholder="مثال: 110105"
                  required
                />
              </div>
              <div class="form-group">
                <label>نوع الحساب</label>
                <select v-model="newAccountForm.account_type" class="field-like" required>
                  <option value="asset">أصل (Asset)</option>
                  <option value="liability">التزام (Liability)</option>
                  <option value="equity">حقوق ملكية (Equity)</option>
                  <option value="revenue">إيراد (Revenue)</option>
                  <option value="expense">مصروف (Expense)</option>
                </select>
              </div>
            </div>
            <div class="grid grid-2 mb-3">
              <div class="form-group">
                <label>اسم الحساب بالعربية</label>
                <input
                  v-model="newAccountForm.name_ar"
                  type="text"
                  class="field-like"
                  placeholder="اسم الحساب..."
                  required
                />
              </div>
              <div class="form-group">
                <label>اسم الحساب بالإنجليزية</label>
                <input
                  v-model="newAccountForm.name_en"
                  type="text"
                  class="field-like"
                  placeholder="Account name..."
                />
              </div>
            </div>
            <div class="form-actions-row">
              <button type="submit" class="btn btn-primary" :disabled="accountSubmitting">
                {{ accountSubmitting ? 'جاري الحفظ...' : 'حفظ وإضافة الحساب' }}
              </button>
              <button type="button" class="btn btn-secondary" @click="showNewAccountModal = false">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal: تسجيل جلسة مطابقة وتسوية جديدة -->
    <Teleport to="body">
      <div v-if="showNewRecModal" class="modal-overlay" @click.self="showNewRecModal = false">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>تسجيل مطابقة وتسوية بنكية / خزينة</h3>
            <button type="button" class="icon-btn" @click="showNewRecModal = false">✕</button>
          </div>
          <form @submit.prevent="submitCreateReconciliation">
            <div class="form-group mb-3">
              <label>الحساب المراد مطابقته (بنك أو خزينة)</label>
              <select v-model.number="newRecForm.account_id" class="field-like" required>
                <option :value="undefined">— اختر الحساب —</option>
                <option
                  v-for="a in accountsList.filter((acc) => acc.account_type === 'asset')"
                  :key="a.id"
                  :value="a.id"
                >
                  {{ a.code }} - {{ a.name_ar }}
                </option>
              </select>
            </div>
            <div class="grid grid-2 mb-3">
              <div class="form-group">
                <label>تاريخ كشف الحساب</label>
                <input
                  v-model="newRecForm.statement_date"
                  type="date"
                  class="field-like"
                  required
                />
              </div>
              <div class="form-group">
                <label>الرصيد الفعلي في الكشف (Statement Balance)</label>
                <input
                  v-model.number="newRecForm.statement_balance"
                  type="number"
                  step="0.01"
                  class="field-like num-cell"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div class="form-group mb-3">
              <label>ملاحظات التسوية</label>
              <textarea
                v-model="newRecForm.notes"
                class="field-like"
                rows="2"
                placeholder="ملاحظات توضيحية حول التسوية أو الفروقات..."
              ></textarea>
            </div>
            <div class="form-actions-row">
              <button type="submit" class="btn btn-primary" :disabled="recSubmitting">
                {{ recSubmitting ? 'جاري الحفظ...' : 'حفظ واحتساب المطابقة' }}
              </button>
              <button type="button" class="btn btn-secondary" @click="showNewRecModal = false">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal: قائمة تدقيق إقفال الفترة (Period Checklist Modal) -->
    <Teleport to="body">
      <div v-if="showChecklistModal" class="modal-overlay" @click.self="showChecklistModal = false">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>قائمة تدقيق إقفال الفترة: {{ selectedPeriod?.period_name }}</h3>
            <button type="button" class="icon-btn" @click="showChecklistModal = false">✕</button>
          </div>
          <div v-if="!periodChecklist" class="py-4 text-center">
            ⏳ جاري فحص وتدقيق الاشتراطات...
          </div>
          <div v-else class="checklist-body">
            <div
              class="balance-status-badge mb-4"
              :class="periodChecklist.is_ready_to_close ? 'balanced' : 'imbalanced'"
            >
              <span class="status-dot"></span>
              <span>
                {{
                  periodChecklist.is_ready_to_close
                    ? 'الفترة مستوفية لكافة الشروط وجاهزة للإقفال التام'
                    : 'يوجد موانع تمنع الإقفال أو تتطلب مراجعة'
                }}
              </span>
            </div>

            <ul class="checklist-items-list mb-4">
              <li
                :class="
                  periodChecklist.checks.unbalanced_journal_entries.passed
                    ? 'check-pass'
                    : 'check-fail'
                "
              >
                <span class="check-icon">{{
                  periodChecklist.checks.unbalanced_journal_entries.passed ? '✓' : '✗'
                }}</span>
                <span
                  >توازن كافة قيود اليومية (قيود غير متوازنة:
                  {{ periodChecklist.checks.unbalanced_journal_entries.count }})</span
                >
              </li>
              <li
                :class="
                  periodChecklist.checks.draft_journal_entries.passed ? 'check-pass' : 'check-fail'
                "
              >
                <span class="check-icon">{{
                  periodChecklist.checks.draft_journal_entries.passed ? '✓' : '✗'
                }}</span>
                <span
                  >عدم وجود مسودات قيود معلقة (قيود مسودة:
                  {{ periodChecklist.checks.draft_journal_entries.count }})</span
                >
              </li>
              <li
                :class="
                  periodChecklist.checks.unreconciled_bank_sessions.passed
                    ? 'check-pass'
                    : 'check-fail'
                "
              >
                <span class="check-icon">{{
                  periodChecklist.checks.unreconciled_bank_sessions.passed ? '✓' : '✗'
                }}</span>
                <span
                  >إتمام كافة جلسات المطابقة البنكية (جلسات غير معتمدة:
                  {{ periodChecklist.checks.unreconciled_bank_sessions.count }})</span
                >
              </li>
              <li
                :class="
                  periodChecklist.checks.aging_ledger_discrepancies.passed
                    ? 'check-pass'
                    : 'check-fail'
                "
              >
                <span class="check-icon">{{
                  periodChecklist.checks.aging_ledger_discrepancies.passed ? '✓' : '✗'
                }}</span>
                <span>
                  تطابق مديونيات العملاء والموردين مع الأستاذ (فارق عملاء:
                  {{
                    formatMoney(periodChecklist.checks.aging_ledger_discrepancies.customer_variance)
                  }}
                  / موردين:
                  {{
                    formatMoney(
                      periodChecklist.checks.aging_ledger_discrepancies.supplier_variance,
                    )
                  }})
                </span>
              </li>
            </ul>

            <div v-if="periodChecklist.blockers.length > 0" class="blockers-box mb-4">
              <strong>الموانع الحرجة:</strong>
              <ul>
                <li v-for="(b, i) in periodChecklist.blockers" :key="i" class="text-danger">
                  {{ b }}
                </li>
              </ul>
            </div>

            <div class="form-actions-row">
              <button
                v-if="selectedPeriod?.status === 'open'"
                type="button"
                class="btn btn-primary"
                :disabled="closingPeriod || !periodChecklist.is_ready_to_close"
                @click="closePeriodNow"
              >
                {{
                  closingPeriod ? 'جاري الإقفال وتفعيل القفل...' : 'إقفال الفترة المحاسبية نهائياً'
                }}
              </button>
              <button type="button" class="btn btn-secondary" @click="showChecklistModal = false">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Modal: إعادة فتح فترة مقفلة -->
    <Teleport to="body">
      <div v-if="showReopenModal" class="modal-overlay" @click.self="showReopenModal = false">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>إعادة فتح الفترة المحاسبية: {{ selectedPeriod?.period_name }}</h3>
            <button type="button" class="icon-btn" @click="showReopenModal = false">✕</button>
          </div>
          <form @submit.prevent="confirmReopenPeriod">
            <p class="text-muted mb-3">
              إعادة فتح الفترة سيتيح للمستخدمين المصرح لهم تعديل وإدخال قيود محاسبية ضمن تواريخها
              مرة أخرى. يتطلب ذلك تسجيلاً إدارياً للسبب.
            </p>
            <div class="form-group mb-3">
              <label>سبب إعادة الفتح (إلزامي للتدقيق المالي)</label>
              <textarea
                v-model="reopenReason"
                class="field-like"
                rows="3"
                placeholder="أدخل سبب إعادة فتح الفترة بالتفصيل..."
                required
              ></textarea>
            </div>
            <div class="form-actions-row">
              <button type="submit" class="btn btn-warning" :disabled="periodSubmitting">
                {{ periodSubmitting ? 'جاري التنفيذ...' : 'تأكيد إعادة فتح الفترة' }}
              </button>
              <button type="button" class="btn btn-secondary" @click="showReopenModal = false">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal: إنشاء فترة محاسبية جديدة -->
    <Teleport to="body">
      <div v-if="showNewPeriodModal" class="modal-overlay" @click.self="showNewPeriodModal = false">
        <div class="modal-card card">
          <div class="modal-header">
            <h3>إنشاء فترة محاسبية جديدة</h3>
            <button type="button" class="icon-btn" @click="showNewPeriodModal = false">✕</button>
          </div>
          <form @submit.prevent="submitCreatePeriod">
            <div class="grid grid-2 mb-3">
              <div class="form-group">
                <label>كود الفترة (فريد)</label>
                <input
                  v-model="newPeriodForm.period_code"
                  type="text"
                  class="field-like"
                  placeholder="مثال: 2026-M09 أو 2026-Q3"
                  required
                />
              </div>
              <div class="form-group">
                <label>السنة المالية</label>
                <input
                  v-model.number="newPeriodForm.fiscal_year"
                  type="number"
                  class="field-like num-cell"
                  required
                />
              </div>
            </div>
            <div class="form-group mb-3">
              <label>اسم الفترة بالعربية</label>
              <input
                v-model="newPeriodForm.period_name"
                type="text"
                class="field-like"
                placeholder="مثال: شهر سبتمبر 2026"
                required
              />
            </div>
            <div class="grid grid-2 mb-3">
              <div class="form-group">
                <label>تاريخ بداية الفترة</label>
                <input v-model="newPeriodForm.start_date" type="date" class="field-like" required />
              </div>
              <div class="form-group">
                <label>تاريخ نهاية الفترة</label>
                <input v-model="newPeriodForm.end_date" type="date" class="field-like" required />
              </div>
            </div>
            <div class="form-actions-row">
              <button type="submit" class="btn btn-primary" :disabled="periodSubmitting">
                {{ periodSubmitting ? 'جاري الحفظ...' : 'إنشاء الفترة' }}
              </button>
              <button type="button" class="btn btn-secondary" @click="showNewPeriodModal = false">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  accountingApi,
  type AccountItem,
  type TrialBalanceResponse,
  type GeneralLedgerResponse,
  type BalanceSheetResponse,
  type BankReconciliation,
  type CustomerAgingResponse,
  type SupplierAgingResponse,
  type LedgerReconciliationSummary,
  type BankStatementTransaction,
  type AgingReconciliationResponse,
  type FinancialPeriod,
  type PeriodChecklistResponse,
} from '@/api';
import { formatMoney } from '@/utils/formatters';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  fromDate?: string;
  toDate?: string;
}>();

const subTab = ref<
  | 'trial_balance'
  | 'general_ledger'
  | 'balance_sheet'
  | 'coa'
  | 'new_entry'
  | 'reconciliation'
  | 'aging'
  | 'proof'
  | 'periods'
>('trial_balance');
const loading = ref(false);
const error = ref<string | null>(null);

// Data containers
const trialBalanceData = ref<TrialBalanceResponse | null>(null);
const generalLedgerData = ref<GeneralLedgerResponse | null>(null);
const balanceSheetData = ref<BalanceSheetResponse | null>(null);
const accountsList = ref<AccountItem[]>([]);

// Reconciliation Data
const reconciliationsList = ref<BankReconciliation[]>([]);
const selectedRec = ref<BankReconciliation | null>(null);
const statementTransactions = ref<BankStatementTransaction[]>([]);
const statementFileInput = ref<HTMLInputElement | null>(null);
const uploadingStatement = ref(false);
const autoMatching = ref(false);
const finalizingRec = ref(false);
const showNewRecModal = ref(false);
const recSubmitting = ref(false);
const newRecForm = ref({
  account_id: undefined as number | undefined,
  statement_date: new Date().toISOString().slice(0, 10),
  statement_balance: 0,
  notes: '',
});

// Aging Data & GL Reconciliation
const customerAgingData = ref<CustomerAgingResponse | null>(null);
const supplierAgingData = ref<SupplierAgingResponse | null>(null);
const agingRecData = ref<AgingReconciliationResponse | null>(null);
const agingActiveTab = ref<'customers' | 'suppliers'>('customers');

// Financial Periods Data
const periodsList = ref<FinancialPeriod[]>([]);
const selectedPeriod = ref<FinancialPeriod | null>(null);
const periodChecklist = ref<PeriodChecklistResponse | null>(null);
const showChecklistModal = ref(false);
const showNewPeriodModal = ref(false);
const showReopenModal = ref(false);
const reopenReason = ref('');
const closingPeriod = ref(false);
const periodSubmitting = ref(false);
const newPeriodForm = ref({
  period_name: '',
  period_code: '',
  start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10),
  end_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10),
  fiscal_year: new Date().getFullYear(),
});

// Ledger Proof Data
const ledgerProofData = ref<LedgerReconciliationSummary | null>(null);

// Filters and selections
const tbSearch = ref('');
const glSelectedCode = ref('1101');

// Form for manual journal entry
const entrySubmitting = ref(false);
const entryForm = ref({
  entry_date: new Date().toISOString().slice(0, 10),
  description: '',
  lines: [
    { account_id: undefined as number | undefined, debit: 0, credit: 0, description: '' },
    { account_id: undefined as number | undefined, debit: 0, credit: 0, description: '' },
  ],
});

// Modal for creating new account
const showNewAccountModal = ref(false);
const accountSubmitting = ref(false);
const newAccountForm = ref({
  code: '',
  name_ar: '',
  name_en: '',
  account_type: 'asset' as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
  parent_id: null as number | null,
});

// Computed values for manual journal entry balancing
const entryDebitSum = computed(() => {
  return entryForm.value.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
});

const entryCreditSum = computed(() => {
  return entryForm.value.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
});

const entryDiff = computed(() => {
  return Math.abs(entryDebitSum.value - entryCreditSum.value);
});

const isEntryBalanced = computed(() => {
  return entryDebitSum.value > 0 && entryDiff.value <= 0.01;
});

// Filtered rows in Trial Balance
const filteredTbRows = computed(() => {
  if (!trialBalanceData.value?.accounts) return [];
  const q = tbSearch.value.trim().toLowerCase();
  if (!q) return trialBalanceData.value.accounts;
  return trialBalanceData.value.accounts.filter(
    (a) => a.code.toLowerCase().includes(q) || a.name_ar.toLowerCase().includes(q),
  );
});

const switchSubTab = async (tab: typeof subTab.value) => {
  subTab.value = tab;
  await loadCurrentSubTab();
};

const formatAccountType = (type?: string) => {
  switch (type) {
    case 'asset':
      return 'أصل (Asset)';
    case 'liability':
      return 'التزام (Liability)';
    case 'equity':
      return 'حقوق ملكية (Equity)';
    case 'revenue':
      return 'إيرادات (Revenue)';
    case 'expense':
      return 'مصروفات (Expense)';
    default:
      return type || '—';
  }
};

const drillDownToGL = (accountCode: string) => {
  glSelectedCode.value = accountCode;
  switchSubTab('general_ledger');
};

const onDebitInput = (line: { debit: number; credit: number }) => {
  if (line.debit > 0) line.credit = 0;
};

const onCreditInput = (line: { debit: number; credit: number }) => {
  if (line.credit > 0) line.debit = 0;
};

const addEntryLine = () => {
  entryForm.value.lines.push({
    account_id: undefined,
    debit: 0,
    credit: 0,
    description: '',
  });
};

const removeEntryLine = (idx: number) => {
  if (entryForm.value.lines.length > 2) {
    entryForm.value.lines.splice(idx, 1);
  }
};

const loadAccounts = async () => {
  try {
    const res = await accountingApi.getAccounts();
    if (res.data) accountsList.value = res.data;
  } catch (err: any) {
    console.error('Failed to load accounts list', err);
  }
};

const loadTrialBalance = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await accountingApi.getTrialBalance({
      from_date: props.fromDate,
      to_date: props.toDate,
    });
    if (res.data) trialBalanceData.value = res.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل ميزان المراجعة';
  } finally {
    loading.value = false;
  }
};

const loadGeneralLedger = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await accountingApi.getGeneralLedger({
      account_code: glSelectedCode.value,
      from_date: props.fromDate,
      to_date: props.toDate,
    });
    if (res.data) generalLedgerData.value = res.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل دفتر الأستاذ';
  } finally {
    loading.value = false;
  }
};

const loadBalanceSheet = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await accountingApi.getBalanceSheet(props.toDate);
    if (res.data) balanceSheetData.value = res.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل الميزانية العمومية';
  } finally {
    loading.value = false;
  }
};

// Computed for Aging
const currentAgingTotals = computed(() => {
  if (agingActiveTab.value === 'customers') {
    return customerAgingData.value?.totals;
  }
  return supplierAgingData.value?.totals;
});

const currentAgingRows = computed(() => {
  if (agingActiveTab.value === 'customers') {
    return (customerAgingData.value?.customers || []).map((c) => ({
      id: c.customer_id,
      name: c.customer_name,
      phone: c.customer_phone,
      invoices_count: c.invoices_count,
      current_0_30: c.current_0_30,
      days_31_60: c.days_31_60,
      days_61_90: c.days_61_90,
      over_90: c.over_90,
      total_due: c.total_due,
    }));
  }
  return (supplierAgingData.value?.suppliers || []).map((s) => ({
    id: s.supplier_id,
    name: s.supplier_name,
    phone: s.supplier_phone,
    invoices_count: s.invoices_count,
    current_0_30: s.current_0_30,
    days_31_60: s.days_31_60,
    days_61_90: s.days_61_90,
    over_90: s.over_90,
    total_due: s.total_due,
  }));
});

const switchAgingTab = async (tab: 'customers' | 'suppliers') => {
  agingActiveTab.value = tab;
  await loadAgingData();
};

const loadReconciliations = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await accountingApi.getReconciliations();
    if (res.data) reconciliationsList.value = res.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل بيانات مطابقات البنك';
  } finally {
    loading.value = false;
  }
};

const viewRecDetails = async (rec: BankReconciliation) => {
  selectedRec.value = rec;
  await loadStatementTransactions(rec.id);
};

const backToRecList = () => {
  selectedRec.value = null;
  statementTransactions.value = [];
};

const loadStatementTransactions = async (recId: number) => {
  try {
    const res = await accountingApi.getStatementTransactions(recId);
    if (res.data) statementTransactions.value = res.data;
  } catch (err: any) {
    console.error('Failed to load statement transactions', err);
  }
};

const onStatementFileSelected = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !selectedRec.value) return;

  uploadingStatement.value = true;
  try {
    const res = await accountingApi.importBankStatement(selectedRec.value.id, file);
    alert(`تم استيراد ${res.data?.imported_count || 0} حركة بنكية بنجاح`);
    await loadStatementTransactions(selectedRec.value.id);
    const updatedRec = await accountingApi.getReconciliationById(selectedRec.value.id);
    if (updatedRec.data) selectedRec.value = updatedRec.data;
    await loadReconciliations();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل استيراد كشف الحساب البنكي');
  } finally {
    uploadingStatement.value = false;
    target.value = '';
  }
};

const triggerAutoMatch = async () => {
  if (!selectedRec.value) return;
  autoMatching.value = true;
  try {
    const res = await accountingApi.autoMatchTransactions(selectedRec.value.id);
    alert(`اكتملت المطابقة: تمت مطابقة ${res.data?.matched_count || 0} حركة`);
    await loadStatementTransactions(selectedRec.value.id);
    const updatedRec = await accountingApi.getReconciliationById(selectedRec.value.id);
    if (updatedRec.data) selectedRec.value = updatedRec.data;
    await loadReconciliations();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل تشغيل المطابقة الآلية');
  } finally {
    autoMatching.value = false;
  }
};

const unmatchTx = async (txId: number) => {
  if (!selectedRec.value) return;
  try {
    await accountingApi.unmatchTransaction(txId);
    await loadStatementTransactions(selectedRec.value.id);
    const updatedRec = await accountingApi.getReconciliationById(selectedRec.value.id);
    if (updatedRec.data) selectedRec.value = updatedRec.data;
    await loadReconciliations();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل إلغاء المطابقة');
  }
};

const excludeTx = async (txId: number) => {
  if (!selectedRec.value) return;
  const reason = prompt('سبب استبعاد الحركة البنكية من المطابقة:');
  if (reason === null) return;
  try {
    await accountingApi.excludeTransaction(txId, reason);
    await loadStatementTransactions(selectedRec.value.id);
    const updatedRec = await accountingApi.getReconciliationById(selectedRec.value.id);
    if (updatedRec.data) selectedRec.value = updatedRec.data;
    await loadReconciliations();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل استبعاد الحركة');
  }
};

const finalizeRec = async () => {
  if (!selectedRec.value) return;
  if (Math.abs(selectedRec.value.difference) > 0.01) {
    alert('لا يمكن اعتماد المطابقة بوجود فارق مالي! يجب أن يكون الفارق 0.00');
    return;
  }
  if (!confirm('هل أنت متأكد من اعتماد وإقفال جلسة المطابقة نهائياً؟')) return;

  finalizingRec.value = true;
  try {
    const res = await accountingApi.finalizeReconciliation(selectedRec.value.id);
    alert('تم اعتماد وإقفال جلسة المطابقة بنجاح');
    if (res.data) selectedRec.value = res.data;
    await loadReconciliations();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل اعتماد المطابقة');
  } finally {
    finalizingRec.value = false;
  }
};

const loadAgingData = async () => {
  loading.value = true;
  error.value = null;
  try {
    if (agingActiveTab.value === 'customers') {
      const res = await accountingApi.getCustomerAging(props.toDate);
      if (res.data) customerAgingData.value = res.data;
    } else {
      const res = await accountingApi.getSupplierAging(props.toDate);
      if (res.data) supplierAgingData.value = res.data;
    }
    const recRes = await accountingApi.getAgingReconciliation(props.toDate);
    if (recRes.data) agingRecData.value = recRes.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل بيانات أعمار الديون';
  } finally {
    loading.value = false;
  }
};

const loadPeriods = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await accountingApi.listPeriods();
    if (res.data) periodsList.value = res.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل الفترات المحاسبية';
  } finally {
    loading.value = false;
  }
};

const openChecklist = async (p: FinancialPeriod) => {
  selectedPeriod.value = p;
  showChecklistModal.value = true;
  periodChecklist.value = null;
  try {
    const res = await accountingApi.getPeriodChecklist(p.id);
    if (res.data) periodChecklist.value = res.data;
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل جلب قائمة تدقيق الفترة');
  }
};

const closePeriodNow = async () => {
  if (!selectedPeriod.value) return;
  if (
    !confirm(
      `هل أنت متأكد من إقفال الفترة ${selectedPeriod.value.period_name}؟ بعد الإقفال سيتم منع أي تعديل أو إنشاء قيود بتاريخ يقع ضمن هذه الفترة.`,
    )
  )
    return;

  closingPeriod.value = true;
  try {
    await accountingApi.closePeriod(selectedPeriod.value.id);
    alert('تم إقفال الفترة المحاسبية بنجاح وتفعيل قفل السجلات');
    showChecklistModal.value = false;
    await loadPeriods();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل إقفال الفترة المحاسبية');
  } finally {
    closingPeriod.value = false;
  }
};

const openReopenModal = (p: FinancialPeriod) => {
  selectedPeriod.value = p;
  reopenReason.value = '';
  showReopenModal.value = true;
};

const confirmReopenPeriod = async () => {
  if (!selectedPeriod.value || !reopenReason.value.trim()) {
    alert('يرجى كتابة سبب وجيه لإعادة فتح الفترة المقفلة');
    return;
  }
  periodSubmitting.value = true;
  try {
    await accountingApi.reopenPeriod(selectedPeriod.value.id, reopenReason.value);
    alert('تم إعادة فتح الفترة المحاسبية بنجاح');
    showReopenModal.value = false;
    await loadPeriods();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل إعادة فتح الفترة');
  } finally {
    periodSubmitting.value = false;
  }
};

const submitCreatePeriod = async () => {
  if (!newPeriodForm.value.period_code || !newPeriodForm.value.period_name) return;
  periodSubmitting.value = true;
  try {
    await accountingApi.createPeriod(newPeriodForm.value);
    alert('تم إنشاء الفترة المحاسبية بنجاح');
    showNewPeriodModal.value = false;
    await loadPeriods();
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل إنشاء الفترة');
  } finally {
    periodSubmitting.value = false;
  }
};

const loadLedgerProof = async () => {
  loading.value = true;
  error.value = null;
  try {
    const res = await accountingApi.getLedgerReconciliationSummary(props.fromDate, props.toDate);
    if (res.data) ledgerProofData.value = res.data;
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || 'فشل تحميل تقرير مطابقة الأستاذ';
  } finally {
    loading.value = false;
  }
};

const openNewRecModal = () => {
  newRecForm.value = {
    account_id: undefined,
    statement_date: new Date().toISOString().slice(0, 10),
    statement_balance: 0,
    notes: '',
  };
  showNewRecModal.value = true;
};

const submitCreateReconciliation = async () => {
  if (!newRecForm.value.account_id) return;
  recSubmitting.value = true;
  try {
    await accountingApi.createReconciliation({
      account_id: newRecForm.value.account_id,
      statement_date: newRecForm.value.statement_date,
      statement_balance: newRecForm.value.statement_balance,
      notes: newRecForm.value.notes,
    });
    showNewRecModal.value = false;
    await loadReconciliations();
    alert('تم تسجيل جلسة المطابقة وحساب الفارق بنجاح');
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل حفظ جلسة المطابقة');
  } finally {
    recSubmitting.value = false;
  }
};

const loadCurrentSubTab = async () => {
  if (subTab.value === 'trial_balance') {
    await loadTrialBalance();
  } else if (subTab.value === 'general_ledger') {
    await loadGeneralLedger();
  } else if (subTab.value === 'balance_sheet') {
    await loadBalanceSheet();
  } else if (subTab.value === 'coa') {
    await loadAccounts();
  } else if (subTab.value === 'reconciliation') {
    await loadReconciliations();
  } else if (subTab.value === 'aging') {
    await loadAgingData();
  } else if (subTab.value === 'proof') {
    await loadLedgerProof();
  } else if (subTab.value === 'periods') {
    await loadPeriods();
  }
};

const submitJournalEntry = async () => {
  if (!isEntryBalanced.value) return;
  entrySubmitting.value = true;
  try {
    await accountingApi.createJournalEntry({
      entry_date: entryForm.value.entry_date,
      description: entryForm.value.description,
      reference_type: 'manual',
      lines: entryForm.value.lines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0)),
    });
    // Reset form
    entryForm.value.description = '';
    entryForm.value.lines = [
      { account_id: undefined, debit: 0, credit: 0, description: '' },
      { account_id: undefined, debit: 0, credit: 0, description: '' },
    ];
    alert('تم ترحيل قيد اليومية بنجاح إلى دفتر الأستاذ العام');
    await switchSubTab('trial_balance');
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل ترحيل قيد اليومية');
  } finally {
    entrySubmitting.value = false;
  }
};

const openNewAccountModal = () => {
  newAccountForm.value = {
    code: '',
    name_ar: '',
    name_en: '',
    account_type: 'asset',
    parent_id: null,
  };
  showNewAccountModal.value = true;
};

const onParentAccountChange = () => {
  const p = accountsList.value.find((a) => a.id === newAccountForm.value.parent_id);
  if (p) {
    newAccountForm.value.account_type = p.account_type;
  }
};

const submitCreateAccount = async () => {
  accountSubmitting.value = true;
  try {
    await accountingApi.createAccount(newAccountForm.value);
    showNewAccountModal.value = false;
    await loadAccounts();
    alert('تم إضافة الحساب بنجاح إلى شجرة الحسابات');
  } catch (err: any) {
    alert(err.response?.data?.message || err.message || 'فشل إنشاء الحساب');
  } finally {
    accountSubmitting.value = false;
  }
};

onMounted(async () => {
  await loadAccounts();
  await loadCurrentSubTab();
});
</script>

<style scoped>
.accounting-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sub-nav-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  padding-bottom: 8px;
}

.sub-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--bg-card, #ffffff);
  color: var(--text-muted, #64748b);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
}

.sub-nav-btn:hover {
  background: var(--bg-hover, #f1f5f9);
  color: var(--text-main, #0f172a);
}

.sub-nav-btn.active {
  background: var(--primary-light, #eff6ff);
  color: var(--primary-color, #2563eb);
  border-color: var(--primary-color, #2563eb);
  font-weight: 600;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.balance-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
}

.balance-status-badge.balanced {
  background: #dcfce7;
  color: #166534;
}

.balance-status-badge.imbalanced {
  background: #fee2e2;
  color: #991b1b;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.trial-balance-table th {
  vertical-align: middle;
}

.sub-th {
  font-size: 0.75rem;
  font-weight: 600;
}

.num-cell {
  text-align: left;
  font-variant-numeric: tabular-nums;
  direction: ltr;
}

.type-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}

.type-pill.asset {
  background: #e0f2fe;
  color: #0369a1;
}
.type-pill.liability {
  background: #fef3c7;
  color: #b45309;
}
.type-pill.equity {
  background: #f3e8ff;
  color: #7e22ce;
}
.type-pill.revenue {
  background: #dcfce7;
  color: #15803d;
}
.type-pill.expense {
  background: #fee2e2;
  color: #b91c1c;
}

.clickable-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.clickable-row:hover {
  background: var(--bg-hover, #f8fafc);
}

.summary-footer-row td {
  background: var(--bg-hover, #f8fafc);
  font-weight: bold;
}

.ref-pill {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--border-color, #e2e8f0);
  font-size: 0.75rem;
}

.bs-col-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.live-balance-indicator {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
}

.live-balance-indicator.balanced {
  background: #dcfce7;
  color: #166534;
}

.live-balance-indicator.imbalanced {
  background: #fee2e2;
  color: #991b1b;
}

.form-actions-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.kpi-grid-5 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.aging-toggle-tabs {
  display: flex;
  gap: 8px;
}

.bg-success-light {
  background: #dcfce7;
  color: #166534;
}

.bg-warning-light {
  background: #fef3c7;
  color: #b45309;
}

.bg-danger-light {
  background: #fee2e2;
  color: #991b1b;
}

.action-buttons-group {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.gl-reconcile-banner {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e2e8f0);
}

.gl-reconcile-banner.reconciled {
  background: #f0fdf4;
  border-color: #86efac;
}

.gl-reconcile-banner.unreconciled {
  background: #fef2f2;
  border-color: #fca5a5;
}

.banner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.banner-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
}

.banner-details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.banner-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  flex-wrap: wrap;
}

.item-sep {
  color: var(--text-muted, #64748b);
  font-weight: bold;
}

.checklist-items-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checklist-items-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.checklist-items-list li.check-pass {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.checklist-items-list li.check-fail {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.check-icon {
  font-weight: bold;
  font-size: 1.1rem;
}

.blockers-box {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 0.875rem;
}

.table-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
