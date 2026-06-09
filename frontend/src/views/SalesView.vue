<template>
  <div class="sales-page">
    <div class="page-toolbar card">
      <div class="toolbar-actions">
        <button type="button" class="icon-btn" title="تحميل قالب الاستيراد" @click="downloadTemplate">📥</button>
        <label class="icon-btn import-btn" title="فحص ملف Excel">
          🔍
          <input type="file" accept=".xlsx,.xls" hidden @change="onValidate" />
        </label>
        <label class="icon-btn import-btn" title="استيراد من Excel">
          📤
          <input type="file" accept=".xlsx,.xls" hidden @change="onImport" />
        </label>
      </div>
      <div class="filter-row">
        <div class="form-group">
          <label>من تاريخ</label>
          <input v-model="filters.from_date" type="date" @change="load" />
        </div>
        <div class="form-group">
          <label>إلى تاريخ</label>
          <input v-model="filters.to_date" type="date" @change="load" />
        </div>
      </div>
    </div>

    <div class="opening-balance card">
      <div class="opening-balance-head">
        <div>
          <h3>بداية المدة</h3>
          <p>المبلغ المرحل من الشهر السابق ويُضاف إلى صافي التدفق.</p>
        </div>
        <div class="opening-balance-actions">
          <button type="button" class="btn btn-outline btn-sm" :disabled="openingBalanceLoading || openingBalanceSaving" @click="startOpeningBalanceEdit">
            تعديل
          </button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="openingBalanceSaving || !openingBalanceEditing" @click="saveOpeningBalance">
            {{ openingBalanceSaving ? 'جارٍ الحفظ...' : 'حفظ' }}
          </button>
        </div>
      </div>
      <div class="grid grid-3 opening-balance-grid">
        <div class="form-group">
          <label>من تاريخ</label>
          <input v-model="openingBalanceForm.from_date" type="date" :disabled="!openingBalanceEditing" />
        </div>
        <div class="form-group">
          <label>إلى تاريخ</label>
          <input v-model="openingBalanceForm.to_date" type="date" :disabled="!openingBalanceEditing" />
        </div>
        <div class="form-group">
          <label>المبلغ</label>
          <input v-model.number="openingBalanceForm.amount" type="number" min="0" step="0.01" :disabled="!openingBalanceEditing" placeholder="0.00" />
        </div>
      </div>
      <div v-if="openingBalanceMsg" class="opening-balance-msg" :class="{ err: openingBalanceErr }">
        {{ openingBalanceMsg }}
      </div>
    </div>

    <div class="tabs">
      <button
        type="button"
        :class="{ active: activeTab === 'branch' }"
        @click="switchTab('branch')"
      >🏪 مبيعات الفرع</button>
      <button
        type="button"
        :class="{ active: activeTab === 'wholesale' }"
        @click="switchTab('wholesale')"
      >📦 مبيعات الجملة</button>
    </div>

    <div class="grid grid-3 stats-row">
      <StatCard label="إجمالي الفترة" :value="periodTotal" icon="💰" />
      <StatCard label="عدد الايام" :value="sales.length" icon="📋" format="number" />
      <StatCard label="متوسط اليوم" :value="dailyAverage" icon="📆" />
    </div>

    <div class="grid grid-2 main-row">
      <div class="card form-card">
        <h3>{{ editingSaleId ? 'تعديل فاتورة بيع' : (activeTab === 'branch' ? 'تسجيل مبيعات فرع' : 'تسجيل مبيعات جملة') }}</h3>
        <form @submit.prevent="submitSale">
          <div v-if="editingSaleId" class="edit-banner">
            <span>وضع التعديل مفعل للفاتورة {{ editingSaleNumber }}</span>
            <button type="button" class="btn btn-outline btn-sm" @click="cancelEdit">إلغاء التعديل</button>
          </div>
          <div class="form-group">
            <label>تاريخ المبيعات *</label>
            <input v-model="form.sale_date" type="date" required />
          </div>
          <div class="form-group">
            <label>المبلغ (ج.م) *</label>
            <input v-model.number="form.total_amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
          </div>
          <div v-if="activeTab === 'wholesale'" class="form-group">
            <label>العميل</label>
            <select v-model="form.customer_id">
              <option :value="null">— بدون عميل —</option>
              <option v-for="c in wholesaleCustomers" :key="c.id" :value="c.id">{{ c.name_ar }} ({{ c.code }})</option>
            </select>
          </div>
          <div class="grid grid-2">
            <div class="form-group">
              <label>طريقة الدفع</label>
              <select v-model="form.payment_method">
                <option value="cash">نقدي</option>
                <option value="card">بطاقة</option>
                <option value="transfer">تحويل</option>
                <option value="credit">آجل</option>
              </select>
            </div>
            <div class="form-group">
              <label>حالة الدفع</label>
              <select v-model="form.payment_status">
                <option value="paid">مدفوع بالكامل</option>
                <option value="partial">دفع جزئي</option>
                <option value="unpaid">غير مدفوع (آجل)</option>
              </select>
            </div>
          </div>

          <!-- حقل الدفع الجزئي — يظهر فقط عند اختيار "جزئي" -->
          <div v-if="form.payment_status === 'partial'" class="partial-payment-box">
            <div class="partial-header">
              <span class="partial-icon">💳</span>
              <span>تفاصيل الدفع الجزئي</span>
            </div>
            <div class="grid grid-2">
              <div class="form-group">
                <label>المبلغ المدفوع (ج.م) *</label>
                <input
                  v-model.number="form.paid_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  :max="form.total_amount"
                  placeholder="0.00"
                  @input="calcRemaining"
                />
              </div>
              <div class="form-group">
                <label>المبلغ المتبقي (ج.م)</label>
                <div class="remaining-display" :class="remainingAmount > 0 ? 'has-remaining' : 'no-remaining'">
                  {{ formatMoney(remainingAmount) }}
                </div>
              </div>
            </div>
            <div v-if="remainingAmount > 0" class="remaining-note">
              ⚠️ سيُضاف {{ formatMoney(remainingAmount) }} لرصيد العميل المستحق
            </div>
          </div>
          <div class="form-group">
            <label>ربح تقريبي (اختياري)</label>
            <input v-model.number="form.profit_amount" type="number" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label>ملاحظات</label>
            <textarea v-model="form.notes" rows="2"></textarea>
          </div>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'جاري الحفظ...' : (editingSaleId ? 'حفظ تعديل الفاتورة' : 'حفظ المبيعات') }}
          </button>
        </form>
      </div>

      <div class="card table-wrap list-card">
        <h3>سجل المبيعات</h3>
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>المبلغ</th>
              <th>الربح</th>
              <th>الحالة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sales" :key="s.id">
              <td>{{ formatDate(s.sale_date || s.created_at) }}</td>
              <td>{{ formatMoney(s.total_amount) }}</td>
              <td>{{ formatMoney(s.profit_amount) }}</td>
              <td>
                <span :class="statusBadge(s.status)">{{ statusLabel(s.status) }}</span>
              </td>
              <td>
                <button type="button" class="btn btn-sm btn-outline" :disabled="saving || s.status !== 'completed'" @click="startEdit(s)">
                  تعديل
                </button>
              </td>
            </tr>
            <tr v-if="!sales.length">
              <td colspan="5" class="empty">لا توجد مبيعات في هذه الفترة</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <details class="excel-guide card" open>
      <summary>📋 شكل الملف الصحيح (ورقة «مبيعات» فقط)</summary>
      <p class="guide-note">السطر 1 = عناوين ثابتة. من السطر 2 = بياناتك. لا تعدّل أسماء الأعمدة.</p>
      <div class="guide-table-wrap">
        <table class="guide-table">
          <thead>
            <tr>
              <th>تاريخ_البيع</th>
              <th>نوع_البيع</th>
              <th>المبلغ_جنيها</th>
              <th>كود_العميل</th>
              <th>حالة_الدفع</th>
              <th>طريقة_الدفع</th>
              <th>ربح_اختياري</th>
              <th>ملاحظات</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            <tr class="ok-row">
              <td>2026-05-21</td>
              <td>branch</td>
              <td>1500</td>
              <td></td>
              <td>paid</td>
              <td>cash</td>
              <td>200</td>
              <td>مبيعات فرع</td>
              <td></td>
            </tr>
            <tr class="ok-row">
              <td>21/05/2026</td>
              <td>wholesale</td>
              <td>8500</td>
              <td>C-002</td>
              <td>paid</td>
              <td>transfer</td>
              <td>0</td>
              <td>جملة</td>
              <td></td>
            </tr>
            <tr class="warn-row">
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td>حذف كل المبيعات الحالية</td>
              <td>delete_all</td>
            </tr>
            <tr class="bad-row">
              <td colspan="9">❌ خطأ شائع: كتابة «مبيعات فرع» في نوع_البيع — الصحيح: branch أو wholesale فقط</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="guide-list">
        <li><strong>فرع:</strong> نوع_البيع = <code>branch</code> — اترك كود_العميل فارغاً</li>
        <li><strong>جملة:</strong> نوع_البيع = <code>wholesale</code> — كود عميل مثل <code>C-002</code></li>
        <li><strong>حذف كل المبيعات:</strong> اكتب <code>delete_all</code> في عمود <code>الإجراء</code> بأي صف</li>
        <li>أكواد العملاء المتاحة: {{ customerCodesHint }}</li>
      </ul>
    </details>

    <div v-if="importMsg || importDetails.length" class="import-result card" :class="{ err: importErr }">
      <p class="import-msg" :class="{ err: importErr }">{{ importMsg }}</p>
      <ul v-if="importDetails.length" class="import-details">
        <li v-for="(d, i) in importDetails" :key="i">{{ d }}</li>
      </ul>
      <p v-if="importDetails.length" class="import-hint">
        التحذيرات = صفوف لم تُستورد (بيانات ناقصة أو غير صحيحة). احذف صفوف الأمثلة/التعليمات من ورقة «مبيعات» قبل الرفع.
      </p>
    </div>

    <div class="danger-actions card">
      <div class="danger-title">🗑️ إدارة الحذف</div>

      <!-- حذف حسب النوع -->
      <div class="danger-row">
        <span class="danger-label">حذف حسب النوع:</span>
        <button
          type="button"
          class="delete-type-btn branch"
          :disabled="saving"
          @click="deleteSalesByType('branch')"
          title="حذف كل مبيعات الفرع نهائياً"
        >
          <span class="btn-icon">🏪</span>
          <span class="btn-text">حذف مبيعات الفرع</span>
        </button>
        <button
          type="button"
          class="delete-type-btn wholesale"
          :disabled="saving"
          @click="deleteSalesByType('wholesale')"
          title="حذف كل مبيعات الجملة نهائياً"
        >
          <span class="btn-icon">📦</span>
          <span class="btn-text">حذف مبيعات الجملة</span>
        </button>
      </div>

      <!-- حذف حسب اليوم -->
      <div class="danger-row">
        <span class="danger-label">حذف يوم محدد:</span>
        <input v-model="deleteDate" type="date" class="date-input" />
        <button
          type="button"
          class="delete-type-btn day"
          :disabled="saving || !deleteDate"
          @click="deleteSalesForOneDay"
          title="حذف مبيعات هذا اليوم فقط"
        >
          <span class="btn-icon">🗓️</span>
          <span class="btn-text">حذف مبيعات اليوم</span>
        </button>
      </div>

      <!-- حذف الكل -->
      <div class="danger-row">
        <span class="danger-label">حذف شامل:</span>
        <button
          type="button"
          class="delete-type-btn all"
          :disabled="saving"
          @click="deleteAllSales"
          title="حذف كل المبيعات نهائياً"
        >
          <span class="btn-icon">⚠️</span>
          <span class="btn-text">حذف كل المبيعات</span>
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import StatCard from '@/components/StatCard.vue';
import { sales as salesApi, customers as customersApi } from '@/api';
import { formatMoney } from '@/utils/currency';

const localTodayYmd = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const today = localTodayYmd();
const activeTab = ref('branch');
const sales = ref([]);
const wholesaleCustomers = ref([]);
const saving = ref(false);
const openingBalanceLoading = ref(false);
const openingBalanceSaving = ref(false);
const openingBalanceEditing = ref(false);
const openingBalanceMsg = ref('');
const openingBalanceErr = ref(false);
const openingBalanceForm = ref({
  from_date: today,
  to_date: today,
  amount: 0,
});
const importMsg = ref('');
const importErr = ref(false);
const importDetails = ref([]);
const customerCodesHint = ref('C-001, C-002, C-003, C-004 (أو اترك فارغاً)');
const deleteDate = ref(today);
const editingSaleId = ref(null);
const editingSaleNumber = ref('');

const filters = ref({
  from_date: today.slice(0, 8) + '01',
  to_date: today,
});

const form = ref({
  sale_date: today,
  total_amount: null,
  customer_id: null,
  payment_method: 'cash',
  payment_status: 'paid',
  paid_amount: null,
  profit_amount: 0,
  notes: '',
});

const remainingAmount = computed(() => {
  if (form.value.payment_status !== 'partial') return 0;
  const total = Number(form.value.total_amount || 0);
  const paid = Number(form.value.paid_amount || 0);
  return Math.max(0, total - paid);
});

const calcRemaining = () => {
  // تأكد إن المدفوع مش أكبر من الإجمالي
  if (form.value.paid_amount > form.value.total_amount) {
    form.value.paid_amount = form.value.total_amount;
  }
};

const periodTotal = computed(() =>
  sales.value.filter((s) => s.status === 'completed').reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0)
);
const enteredDaysCount = computed(() => {
  const set = new Set(
    sales.value
      .map((s) => (s.sale_date || '').split?.('T')?.[0] || '')
      .filter(Boolean)
  );
  return set.size;
});
const dailyAverage = computed(() => (enteredDaysCount.value ? periodTotal.value / enteredDaysCount.value : 0));

const formatDate = (d) => {
  const val = d?.split?.('T')?.[0] || d;
  if (!val) return '—';
  // Keep DATE values as plain text to avoid any timezone conversion.
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, day] = val.split('-');
    return `${day}/${m}/${y}`;
  }
  return new Date(val).toLocaleDateString('en-GB');
};

const statusLabel = (s) => ({ completed: 'مكتمل', returned: 'مسترد', cancelled: 'ملغي' }[s] || s);
const statusBadge = (s) => ['badge', s === 'completed' ? 'badge-success' : s === 'returned' ? 'badge-danger' : 'badge-warning'];

const switchTab = (tab) => {
  activeTab.value = tab;
  cancelEdit();
  load();
};

const resetForm = () => {
  form.value = {
    sale_date: today,
    total_amount: null,
    customer_id: null,
    payment_method: 'cash',
    payment_status: 'paid',
    paid_amount: null,
    profit_amount: 0,
    notes: '',
  };
};

const cancelEdit = () => {
  editingSaleId.value = null;
  editingSaleNumber.value = '';
  resetForm();
};

const loadOpeningBalance = async () => {
  openingBalanceLoading.value = true;
  try {
    const res = await salesApi.openingBalance({
      from_date: filters.value.from_date,
      to_date: filters.value.to_date,
    });
    openingBalanceForm.value = {
      from_date: res.data?.from_date || filters.value.from_date,
      to_date: res.data?.to_date || filters.value.to_date,
      amount: Number(res.data?.amount || 0),
    };
  } catch (e) {
    openingBalanceErr.value = true;
    openingBalanceMsg.value = e.message || 'فشل تحميل بداية المدة';
  } finally {
    openingBalanceLoading.value = false;
  }
};

const startOpeningBalanceEdit = async () => {
  openingBalanceEditing.value = true;
  openingBalanceErr.value = false;
  openingBalanceMsg.value = 'يمكنك الآن تعديل بداية المدة ثم الضغط على حفظ';
  await loadOpeningBalance();
};

const saveOpeningBalance = async () => {
  openingBalanceSaving.value = true;
  openingBalanceErr.value = false;
  try {
    const res = await salesApi.saveOpeningBalance(openingBalanceForm.value);
    openingBalanceForm.value = {
      from_date: res.data?.from_date || openingBalanceForm.value.from_date,
      to_date: res.data?.to_date || openingBalanceForm.value.to_date,
      amount: Number(res.data?.amount || 0),
    };
    openingBalanceEditing.value = false;
    openingBalanceMsg.value = 'تم حفظ بداية المدة بنجاح';
    await load();
  } catch (e) {
    openingBalanceErr.value = true;
    openingBalanceMsg.value = e.message || 'فشل حفظ بداية المدة';
  } finally {
    openingBalanceSaving.value = false;
  }
};

const startEdit = async (sale) => {
  saving.value = true;
  try {
    const res = await salesApi.get(sale.id);
    const detail = res.data;
    editingSaleId.value = detail.id;
    editingSaleNumber.value = detail.sale_number;
    activeTab.value = detail.sale_type || activeTab.value;
    const paidAmount = (detail.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    form.value = {
      sale_date: String(detail.sale_date || today).split('T')[0],
      total_amount: Number(detail.total_amount || 0),
      customer_id: detail.customer_id || null,
      payment_method: detail.payments?.[0]?.method || 'cash',
      payment_status: detail.payment_status || 'paid',
      paid_amount: detail.payment_status === 'partial' ? paidAmount : null,
      profit_amount: Number(detail.profit_amount || 0),
      notes: detail.notes || '',
    };
  } catch (e) {
    alert(e.message || 'فشل تحميل الفاتورة للتعديل');
  } finally {
    saving.value = false;
  }
};

const load = async () => {
  const [salesRes, openingRes] = await Promise.all([
    salesApi.list({
      sale_type: activeTab.value,
      from_date: filters.value.from_date,
      to_date: filters.value.to_date,
      limit: 200,
    }),
    salesApi.openingBalance({
      from_date: filters.value.from_date,
      to_date: filters.value.to_date,
    }).catch(() => null),
  ]);
  sales.value = salesRes.data;
  if (openingRes?.data) {
    openingBalanceForm.value = {
      from_date: openingRes.data.from_date || filters.value.from_date,
      to_date: openingRes.data.to_date || filters.value.to_date,
      amount: Number(openingRes.data.amount || 0),
    };
  }
};

const submitSale = async () => {
  saving.value = true;
  try {
    const payload = {
      ...form.value,
      sale_type: activeTab.value,
    };
    // لو دفع جزئي، نحسب الباقي ونضيفه للرصيد
    if (form.value.payment_status === 'partial') {
      if (!form.value.paid_amount || form.value.paid_amount <= 0) {
        alert('أدخل المبلغ المدفوع أولاً');
        saving.value = false;
        return;
      }
      payload.paid_amount = form.value.paid_amount;
    }
    if (editingSaleId.value) {
      await salesApi.update(editingSaleId.value, payload);
      cancelEdit();
    } else {
      await salesApi.create(payload);
      form.value.total_amount = null;
      form.value.notes = '';
      form.value.profit_amount = 0;
      form.value.paid_amount = null;
    }
    await load();
  } catch (e) {
    alert(e.message);
  } finally {
    saving.value = false;
  }
};

const deleteAllSales = async () => {
  const confirmed = window.confirm('تأكيد نهائي: سيتم حذف كل بيانات قسم المبيعات الحالية. هل تريد المتابعة؟');
  if (!confirmed) return;
  saving.value = true;
  try {
    const res = await salesApi.deleteAll();
    const count = res?.data?.deletedCount ?? 0;
    importErr.value = false;
    importMsg.value = `تم حذف كل بيانات المبيعات بنجاح (${count} سجل)`;
    importDetails.value = [];
    await load();
  } catch (e) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل حذف بيانات المبيعات';
  } finally {
    saving.value = false;
  }
};

const deleteSalesByType = async (saleType) => {
  const label = saleType === 'branch' ? 'مبيعات الفرع 🏪' : 'مبيعات الجملة 📦';
  const confirmed = window.confirm(`تأكيد نهائي: سيتم حذف كل ${label} بشكل دائم.\nهل أنت متأكد؟`);
  if (!confirmed) return;
  saving.value = true;
  try {
    const res = await salesApi.deleteByType(saleType);
    const count = res?.data?.deletedCount ?? 0;
    importErr.value = false;
    importMsg.value = `✅ تم حذف ${count} سجل من ${label} بنجاح`;
    importDetails.value = [];
    await load();
  } catch (e) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل الحذف';
  } finally {
    saving.value = false;
  }
};

const deleteSalesForOneDay = async () => {
  const confirmed = window.confirm(`تأكيد: سيتم حذف كل مبيعات يوم ${deleteDate.value} فقط. هل تريد المتابعة؟`);
  if (!confirmed) return;
  saving.value = true;
  try {
    const res = await salesApi.deleteByDate(deleteDate.value);
    const count = res?.data?.deletedCount ?? 0;
    importErr.value = false;
    importMsg.value = `تم حذف مبيعات يوم ${deleteDate.value} بنجاح (${count} سجل)`;
    importDetails.value = [];
    await load();
  } catch (e) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل حذف مبيعات اليوم المحدد';
  } finally {
    saving.value = false;
  }
};

const downloadTemplate = async () => {
  try {
    const blob = await salesApi.downloadTemplate();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bin-al-ajouz-sales-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || 'فشل تحميل القالب');
  }
};

const showImportResult = (d, isValidate = false) => {
  if (isValidate) {
    importMsg.value = d.ok
      ? `الملف سليم: ${d.validCount} سطر جاهز للاستيراد${d.hasDeleteAll ? ' + أمر حذف كل المبيعات' : ''}`
      : 'الملف فيه أخطاء — راجع القائمة أدناه';
    importErr.value = !d.ok;
    importDetails.value = (d.parseErrors || []).map((e) => `سطر ${e.row}: ${e.message}`);
    if (d.ok && d.preview?.length) {
      importDetails.value.unshift(
        ...d.preview.map((r, i) => `✓ مثال سطر ${i + 2}: ${r.sale_date} | ${r.sale_type} | ${r.total_amount} ج.م`)
      );
    }
    return;
  }
  importMsg.value = `تم استيراد ${d.success} من ${d.total} سجل` +
    (d.hasDeleteAll ? ` — تم حذف ${d.deletedCount || 0} مبيعة حالية` : '') +
    (d.failed?.length ? ` — فشل ${d.failed.length}` : '') +
    (d.parseErrors?.length ? ` — تحذيرات: ${d.parseErrors.length}` : '');
  importDetails.value = [
    ...(d.parseErrors || []).map((e) => `تحذير سطر ${e.row}: ${e.message}`),
    ...(d.failed || []).map((e) => `فشل سطر ${e.row}: ${e.message}`),
  ];
  importErr.value = d.success === 0 && importDetails.value.length > 0;
};

const onValidate = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importMsg.value = 'جاري فحص الملف...';
  importErr.value = false;
  importDetails.value = [];
  try {
    const res = await salesApi.validateExcel(file);
    showImportResult(res.data, true);
  } catch (err) {
    importErr.value = true;
    importMsg.value = err.message || 'فشل فحص الملف';
    importDetails.value = String(err.message || '').split('|').map((s) => s.trim()).filter(Boolean);
  }
  e.target.value = '';
};

const onImport = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importMsg.value = '';
  importErr.value = false;
  importDetails.value = [];
  try {
    const validation = await salesApi.validateExcel(file);
    const confirmDeleteAll = validation?.data?.hasDeleteAll
      ? window.confirm('ملف الاستيراد يحتوي أمر delete_all وسيحذف كل المبيعات قبل الاستيراد. هل تريد المتابعة؟')
      : false;
    if (validation?.data?.hasDeleteAll && !confirmDeleteAll) return;

    const res = await salesApi.importExcel(file, {
      confirm: validation?.data?.hasDeleteAll ? 'CONFIRM_DELETE_ALL_SALES' : undefined,
    });
    showImportResult(res.data, false);
    await load();
  } catch (err) {
    importErr.value = true;
    importMsg.value = err.message || 'فشل الاستيراد';
  }
  e.target.value = '';
};

onMounted(async () => {
  const c = await customersApi.list({ limit: 200 });
  wholesaleCustomers.value = c.data.filter((x) => x.customer_type === 'wholesale');
  const codes = c.data.map((x) => x.code).filter(Boolean);
  if (codes.length) customerCodesHint.value = codes.join('، ');
  load();
});
</script>

<style lang="scss" scoped>
.sales-page { display: flex; flex-direction: column; gap: 20px; }
.page-toolbar {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px;
}
.opening-balance {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--warning) 22%, var(--border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--warning) 9%, var(--bg-elevated)), var(--bg-elevated));
}
.opening-balance-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.opening-balance-head h3 {
  margin: 0 0 4px;
  color: var(--text-strong);
  font-size: 1rem;
  font-weight: 900;
}
.opening-balance-head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.86rem;
}
.opening-balance-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.opening-balance-grid {
  align-items: end;
}
.opening-balance-msg {
  font-size: 0.88rem;
  color: var(--success);
  font-weight: 700;
  padding: 10px 12px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 18%, transparent);
}
.opening-balance-msg.err {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border-color: color-mix(in srgb, var(--danger) 20%, transparent);
}
.toolbar-actions { display: flex; gap: 8px; }
.import-btn { cursor: pointer; margin: 0; }
.icon-btn {
  width: 34px; height: 34px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  background: var(--bg-elevated); color: var(--text);
  cursor: pointer; transition: var(--transition);
  &:hover { background: var(--bg); border-color: var(--primary-soft); }
  &.warning { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  &.danger  { color: var(--danger);  border-color: color-mix(in srgb, var(--danger)  30%, transparent); }
}
.filter-row { display: flex; gap: 12px; flex-wrap: wrap; }
.filter-row .form-group { margin: 0; min-width: 140px; }
.tabs {
  display: flex; gap: 6px;
  button {
    padding: 10px 22px; border: 2px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-elevated); cursor: pointer; font-weight: 700; transition: var(--transition);
    &:hover { border-color: var(--primary-soft); }
    &.active {
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
      color: #fff; border-color: transparent;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }
}
.main-row { align-items: start; }
.form-card h3, .list-card h3 { margin-bottom: 16px; color: var(--text-strong); font-size: 1rem; font-weight: 800; }
.list-card { max-height: 640px; overflow: auto; }
.empty { text-align: center; color: var(--text-muted); padding: 24px; }
.excel-guide {
  summary { cursor: pointer; font-weight: 700; color: var(--text-strong); }
  .guide-note { color: var(--text-muted); font-size: 0.88rem; margin: 8px 0 12px; }
  .guide-table-wrap { overflow-x: auto; }
  .guide-table {
    width: 100%; font-size: 0.8rem; border-collapse: collapse;
    th, td { border: 1px solid var(--border); padding: 8px; text-align: right; }
    th { background: linear-gradient(135deg, var(--primary), var(--primary-strong)); color: #fff; }
    .ok-row { background: color-mix(in srgb, var(--success) 8%, transparent); }
    .warn-row { background: color-mix(in srgb, var(--warning) 10%, transparent); }
    .bad-row td { background: color-mix(in srgb, var(--danger) 8%, transparent); color: var(--danger); }
  }
  code { background: var(--bg); padding: 2px 6px; border-radius: 4px; font-size: 0.82rem; }
  .guide-list { margin: 12px 0 0; padding-right: 20px; font-size: 0.88rem; }
}
.import-result { margin-top: 4px; border-radius: var(--radius-sm); padding: 12px 16px; background: color-mix(in srgb, var(--success) 8%, transparent); border: 1px solid color-mix(in srgb, var(--success) 20%, transparent); }
.import-result.err { background: color-mix(in srgb, var(--danger) 6%, transparent); border-color: color-mix(in srgb, var(--danger) 20%, transparent); }
.import-msg { margin: 0 0 8px; font-weight: 700; color: var(--success); }
.import-result.err .import-msg { color: var(--danger); }
.import-details { margin: 0; padding-right: 20px; font-size: 0.88rem; color: var(--text); li { margin: 4px 0; } }
.import-hint { margin: 10px 0 0; font-size: 0.84rem; color: var(--text-muted); }
.danger-actions {
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  background: color-mix(in srgb, var(--danger) 3%, transparent);
  border-radius: var(--radius-sm); padding: 16px 20px; margin-top: 4px;
}
.danger-title {
  font-weight: 800; color: var(--text-strong); margin-bottom: 14px;
  font-size: 0.95rem; display: flex; align-items: center; gap: 6px;
}
.danger-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 0; border-bottom: 1px solid color-mix(in srgb, var(--danger) 12%, transparent);
  &:last-child { border-bottom: none; padding-bottom: 0; }
}
.danger-label {
  font-size: 0.82rem; font-weight: 700; color: var(--text-muted);
  min-width: 110px; flex-shrink: 0;
}
.date-input {
  padding: 8px 12px; border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs); background: var(--bg-elevated);
  font-size: 0.88rem; max-width: 160px;
}
.delete-type-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 16px; border-radius: var(--radius-sm);
  font-weight: 700; font-size: 0.88rem; cursor: pointer;
  transition: var(--transition); border: 2px solid transparent;

  .btn-icon { font-size: 1rem; }
  .btn-text { white-space: nowrap; }

  &:disabled { opacity: 0.45; cursor: not-allowed; }

  &.branch {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary-dark);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--primary); color: #fff; border-color: var(--primary);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }

  &.wholesale {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--accent); color: #fff; border-color: var(--accent);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent);
    }
  }

  &.day {
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--warning); color: #fff; border-color: var(--warning);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--warning) 35%, transparent);
    }
  }

  &.all {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--danger); color: #fff; border-color: var(--danger);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--danger) 35%, transparent);
    }
  }
}
@media (max-width: 900px) { .main-row { grid-template-columns: 1fr; } }
/* Partial payment */
.partial-payment-box {
  background: color-mix(in srgb, var(--warning) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  margin-bottom: 16px;
}
.partial-header {
  display: flex; align-items: center; gap: 8px;
  font-weight: 800; font-size: 0.9rem; color: var(--warning);
  margin-bottom: 12px;
  .partial-icon { font-size: 1.1rem; }
}
.remaining-display {
  padding: 11px 14px;
  border-radius: var(--radius-xs);
  font-weight: 800; font-size: 1rem;
  border: 2px solid;
  &.has-remaining {
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    color: var(--danger);
  }
  &.no-remaining {
    background: color-mix(in srgb, var(--success) 8%, transparent);
    border-color: color-mix(in srgb, var(--success) 30%, transparent);
    color: var(--success);
  }
}
.remaining-note {
  margin-top: 10px; font-size: 0.84rem; font-weight: 700;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  padding: 8px 12px; border-radius: var(--radius-xs);
}
</style>
