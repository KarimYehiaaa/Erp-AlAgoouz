<template>
  <div class="purchases-expenses-page">
    <!-- Tabs Navigation -->
    <div class="tabs-container" v-if="canManagePurchases && canManageExpenses">
      <div
        class="tab-slider"
        :style="{
          transform: activeTab === 'purchases' ? 'translateX(0)' : 'translateX(calc(-100% - 4px))',
        }"
      ></div>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'purchases' }"
        @click="switchTab('purchases')"
      >
        <AppIcon name="purchases" :size="16" />
        <span>فاتورة مشتريات</span>
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'expenses' }"
        @click="switchTab('expenses')"
      >
        <AppIcon name="expenses" :size="16" />
        <span>المصروفات العامة</span>
      </button>
    </div>

    <!-- ==============================================
         1. PURCHASES TAB
         ============================================== -->
    <div v-if="activeTab === 'purchases' && canManagePurchases" class="tab-content animate-in">
      <Teleport to="body" :disabled="!editingInvoiceId">
        <div
          :class="{ 'modal-overlay': editingInvoiceId }"
          @click.self="editingInvoiceId ? cancelPurchaseEdit() : null"
        >
          <div class="card form-card" :class="{ 'modal-card': editingInvoiceId }">
            <h3>{{ editingInvoiceId ? 'تعديل فاتورة مشتريات' : 'إدخال فاتورة مشتريات' }}</h3>

            <div class="invoice-meta-panel grid grid-3">
              <div class="form-group">
                <label>تاريخ الفاتورة</label>
                <input v-model="purchaseForm.invoice_date" type="date" class="field-like" />
              </div>
              <div class="form-group">
                <label>المورد</label>
                <select v-model.number="purchaseForm.supplier_id" class="field-like">
                  <option :value="null">— بدون مورد —</option>
                  <option v-for="s in suppliersList" :key="s.id" :value="s.id">
                    {{ s.name_ar }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>ملاحظات الفاتورة</label>
                <input
                  v-model="purchaseForm.notes"
                  class="field-like"
                  placeholder="ملاحظات إضافية..."
                />
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>المخزن</th>
                  <th>الوحدة</th>
                  <th style="width: 120px">الكمية</th>
                  <th style="width: 140px">السعر</th>
                  <th style="width: 150px">الإجمالي</th>
                  <th style="width: 50px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in purchaseForm.items" :key="i">
                  <td>
                    <select
                      v-model.number="item.product_id"
                      class="field-like"
                      @change="onProductChange(item)"
                    >
                      <option :value="null">اختر المنتج</option>
                      <option v-for="p in products" :key="p.id" :value="p.id">
                        {{ p.name_ar }} ({{ unitLabel(p.unit) }})
                      </option>
                    </select>
                  </td>
                  <td>
                    <span class="warehouse-chip" :class="{ missing: !item.warehouse_name }">
                      {{ item.warehouse_name || 'حدد المنتج' }}
                    </span>
                  </td>
                  <td>
                    <select v-model="item.unit" class="field-like">
                      <option v-for="u in unitNames(item.unit)" :key="u" :value="u">
                        {{ unitLabel(u) }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <input
                      v-model="item.quantity"
                      class="field-like"
                      type="text"
                      inputmode="decimal"
                      style="text-align: center"
                    />
                  </td>
                  <td>
                    <input
                      v-model="item.unit_price"
                      class="field-like"
                      type="text"
                      inputmode="decimal"
                      style="text-align: center"
                    />
                  </td>
                  <td
                    style="
                      font-weight: 700;
                      color: var(--text-strong);
                      text-align: left;
                      padding-left: 12px;
                    "
                  >
                    {{ formatMoney(toDecimal(item.quantity) * toDecimal(item.unit_price)) }}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="icon-btn danger"
                      @click="removePurchaseItem(i)"
                      :disabled="purchaseForm.items.length === 1"
                      title="حذف هذا الصنف"
                    >
                      <AppIcon name="delete" :size="16" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="invoice-summary-bar">
              <button type="button" class="btn btn-outline" @click="addPurchaseItem">
                <AppIcon name="plus" :size="16" />
                <span>إضافة صنف</span>
              </button>
              <div class="invoice-total-badge">
                <span class="total-label">إجمالي الفاتورة:</span>
                <span class="total-value">{{ formatMoney(purchaseTotalAmount) }}</span>
              </div>
            </div>

            <div class="actions">
              <button
                class="btn btn-primary"
                :disabled="purchasesSaving"
                @click="savePurchaseInvoice"
              >
                {{
                  purchasesSaving
                    ? 'جاري الحفظ...'
                    : editingInvoiceId
                      ? 'حفظ التعديل'
                      : 'حفظ الفاتورة'
                }}
              </button>
              <button
                v-if="editingInvoiceId"
                type="button"
                class="btn btn-outline"
                :disabled="purchasesSaving"
                @click="cancelPurchaseEdit"
              >
                إلغاء التعديل
              </button>
            </div>

            <p v-if="purchasesMsg" :class="['msg', purchasesErr ? 'err' : 'ok']">
              {{ purchasesMsg }}
            </p>
          </div>
        </div>
      </Teleport>

      <div class="card">
        <div class="card-header-row">
          <h3>آخر فواتير المشتريات</h3>
          <div class="purchases-filters">
            <div class="filter-group">
              <label>من</label>
              <input v-model="purchasesFilters.from_date" type="date" @change="loadPurchasesOnly" />
            </div>
            <div class="filter-group">
              <label>إلى</label>
              <input v-model="purchasesFilters.to_date" type="date" @change="loadPurchasesOnly" />
            </div>
            <div class="month-filter-btn" title="اختر الشهر بالكامل">
              <AppIcon name="calendar" :size="18" />
              <input type="month" class="month-picker-overlay" @change="selectPurchasesMonth" />
            </div>
          </div>
        </div>

        <!-- Quick Dashboard for Selected Period Purchases -->
        <div class="grid grid-2" style="margin-bottom: 20px">
          <StatCard label="إجمالي قيمة مشتريات الفترة" :value="periodPurchasesTotal" icon="money" />
          <StatCard
            label="عدد فواتير المشتريات بالفترة"
            :value="periodPurchasesCount"
            icon="receipt"
            format="number"
          />
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>المورد</th>
              <th>المخزن</th>
              <th>الإجمالي</th>
              <th>بنود</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingPurchases" v-for="i in 3" :key="'p-sk-' + i">
              <td><div class="skeleton-shimmer" style="height: 18px; width: 70px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 120px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 30px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 50px"></div></td>
            </tr>
            <tr v-else v-for="inv in invoices" :key="inv.id">
              <td>{{ inv.invoice_number }}</td>
              <td>{{ inv.invoice_date }}</td>
              <td>{{ inv.supplier_name || '—' }}</td>
              <td>{{ inv.warehouse_name }}</td>
              <td>{{ formatMoney(inv.total_amount) }}</td>
              <td>{{ inv.items?.length || 0 }}</td>
              <td>
                <button
                  v-permission="'inventory.edit'"
                  type="button"
                  class="icon-btn"
                  @click="editInvoice(inv)"
                  :disabled="purchasesSaving"
                  title="تعديل"
                >
                  <AppIcon name="edit" :size="16" />
                </button>
                <button
                  v-permission="'inventory.delete'"
                  type="button"
                  class="icon-btn danger"
                  @click="deleteInvoice(inv.id, inv.invoice_number)"
                  :disabled="purchasesSaving"
                  title="حذف"
                >
                  <AppIcon name="delete" :size="16" />
                </button>
              </td>
            </tr>
            <tr v-if="!loadingPurchases && !invoices.length">
              <td colspan="7">لا توجد بيانات</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ==============================================
         2. EXPENSES TAB
         ============================================== -->
    <div v-if="activeTab === 'expenses' && canManageExpenses" class="tab-content animate-in">
      <div class="card-header-row" style="margin-bottom: 16px">
        <div class="purchases-filters">
          <div class="filter-group">
            <label>من تاريخ</label>
            <input v-model="expensesFilters.from_date" type="date" @change="loadExpensesOnly" />
          </div>
          <div class="filter-group">
            <label>إلى تاريخ</label>
            <input v-model="expensesFilters.to_date" type="date" @change="loadExpensesOnly" />
          </div>
          <div class="month-filter-btn" title="اختر الشهر بالكامل">
            <AppIcon name="calendar" :size="18" />
            <input type="month" class="month-picker-overlay" @change="selectExpensesMonth" />
          </div>
        </div>
        <div class="actions" style="margin-bottom: 20px">
          <button v-permission="'expenses.add'" class="btn btn-primary" @click="openExpenseCreate">
            + مصروف جديد
          </button>
        </div>
      </div>

      <!-- Expenses Summary Stat Cards -->
      <div class="grid grid-4" style="gap: 16px; margin-bottom: 20px">
        <StatCard
          label="إجمالي المصروفات"
          :value="formatMoney(periodExpensesTotal)"
          icon="cash"
          format="currency"
        />
        <StatCard
          label="🏢 المصروفات الثابتة (إيجار/مرتبات/كهرباء)"
          :value="formatMoney(periodFixedExpensesTotal)"
          icon="building"
          format="currency"
        />
        <StatCard
          label="🛒 المصروفات المتغيرة والتشغيلية"
          :value="formatMoney(periodVariableExpensesTotal)"
          icon="wallet"
          format="currency"
        />
        <StatCard
          label="عدد بنود المصروفات بالفترة"
          :value="periodExpensesCount"
          icon="receipt"
          format="number"
        />
      </div>

      <!-- Filter Tabs by Expense Nature -->
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          gap: 12px;
          flex-wrap: wrap;
        "
      >
        <div class="tabs inline-tabs" style="margin-bottom: 0">
          <button
            type="button"
            :class="{ active: expenseTypeFilter === 'all' }"
            @click="expenseTypeFilter = 'all'"
          >
            📋 كافة المصروفات ({{ expensesList.length }})
          </button>
          <button
            type="button"
            :class="{ active: expenseTypeFilter === 'fixed' }"
            @click="expenseTypeFilter = 'fixed'"
          >
            🏢 المصروفات الثابتة ({{
              periodFixedExpensesTotal ? formatMoney(periodFixedExpensesTotal) : '0'
            }})
          </button>
          <button
            type="button"
            :class="{ active: expenseTypeFilter === 'variable' }"
            @click="expenseTypeFilter = 'variable'"
          >
            🛒 المصروفات المتغيرة ({{
              periodVariableExpensesTotal ? formatMoney(periodVariableExpensesTotal) : '0'
            }})
          </button>
        </div>
      </div>

      <div class="card table-wrap">
        <table class="items-table">
          <thead>
            <tr>
              <th>البند</th>
              <th>التصنيف</th>
              <th>النوع</th>
              <th>المبلغ</th>
              <th>التاريخ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadingExpenses" v-for="i in 3" :key="'e-sk-' + i">
              <td><div class="skeleton-shimmer" style="height: 18px; width: 140px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 100px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
              <td><div class="skeleton-shimmer" style="height: 18px; width: 50px"></div></td>
            </tr>
            <tr v-else v-for="e in filteredExpensesList" :key="e.id">
              <td style="font-weight: 700">{{ e.title }}</td>
              <td>{{ e.category_name }}</td>
              <td>
                <span
                  v-if="e.is_fixed"
                  class="badge"
                  style="
                    background: rgba(59, 130, 246, 0.12);
                    color: #3b82f6;
                    font-size: 0.75rem;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-weight: 800;
                  "
                  >🏢 ثابت</span
                >
                <span
                  v-else
                  class="badge"
                  style="
                    background: rgba(100, 116, 139, 0.12);
                    color: #64748b;
                    font-size: 0.75rem;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-weight: 700;
                  "
                  >🛒 متغير</span
                >
              </td>
              <td style="font-weight: 800; color: var(--accent)">{{ formatMoney(e.amount) }}</td>
              <td>{{ e.expense_date }}</td>
              <td class="actions">
                <button
                  v-permission="'expenses.edit'"
                  type="button"
                  class="icon-btn"
                  @click="openExpenseEdit(e)"
                  title="تعديل"
                >
                  <AppIcon name="edit" :size="16" />
                </button>
                <button
                  v-permission="'expenses.delete'"
                  type="button"
                  class="icon-btn danger"
                  @click="removeExpense(e)"
                  title="حذف"
                >
                  <AppIcon name="delete" :size="16" />
                </button>
              </td>
            </tr>
            <tr v-if="!loadingExpenses && !expensesList.length">
              <td colspan="6">لا توجد مصروفات مسجلة</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Expense Modal Form -->
      <div v-if="showExpenseForm" class="modal-overlay" @click.self="showExpenseForm = false">
        <div class="card modal-card" style="width: min(500px, 90vw); margin-inline: auto">
          <h3>{{ expenseForm.id ? 'تعديل' : 'إضافة' }} مصروف</h3>
          <form @submit.prevent="saveExpense">
            <div class="form-group" style="margin-bottom: 12px">
              <label>البند</label>
              <input
                v-model="expenseForm.title"
                class="field-like"
                placeholder="مثال: إيجار المحل، فاتورة كهرباء، شراء أدوات..."
                required
                @blur="suggestExpenseCategory"
              />
            </div>
            <div class="form-group" style="margin-bottom: 12px">
              <label>التصنيف</label>
              <select
                v-model="expenseForm.category_id"
                class="field-like"
                @change="onExpenseCategoryChange"
              >
                <option v-for="c in expenseCategories" :key="c.id" :value="c.id">
                  {{ c.name_ar }}
                </option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 12px">
              <label
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  font-weight: 700;
                "
              >
                <span>طبيعة المصروف</span>
                <span
                  v-if="expenseForm.is_fixed"
                  style="color: #3b82f6; font-size: 0.78rem; font-weight: 800"
                  >🏢 مصروف ثابت (Overhead)</span
                >
                <span v-else style="color: #64748b; font-size: 0.78rem; font-weight: 700"
                  >🛒 مصروف متغير / تشغيلي</span
                >
              </label>
              <select v-model="expenseForm.is_fixed" class="field-like">
                <option :value="false">🛒 مصروف متغير / تشغيلي (ضيافة، صيانة طارئة، نقل...)</option>
                <option :value="true">
                  🏢 مصروف ثابت / شهري (إيجار، مرتبات، كهرباء، مرافق...)
                </option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 12px">
              <label>المبلغ</label>
              <input
                v-model.number="expenseForm.amount"
                class="field-like"
                type="number"
                step="0.01"
                required
              />
            </div>
            <div class="form-group" style="margin-bottom: 16px">
              <label>تاريخ المصروف</label>
              <input v-model="expenseForm.expense_date" class="field-like" type="date" />
            </div>
            <div class="actions">
              <button type="submit" class="btn btn-primary" :disabled="expensesSaving">
                {{ expensesSaving ? 'جاري الحفظ...' : 'حفظ' }}
              </button>
              <button type="button" class="btn btn-outline" @click="showExpenseForm = false">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  products as productsApi,
  purchases as purchasesApi,
  suppliers as suppliersApi,
  expenses as expensesApi,
} from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';
import { useAuthStore } from '@/stores/auth';
import AppIcon from '@/components/AppIcon.vue';
import StatCard from '@/components/StatCard.vue';

const route = useRoute();
const authStore = useAuthStore();

// Permissions
const canManagePurchases = computed(() => authStore.hasPermission('inventory.manage'));
const canManageExpenses = computed(() => authStore.hasPermission('expenses.manage'));

const loadingPurchases = ref(false);
const loadingExpenses = ref(false);

// Active Tab
const activeTab = ref(route.query.tab === 'expenses' ? 'expenses' : 'purchases');
if (!canManagePurchases.value && canManageExpenses.value) {
  activeTab.value = 'expenses';
} else if (canManagePurchases.value && !canManageExpenses.value) {
  activeTab.value = 'purchases';
}

const switchTab = (tab) => {
  activeTab.value = tab;
  window.history.replaceState({}, '', `/purchases?tab=${tab}`);
  if (tab === 'purchases') loadPurchasesOnly();
  else loadExpensesOnly();
};

// Common Date Handlers
const todayStr = new Date().toISOString().split('T')[0];
const firstDayOfMonth = todayStr.slice(0, 8) + '01';

// Number normalization helpers
const normalizeDigits = (value) =>
  String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(digit)])
    .replace(/[۰-۹]/g, (digit) => '0123456789'['۰۱۲۳۴۵٦۷۸۹'.indexOf(digit)]);

const toDecimal = (value, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = normalizeDigits(value).trim().replace(/[٫,]/g, '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// ====================================================
// PURCHASES LOGIC
// ====================================================
const { loadMeta, unitLabel, unitNames } = useProductMeta();

const products = ref([]);
const invoices = ref([]);
const suppliersList = ref([]);
const purchasesSaving = ref(false);
const purchasesMsg = ref('');
const purchasesErr = ref(false);
const editingInvoiceId = ref(null);

const purchasesFilters = ref({
  from_date: firstDayOfMonth,
  to_date: todayStr,
  limit: 200,
});

const emptyItem = () => ({
  product_id: null,
  warehouse_name: '',
  unit: unitNames()[0] || 'قطعة',
  quantity: 1,
  unit_price: 0,
});
const purchaseForm = ref({
  invoice_date: todayStr,
  supplier_id: null,
  notes: '',
  items: [emptyItem()],
});

const purchaseTotalAmount = computed(() =>
  purchaseForm.value.items.reduce((s, x) => s + toDecimal(x.quantity) * toDecimal(x.unit_price), 0),
);

const periodPurchasesTotal = computed(() => {
  return invoices.value.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
});

const periodPurchasesCount = computed(() => {
  return invoices.value.length;
});

const selectPurchasesMonth = (event) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  purchasesFilters.value.from_date = fromDate;
  purchasesFilters.value.to_date = toDate;
  loadPurchasesOnly();
};

const loadPurchasesOnly = async () => {
  if (!canManagePurchases.value) return;
  loadingPurchases.value = true;
  try {
    const [p, inv, sup] = await Promise.all([
      productsApi.list({ limit: 1000 }),
      purchasesApi.list({
        from_date: purchasesFilters.value.from_date,
        to_date: purchasesFilters.value.to_date,
        limit: purchasesFilters.value.limit,
      }),
      suppliersApi.list(),
    ]);
    products.value = p.data || [];
    invoices.value = inv.data || [];
    suppliersList.value = sup.data || [];
    await loadMeta();
  } catch (err) {
    console.error('Failed to load purchases:', err);
  } finally {
    loadingPurchases.value = false;
  }
};

const onProductChange = (item) => {
  const p = products.value.find((x) => x.id === item.product_id);
  if (!p) return;
  item.warehouse_name = p.primary_warehouse_name || '';
  item.unit = p.unit || 'count';
  item.unit_price = Number(p.purchase_price) || 0;
};

const addPurchaseItem = () => purchaseForm.value.items.push(emptyItem());
const removePurchaseItem = (i) => purchaseForm.value.items.splice(i, 1);

const resetPurchasesForm = () => {
  editingInvoiceId.value = null;
  purchaseForm.value = {
    invoice_date: todayStr,
    supplier_id: null,
    notes: '',
    items: [emptyItem()],
  };
};

const editInvoice = (invoice) => {
  editingInvoiceId.value = invoice.id;
  purchaseForm.value = {
    invoice_date: String(invoice.invoice_date || '').slice(0, 10),
    supplier_id: invoice.supplier_id || null,
    notes: invoice.notes || '',
    items: (invoice.items || []).map((item) => ({
      product_id: item.product_id,
      warehouse_name: item.warehouse_name || '',
      unit: item.unit || 'count',
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? 0,
    })),
  };
  if (!purchaseForm.value.items.length) purchaseForm.value.items = [emptyItem()];
  purchasesMsg.value = `جاري تعديل فاتورة ${invoice.invoice_number}`;
  purchasesErr.value = false;
};

const cancelPurchaseEdit = () => {
  resetPurchasesForm();
  purchasesMsg.value = '';
  purchasesErr.value = false;
};

const deleteInvoice = async (id, invoiceNumber) => {
  if (!id) return;
  const ok = confirm(`هل تريد حذف فاتورة المشتريات ${invoiceNumber}?`);
  if (!ok) return;

  purchasesMsg.value = '';
  purchasesErr.value = false;
  purchasesSaving.value = true;
  try {
    await purchasesApi.delete(id);
    purchasesMsg.value = 'تم حذف فاتورة المشتريات وتحديث المخزون';
    await loadPurchasesOnly();
  } catch (e) {
    purchasesErr.value = true;
    purchasesMsg.value = e.message || 'فشل الحذف';
  } finally {
    purchasesSaving.value = false;
  }
};

const savePurchaseInvoice = async () => {
  if (purchasesSaving.value) return;
  purchasesMsg.value = '';
  purchasesErr.value = false;
  purchasesSaving.value = true;
  try {
    const items = purchaseForm.value.items
      .filter((x) => x.product_id && toDecimal(x.quantity) > 0)
      .map((x) => ({
        ...x,
        quantity: toDecimal(x.quantity),
        unit_price: toDecimal(x.unit_price),
      }));
    if (!items.length) throw new Error('أضف صنفًا واحدًا على الأقل');
    const payload = {
      invoice_date: purchaseForm.value.invoice_date,
      supplier_id: purchaseForm.value.supplier_id || null,
      notes: purchaseForm.value.notes,
      items,
    };
    if (editingInvoiceId.value) {
      const res = await purchasesApi.update(editingInvoiceId.value, payload);
      const shortages = res?.data?.shortages || [];
      purchasesMsg.value = shortages.length
        ? `تم تعديل فاتورة المشتريات، مع وجود ${shortages.length} بند لم يتم عكس كامل كميته من المخزون القديم`
        : 'تم تعديل فاتورة المشتريات وتحديث المخزون';
    } else {
      await purchasesApi.create(payload);
      purchasesMsg.value = 'تم حفظ فاتورة المشتريات وتحديث المخزون';
    }
    resetPurchasesForm();
    await loadPurchasesOnly();
  } catch (e) {
    purchasesErr.value = true;
    purchasesMsg.value = e.message || 'فشل الحفظ';
  } finally {
    purchasesSaving.value = false;
  }
};

// ====================================================
// EXPENSES LOGIC
// ====================================================
const expensesList = ref([]);
const expenseCategories = ref([]);
const expensesSaving = ref(false);
const expenseTypeFilter = ref('all');

const periodExpensesTotal = computed(() => {
  return expensesList.value.reduce((sum, e) => sum + Number(e.amount || 0), 0);
});

const periodFixedExpensesTotal = computed(() => {
  return expensesList.value
    .filter((e) => e.is_fixed)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
});

const periodVariableExpensesTotal = computed(() => {
  return expensesList.value
    .filter((e) => !e.is_fixed)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
});

const periodExpensesCount = computed(() => {
  return expensesList.value.length;
});

const filteredExpensesList = computed(() => {
  if (expenseTypeFilter.value === 'fixed') {
    return expensesList.value.filter((e) => Boolean(e.is_fixed));
  }
  if (expenseTypeFilter.value === 'variable') {
    return expensesList.value.filter((e) => !Boolean(e.is_fixed));
  }
  return expensesList.value;
});

const expensesFilters = ref({
  from_date: firstDayOfMonth,
  to_date: todayStr,
});

const showExpenseForm = ref(false);
const expenseForm = ref({
  id: null,
  title: '',
  category_id: 1,
  is_fixed: false,
  amount: 0,
  expense_date: todayStr,
});

const resetExpenseForm = () => {
  const firstCat = expenseCategories.value[0];
  expenseForm.value = {
    id: null,
    title: '',
    category_id: firstCat?.id || 1,
    is_fixed: firstCat ? Boolean(firstCat.is_fixed) : false,
    amount: 0,
    expense_date: todayStr,
  };
};

const onExpenseCategoryChange = () => {
  const cat = expenseCategories.value.find(
    (c) => Number(c.id) === Number(expenseForm.value.category_id),
  );
  if (cat) {
    expenseForm.value.is_fixed = Boolean(cat.is_fixed);
  }
};

const openExpenseCreate = () => {
  resetExpenseForm();
  showExpenseForm.value = true;
};

const openExpenseEdit = (row) => {
  expenseForm.value = {
    id: row.id,
    title: row.title,
    category_id: row.category_id,
    is_fixed: row.is_fixed === true || String(row.is_fixed) === 'true',
    amount: Number(row.amount || 0),
    expense_date: String(row.expense_date || '').slice(0, 10),
  };
  showExpenseForm.value = true;
};

const selectExpensesMonth = (event) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  expensesFilters.value.from_date = fromDate;
  expensesFilters.value.to_date = toDate;
  loadExpensesOnly();
};

const loadExpensesOnly = async () => {
  if (!canManageExpenses.value) return;
  loadingExpenses.value = true;
  try {
    const [listRes, c] = await Promise.all([
      expensesApi.list({
        from_date: expensesFilters.value.from_date,
        to_date: expensesFilters.value.to_date,
        limit: 1000,
      }),
      expensesApi.categories(),
    ]);

    expensesList.value = listRes.data || [];
    expenseCategories.value = c.data || [];
  } catch (err) {
    console.error('Failed to load expenses:', err);
  } finally {
    loadingExpenses.value = false;
  }
};

const suggestExpenseCategory = async () => {
  const title = expenseForm.value.title?.trim();
  if (!title || title.length < 3) return;
  try {
    const res = await expensesApi.suggestCategory(title);
    if (res.data?.category_id) {
      const exists = expenseCategories.value.some((c) => c.id === res.data.category_id);
      if (exists) {
        expenseForm.value.category_id = res.data.category_id;
        onExpenseCategoryChange();
      }
    }
  } catch (err) {
    console.error('Failed to suggest category:', err);
  }
};

const saveExpense = async () => {
  expensesSaving.value = true;
  try {
    const payload = {
      ...expenseForm.value,
      is_fixed:
        expenseForm.value.is_fixed === true || String(expenseForm.value.is_fixed) === 'true',
    };
    if (expenseForm.value.id) await expensesApi.update(expenseForm.value.id, payload);
    else await expensesApi.create(payload);
    showExpenseForm.value = false;
    resetExpenseForm();
    await loadExpensesOnly();
  } catch (e) {
    window.alert(e.message || 'فشل حفظ المصروف');
  } finally {
    expensesSaving.value = false;
  }
};

const removeExpense = async (row) => {
  if (!window.confirm(`تأكيد حذف المصروف: ${row.title} ؟`)) return;
  try {
    await expensesApi.delete(row.id);
    await loadExpensesOnly();
  } catch (e) {
    window.alert(e.message || 'فشل حذف المصروف');
  }
};

// On Mounted Load
onMounted(() => {
  if (activeTab.value === 'purchases') loadPurchasesOnly();
  else loadExpensesOnly();
});
</script>

<style lang="scss" scoped>
.purchases-expenses-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tabs Design */
.tabs-container {
  position: relative;
  display: flex;
  background: var(--bg-soft);
  padding: 4px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  gap: 4px;
  width: fit-content;
  margin-bottom: 12px;
}
.tab-slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  right: 4px;
  width: calc(50% - 6px);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}
.tab-btn {
  position: relative;
  z-index: 2;
  background: transparent !important;
  border: none !important;
  color: var(--text-muted);
  font-weight: 700;
  padding: 10px 20px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: color 0.28s ease;
  border-radius: var(--radius-md);

  &:hover {
    color: var(--text-strong);
  }

  &.active {
    color: var(--primary-dark) !important;
  }
}

.items-table {
  width: 100%;
}
.items-table th,
.items-table td {
  padding: 8px;
  text-align: right;
  vertical-align: middle;
}
.items-table input,
.items-table select {
  width: 100%;
}
.field-like {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  font-size: 0.9rem;
  font-weight: 600;
  transition: var(--transition);
  &:focus {
    outline: none;
    border-color: var(--primary);
  }
}
.warehouse-chip {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--info) 10%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--info) 24%, transparent);
  color: var(--text-strong);
  font-weight: 700;
  white-space: nowrap;
}
.warehouse-chip.missing {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-muted);
}
.actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.total {
  font-weight: 800;
  color: var(--text-strong);
}
.msg.ok {
  color: var(--success);
  font-weight: 700;
}
.msg.err {
  color: var(--danger);
  font-weight: 700;
}

/* Modal and form card */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-card {
  width: min(900px, 95vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-xl);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 24px;
}
.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  h3 {
    margin: 0;
  }
}
.purchases-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  .filter-group {
    display: flex;
    align-items: center;
    gap: 6px;
    label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 700;
    }
    input {
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      font-size: 0.88rem;
    }
  }
  .month-filter-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    transition: all 0.2s;
  }
  .month-filter-btn:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
    color: var(--primary);
  }
  .month-picker-overlay {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
}

.invoice-meta-panel {
  background: var(--bg);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
  gap: 16px;
}
.invoice-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  margin-bottom: 24px;
}
.invoice-total-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--success) 8%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
  border-radius: var(--radius-md);
}
.invoice-total-badge .total-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 700;
}
.invoice-total-badge .total-value {
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--success);
}
</style>
