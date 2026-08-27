<template>
  <div class="customers-page">
    <!-- Header -->
    <div class="page-header">
      <div class="search-wrap">
        <span class="search-icon"></span>
        <input
          v-model="search"
          type="text"
          placeholder="بحث بالاسم أو الهاتف أو الكود..."
          aria-label="بحث في العملاء"
          class="search-input"
        />
      </div>
      <div class="header-actions">
        <select v-model="typeFilter" @change="load" class="type-filter">
          <option value="">كل العملاء</option>
          <option value="wholesale">جملة فقط</option>
          <option value="retail">تجزئة فقط</option>
        </select>
        <button v-permission="'customers.add'" class="btn btn-add" @click="openForm()">
          <AppIcon name="add" :size="16" /> عميل جديد
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-3 summary-row">
      <div class="summary-card card">
        <div class="summary-icon"></div>
        <div>
          <div class="summary-label">إجمالي العملاء</div>
          <div class="summary-value">{{ customers.length }}</div>
        </div>
      </div>
      <div class="summary-card card">
        <div class="summary-icon"></div>
        <div>
          <div class="summary-label">عملاء الجملة</div>
          <div class="summary-value">{{ wholesaleCount }}</div>
        </div>
      </div>
      <div class="summary-card card warn">
        <div class="summary-icon"></div>
        <div>
          <div class="summary-label">إجمالي الديون</div>
          <div class="summary-value">{{ formatMoney(totalBalance) }}</div>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>الكود</th>
            <th>الاسم</th>
            <th>الهاتف</th>
            <th>النوع</th>
            <th>إجمالي المشتريات</th>
            <th>الرصيد المستحق</th>
            <th>الحد الائتماني</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading" v-for="i in 3" :key="'c-sk-' + i">
            <td><div class="skeleton-shimmer" style="height: 18px; width: 60px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 140px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 100px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 90px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 80px"></div></td>
            <td><div class="skeleton-shimmer" style="height: 18px; width: 110px"></div></td>
          </tr>
          <tr
            v-else
            v-for="c in customers"
            :key="c.id"
            :class="{ 'has-balance': Number((c.total_balance ?? c.balance) || 0) > 0 }"
          >
            <td>
              <code class="code-badge">{{ c.code }}</code>
            </td>
            <td class="name-cell">
              <span class="customer-name">{{ c.name_ar }}</span>
            </td>
            <td>{{ c.phone || '—' }}</td>
            <td>
              <span
                class="type-badge"
                :class="c.customer_type === 'wholesale' ? 'wholesale' : 'retail'"
              >
                {{ c.customer_type === 'wholesale' ? ' جملة' : ' تجزئة' }}
              </span>
            </td>
            <td class="amount-cell">{{ formatMoney(c.total_purchased || 0) }}</td>
            <td
              class="amount-cell"
              :class="
                Number((c.total_balance ?? c.balance) || 0) > 0 ? 'balance-due' : 'balance-ok'
              "
            >
              <strong>{{ formatMoney((c.total_balance ?? c.balance) || 0) }}</strong>
            </td>
            <td class="amount-cell muted">{{ formatMoney(c.credit_limit) }}</td>
            <td class="actions">
              <button class="icon-btn" @click="openStatement(c)" title="الحساب الجاري">
                <AppIcon name="reports" :size="16" />
              </button>
              <button
                v-permission="'customers.edit'"
                class="icon-btn edit"
                @click="openForm(c)"
                title="تعديل"
              >
                <AppIcon name="edit" :size="16" />
              </button>
              <button
                v-permission="'customers.delete'"
                class="icon-btn danger"
                @click="removeCustomer(c)"
                title="حذف"
              >
                <AppIcon name="delete" :size="16" />
              </button>
            </td>
          </tr>
          <tr v-if="!loading && !customers.length">
            <td colspan="8" class="empty">لا يوجد عملاء مطابقون</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ═══ STATEMENT MODAL ═══ -->
    <div v-if="showStatement" class="modal-overlay" @click.self="showStatement = false">
      <div class="statement-modal">
        <div class="statement-header">
          <div class="statement-title">
            <span class="statement-icon"></span>
            <div>
              <h2>الحساب الجاري</h2>
              <p>{{ statement?.customer?.name_ar }} · {{ statement?.customer?.code }}</p>
            </div>
          </div>
          <button class="close-btn" @click="showStatement = false"></button>
        </div>

        <div v-if="loadingStatement" class="statement-loading">⏳ جاري التحميل...</div>
        <template v-else-if="statement">
          <!-- Summary -->
          <div class="statement-summary">
            <div class="summary-item purchased">
              <div class="si-label">إجمالي البضاعة المأخوذة</div>
              <div class="si-value">{{ formatMoney(statement.summary.total_purchased) }}</div>
            </div>
            <div class="summary-item paid">
              <div class="si-label">إجمالي المدفوع</div>
              <div class="si-value">{{ formatMoney(statement.summary.total_paid) }}</div>
            </div>
            <div
              class="summary-item balance"
              :class="statement.summary.total_balance > 0 ? 'due' : 'clear'"
            >
              <div class="si-label">الرصيد المتبقي</div>
              <div class="si-value">{{ formatMoney(statement.summary.total_balance) }}</div>
              <div class="si-sub">
                {{ statement.summary.total_balance > 0 ? ' مستحق السداد' : ' لا يوجد رصيد' }}
              </div>
            </div>
          </div>

          <!-- Record Payment -->
          <div v-if="statement.summary.total_balance > 0" class="payment-form card">
            <h4>تسجيل دفعة</h4>
            <div class="payment-fields">
              <div class="form-group">
                <label>المبلغ (ج.م) *</label>
                <input
                  v-model.number="payForm.amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  :max="statement.summary.total_balance"
                  :placeholder="`الرصيد: ${formatMoney(statement.summary.total_balance)}`"
                />
              </div>
              <div class="form-group">
                <label>طريقة الدفع</label>
                <select v-model="payForm.payment_method">
                  <option value="cash">نقدي</option>
                  <option value="card">بطاقة</option>
                  <option value="transfer">تحويل</option>
                </select>
              </div>
              <div class="form-group">
                <label>ملاحظات</label>
                <input v-model="payForm.notes" type="text" placeholder="اختياري..." />
              </div>
            </div>
            <div class="payment-actions">
              <button
                v-permission="'customers.edit'"
                class="btn btn-outline"
                type="button"
                @click="payForm.amount = statement.summary.total_balance"
              >
                سداد كامل الرصيد
              </button>
              <button
                v-permission="'customers.edit'"
                class="btn btn-save"
                :disabled="savingPayment || !payForm.amount"
                @click="submitPayment"
              >
                <AppIcon name="save" :size="16" />
                {{ savingPayment ? 'جاري الحفظ...' : 'تسجيل الدفعة' }}
              </button>
              <p v-if="payMsg" class="pay-msg" :class="payErr ? 'err' : 'ok'">{{ payMsg }}</p>
            </div>
          </div>

          <!-- Transactions Table -->
          <div class="transactions-section">
            <h4>سجل المعاملات ({{ statement.transactions.length }})</h4>
            <div class="transactions-wrap">
              <table class="transactions-table">
                <thead>
                  <tr>
                    <th>رقم الفاتورة</th>
                    <th>التاريخ</th>
                    <th>قيمة البضاعة</th>
                    <th>المدفوع</th>
                    <th>المتبقي</th>
                    <th>الحالة</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="t in statement.transactions"
                    :key="`${t.entry_type}-${t.id}`"
                    :class="{
                      'row-sale': t.entry_type === 'sale',
                      'row-invoice': t.entry_type === 'invoice',
                      'row-unpaid': t.payment_status === 'unpaid',
                      'row-partial': t.payment_status === 'partial',
                      'row-cancelled': t.status === 'cancelled',
                    }"
                  >
                    <td>
                      <span class="entry-type" :class="t.entry_type">
                        {{
                          t.entry_type === 'invoice'
                            ? 'فاتورة'
                            : t.entry_type === 'opening_balance'
                              ? 'رصيد سابق'
                              : 'بيع'
                        }}
                      </span>
                      <code>{{ t.sale_number || t.invoice_number || t.entry_number }}</code>
                    </td>
                    <td>{{ formatDate(t.entry_date || t.sale_date || t.created_at) }}</td>
                    <td class="amount-cell">{{ formatMoney(t.total_amount) }}</td>
                    <td class="amount-cell paid-col">{{ formatMoney(t.paid_amount) }}</td>
                    <td
                      class="amount-cell"
                      :class="t.total_amount - t.paid_amount > 0.01 ? 'balance-due' : 'balance-ok'"
                    >
                      {{ formatMoney(Math.max(0, t.total_amount - t.paid_amount)) }}
                    </td>
                    <td>
                      <span class="status-badge" :class="t.payment_status">
                        {{ statusLabel(t.payment_status) }}
                      </span>
                    </td>
                    <td>
                      <!-- زر دفع يظهر فقط لو في باقي -->
                      <button
                        v-if="
                          t.entry_type === 'sale' &&
                          t.status !== 'cancelled' &&
                          t.total_amount - t.paid_amount > 0.01
                        "
                        class="pay-sale-btn"
                        @click="openSalePayment(t)"
                        title="تسجيل دفعة على هذه الفاتورة"
                      >
                        دفع
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!statement.transactions.length">
                    <td colspan="7" class="empty">لا توجد معاملات</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Sale Payment Mini Modal -->
          <div
            v-if="activeSalePayment"
            class="sale-pay-overlay"
            @click.self="activeSalePayment = null"
          >
            <div class="sale-pay-card">
              <div class="sale-pay-header">
                <span> دفعة على فاتورة {{ activeSalePayment.sale_number }}</span>
                <button class="close-btn-sm" @click="activeSalePayment = null"></button>
              </div>
              <div class="sale-pay-info">
                <span
                  >إجمالي الفاتورة:
                  <strong>{{ formatMoney(activeSalePayment.total_amount) }}</strong></span
                >
                <span
                  >المدفوع:
                  <strong class="paid-col">{{
                    formatMoney(activeSalePayment.paid_amount)
                  }}</strong></span
                >
                <span
                  >الباقي:
                  <strong class="balance-due">{{
                    formatMoney(activeSalePayment.total_amount - activeSalePayment.paid_amount)
                  }}</strong></span
                >
              </div>
              <div class="sale-pay-form">
                <div class="form-group">
                  <label>المبلغ المدفوع (ج.م) *</label>
                  <input
                    v-model.number="salePayForm.amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    :max="activeSalePayment.total_amount - activeSalePayment.paid_amount"
                    :placeholder="`الباقي: ${formatMoney(activeSalePayment.total_amount - activeSalePayment.paid_amount)}`"
                    ref="salePayInput"
                  />
                </div>
                <div class="form-group">
                  <label>طريقة الدفع</label>
                  <select v-model="salePayForm.payment_method">
                    <option value="cash">نقدي</option>
                    <option value="card">بطاقة</option>
                    <option value="transfer">تحويل</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>ملاحظات</label>
                  <input v-model="salePayForm.notes" type="text" placeholder="اختياري..." />
                </div>
              </div>
              <p v-if="salePayMsg" class="pay-msg" :class="salePayErr ? 'err' : 'ok'">
                {{ salePayMsg }}
              </p>
              <div class="sale-pay-actions">
                <button
                  class="btn btn-save"
                  :disabled="savingSalePay || !salePayForm.amount"
                  @click="submitSalePayment"
                >
                  <AppIcon name="save" :size="16" />
                  {{ savingSalePay ? 'جاري التسجيل...' : 'تسجيل الدفعة' }}
                </button>
                <button class="btn btn-outline" @click="activeSalePayment = null">إلغاء</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ═══ FORM MODAL ═══ -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <div class="card modal-content">
        <h3>
          <AppIcon :name="form.id ? 'edit' : 'add'" :size="20" />
          {{ form.id ? 'تعديل عميل' : 'عميل جديد' }}
        </h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label>كود العميل</label>
            <input
              v-model="form.code"
              :placeholder="form.id ? '' : 'اتركه فارغاً للتوليد التلقائي'"
            />
          </div>
          <div class="form-group">
            <label>الاسم *</label><input v-model="form.name_ar" required />
          </div>
          <div class="form-group"><label>الهاتف</label><input v-model="form.phone" /></div>
          <div class="form-group">
            <label>النوع</label>
            <select v-model="form.customer_type">
              <option value="retail">تجزئة</option>
              <option value="wholesale">جملة</option>
            </select>
          </div>
          <div class="form-group">
            <label>المديونية / رصيد بداية المدة (ج.م)</label>
            <input
              v-model.number="form.opening_balance"
              type="number"
              min="0"
              step="0.01"
              placeholder="أدخل مديونية سابقة إن وجدت..."
            />
            <small
              style="
                color: var(--text-muted, #888);
                font-size: 0.76rem;
                display: block;
                margin-top: 4px;
              "
            >
              تُضاف هذه المديونية تلقائياً وحسابياً في رصيد ومديونية العميل الكلية المستحقة.
            </small>
          </div>
          <div class="form-group">
            <label>حد ائتماني (ج.م)</label
            ><input v-model.number="form.credit_limit" type="number" min="0" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showForm = false">إلغاء</button>
            <button type="submit" class="btn btn-save">
              <AppIcon name="save" :size="16" /> حفظ
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { customers as api } from '@/api';
import { formatMoney } from '@/utils/currency';

// ─── state ──────────────────────────────────────────────────────────────────
const customers = ref<any[]>([]);
const search = ref('');
const typeFilter = ref('');
const showForm = ref(false);
const showStatement = ref(false);
const loadingStatement = ref(false);
const loading = ref(false);
const statement = ref<any>(null);
const savingPayment = ref(false);
const payMsg = ref('');
const payErr = ref(false);

// دفع على فاتورة محددة
const activeSalePayment = ref<any>(null);
const savingSalePay = ref(false);
const salePayMsg = ref('');
const salePayErr = ref(false);
const salePayInput = ref<any>(null);
const salePayForm = ref({ amount: null, payment_method: 'cash', notes: '' });

const form = ref<Record<string, any>>({
  code: '',
  name_ar: '',
  phone: '',
  customer_type: 'retail',
  credit_limit: 0,
});
const payForm = ref({ amount: null, payment_method: 'cash', notes: '' });
const getCustomerDue = (c: any) => {
  const hasComputed = c.total_balance !== undefined && c.total_balance !== null;
  if (hasComputed) return Number(c.total_balance || 0);
  return Number(c.balance || 0);
};
// ─── computed ─────────────────────────────────────────────────────────────────
const wholesaleCount = computed(
  () => customers.value.filter((c: any) => c.customer_type === 'wholesale').length,
);
const totalBalance = computed(() =>
  customers.value.reduce((s: any, c: any) => s + Math.max(0, getCustomerDue(c)), 0),
);

// ─── helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d: any) => {
  const val = d?.split?.('T')?.[0] || d;
  if (!val) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, day] = val.split('-');
    return `${day}/${m}/${y}`;
  }
  return new Date(val).toLocaleDateString('en-GB');
};

const statusLabel = (s: any) =>
  (
    ({
      paid: 'مدفوع',
      unpaid: 'غير مدفوع',
      partial: 'جزئي',
      refunded: 'مسترد',
    }) as Record<string, string>
  )[s] || s;

// ─── data loading ─────────────────────────────────────────────────────────────
// بحث مؤجَّل 350ms — كان يطلق طلب API لكل حرف مكتوب
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(load, 350);
});

const load = async () => {
  loading.value = true;
  try {
    const params: Record<string, any> = { search: search.value };
    if (typeFilter.value) params.customer_type = typeFilter.value;
    const res = await api.list(params);
    customers.value = (res.data || []).map((c: any) => {
      const totalBalance = getCustomerDue(c);
      const totalPaid = Number(c.total_paid || 0);
      const totalPurchased = Number(c.total_purchased || 0) || totalPaid + totalBalance;
      return {
        ...c,
        total_balance: totalBalance,
        total_purchased: totalPurchased,
        total_paid: totalPaid,
      };
    });
  } catch (err: any) {
    console.error('Failed to load customers:', err);
  } finally {
    loading.value = false;
  }
};

// ─── statement ────────────────────────────────────────────────────────────────
const openStatement = async (customer: any) => {
  showStatement.value = true;
  loadingStatement.value = true;
  statement.value = null;
  payMsg.value = '';
  payErr.value = false;
  payForm.value = { amount: null, payment_method: 'cash', notes: '' };
  try {
    const res = await api.statement(customer.id);
    statement.value = res.data;
  } catch (e: any) {
    console.error(e);
  } finally {
    loadingStatement.value = false;
  }
};

const submitPayment = async () => {
  if (!payForm.value.amount || payForm.value.amount <= 0) return;
  if (payForm.value.amount > statement.value.summary.total_balance + 0.01) {
    payErr.value = true;
    payMsg.value = 'المبلغ أكبر من الرصيد المتبقي على العميل';
    return;
  }
  savingPayment.value = true;
  payMsg.value = '';
  payErr.value = false;
  try {
    await api.recordPayment(statement.value.customer.id, payForm.value);
    payMsg.value = ` تم تسجيل دفعة ${formatMoney(payForm.value.amount)} بنجاح`;
    payForm.value.amount = null;
    payForm.value.notes = '';
    // إعادة تحميل الحساب
    const res = await api.statement(statement.value.customer.id);
    statement.value = res.data;
    await load();
  } catch (e: any) {
    payErr.value = true;
    payMsg.value = e.message || 'فشل تسجيل الدفعة';
  } finally {
    savingPayment.value = false;
  }
};

const openSalePayment = (transaction: any) => {
  activeSalePayment.value = transaction;
  salePayForm.value = { amount: null, payment_method: 'cash', notes: '' };
  salePayMsg.value = '';
  salePayErr.value = false;
};

const submitSalePayment = async () => {
  if (!salePayForm.value.amount || salePayForm.value.amount <= 0) return;
  savingSalePay.value = true;
  salePayMsg.value = '';
  salePayErr.value = false;
  try {
    await api.recordSalePayment(activeSalePayment.value.id, salePayForm.value);
    salePayMsg.value = ` تم تسجيل ${formatMoney(salePayForm.value.amount)} بنجاح`;
    salePayForm.value.amount = null;
    // إعادة تحميل الحساب
    const res = await api.statement(statement.value.customer.id);
    statement.value = res.data;
    await load();
    // إغلاق بعد ثانية
    setTimeout(() => {
      activeSalePayment.value = null;
    }, 1200);
  } catch (e: any) {
    salePayErr.value = true;
    salePayMsg.value = e.message || 'فشل تسجيل الدفعة';
  } finally {
    savingSalePay.value = false;
  }
};

// ─── form ─────────────────────────────────────────────────────────────────────
const openForm = (c: any = null) => {
  form.value = c
    ? {
        ...c,
        opening_balance: Number(c.opening_balance || 0),
      }
    : {
        code: '',
        name_ar: '',
        phone: '',
        customer_type: 'retail',
        credit_limit: 0,
        opening_balance: 0,
      };
  showForm.value = true;
};

const save = async () => {
  if (form.value.id) await api.update(form.value.id, form.value);
  else await api.create(form.value);
  showForm.value = false;
  await load();
};

const removeCustomer = async (customer: any) => {
  if (!confirm(`تأكيد حذف العميل: ${customer.name_ar}؟`)) return;
  await api.delete(customer.id);
  await load();
};

onMounted(load);
</script>

<style lang="scss" scoped>
.customers-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 220px;
  .search-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.45;
    font-size: 0.9rem;
    pointer-events: none;
  }
}
.search-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  font-size: 0.9rem;
  transition: var(--transition);
  &:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  }
}
.type-filter {
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  font-size: 0.9rem;
}

/* Summary */
.summary-row {
  gap: 14px;
}
.summary-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  .summary-icon {
    font-size: 1.8rem;
  }
  .summary-label {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 3px;
  }
  .summary-value {
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--text-strong);
  }
  &.warn .summary-value {
    color: var(--warning);
  }
}

/* Table */
.code-badge {
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.8rem;
  border: 1px solid var(--border);
}
.name-cell .customer-name {
  font-weight: 700;
}
.type-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  &.wholesale {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary-dark);
    border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  }
  &.retail {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  }
}
.amount-cell {
  font-weight: 600;
  white-space: nowrap;
}
.muted {
  color: var(--text-muted);
  font-weight: 400;
}
.balance-due {
  color: var(--danger);
  font-weight: 800;
}
.balance-ok {
  color: var(--success);
}
.has-balance td {
  background: color-mix(in srgb, var(--warning) 4%, transparent);
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
}

.actions {
  display: flex;
  gap: 6px;
}

/* Modal overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(5px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

/* Statement Modal */
.statement-modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: min(820px, 96vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
}

.statement-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  .statement-title {
    display: flex;
    align-items: center;
    gap: 14px;
    .statement-icon {
      font-size: 2rem;
    }
    h2 {
      margin: 0;
      color: #fff;
      font-size: 1.2rem;
    }
    p {
      margin: 3px 0 0;
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.85rem;
    }
  }
  .close-btn {
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: var(--transition);
    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }
}

.statement-loading {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
}

/* Summary boxes */
.statement-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--border);
}
.summary-item {
  padding: 20px 24px;
  text-align: center;
  border-left: 1px solid var(--border);
  &:last-child {
    border-left: none;
  }
  .si-label {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 600;
  }
  .si-value {
    font-size: 1.4rem;
    font-weight: 800;
  }
  .si-sub {
    font-size: 0.75rem;
    margin-top: 4px;
  }
  &.purchased .si-value {
    color: var(--text-strong);
  }
  &.paid .si-value {
    color: var(--success);
  }
  &.balance.due .si-value {
    color: var(--danger);
  }
  &.balance.due {
    background: color-mix(in srgb, var(--danger) 4%, transparent);
  }
  &.balance.clear .si-value {
    color: var(--success);
  }
  &.balance.clear {
    background: color-mix(in srgb, var(--success) 4%, transparent);
  }
}

/* Payment form */
.payment-form {
  margin: 16px 20px;
  padding: 16px 20px;
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  background: color-mix(in srgb, var(--primary) 4%, transparent);
  h4 {
    margin: 0 0 14px;
    color: var(--primary-dark);
    font-size: 0.95rem;
  }
}
.payment-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.payment-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
}
.pay-msg {
  font-size: 0.88rem;
  font-weight: 700;
  &.ok {
    color: var(--success);
  }
  &.err {
    color: var(--danger);
  }
}

/* Transactions */
.transactions-section {
  padding: 16px 20px 20px;
  h4 {
    margin: 0 0 12px;
    color: var(--text-strong);
    font-size: 0.95rem;
    font-weight: 800;
  }
}
.transactions-wrap {
  overflow-x: auto;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.transactions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  th {
    background: var(--bg);
    padding: 10px 12px;
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    border-bottom: 2px solid var(--border);
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  tr:last-child td {
    border-bottom: none;
  }
  .row-sale td {
    background: color-mix(in srgb, var(--primary) 2%, transparent);
  }
  .row-invoice td {
    background: color-mix(in srgb, var(--accent) 2%, transparent);
  }
  .row-unpaid td {
    background: color-mix(in srgb, var(--danger) 4%, transparent);
  }
  .row-partial td {
    background: color-mix(in srgb, var(--warning) 4%, transparent);
  }
  .row-cancelled td {
    opacity: 0.5;
  }
  .paid-col {
    color: var(--success);
    font-weight: 700;
  }
}

.entry-type {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  vertical-align: middle;

  &.sale {
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary-dark);
  }

  &.invoice {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }
}

.status-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  &.paid {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: var(--success);
  }
  &.unpaid {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }
  &.partial {
    background: color-mix(in srgb, var(--warning) 12%, transparent);
    color: var(--warning);
  }
  &.refunded {
    background: color-mix(in srgb, var(--info) 12%, transparent);
    color: var(--info);
  }
}

/* Form modal */
.modal-content {
  max-width: 440px;
  width: 90%;
}
.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

/* Pay sale button */
.pay-sale-btn {
  padding: 5px 12px;
  border-radius: var(--radius-xs);
  font-size: 0.8rem;
  font-weight: 700;
  border: 1px solid color-mix(in srgb, var(--success) 35%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  color: var(--success);
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  &:hover {
    background: var(--success);
    color: #fff;
  }
}

/* Sale payment mini modal */
.sale-pay-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sale-pay-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: min(440px, 96vw);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
  overflow: hidden;
}
.sale-pay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--success), color-mix(in srgb, var(--success) 70%, #000));
  color: #fff;
  font-weight: 800;
  font-size: 0.95rem;
}
.close-btn-sm {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: rgba(255, 255, 255, 0.35);
  }
}
.sale-pay-info {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
  strong {
    font-weight: 800;
  }
}
.sale-pay-form {
  padding: 16px 20px;
}
.sale-pay-actions {
  display: flex;
  gap: 10px;
  padding: 0 20px 16px;
}

@media (max-width: 768px) {
  .statement-summary {
    grid-template-columns: 1fr;
  }
  .payment-fields {
    grid-template-columns: 1fr;
  }
  .summary-item {
    border-left: none;
    border-bottom: 1px solid var(--border);
  }
  .sale-pay-info {
    flex-direction: column;
    gap: 6px;
  }
}
</style>
