<template>
  <div class="sales-page">
    <div class="page-toolbar card">
      <div v-if="activeTab !== 'monthly'" class="toolbar-actions">
        <router-link
          to="/invoices/create"
          class="btn btn-primary btn-sm"
          style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600"
        >
          <span>+ إنشاء فاتورة جملة</span>
        </router-link>
        <router-link
          to="/invoices/quotes"
          class="btn btn-outline btn-sm"
          style="display: inline-flex; align-items: center; gap: 6px"
        >
          <span>عرض أسعار</span>
        </router-link>
        <button
          type="button"
          class="icon-btn"
          title="تحميل قالب الاستيراد"
          @click="downloadTemplate"
        >
          📥
        </button>
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
        <div class="form-group month-picker-group">
          <label>&nbsp;</label>
          <div class="month-filter-btn" title="اختر الشهر بالكامل">
            <AppIcon name="calendar" :size="18" />
            <input type="month" class="month-picker-overlay" @change="selectMonth" />
          </div>
        </div>
      </div>
    </div>

    <section
      class="opening-balance opening-ledger"
      :class="{ editing: openingBalanceEditing, saving: openingBalanceSaving }"
    >
      <div class="ledger-glow" aria-hidden="true"></div>
      <div class="opening-balance-head">
        <div class="ledger-title">
          <span class="ledger-mark" aria-hidden="true">رصيد</span>
          <div>
            <h3>بداية المدة</h3>
            <p>الرصيد المرحل قبل مبيعات الفترة، يدخل في صافي التدفق فقط.</p>
          </div>
        </div>
        <div class="ledger-amount">
          <span>الرصيد المسجل</span>
          <strong>{{ formatMoney(openingBalanceForm.amount || 0) }}</strong>
        </div>
        <div class="opening-balance-actions">
          <button
            type="button"
            class="ledger-action secondary"
            :disabled="openingBalanceLoading || openingBalanceSaving"
            @click="startOpeningBalanceEdit"
          >
            تعديل
          </button>
          <button
            type="button"
            class="ledger-action primary"
            :disabled="openingBalanceSaving || !openingBalanceEditing"
            @click="saveOpeningBalance"
          >
            {{ openingBalanceSaving ? 'جارٍ الحفظ...' : 'حفظ' }}
          </button>
        </div>
      </div>
      <div class="opening-balance-grid">
        <div class="ledger-field">
          <span>من تاريخ</span>
          <input
            v-model="openingBalanceForm.from_date"
            type="date"
            :disabled="!openingBalanceEditing"
          />
        </div>
        <div class="ledger-field">
          <span>إلى تاريخ</span>
          <input
            v-model="openingBalanceForm.to_date"
            type="date"
            :disabled="!openingBalanceEditing"
          />
        </div>
        <div class="ledger-field amount-field">
          <span>المبلغ المرحل</span>
          <input
            v-model.number="openingBalanceForm.amount"
            type="number"
            min="0"
            step="0.01"
            :disabled="!openingBalanceEditing"
            placeholder="0.00"
          />
        </div>
      </div>
      <div v-if="openingBalanceMsg" class="opening-balance-msg" :class="{ err: openingBalanceErr }">
        {{ openingBalanceMsg }}
      </div>
    </section>

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

    <section class="sales-insight card" :class="salesHealth.tone">
      <div class="insight-copy">
        <span class="eyebrow">ملخص الفترة</span>
        <h3>{{ salesHealth.title }}</h3>
        <p>{{ salesHealth.message }}</p>
      </div>
      <div class="insight-metrics">
        <div class="insight-tile">
          <span>{{ activeTab === 'wholesale' ? 'ديون سابقة/افتتاحية' : 'بداية المدة' }}</span>
          <strong>{{
            formatMoney(
              activeTab === 'wholesale' ? totalOpeningBalanceDebts : openingBalanceForm.amount || 0,
            )
          }}</strong>
        </div>
        <div class="insight-tile success">
          <span>مبيعات محصلة</span>
          <strong>{{ formatMoney(collectedTotal) }}</strong>
        </div>
        <div class="insight-tile warning">
          <span>{{
            activeTab === 'wholesale' ? 'إجمالي ديون العملاء الكلية' : 'آجل/جزئي للمتابعة'
          }}</span>
          <strong>{{ formatMoney(openCreditTotal) }}</strong>
        </div>
        <div class="insight-tile primary">
          <span>رصيد متوقع</span>
          <strong>{{ formatMoney(periodCashTotal) }}</strong>
        </div>
      </div>
    </section>

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
    <div v-if="activeTab === 'branch'" class="grid main-row" :class="{ 'grid-2': !editingSaleId }">
      <Teleport to="body" :disabled="!editingSaleId">
        <div
          :class="{ 'modal-overlay': editingSaleId }"
          @click.self="editingSaleId ? cancelEdit() : null"
        >
          <div class="card form-card" :class="{ 'modal-card': editingSaleId }">
            <h3>
              {{ editingSaleId ? 'تعديل بيع' : 'تسجيل مبيعات يومية' }}
            </h3>
            <form @submit.prevent="submitSale">
              <div v-if="editingSaleId" class="edit-banner">
                <span>وضع التعديل مفعل للفاتورة {{ editingSaleNumber }}</span>
                <button type="button" class="btn btn-outline btn-sm" @click="cancelEdit">
                  إلغاء التعديل
                </button>
              </div>
              <div class="form-group">
                <label>تاريخ المبيعات *</label>
                <input v-model="form.sale_date" type="date" required />
              </div>
              <div class="form-group">
                <label>المبلغ (ج.م) *</label>
                <input
                  v-model.number="form.total_amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                />
              </div>
              <div class="form-group">
                <label>حالة الدفع *</label>
                <select v-model="form.payment_status">
                  <option value="paid">مدفوع بالكامل</option>
                  <option value="partial">دفع جزئي</option>
                  <option value="unpaid">آجل (غير مدفوع)</option>
                </select>
              </div>
              <div v-if="form.payment_status === 'partial'" class="form-group">
                <label>المبلغ المدفوع حالياً (ج.م) *</label>
                <input
                  v-model.number="form.paid_amount"
                  type="number"
                  min="0.01"
                  :max="form.total_amount || undefined"
                  step="0.01"
                  required
                  placeholder="أدخل المبلغ المدفوع"
                />
                <div v-if="remainingAmount > 0" class="field-hint warning">
                  ⚠️ سيُضاف {{ formatMoney(remainingAmount) }} لرصيد العميل المستحق
                </div>
              </div>
              <div class="form-group">
                <label>ملاحظات</label>
                <textarea v-model="form.notes" rows="2"></textarea>
              </div>
              <button type="submit" class="btn btn-primary" :disabled="saving">
                {{ saving ? 'جاري الحفظ...' : editingSaleId ? 'حفظ التعديل' : 'حفظ' }}
              </button>
            </form>
          </div>
        </div>
      </Teleport>

      <div class="card table-wrap list-card sales-history-card">
        <div class="history-head">
          <div>
            <h3>سجل المبيعات اليومية</h3>
            <p>{{ sales.length }} عملية</p>
          </div>
          <div style="display: flex; align-items: center; gap: 12px">
            <router-link to="/branch-sales" class="btn btn-outline btn-sm">
              <span>🛒 شاشة الكاشير والمبيعات السريعة</span>
            </router-link>
            <span class="history-total">{{ formatMoney(periodTotal) }}</span>
          </div>
        </div>
        <BaseTable
          :items="sales"
          :columns="activeColumns"
          :loading="loadingSales"
          empty-message="لا توجد مبيعات يومية للفرع في هذه الفترة"
        >
          <template #cell-sale_date="{ item }">
            <span class="history-date">{{ formatDate(item.sale_date || item.created_at) }}</span>
          </template>
          <template #cell-sale_number="{ item }">
            <span class="mono" style="font-weight: 700">{{
              item.sale_number || item.invoice_number || '—'
            }}</span>
          </template>
          <template #cell-total_amount="{ item }">
            <span class="history-amount">{{ formatMoney(item.total_amount) }}</span>
          </template>
          <template #cell-payment_status="{ item }">
            <span class="history-payment" :class="paymentBadge(item.payment_status)">
              {{ paymentStatusLabel(item.payment_status) }}
            </span>
          </template>
          <template #cell-actions="{ item }">
            <button
              v-permission="['sales.edit', 'pos.edit']"
              type="button"
              class="history-edit-btn"
              :disabled="activeTab === 'monthly' || saving || item.status !== 'completed'"
              @click="startEdit(item)"
            >
              تعديل
            </button>
          </template>
        </BaseTable>
      </div>
    </div>

    <!-- 2. مبيعات الجملة (wholesale): جدول فواتير الجملة للعملاء فقط (بدون نموذج إدخال يدوي عادي) -->
    <div v-else-if="activeTab === 'wholesale'" class="wholesale-view-wrap">
      <div class="card table-wrap list-card sales-history-card">
        <div
          class="history-head"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
          "
        >
          <div>
            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700">فواتير الجملة</h3>
            <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 0.9rem">
              {{ sales.length }} فاتورة
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 10px">
            <router-link
              to="/invoices/create"
              class="btn btn-primary"
              style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600"
            >
              <span>+ فاتورة جديدة</span>
            </router-link>
            <router-link
              to="/invoices/quotes"
              class="btn btn-outline"
              style="display: inline-flex; align-items: center; gap: 6px"
            >
              <span>عرض أسعار</span>
            </router-link>
            <span class="history-total">{{ formatMoney(periodTotal) }}</span>
          </div>
        </div>
        <BaseTable
          :items="sales"
          :columns="activeColumns"
          :loading="loadingSales"
          empty-message="لا توجد فواتير مبيعات جملة للعملاء في هذه الفترة"
        >
          <template #cell-sale_date="{ item }">
            <span class="history-date">{{ formatDate(item.sale_date || item.created_at) }}</span>
          </template>
          <template #cell-sale_number="{ item }">
            <span class="mono" style="font-weight: 700">{{
              item.sale_number || item.invoice_number || '—'
            }}</span>
          </template>
          <template #cell-customer_name="{ item }">
            <span class="customer-chip" style="font-weight: 800; color: var(--accent, #c77a2f)">
              👤 {{ item.customer_name || item.customer_name_ar || 'عميل جملة' }}
            </span>
          </template>
          <template #cell-total_amount="{ item }">
            <span class="history-amount">{{ formatMoney(item.total_amount) }}</span>
          </template>
          <template #cell-payment_status="{ item }">
            <span class="history-payment" :class="paymentBadge(item.payment_status)">
              {{ paymentStatusLabel(item.payment_status) }}
            </span>
          </template>
          <template #cell-actions="{ item }">
            <router-link
              :to="`/invoices/${item.invoice_id || item.id}`"
              class="btn btn-outline btn-sm"
              style="margin-left: 6px"
            >
              عرض / طباعة
            </router-link>
            <router-link
              :to="`/invoices/${item.invoice_id || item.id}/edit`"
              class="btn btn-outline btn-sm"
            >
              تعديل
            </router-link>
          </template>
        </BaseTable>
      </div>
    </div>

    <!-- 3. المبيعات الشهرية (monthly): رفع واستيراد ملفات Excel فقط (بدون جدول سجل مبيعات) -->
    <div v-else-if="activeTab === 'monthly'" class="monthly-view-wrap">
      <div class="card form-card monthly-sales-card" style="max-width: 900px; margin: 0 auto">
        <span class="monthly-kicker">Excel فقط</span>
        <h3>استيراد مبيعات شهرية</h3>
        <p class="monthly-copy">
          ارفع ملف مبيعات جهاز المبيعات الرئيسي هنا وسيتم تسجيلها وخصمها من المخزون تلقائياً.
        </p>
        <div class="monthly-actions">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="monthlyImporting"
            @click="downloadMonthlyTemplate"
          >
            تحميل قالب مبيعات شهرية
          </button>
          <label class="btn btn-outline import-btn" :class="{ disabled: monthlyValidating }">
            {{ monthlyValidating ? 'جاري الفحص...' : 'فحص ملف Excel' }}
            <input
              type="file"
              accept=".xlsx,.xls"
              hidden
              :disabled="monthlyValidating"
              @change="onValidateMonthly"
            />
          </label>
          <label
            class="btn btn-success monthly-import-btn import-btn"
            :class="{ disabled: monthlyImporting }"
            role="button"
          >
            {{ monthlyImporting ? 'جاري الاستيراد...' : 'استيراد ذكي وخصم المخزون' }}
            <input
              type="file"
              accept=".xlsx,.xls"
              hidden
              :disabled="monthlyImporting"
              @change="onImportMonthly"
            />
          </label>
        </div>
        <div class="monthly-rules">
          <span>المخزن المستهدف: مخزون المحل</span>
          <span>نوع البيع: مبيعات شهرية</span>
          <span>الدفع الافتراضي: مدفوع</span>
        </div>
        <div
          v-if="monthlyImportMsg || monthlyImportDetails.length"
          class="import-result inline"
          :class="{ err: monthlyImportErr }"
        >
          <p class="import-msg" :class="{ err: monthlyImportErr }">{{ monthlyImportMsg }}</p>
          <ul v-if="monthlyImportDetails.length" class="import-details">
            <li v-for="(d, i) in monthlyImportDetails" :key="i">{{ d }}</li>
          </ul>
        </div>
      </div>
    </div>

    <details class="excel-guide card" open>
      <summary>📋 شكل الملف الصحيح (ورقة «مبيعات» فقط)</summary>
      <p class="guide-note">
        السطر 1 = عناوين ثابتة. من السطر 2 = بياناتك. لا تعدّل أسماء الأعمدة.
      </p>
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
              <td>حذف كل المبيعات الحالية</td>
              <td>delete_all</td>
            </tr>
            <tr class="bad-row">
              <td colspan="8">
                ❌ خطأ شائع: كتابة «مبيعات فرع» في نوع_البيع — الصحيح: branch أو wholesale فقط
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="guide-list">
        <li><strong>فرع:</strong> نوع_البيع = <code>branch</code> — اترك كود_العميل فارغاً</li>
        <li>
          <strong>جملة:</strong> نوع_البيع = <code>wholesale</code> — كود عميل مثل
          <code>C-002</code>
        </li>
        <li>
          <strong>حذف كل المبيعات:</strong> اكتب <code>delete_all</code> في عمود
          <code>الإجراء</code> بأي صف
        </li>
        <li>أكواد العملاء المتاحة: {{ customerCodesHint }}</li>
      </ul>
    </details>

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

<script setup lang="ts">
// @ts-nocheck
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StatCard from '@/components/StatCard.vue';
import AppIcon from '@/components/AppIcon.vue';
import BaseTable from '@/components/ui/BaseTable.vue';
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
const activeTab = ref(route.query.tab || 'branch');
const sales = ref([]);
const loadingSales = ref(false);

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && newTab !== activeTab.value) {
      activeTab.value = String(newTab);
      load();
    }
  },
);

const salesColumns = [
  { key: 'sale_date', label: 'التاريخ' },
  { key: 'total_amount', label: 'المبلغ' },
  { key: 'payment_status', label: 'الدفع' },
  { key: 'actions', label: 'إجراء', align: 'center' },
];

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
const wholesaleCustomers = ref([]);
const allCustomers = ref([]);
const totalCustomerDebts = computed(() => {
  return allCustomers.value.reduce((sum, cust) => {
    const bal = Number((cust.total_balance ?? cust.balance) || 0);
    return sum + (bal > 0 ? bal : 0);
  }, 0);
});
const totalOpeningBalanceDebts = computed(() => {
  return allCustomers.value.reduce((sum, cust) => {
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
const importDetails = ref([]);
const monthlyImportMsg = ref('');
const monthlyImportErr = ref(false);
const monthlyImportDetails = ref([]);
const monthlyValidating = ref(false);
const monthlyImporting = ref(false);
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
  sales.value
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0),
);
const completedSales = computed(() => sales.value.filter((s) => s.status === 'completed'));
const isOpenPayment = (sale) => ['partial', 'unpaid'].includes(sale?.payment_status);
const collectedTotal = computed(() =>
  completedSales.value.reduce((sum, sale) => {
    if (sale.payment_status === 'paid') return sum + Number(sale.total_amount || 0);
    return sum;
  }, 0),
);
const openCreditTotal = computed(() => {
  if (activeTab.value === 'wholesale') {
    return totalCustomerDebts.value;
  }
  return completedSales.value.reduce((sum, sale) => {
    if (isOpenPayment(sale)) return sum + Number(sale.total_amount || 0);
    return sum;
  }, 0);
});
const openPaymentCount = computed(
  () => completedSales.value.filter((sale) => isOpenPayment(sale)).length,
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

const paymentStatusLabel = (s) =>
  ({ paid: 'مدفوع', partial: 'جزئي', unpaid: 'آجل', refunded: 'مسترد' })[s] || s || '—';
const paymentBadge = (s) => [
  'badge',
  s === 'paid'
    ? 'badge-success'
    : s === 'unpaid'
      ? 'badge-danger'
      : s === 'partial'
        ? 'badge-warning'
        : 'badge-danger',
];

const switchTab = (tab) => {
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
      notes: detail.notes || '',
    };
  } catch (e) {
    alert(e.message || 'فشل تحميل الفاتورة للتعديل');
  } finally {
    saving.value = false;
  }
};

const selectMonth = (event) => {
  const value = event.target.value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  filters.value.from_date = fromDate;
  filters.value.to_date = toDate;
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
      wholesaleCustomers.value = customersRes.data.filter((x) => x.customer_type === 'wholesale');
    }
    if (openingRes?.data) {
      openingBalanceForm.value = {
        from_date: openingRes.data.from_date || filters.value.from_date,
        to_date: openingRes.data.to_date || filters.value.to_date,
        amount: Number(openingRes.data.amount || 0),
      };
    }
  } catch (err) {
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
  } catch (e) {
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
        ...d.preview.map(
          (r, i) => `✓ مثال سطر ${i + 2}: ${r.sale_date} | ${r.sale_type} | ${r.total_amount} ج.م`,
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
    ...(d.parseErrors || []).map((e) => `تحذير سطر ${e.row}: ${e.message}`),
    ...(d.failed || []).map((e) => `فشل سطر ${e.row}: ${e.message}`),
  ];
  importErr.value = d.success === 0 && importDetails.value.length > 0;
};

const showMonthlyImportResult = (d, isValidate = false) => {
  if (isValidate) {
    monthlyImportMsg.value = d.ok
      ? `الملف جاهز: ${d.groupCount || 0} يوم/دفعة و ${d.itemCount || 0} صنف سيتم خصمهم من مخزون المحل`
      : 'الملف يحتاج مراجعة قبل الاستيراد';
    monthlyImportErr.value = !d.ok;
    monthlyImportDetails.value = (d.parseErrors || []).map((e) => `سطر ${e.row}: ${e.message}`);
    if (d.ok && d.preview?.length) {
      monthlyImportDetails.value.unshift(
        ...d.preview.map(
          (r) => `✓ ${r.sale_date} | ${r.payment_method} | ${r.items_count} صنف | ${r.sample}`,
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
    ...(d.parseErrors || []).map((e) => `تحذير سطر ${e.row}: ${e.message}`),
    ...(d.failed || []).map((e) => `فشل ${e.sale_date || ''}: ${e.message}`),
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
  } catch (e) {
    monthlyImportErr.value = true;
    monthlyImportMsg.value = e.message || 'فشل تحميل قالب المبيعات الشهرية';
  }
};

const onValidateMonthly = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  monthlyValidating.value = true;
  monthlyImportMsg.value = 'جاري فحص ملف المبيعات الشهرية...';
  monthlyImportErr.value = false;
  monthlyImportDetails.value = [];
  try {
    const res = await salesApi.branchValidateExcel(file);
    showMonthlyImportResult(res.data, true);
  } catch (err) {
    monthlyImportErr.value = true;
    monthlyImportMsg.value = err.message || 'فشل فحص ملف المبيعات الشهرية';
    monthlyImportDetails.value = String(err.message || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
  } finally {
    monthlyValidating.value = false;
    e.target.value = '';
  }
};

const onImportMonthly = async (e) => {
  const file = e.target.files?.[0];
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
  } catch (err) {
    monthlyImportErr.value = true;
    monthlyImportMsg.value = err.message || 'فشل استيراد المبيعات الشهرية';
  } finally {
    monthlyImporting.value = false;
    e.target.value = '';
  }
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
    importDetails.value = String(err.message || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
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
.sales-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  --sales-panel-bg: color-mix(in srgb, var(--card-bg) 88%, var(--primary) 4%);
  --sales-panel-border: color-mix(in srgb, var(--primary) 15%, var(--card-border));
  --sales-soft: color-mix(in srgb, var(--primary) 8%, transparent);
  --sales-grid-line: color-mix(in srgb, var(--primary) 5%, transparent);
}
.page-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding: 16px;
  border-radius: calc(var(--radius-lg) + 2px);
  border-color: var(--sales-panel-border);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, transparent), transparent 38%),
    color-mix(in srgb, var(--card-bg) 92%, var(--bg-elevated));
  box-shadow: var(--shadow-xs);
}
.opening-balance {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--warning) 22%, var(--border));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--warning) 9%, var(--bg-elevated)),
    var(--bg-elevated)
  );
}
.opening-ledger {
  position: relative;
  overflow: hidden;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--card-border));
  border-radius: calc(var(--radius-lg) + 4px);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), transparent 42%),
    radial-gradient(
      circle at 10% 20%,
      color-mix(in srgb, var(--accent) 16%, transparent),
      transparent 28%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card-bg) 92%, var(--primary) 8%),
      var(--bg-elevated)
    );
  box-shadow:
    0 22px 55px color-mix(in srgb, var(--primary) 14%, transparent),
    var(--shadow-sm);
}
.opening-ledger::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(90deg, color-mix(in srgb, var(--primary) 7%, transparent) 1px, transparent 1px),
    linear-gradient(0deg, color-mix(in srgb, var(--primary) 5%, transparent) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 74%, transparent);
  opacity: 0.45;
  pointer-events: none;
}
.ledger-glow {
  position: absolute;
  inset-inline-end: -90px;
  top: -110px;
  width: 270px;
  height: 270px;
  border-radius: 999px;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent) 30%, transparent),
    transparent 62%
  );
  filter: blur(2px);
  pointer-events: none;
}
.opening-balance-head {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(190px, auto) auto;
  gap: 16px;
  align-items: center;
}
.ledger-title {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ledger-mark {
  width: 58px;
  height: 58px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 950;
  letter-spacing: -0.01em;
  background: linear-gradient(145deg, var(--primary), var(--primary-strong)), var(--primary);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 14px 32px color-mix(in srgb, var(--primary) 32%, transparent);
  transform: rotate(-2deg);
}
.opening-balance-head h3 {
  margin: 0 0 5px;
  color: var(--text-strong);
  font-size: clamp(1.05rem, 1.9vw, 1.35rem);
  font-weight: 950;
  letter-spacing: -0.03em;
}
.opening-balance-head p {
  margin: 0;
  max-width: 430px;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.7;
}
.ledger-amount {
  min-width: 190px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    var(--shadow-xs);
}
.ledger-amount span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 900;
}
.ledger-amount strong {
  display: block;
  color: var(--primary-strong);
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  line-height: 1.15;
  font-weight: 950;
  letter-spacing: -0.03em;
}
.opening-balance-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ledger-action {
  min-width: 74px;
  min-height: 40px;
  padding: 9px 17px;
  border: 0;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 900;
  cursor: pointer;
  transition:
    transform var(--transition),
    box-shadow var(--transition),
    opacity var(--transition);
}
.ledger-action:hover:not(:disabled) {
  transform: translateY(-2px);
}
.ledger-action:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}
.ledger-action.primary {
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
  box-shadow: 0 12px 26px color-mix(in srgb, var(--primary) 30%, transparent);
}
.ledger-action.primary:disabled {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}
.ledger-action.secondary {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
}
.opening-balance-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.ledger-field {
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}
.ledger-field span {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 0.74rem;
  font-weight: 950;
}
.ledger-field input {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--card-bg) 86%, transparent);
  color: var(--text-strong);
  font-weight: 850;
  transition:
    border-color var(--transition),
    box-shadow var(--transition),
    background var(--transition);
}
.ledger-field input:disabled {
  opacity: 1;
  color: var(--text);
  background: transparent;
  border-color: transparent;
  padding-inline: 0;
}
.opening-ledger.editing .ledger-field input {
  border-color: color-mix(in srgb, var(--primary) 26%, var(--border));
  background: var(--bg-elevated);
}
.opening-ledger.editing .ledger-field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}
.opening-balance-msg {
  position: relative;
  z-index: 1;
  margin-top: 12px;
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
.toolbar-actions {
  display: flex;
  gap: 9px;
  padding: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-elevated) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border));
}
.import-btn {
  cursor: pointer;
  margin: 0;
}
.icon-btn {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border));
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  cursor: pointer;
  transition:
    transform var(--transition),
    box-shadow var(--transition),
    border-color var(--transition);
  &:hover {
    transform: translateY(-2px);
    background: var(--bg);
    border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
    box-shadow: var(--shadow-xs);
  }
  &.warning {
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  }
  &.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  }
}
.filter-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-row .form-group {
  min-width: 160px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 82%, transparent);
}
.filter-row .form-group label {
  margin-bottom: 7px;
  font-size: 0.76rem;
  font-weight: 950;
}
.filter-row .form-group input {
  min-height: 38px;
  padding: 8px 10px;
  border-color: transparent;
  background: transparent;
  font-weight: 850;
}
.month-picker-group {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 48px !important;
}
.month-filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-end;
  margin-bottom: 8px;
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
.sales-insight {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(520px, 1.35fr);
  gap: 18px;
  align-items: stretch;
  overflow: hidden;
  position: relative;
  padding: 20px;
  border-color: var(--sales-panel-border);
  border-radius: calc(var(--radius-lg) + 2px);
  background:
    linear-gradient(90deg, var(--sales-grid-line) 1px, transparent 1px),
    linear-gradient(0deg, var(--sales-grid-line) 1px, transparent 1px),
    radial-gradient(
      circle at top right,
      color-mix(in srgb, var(--primary) 14%, transparent),
      transparent 34%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--surface-1) 94%, var(--primary) 6%),
      var(--surface-2)
    );
  background-size:
    42px 42px,
    42px 42px,
    auto,
    auto;
}
.sales-insight::before {
  content: '';
  position: absolute;
  inset-inline-start: -70px;
  bottom: -90px;
  width: 190px;
  height: 190px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  pointer-events: none;
}
.sales-insight::after {
  content: '';
  position: absolute;
  inset: auto 20px 0 20px;
  height: 3px;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in srgb, var(--accent) 70%, var(--primary)),
    transparent
  );
  opacity: 0.72;
}
.sales-insight.warning {
  border-color: color-mix(in srgb, var(--warning) 30%, var(--border));
}
.sales-insight.success {
  border-color: color-mix(in srgb, var(--success) 26%, var(--border));
}
.sales-insight.muted {
  border-color: color-mix(in srgb, var(--text-muted) 18%, var(--border));
}
.insight-copy,
.insight-metrics {
  position: relative;
  z-index: 1;
}
.eyebrow {
  display: inline-flex;
  margin-bottom: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent);
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.insight-copy h3 {
  margin: 0 0 6px;
  color: var(--text-strong);
  font-size: clamp(1.05rem, 1.7vw, 1.35rem);
  font-weight: 950;
  letter-spacing: -0.03em;
}
.insight-copy p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.75;
}
.insight-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.insight-tile {
  position: relative;
  overflow: hidden;
  min-height: 92px;
  padding: 15px 16px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--bg-elevated) 88%, transparent),
    color-mix(in srgb, var(--card-bg) 72%, transparent)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    var(--shadow-xs);
}
.insight-tile::before {
  content: '';
  position: absolute;
  inset-inline-end: 0;
  top: 13px;
  bottom: 13px;
  width: 4px;
  border-radius: 999px 0 0 999px;
  background: color-mix(in srgb, var(--primary) 55%, transparent);
}
.insight-tile span {
  display: block;
  margin-bottom: 8px;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 950;
}
.insight-tile strong {
  display: block;
  color: var(--text-strong);
  font-size: clamp(1rem, 1.35vw, 1.25rem);
  line-height: 1.35;
  font-weight: 950;
  letter-spacing: -0.03em;
}
.insight-tile.success::before {
  background: color-mix(in srgb, var(--success) 58%, transparent);
}
.insight-tile.warning::before {
  background: color-mix(in srgb, var(--warning) 65%, transparent);
}
.insight-tile.primary::before {
  background: color-mix(in srgb, var(--primary) 70%, transparent);
}
.insight-tile.success strong {
  color: var(--success);
}
.insight-tile.warning strong {
  color: var(--warning);
}
.insight-tile.primary strong {
  color: var(--primary-strong);
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
.main-row {
  align-items: start;
  gap: 18px;
}
.form-card,
.list-card {
  position: relative;
  overflow: hidden;
  border-color: var(--sales-panel-border);
  border-radius: calc(var(--radius-lg) + 2px);
  background:
    radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--primary) 8%, transparent),
      transparent 32%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card-bg) 94%, var(--primary) 4%),
      var(--bg-elevated)
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    var(--shadow-xs);
}
.form-card::before,
.list-card::before {
  content: '';
  position: absolute;
  inset: 0;
  height: 4px;
  background: linear-gradient(
    90deg,
    var(--primary),
    color-mix(in srgb, var(--accent) 70%, var(--primary)),
    transparent
  );
  opacity: 0.74;
}
.form-card h3,
.list-card h3 {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  color: var(--text-strong);
  font-size: 1.05rem;
  font-weight: 950;
  letter-spacing: -0.02em;
}
.form-card h3::before,
.list-card h3::before {
  content: '';
  width: 12px;
  height: 28px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--primary), var(--primary-strong));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 25%, transparent);
}
.form-card form {
  position: relative;
  z-index: 1;
}
.form-card .form-group {
  margin-bottom: 14px;
}
.form-card .form-group label {
  color: var(--text-muted);
  font-weight: 950;
}
.form-card input,
.form-card select,
.form-card textarea {
  min-height: 46px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--bg-elevated) 92%, transparent),
    color-mix(in srgb, var(--card-bg) 86%, transparent)
  );
}
.form-card .btn-primary[type='submit'] {
  width: 100%;
  min-height: 48px;
  margin-top: 4px;
  border-radius: 999px;
  font-weight: 950;
  box-shadow: 0 14px 28px color-mix(in srgb, var(--primary) 26%, transparent);
}
.monthly-sales-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  background:
    radial-gradient(
      circle at 15% 10%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 28%
    ),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card-bg) 92%, var(--primary) 7%),
      var(--bg-elevated)
    );
}
.monthly-sales-card h3 {
  margin-bottom: 0;
}
.monthly-kicker {
  width: fit-content;
  padding: 5px 11px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  font-size: 0.76rem;
  font-weight: 950;
}
.monthly-copy {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--text-muted);
  line-height: 1.8;
  font-size: 0.92rem;
  font-weight: 750;
}
.monthly-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.monthly-actions .btn {
  min-height: 42px;
  border-radius: 999px;
  font-weight: 900;
  cursor: pointer;
}
.monthly-actions .monthly-import-btn {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(
    135deg,
    var(--success),
    color-mix(in srgb, var(--success) 72%, #052e16)
  );
  box-shadow: 0 12px 24px color-mix(in srgb, var(--success) 24%, transparent);
}
.monthly-actions .monthly-import-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px color-mix(in srgb, var(--success) 30%, transparent);
}
.monthly-actions .btn.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.monthly-rules {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}
.monthly-rules span {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
  font-size: 0.8rem;
  font-weight: 850;
}
.import-result.inline {
  position: relative;
  z-index: 1;
  margin-top: 0;
}
.list-card {
  max-height: 640px;
  overflow: auto;
}
.sales-history-card {
  padding: 0;
}
.history-head {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 20px 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--card-bg) 96%, var(--primary) 4%),
    var(--bg-elevated)
  );
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border));
}
.history-head h3 {
  margin: 0 0 5px;
}
.history-head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 800;
}
.history-total {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 13px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 9%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
  font-weight: 950;
  white-space: nowrap;
}
.list-card table {
  border-collapse: separate;
  border-spacing: 0 9px;
  padding: 0 14px 14px;
}
.list-card thead th {
  position: sticky;
  top: 77px;
  z-index: 2;
  border: 0;
  background: color-mix(in srgb, var(--bg-elevated) 96%, var(--primary) 3%);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 950;
  padding-block: 10px;
}
.list-card tbody td {
  border-top: 1px solid color-mix(in srgb, var(--primary) 9%, var(--border));
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 9%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  font-weight: 800;
  padding-block: 13px;
}
.list-card tbody td:first-child {
  border-inline-start: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border));
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.list-card tbody td:last-child {
  border-inline-end: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border));
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.list-card tbody tr:hover td {
  background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated));
}
.payment-open td {
  background: color-mix(in srgb, var(--warning) 7%, var(--bg-elevated));
}
.payment-open:hover td {
  background: color-mix(in srgb, var(--warning) 11%, var(--bg-elevated));
}
.history-date {
  color: var(--text-muted);
  font-weight: 900;
  white-space: nowrap;
}
.history-amount {
  color: var(--text-strong);
  font-size: 0.98rem;
  font-weight: 950;
  white-space: nowrap;
}
.history-payment .badge {
  min-width: 74px;
  justify-content: center;
}
.history-action {
  text-align: left;
}
.history-edit-btn {
  min-width: 72px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 7%, var(--bg-elevated));
  color: var(--primary-strong);
  font-weight: 900;
  cursor: pointer;
  transition:
    transform var(--transition),
    box-shadow var(--transition),
    background var(--transition);
}
.history-edit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--primary) 13%, var(--bg-elevated));
  box-shadow: var(--shadow-xs);
}
.history-edit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px;
}
.excel-guide {
  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--text-strong);
  }
  .guide-note {
    color: var(--text-muted);
    font-size: 0.88rem;
    margin: 8px 0 12px;
  }
  .guide-table-wrap {
    overflow-x: auto;
  }
  .guide-table {
    width: 100%;
    font-size: 0.8rem;
    border-collapse: collapse;
    th,
    td {
      border: 1px solid var(--border);
      padding: 8px;
      text-align: right;
    }
    th {
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
      color: #fff;
    }
    .ok-row {
      background: color-mix(in srgb, var(--success) 8%, transparent);
    }
    .warn-row {
      background: color-mix(in srgb, var(--warning) 10%, transparent);
    }
    .bad-row td {
      background: color-mix(in srgb, var(--danger) 8%, transparent);
      color: var(--danger);
    }
  }
  code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.82rem;
  }
  .guide-list {
    margin: 12px 0 0;
    padding-right: 20px;
    font-size: 0.88rem;
  }
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
.danger-actions {
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  background: color-mix(in srgb, var(--danger) 3%, transparent);
  border-radius: var(--radius-sm);
  padding: 16px 20px;
  margin-top: 4px;
}
.danger-title {
  font-weight: 800;
  color: var(--text-strong);
  margin-bottom: 14px;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.danger-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 12%, transparent);
  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
}
.danger-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-muted);
  min-width: 110px;
  flex-shrink: 0;
}
.date-input {
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
  font-size: 0.88rem;
  max-width: 160px;
}
.delete-type-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: var(--transition);
  border: 2px solid transparent;

  .btn-icon {
    font-size: 1rem;
  }
  .btn-text {
    white-space: nowrap;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.branch {
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: var(--primary-dark);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }

  &.wholesale {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent);
    }
  }

  &.day {
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--warning);
      color: #fff;
      border-color: var(--warning);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--warning) 35%, transparent);
    }
  }

  &.all {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    &:hover:not(:disabled) {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--danger) 35%, transparent);
    }
  }
}
@media (max-width: 1100px) {
  .opening-balance-head {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .ledger-amount {
    max-width: 320px;
  }
  .opening-balance-actions {
    justify-content: flex-start;
  }
  .sales-insight {
    grid-template-columns: 1fr;
  }
  .insight-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .main-row {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .opening-ledger {
    padding: 16px;
    border-radius: var(--radius-lg);
  }
  .ledger-title {
    align-items: flex-start;
  }
  .ledger-mark {
    width: 58px;
    height: 48px;
    border-radius: 16px;
    font-size: 0.72rem;
  }
  .opening-balance-grid {
    grid-template-columns: 1fr;
  }
  .ledger-amount {
    max-width: none;
  }
  .ledger-action {
    flex: 1;
  }
  .insight-metrics {
    grid-template-columns: 1fr;
  }
  .monthly-rules {
    grid-template-columns: 1fr;
  }
  .list-card {
    max-height: none;
    overflow: hidden;
  }
  .list-card table,
  .list-card thead,
  .list-card tbody,
  .list-card tr,
  .list-card th,
  .list-card td {
    display: block;
  }
  .list-card table {
    border-spacing: 0;
    padding: 0 12px 12px;
  }
  .list-card thead {
    display: none;
  }
  .list-card tbody {
    display: grid;
    gap: 10px;
  }
  .list-card tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
    border-radius: var(--radius-md);
    background:
      radial-gradient(
        circle at 0 100%,
        color-mix(in srgb, var(--accent) 10%, transparent),
        transparent 38%
      ),
      color-mix(in srgb, var(--bg-elevated) 82%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }
  .list-card tbody td,
  .list-card tbody td:first-child,
  .list-card tbody td:last-child {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }
  .list-card tbody tr:hover td,
  .payment-open td,
  .payment-open:hover td {
    background: transparent;
  }
  .list-card tbody td:nth-child(1) {
    grid-column: 1;
    color: var(--text-strong);
    font-size: 0.95rem;
    font-weight: 950;
  }
  .list-card tbody td:nth-child(2) {
    grid-column: 2;
    color: var(--text-strong);
    font-size: 0.98rem;
    font-weight: 950;
    white-space: nowrap;
  }
  .list-card tbody td:nth-child(3) {
    align-self: center;
  }
  .list-card tbody td:nth-child(4) {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    padding-top: 2px;
  }
  .list-card tbody td.empty {
    grid-column: 1 / -1;
    padding: 18px;
  }
}
/* Partial payment */
.partial-payment-box {
  background: color-mix(in srgb, var(--warning) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  margin-bottom: 16px;
}
.partial-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--warning);
  margin-bottom: 12px;
  .partial-icon {
    font-size: 1.1rem;
  }
}
.remaining-display {
  padding: 11px 14px;
  border-radius: var(--radius-xs);
  font-weight: 800;
  font-size: 1rem;
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
  margin-top: 10px;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
  padding: 8px 12px;
  border-radius: var(--radius-xs);
}

/* Modal styles for editing */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: overlayFadeIn 0.2s ease;
}

@keyframes overlayFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-card {
  width: min(560px, 95vw);
  max-height: 90vh;
  overflow-y: auto;
  /* خلفية الكارت من المتغيرات العامة للثيم */
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: var(--radius-lg, 16px);
  box-shadow:
    0 24px 60px -12px rgba(0, 0, 0, 0.35),
    0 8px 24px -4px rgba(0, 0, 0, 0.2);
  /* إيقاف تأثير الـ hover على الكارد داخل الموديل */
  transform: none !important;
  animation: modalSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-card:hover {
  transform: none !important;
  box-shadow:
    0 24px 60px -12px rgba(0, 0, 0, 0.35),
    0 8px 24px -4px rgba(0, 0, 0, 0.2) !important;
  border-color: var(--card-border, #e2e8f0) !important;
}
</style>
