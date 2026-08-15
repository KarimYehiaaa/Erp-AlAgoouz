<template>
  <div class="sales-page">
    <SalesToolbar
      :active-tab="activeTab"
      :filters="filters"
      @download-template="downloadTemplate"
      @validate="onValidate"
      @import="onImport"
      @update:from_date="onFromDateChange"
      @update:to_date="onToDateChange"
      @select-month="selectMonth"
    />

    <OpeningBalanceLedger
      :form="openingBalanceForm"
      :loading="openingBalanceLoading"
      :saving="openingBalanceSaving"
      :editing="openingBalanceEditing"
      :msg="openingBalanceMsg"
      :err="openingBalanceErr"
      :format-money="formatMoney"
      @start-edit="startOpeningBalanceEdit"
      @save="saveOpeningBalance"
    />

    <div class="tabs" style="position: relative">
      <div
        class="tab-slider"
        :style="{
          transform:
            activeTab === 'branch'
              ? 'translateX(0)'
              : activeTab === 'wholesale'
                ? 'translateX(calc(-100% - 7px))'
                : 'translateX(calc(-200% - 14px))',
        }"
      ></div>
      <button
        type="button"
        :class="{ active: activeTab === 'branch' }"
        @click="switchTab('branch')"
      >
        🏪 يومي
      </button>
      <button
        type="button"
        :class="{ active: activeTab === 'wholesale' }"
        @click="switchTab('wholesale')"
      >
        📦 جملة
      </button>
      <button
        type="button"
        :class="{ active: activeTab === 'monthly' }"
        @click="switchTab('monthly')"
      >
        📊 شهري
      </button>
    </div>

    <SalesSummaryCard
      :sales-health="salesHealth"
      :active-tab="activeTab"
      :total-opening-balance-debts="totalOpeningBalanceDebts"
      :opening-balance-form="openingBalanceForm"
      :collected-total="collectedTotal"
      :open-credit-total="openCreditTotal"
      :period-cash-total="periodCashTotal"
      :format-money="formatMoney"
    />

    <div v-if="activeTab === 'wholesale'" class="grid grid-4 stats-row">
      <StatCard label="مبيعات جملة الفترة" :value="periodTotal" icon="coins" />
      <StatCard label="المحصل المباشر" :value="collectedTotal" icon="check" />
      <StatCard
        label="ديون مرحلة سابقة/افتتاحية"
        :value="totalOpeningBalanceDebts"
        icon="reports"
      />
      <StatCard label="إجمالي ديون العملاء الكلية" :value="totalCustomerDebts" icon="warning" />
    </div>
    <div v-else class="grid grid-3 stats-row">
      <StatCard label="إجمالي الفترة" :value="periodTotal" icon="coins" />
      <StatCard label="المحصل" :value="collectedTotal" icon="check" />
      <StatCard label="آجل/جزئي" :value="openCreditTotal" icon="warning" />
    </div>

    <!-- 1. المبيعات اليومية (الفرع): نموذج الإدخال اليدوي + سجل مبيعات الفرع اليومية -->
    <BranchSalesPanel
      v-if="activeTab === 'branch'"
      :editing-sale-id="editingSaleId"
      :editing-sale-number="editingSaleNumber"
      :form="form"
      :saving="saving"
      :remaining-amount="remainingAmount"
      :sales="sales"
      :active-columns="activeColumns"
      :loading-sales="loadingSales"
      :period-total="periodTotal"
      :format-money="formatMoney"
      :format-date="formatDate"
      :payment-badge="paymentBadge"
      :payment-status-label="paymentStatusLabel"
      @submit="submitSale"
      @cancel-edit="cancelEdit"
      @start-edit="startEdit"
    />

    <!-- 2. مبيعات الجملة (wholesale): جدول فواتير الجملة للعملاء فقط -->
    <WholesaleSalesPanel
      v-else-if="activeTab === 'wholesale'"
      :sales="sales"
      :active-columns="activeColumns"
      :loading-sales="loadingSales"
      :period-total="periodTotal"
      :format-money="formatMoney"
      :format-date="formatDate"
      :payment-badge="paymentBadge"
      :payment-status-label="paymentStatusLabel"
    />

    <!-- 3. المبيعات الشهرية (monthly): رفع واستيراد ملفات Excel فقط -->
    <MonthlyImportPanel
      v-else-if="activeTab === 'monthly'"
      :importing="monthlyImporting"
      :validating="monthlyValidating"
      :msg="monthlyImportMsg"
      :err="monthlyImportErr"
      :details="monthlyImportDetails"
      @download-template="downloadMonthlyTemplate"
      @validate="onValidateMonthly"
      @import="onImportMonthly"
    />

    <ExcelGuide :customer-codes-hint="customerCodesHint" />

    <div
      v-if="importMsg || importDetails.length"
      class="import-result card"
      :class="{ err: importErr }"
    >
      <p class="import-msg" :class="{ err: importErr }">{{ importMsg }}</p>
      <ul v-if="importDetails.length" class="import-details">
        <li v-for="(d, i) in importDetails" :key="i">{{ d }}</li>
      </ul>
      <p v-if="importDetails.length" class="import-hint">
        التحذيرات = صفوف لم تُستورد (بيانات ناقصة أو غير صحيحة). احذف صفوف الأمثلة/التعليمات من ورقة
        «مبيعات» قبل الرفع.
      </p>
    </div>

    <SalesDangerActions
      :saving="saving"
      v-model:delete-date="deleteDate"
      @delete-type="deleteSalesByType"
      @delete-day="deleteSalesForOneDay"
      @delete-all="deleteAllSales"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StatCard from '@/components/StatCard.vue';
import SalesSummaryCard from '@/components/sales/SalesSummaryCard.vue';
import SalesToolbar from '@/components/sales/SalesToolbar.vue';
import OpeningBalanceLedger from '@/components/sales/OpeningBalanceLedger.vue';
import BranchSalesPanel from '@/components/sales/BranchSalesPanel.vue';
import WholesaleSalesPanel from '@/components/sales/WholesaleSalesPanel.vue';
import MonthlyImportPanel from '@/components/sales/MonthlyImportPanel.vue';
import ExcelGuide from '@/components/sales/ExcelGuide.vue';
import SalesDangerActions from '@/components/sales/SalesDangerActions.vue';
import { sales as salesApi, customers as customersApi } from '@/api';
import { formatMoney } from '@/utils/currency';

const route = useRoute();
const router = useRouter();

const localTodayYmd = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const today = localTodayYmd();
const activeTab = ref<string>((route.query.tab as string) || 'branch');
const sales = ref<any[]>([]);
const loadingSales = ref(false);

watch(
  () => route.query.tab,
  (newTab: any) => {
    if (newTab && newTab !== activeTab.value) {
      activeTab.value = String(newTab);
      load();
    }
  },
);

const activeColumns = computed(() => {
  if (activeTab.value === 'wholesale') {
    return [
      { key: 'sale_date', label: 'التاريخ' },
      { key: 'sale_number', label: 'رقم الفاتورة' },
      { key: 'customer_name', label: 'اسم العميل' },
      { key: 'total_amount', label: 'المبلغ' },
      { key: 'payment_status', label: 'حالة الدفع' },
      { key: 'actions', label: 'إجراء', align: 'center' },
    ];
  }
  return [
    { key: 'sale_date', label: 'التاريخ' },
    { key: 'sale_number', label: 'رقم العملية' },
    { key: 'total_amount', label: 'المبلغ' },
    { key: 'payment_status', label: 'حالة الدفع' },
    { key: 'actions', label: 'إجراء', align: 'center' },
  ];
});
const wholesaleCustomers = ref<any[]>([]);
const allCustomers = ref<any[]>([]);
const totalCustomerDebts = computed(() => {
  return allCustomers.value.reduce((sum: any, cust: any) => {
    const bal = Number((cust.total_balance ?? cust.balance) || 0);
    return sum + (bal > 0 ? bal : 0);
  }, 0);
});
const totalOpeningBalanceDebts = computed(() => {
  return allCustomers.value.reduce((sum: any, cust: any) => {
    return sum + Number(cust.opening_balance || 0);
  }, 0);
});
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
const importDetails = ref<any[]>([]);
const monthlyImportMsg = ref('');
const monthlyImportErr = ref(false);
const monthlyImportDetails = ref<any[]>([]);
const monthlyValidating = ref(false);
const monthlyImporting = ref(false);
const customerCodesHint = ref('C-001, C-002, C-003, C-004 (أو اترك فارغاً)');
const deleteDate = ref(today);
const editingSaleId = ref<any>(null);
const editingSaleNumber = ref('');

const filters = ref({
  from_date: today.slice(0, 8) + '01',
  to_date: today,
});

const form = ref<{
  sale_date: string;
  total_amount: number | null;
  customer_id: number | null;
  payment_method: string;
  payment_status: string;
  paid_amount: number | null;
  notes: string;
}>({
  sale_date: today,
  total_amount: null,
  customer_id: null,
  payment_method: 'cash',
  payment_status: 'paid',
  paid_amount: null,
  notes: '',
});

const remainingAmount = computed(() => {
  if (form.value.payment_status !== 'partial') return 0;
  const total = Number(form.value.total_amount || 0);
  const paid = Number(form.value.paid_amount || 0);
  return Math.max(0, total - paid);
});

const periodTotal = computed(() =>
  sales.value
    .filter((s: any) => s.status === 'completed')
    .reduce((sum: any, s: any) => sum + parseFloat(s.total_amount || 0), 0),
);
const completedSales = computed(() => sales.value.filter((s: any) => s.status === 'completed'));
const isOpenPayment = (sale: any) => ['partial', 'unpaid'].includes(sale?.payment_status);
const collectedTotal = computed(() =>
  completedSales.value.reduce((sum: any, sale: any) => {
    if (sale.payment_status === 'paid') return sum + Number(sale.total_amount || 0);
    return sum;
  }, 0),
);
const openCreditTotal = computed(() => {
  if (activeTab.value === 'wholesale') {
    return totalCustomerDebts.value;
  }
  return completedSales.value.reduce((sum: any, sale: any) => {
    if (isOpenPayment(sale)) return sum + Number(sale.total_amount || 0);
    return sum;
  }, 0);
});
const openPaymentCount = computed(
  () => completedSales.value.filter((sale: any) => isOpenPayment(sale)).length,
);
const periodCashTotal = computed(
  () => Number(openingBalanceForm.value.amount || 0) + collectedTotal.value,
);
const salesListQuery = computed(() => ({
  sale_type:
    activeTab.value === 'branch'
      ? 'branch'
      : activeTab.value === 'wholesale'
        ? 'wholesale'
        : undefined,
  from_date: filters.value.from_date,
  to_date: filters.value.to_date,
  limit: 200,
}));
const salesHealth = computed(() => {
  if (activeTab.value === 'wholesale') {
    if (openCreditTotal.value > 0) {
      return {
        tone: 'warning',
        title: 'مديونيات عملاء مستحقة للتحصيل',
        message: `إجمالي رصيد مديونيات العملاء الكلية المتبقية للتحصيل هو ${formatMoney(openCreditTotal.value)} (شاملة الأرصدة الافتتاحية ومسحوبات الفواتير وتتخصم تلقائياً عند السداد).`,
      };
    }
  }
  if (openPaymentCount.value > 0) {
    return {
      tone: 'warning',
      title: 'في مبيعات محتاجة متابعة تحصيل',
      message: `${openPaymentCount.value} عملية دفعها جزئي أو آجل. الرقم المعروض كآجل/جزئي هو قيمة العمليات المفتوحة للمتابعة.`,
    };
  }
  if (periodTotal.value <= 0) {
    return {
      tone: 'muted',
      title: 'لا توجد مبيعات مكتملة في الفترة',
      message: 'اختار فترة مختلفة أو ابدأ تسجيل المبيعات عشان تظهر مؤشرات التحصيل.',
    };
  }
  return {
    tone: 'success',
    title: 'مبيعات الفترة محصلة بالكامل',
    message: 'كل المبيعات المكتملة في الفترة مدفوعة بالكامل حسب حالة الدفع المسجلة.',
  };
});
const formatDate = (d: any) => {
  const val = d?.split?.('T')?.[0] || d;
  if (!val) return '—';
  // Keep DATE values as plain text to avoid any timezone conversion.
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, day] = val.split('-');
    return `${day}/${m}/${y}`;
  }
  return new Date(val).toLocaleDateString('en-GB');
};

const paymentStatusLabel = (s: any) =>
  (
    ({ paid: 'مدفوع', partial: 'جزئي', unpaid: 'آجل', refunded: 'مسترد' }) as Record<string, string>
  )[s] ||
  s ||
  '—';
const paymentBadge = (s: any) => [
  'badge',
  s === 'paid'
    ? 'badge-success'
    : s === 'unpaid'
      ? 'badge-danger'
      : s === 'partial'
        ? 'badge-warning'
        : 'badge-danger',
];

const switchTab = (tab: any) => {
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } }).catch(() => {});
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
  } catch (e: any) {
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
  } catch (e: any) {
    openingBalanceErr.value = true;
    openingBalanceMsg.value = e.message || 'فشل حفظ بداية المدة';
  } finally {
    openingBalanceSaving.value = false;
  }
};

const startEdit = async (sale: any) => {
  saving.value = true;
  try {
    const res = await salesApi.get(sale.id);
    const detail = res.data;
    editingSaleId.value = detail.id;
    editingSaleNumber.value = detail.sale_number;
    activeTab.value = detail.sale_type || activeTab.value;
    const paidAmount = (detail.payments || []).reduce(
      (sum: any, p: any) => sum + Number(p.amount || 0),
      0,
    );
    form.value = {
      sale_date: String(detail.sale_date || today).split('T')[0] ?? '',
      total_amount: Number(detail.total_amount || 0),
      customer_id: detail.customer_id || null,
      payment_method: detail.payments?.[0]?.method || 'cash',
      payment_status: detail.payment_status || 'paid',
      paid_amount: detail.payment_status === 'partial' ? paidAmount : null,
      notes: detail.notes || '',
    };
  } catch (e: any) {
    alert(e.message || 'فشل تحميل الفاتورة للتعديل');
  } finally {
    saving.value = false;
  }
};

const selectMonth = (value: string) => {
  if (!value) return;
  const [yearRaw, monthRaw] = value.split('-').map(Number);
  const year = yearRaw ?? 0;
  const month = monthRaw ?? 0;
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  filters.value.from_date = fromDate;
  filters.value.to_date = toDate;
  load();
};

const onFromDateChange = (v: string) => {
  filters.value.from_date = v;
  load();
};

const onToDateChange = (v: string) => {
  filters.value.to_date = v;
  load();
};

const load = async () => {
  loadingSales.value = true;
  try {
    const [salesRes, openingRes, customersRes] = await Promise.all([
      salesApi.list(salesListQuery.value),
      salesApi
        .openingBalance({
          from_date: filters.value.from_date,
          to_date: filters.value.to_date,
        })
        .catch(() => null),
      customersApi.list({ limit: 500 }).catch(() => null),
    ]);
    sales.value = salesRes.data;
    if (customersRes?.data) {
      allCustomers.value = customersRes.data;
      wholesaleCustomers.value = customersRes.data.filter(
        (x: any) => x.customer_type === 'wholesale',
      );
    }
    if (openingRes?.data) {
      openingBalanceForm.value = {
        from_date: openingRes.data.from_date || filters.value.from_date,
        to_date: openingRes.data.to_date || filters.value.to_date,
        amount: Number(openingRes.data.amount || 0),
      };
    }
  } catch (err: any) {
    console.error('Failed to load sales:', err);
  } finally {
    loadingSales.value = false;
  }
};

const submitSale = async () => {
  if (activeTab.value === 'wholesale' && !form.value.customer_id) {
    alert('عذراً، يجب اختيار واسم العميل مطلوب لتسجيل فاتورة مبيعات الجملة.');
    return;
  }
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
      form.value.paid_amount = null;
    }
    await load();
  } catch (e: any) {
    alert(e.message);
  } finally {
    saving.value = false;
  }
};

const deleteAllSales = async () => {
  const confirmed = window.confirm(
    'تأكيد نهائي: سيتم حذف كل بيانات قسم المبيعات الحالية. هل تريد المتابعة؟',
  );
  if (!confirmed) return;
  saving.value = true;
  try {
    const res = await salesApi.deleteAll();
    const count = res?.data?.deletedCount ?? 0;
    importErr.value = false;
    importMsg.value = `تم حذف كل بيانات المبيعات بنجاح (${count} سجل)`;
    importDetails.value = [];
    await load();
  } catch (e: any) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل حذف بيانات المبيعات';
  } finally {
    saving.value = false;
  }
};

const deleteSalesByType = async (saleType: any) => {
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
  } catch (e: any) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل الحذف';
  } finally {
    saving.value = false;
  }
};

const deleteSalesForOneDay = async () => {
  const confirmed = window.confirm(
    `تأكيد: سيتم حذف كل مبيعات يوم ${deleteDate.value} فقط. هل تريد المتابعة؟`,
  );
  if (!confirmed) return;
  saving.value = true;
  try {
    const res = await salesApi.deleteByDate(deleteDate.value);
    const count = res?.data?.deletedCount ?? 0;
    importErr.value = false;
    importMsg.value = `تم حذف مبيعات يوم ${deleteDate.value} بنجاح (${count} سجل)`;
    importDetails.value = [];
    await load();
  } catch (e: any) {
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
  } catch (e: any) {
    alert(e.message || 'فشل تحميل القالب');
  }
};

const showImportResult = (d: any, isValidate = false) => {
  if (isValidate) {
    importMsg.value = d.ok
      ? `الملف سليم: ${d.validCount} سطر جاهز للاستيراد${d.hasDeleteAll ? ' + أمر حذف كل المبيعات' : ''}`
      : 'الملف فيه أخطاء — راجع القائمة أدناه';
    importErr.value = !d.ok;
    importDetails.value = (d.parseErrors || []).map((e: any) => `سطر ${e.row}: ${e.message}`);
    if (d.ok && d.preview?.length) {
      importDetails.value.unshift(
        ...d.preview.map(
          (r: any, i: any) =>
            `✓ مثال سطر ${i + 2}: ${r.sale_date} | ${r.sale_type} | ${r.total_amount} ج.م`,
        ),
      );
    }
    return;
  }
  importMsg.value =
    `تم استيراد ${d.success} من ${d.total} سجل` +
    (d.hasDeleteAll ? ` — تم حذف ${d.deletedCount || 0} مبيعة حالية` : '') +
    (d.failed?.length ? ` — فشل ${d.failed.length}` : '') +
    (d.parseErrors?.length ? ` — تحذيرات: ${d.parseErrors.length}` : '');
  importDetails.value = [
    ...(d.parseErrors || []).map((e: any) => `تحذير سطر ${e.row}: ${e.message}`),
    ...(d.failed || []).map((e: any) => `فشل سطر ${e.row}: ${e.message}`),
  ];
  importErr.value = d.success === 0 && importDetails.value.length > 0;
};

const showMonthlyImportResult = (d: any, isValidate = false) => {
  if (isValidate) {
    monthlyImportMsg.value = d.ok
      ? `الملف جاهز: ${d.groupCount || 0} يوم/دفعة و ${d.itemCount || 0} صنف سيتم خصمهم من مخزون المحل`
      : 'الملف يحتاج مراجعة قبل الاستيراد';
    monthlyImportErr.value = !d.ok;
    monthlyImportDetails.value = (d.parseErrors || []).map(
      (e: any) => `سطر ${e.row}: ${e.message}`,
    );
    if (d.ok && d.preview?.length) {
      monthlyImportDetails.value.unshift(
        ...d.preview.map(
          (r: any) => `✓ ${r.sale_date} | ${r.payment_method} | ${r.items_count} صنف | ${r.sample}`,
        ),
      );
    }
    return;
  }

  monthlyImportMsg.value = `تم استيراد ${d.success || 0} من ${d.total || 0} عملية شهرية وخصم ${d.itemsImported || 0} صنف من مخزون المحل`;
  monthlyImportErr.value =
    Boolean((d.failed || []).length) ||
    ((d.success || 0) === 0 && Boolean((d.parseErrors || []).length));
  monthlyImportDetails.value = [
    ...(d.parseErrors || []).map((e: any) => `تحذير سطر ${e.row}: ${e.message}`),
    ...(d.failed || []).map((e: any) => `فشل ${e.sale_date || ''}: ${e.message}`),
  ];
};

const downloadMonthlyTemplate = async () => {
  try {
    const blob = await salesApi.downloadBranchTemplate();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'monthly-store-sales-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    monthlyImportErr.value = true;
    monthlyImportMsg.value = e.message || 'فشل تحميل قالب المبيعات الشهرية';
  }
};

const onValidateMonthly = async (file: File) => {
  if (!file) return;
  monthlyValidating.value = true;
  monthlyImportMsg.value = 'جاري فحص ملف المبيعات الشهرية...';
  monthlyImportErr.value = false;
  monthlyImportDetails.value = [];
  try {
    const res = await salesApi.branchValidateExcel(file);
    showMonthlyImportResult(res.data, true);
  } catch (err: any) {
    monthlyImportErr.value = true;
    monthlyImportMsg.value = err.message || 'فشل فحص ملف المبيعات الشهرية';
    monthlyImportDetails.value = String(err.message || '')
      .split('|')
      .map((s: any) => s.trim())
      .filter(Boolean);
  } finally {
    monthlyValidating.value = false;
  }
};

const onImportMonthly = async (file: File) => {
  if (!file) return;
  monthlyImporting.value = true;
  monthlyImportMsg.value = 'جاري استيراد المبيعات الشهرية وخصم مخزون المحل...';
  monthlyImportErr.value = false;
  monthlyImportDetails.value = [];
  try {
    const validation = await salesApi.branchValidateExcel(file);
    if (!validation?.data?.ok) {
      showMonthlyImportResult(validation.data, true);
      return;
    }
    const res = await salesApi.branchImportExcel(file);
    showMonthlyImportResult(res.data, false);
    await load();
  } catch (err: any) {
    monthlyImportErr.value = true;
    monthlyImportMsg.value = err.message || 'فشل استيراد المبيعات الشهرية';
  } finally {
    monthlyImporting.value = false;
  }
};

const onValidate = async (file: File) => {
  if (!file) return;
  importMsg.value = 'جاري فحص الملف...';
  importErr.value = false;
  importDetails.value = [];
  try {
    const res = await salesApi.validateExcel(file);
    showImportResult(res.data, true);
  } catch (err: any) {
    importErr.value = true;
    importMsg.value = err.message || 'فشل فحص الملف';
    importDetails.value = String(err.message || '')
      .split('|')
      .map((s: any) => s.trim())
      .filter(Boolean);
  }
};

const onImport = async (file: File) => {
  if (!file) return;
  importMsg.value = '';
  importErr.value = false;
  importDetails.value = [];
  try {
    const validation = await salesApi.validateExcel(file);
    const confirmDeleteAll = validation?.data?.hasDeleteAll
      ? window.confirm(
          'ملف الاستيراد يحتوي أمر delete_all وسيحذف كل المبيعات قبل الاستيراد. هل تريد المتابعة؟',
        )
      : false;
    if (validation?.data?.hasDeleteAll && !confirmDeleteAll) return;

    const res = await salesApi.importExcel(file, {
      confirm: validation?.data?.hasDeleteAll ? 'CONFIRM_DELETE_ALL_SALES' : undefined,
    });
    showImportResult(res.data, false);
    await load();
  } catch (err: any) {
    importErr.value = true;
    importMsg.value = err.message || 'فشل الاستيراد';
  }
};

onMounted(async () => {
  const c = await customersApi.list({ limit: 200 });
  wholesaleCustomers.value = c.data.filter((x: any) => x.customer_type === 'wholesale');
  const codes = c.data.map((x: any) => x.code).filter(Boolean);
  if (codes.length) customerCodesHint.value = codes.join('، ');
  load();
});
</script>

<style lang="scss" scoped>
.sales-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  --sales-panel-bg: color-mix(in srgb, var(--card-bg) 88%, var(--primary) 4%);
  --sales-panel-border: color-mix(in srgb, var(--primary) 15%, var(--card-border));
  --sales-soft: color-mix(in srgb, var(--primary) 8%, transparent);
  --sales-grid-line: color-mix(in srgb, var(--primary) 5%, transparent);
}
.tabs {
  position: relative;
  display: flex;
  width: fit-content;
  max-width: 100%;
  gap: 7px;
  padding: 7px;
  border-radius: 999px;
  border: 1px solid var(--sales-panel-border);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--bg-elevated) 86%, transparent),
    color-mix(in srgb, var(--primary) 5%, transparent)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    var(--shadow-xs);

  .tab-slider {
    position: absolute;
    top: 7px;
    bottom: 7px;
    right: 7px;
    width: calc(33.333% - 9px);
    border-radius: 999px;
    background: linear-gradient(135deg, var(--primary), var(--primary-strong));
    box-shadow: 0 10px 24px color-mix(in srgb, var(--primary) 30%, transparent);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
  }

  button {
    position: relative;
    z-index: 2;
    padding: 11px 24px;
    border: none !important;
    border-radius: 999px;
    background: transparent !important;
    color: var(--text-muted);
    cursor: pointer;
    font-weight: 900;
    transition: color 0.28s ease;
    box-shadow: none !important;
    transform: none !important;

    &:hover {
      color: var(--text-strong);
    }
    &.active {
      color: #fff !important;
    }
  }
}
.stats-row {
  gap: 14px;
}
.stats-row :deep(.stat-card) {
  position: relative;
  overflow: hidden;
  min-height: 106px;
  align-items: flex-start;
  padding: 18px;
  border-color: var(--sales-panel-border);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, transparent), transparent 44%),
    color-mix(in srgb, var(--card-bg) 92%, var(--bg-elevated));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    var(--shadow-xs);
}
.stats-row :deep(.stat-card::after) {
  content: '';
  position: absolute;
  inset-inline-start: -44px;
  bottom: -54px;
  width: 130px;
  height: 130px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.stats-row :deep(.stat-icon-wrap) {
  order: 2;
  margin-inline-start: auto;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--primary) 11%, var(--bg-elevated));
  color: var(--primary-strong);
}
.stats-row :deep(.stat-info) {
  position: relative;
  z-index: 1;
}
.stats-row :deep(.stat-label) {
  font-size: 0.78rem;
  font-weight: 950;
}
.stats-row :deep(.stat-value) {
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-weight: 950;
  letter-spacing: -0.04em;
}
.import-result {
  margin-top: 4px;
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  background: color-mix(in srgb, var(--success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}
.import-result.err {
  background: color-mix(in srgb, var(--danger) 6%, transparent);
  border-color: color-mix(in srgb, var(--danger) 20%, transparent);
}
.import-msg {
  margin: 0 0 8px;
  font-weight: 700;
  color: var(--success);
}
.import-result.err .import-msg {
  color: var(--danger);
}
.import-details {
  margin: 0;
  padding-right: 20px;
  font-size: 0.88rem;
  color: var(--text);
  li {
    margin: 4px 0;
  }
}
.import-hint {
  margin: 10px 0 0;
  font-size: 0.84rem;
  color: var(--text-muted);
}
</style>
