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
} from '@/api';
import { formatMoney } from '@/utils/formatters';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps<{
  fromDate?: string;
  toDate?: string;
}>();

const subTab = ref<'trial_balance' | 'general_ledger' | 'balance_sheet' | 'coa' | 'new_entry'>(
  'trial_balance',
);
const loading = ref(false);
const error = ref<string | null>(null);

// Data containers
const trialBalanceData = ref<TrialBalanceResponse | null>(null);
const generalLedgerData = ref<GeneralLedgerResponse | null>(null);
const balanceSheetData = ref<BalanceSheetResponse | null>(null);
const accountsList = ref<AccountItem[]>([]);

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

const loadCurrentSubTab = async () => {
  if (subTab.value === 'trial_balance') {
    await loadTrialBalance();
  } else if (subTab.value === 'general_ledger') {
    await loadGeneralLedger();
  } else if (subTab.value === 'balance_sheet') {
    await loadBalanceSheet();
  } else if (subTab.value === 'coa') {
    await loadAccounts();
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
</style>
