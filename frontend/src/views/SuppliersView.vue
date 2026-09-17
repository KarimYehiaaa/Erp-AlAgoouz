<template>
  <div>
    <div class="page-header">
      <button v-permission="'suppliers.add'" class="btn btn-primary" @click="openCreate">
        + مورد جديد
      </button>
    </div>

    <!-- شبكة كروت الموردين -->
    <div class="grid grid-3">
      <template v-if="loading">
        <div v-for="i in 3" :key="'sup-sk-' + i" class="card supplier-card">
          <div
            class="skeleton-shimmer"
            style="height: 24px; width: 140px; margin-bottom: 12px"
          ></div>
          <div
            class="skeleton-shimmer"
            style="height: 18px; width: 100px; margin-bottom: 8px"
          ></div>
          <div class="skeleton-shimmer" style="height: 18px; width: 80px; margin-bottom: 8px"></div>
          <div
            class="skeleton-shimmer"
            style="height: 18px; width: 120px; margin-bottom: 12px"
          ></div>
          <div class="skeleton-shimmer" style="height: 20px; width: 60px"></div>
        </div>
      </template>
      <template v-else>
        <div
          v-for="s in suppliers"
          :key="s.id"
          class="card supplier-card clickable"
          @click="viewDetails(s)"
        >
          <div class="supplier-head">
            <h3>{{ s.name_ar }}</h3>
            <div class="actions" @click.stop>
              <button
                v-permission="'suppliers.edit'"
                type="button"
                class="icon-btn"
                @click="openEdit(s)"
                title="تعديل"
              >
                <AppIcon name="edit" :size="16" />
              </button>
              <button
                v-permission="'suppliers.delete'"
                type="button"
                class="icon-btn danger"
                @click="removeSupplier(s)"
                title="حذف"
              >
                <AppIcon name="delete" :size="16" />
              </button>
            </div>
          </div>
          <p class="phone">{{ s.phone || 'بدون هاتف' }}</p>
          <div class="balance-row">
            <span>الرصيد المتبقي:</span>
            <strong :class="s.balance > 0 ? 'text-danger' : 'text-success'">{{
              formatMoney(s.balance)
            }}</strong>
          </div>
          <p class="meta">
            آخر تعديل: <strong>{{ s.last_updated_by || 'غير محدد' }}</strong>
          </p>
          <div class="card-footer">
            <span class="badge">{{ s.code || 'بدون كود' }}</span>
            <span class="view-details-link">عرض كشف الحساب ←</span>
          </div>
        </div>
      </template>
    </div>

    <!-- مودال: إضافة/تعديل مورد -->
    <div v-if="showForm" class="modal" @click.self="showForm = false">
      <div class="card modal-content">
        <h3>{{ form.id ? 'تعديل' : 'إضافة' }} مورد</h3>
        <form @submit.prevent="save">
          <div class="form-group">
            <label>كود المورد (اختياري)</label>
            <input v-model="form.code" placeholder="مثال: SUP001" />
          </div>
          <div class="form-group">
            <label>الاسم</label>
            <input v-model="form.name_ar" required />
          </div>
          <div class="form-group">
            <label>الهاتف</label>
            <input v-model="form.phone" />
          </div>
          <div class="form-group">
            <label>البريد الإلكتروني</label>
            <input type="email" v-model="form.email" />
          </div>
          <div class="form-group">
            <label>العنوان</label>
            <input v-model="form.address" />
          </div>
          <div class="form-group">
            <label>ملاحظات</label>
            <textarea v-model="form.notes" rows="2"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">حفظ</button>
        </form>
      </div>
    </div>

    <!-- مودال: تفاصيل المورد وكشف الحساب الشهري تفصيلياً -->
    <div v-if="showDetails" class="modal" @click.self="closeDetails">
      <div class="card modal-content details-modal">
        <div class="modal-header">
          <h3>كشف حساب المورد: {{ selectedSupplier?.name_ar }}</h3>
          <button type="button" class="close-btn" @click="closeDetails">&times;</button>
        </div>

        <div class="supplier-info-grid">
          <div class="info-item">
            <span>كود المورد:</span>
            <strong>{{ selectedSupplier?.code || 'بدون كود' }}</strong>
          </div>
          <div class="info-item">
            <span>الهاتف:</span>
            <strong>{{ selectedSupplier?.phone || 'بدون هاتف' }}</strong>
          </div>
          <div class="info-item highlight">
            <span>الرصيد المتبقي:</span>
            <strong :class="selectedSupplier?.balance > 0 ? 'text-danger' : 'text-success'">
              {{ formatMoney(selectedSupplier?.balance) }}
            </strong>
          </div>
        </div>

        <div class="modal-actions-bar">
          <button
            v-permission="'suppliers.edit'"
            type="button"
            class="btn btn-primary btn-sm"
            @click="openPaymentForm"
          >
            + تسجيل دفعة للمورد
          </button>
        </div>

        <hr class="separator-line" />

        <!-- كشف الحساب الشهري المجمع -->
        <div class="statement-months">
          <h4>المعاملات مجمعة بالشهور</h4>

          <div v-if="loadingDetails" class="loading-state">جاري تحميل تفاصيل المعاملات...</div>

          <div v-else-if="transactionsByMonth.length === 0" class="empty-state">
            لا توجد فواتير مشتريات أو سدادات مسجلة لهذا المورد.
          </div>

          <div v-else class="months-accordion">
            <div v-for="group in transactionsByMonth" :key="group.key" class="month-group">
              <!-- رأس الشهر (أكورديون) -->
              <div class="month-header" @click="toggleMonth(group.key)">
                <div class="month-title">
                  <span class="arrow-indicator">{{ expandedMonths[group.key] ? '▼' : '◀' }}</span>
                  <strong>{{ group.label }}</strong>
                </div>
                <div class="month-totals">
                  <span
                    >المشتريات:
                    <strong class="text-danger">{{
                      formatMoney(group.totalInvoices)
                    }}</strong></span
                  >
                  <span class="sep">|</span>
                  <span
                    >المدفوعات:
                    <strong class="text-success">{{
                      formatMoney(group.totalPayments)
                    }}</strong></span
                  >
                </div>
              </div>

              <!-- جدول تفاصيل الشهر -->
              <div v-show="expandedMonths[group.key]" class="month-details-container">
                <table class="details-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>نوع المعاملة</th>
                      <th>رقم المرجع</th>
                      <th>القيمة</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in group.transactions" :key="t.id" :class="t.type">
                      <td>{{ formatDate(t.dateStr) }}</td>
                      <td>
                        <span class="type-badge" :class="t.type">
                          {{ t.typeName }}
                          <span v-if="t.type === 'payment' && t.paymentMethod" class="method-label">
                            ({{ translateMethod(t.paymentMethod) }})
                          </span>
                        </span>
                      </td>
                      <td>
                        <code>{{ t.refNumber }}</code>
                      </td>
                      <td
                        class="amount"
                        :class="t.type === 'invoice' ? 'text-danger' : 'text-success'"
                      >
                        {{ t.type === 'invoice' ? '+' : '-' }} {{ formatMoney(t.amount) }}
                      </td>
                      <td>
                        <span class="notes-text" :title="t.notes">{{ t.notes || '—' }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- مودال فرعي: تسجيل سداد دفعة مورد -->
    <div v-if="showPaymentModal" class="modal" @click.self="showPaymentModal = false">
      <div class="card modal-content payment-form-modal">
        <div class="modal-header">
          <h3>تسجيل سداد دفعة: {{ selectedSupplier?.name_ar }}</h3>
          <button type="button" class="close-btn" @click="showPaymentModal = false">&times;</button>
        </div>
        <form @submit.prevent="submitPayment">
          <div class="form-group">
            <label>المبلغ المدفوع (جنيه) *</label>
            <input
              type="number"
              step="0.01"
              v-model.number="paymentForm.amount"
              required
              min="0.01"
              class="form-control"
            />
          </div>
          <div class="form-group">
            <label>طريقة الدفع</label>
            <select v-model="paymentForm.payment_method" class="form-control">
              <option value="cash">نقدي (Cash)</option>
              <option value="bank">تحويل بنكي / فيزا</option>
              <option value="vodafone">فودافون كاش</option>
            </select>
          </div>
          <div class="form-group">
            <label>ملاحظات السداد</label>
            <textarea
              v-model="paymentForm.notes"
              placeholder="أدخل أي ملاحظات تفصيلية هنا..."
              rows="3"
              class="form-control"
            ></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="submittingPayment">
              {{ submittingPayment ? 'جاري الحفظ...' : 'تسجيل السداد' }}
            </button>
            <button type="button" class="btn btn-secondary" @click="showPaymentModal = false">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { suppliers as api } from '@/api';
import { formatMoney } from '@/utils/currency';
import AppIcon from '@/components/AppIcon.vue';

const suppliers = ref<any[]>([]);
const loading = ref(false);
const showForm = ref(false);
const form = ref({ id: null, code: '', name_ar: '', phone: '', email: '', address: '', notes: '' });

// كشف الحساب تفصيلياً
const showDetails = ref(false);
const selectedSupplier = ref<any>(null);
const loadingDetails = ref(false);
const supplierInvoices = ref<any[]>([]);
const supplierPayments = ref<any[]>([]);
const expandedMonths = ref<Record<string, boolean>>({});

// تسجيل سداد
const showPaymentModal = ref(false);
const submittingPayment = ref(false);
const paymentForm = ref<Record<string, any>>({ amount: '', payment_method: 'cash', notes: '' });

const load = async () => {
  loading.value = true;
  try {
    suppliers.value = (await api.list()).data || [];
  } catch (err: any) {
    console.error('Failed to load suppliers:', err);
  } finally {
    loading.value = false;
  }
};

const openCreate = () => {
  form.value = { id: null, code: '', name_ar: '', phone: '', email: '', address: '', notes: '' };
  showForm.value = true;
};

const openEdit = (row: any) => {
  form.value = {
    id: row.id,
    code: row.code || '',
    name_ar: row.name_ar,
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    notes: row.notes || '',
  };
  showForm.value = true;
};

const save = async () => {
  try {
    if (form.value.id) await api.update(form.value.id, form.value);
    else await api.create(form.value);
    showForm.value = false;
    await load();
  } catch (e: any) {
    window.alert(e?.message || 'تعذر حفظ المورد');
  }
};

const removeSupplier = async (supplier: any) => {
  if (!window.confirm(`تأكيد حذف المورد: ${supplier.name_ar} ؟`)) return;
  try {
    await api.delete(supplier.id);
    await load();
  } catch (e: any) {
    window.alert(e?.message || 'تعذر حذف المورد');
  }
};

// تشغيل تفاصيل المورد وكشف الحساب الشهري
const viewDetails = async (supplier: any) => {
  selectedSupplier.value = supplier;
  showDetails.value = true;
  loadingDetails.value = true;
  supplierInvoices.value = [];
  supplierPayments.value = [];
  expandedMonths.value = {};

  try {
    const [invoicesRes, paymentsRes] = await Promise.all([
      api.invoices(supplier.id),
      api.payments(supplier.id),
    ]);
    supplierInvoices.value = invoicesRes.data || [];
    supplierPayments.value = paymentsRes.data || [];

    // توسيع الشهر الأول تلقائياً إذا كان متواجداً
    if (transactionsByMonth.value.length > 0) {
      expandedMonths.value[transactionsByMonth.value[0].key] = true;
    }
  } catch (err: any) {
    console.error('Failed to fetch supplier details:', err);
    window.alert('تعذر تحميل تفاصيل معاملات المورد');
  } finally {
    loadingDetails.value = false;
  }
};

const closeDetails = () => {
  showDetails.value = false;
  selectedSupplier.value = null;
};

const toggleMonth = (key: any) => {
  expandedMonths.value[key] = !expandedMonths.value[key];
};

// تجميع وترتيب الفواتير والمدفوعات بالأشهر
const transactionsByMonth = computed(() => {
  const list: any[] = [];

  // فواتير المشتريات
  supplierInvoices.value.forEach((inv: any) => {
    const date = new Date(inv.created_at);
    list.push({
      id: 'inv-' + inv.id,
      date: date,
      dateStr: inv.created_at,
      type: 'invoice',
      typeName: 'فاتورة مشتريات',
      refNumber: inv.invoice_number,
      amount: Number(inv.total_amount),
      notes: inv.notes,
    });
  });

  // المدفوعات المسددة
  supplierPayments.value.forEach((pay: any) => {
    const date = new Date(pay.created_at);
    list.push({
      id: 'pay-' + pay.id,
      date: date,
      dateStr: pay.created_at,
      type: 'payment',
      typeName: 'دفعة مسددة',
      refNumber: pay.payment_number,
      amount: Number(pay.amount),
      paymentMethod: pay.payment_method,
      notes: pay.notes,
    });
  });

  // الترتيب من الأحدث للأقدم
  list.sort((a: any, b: any) => b.date - a.date);

  // التجميع حسب الشهر والسنة
  const groups: Record<string, any> = {};
  list.forEach((t: any) => {
    const year = t.date.getFullYear();
    const monthIndex = t.date.getMonth();

    const monthsAr = [
      'يناير',
      'فبراير',
      'مارس',
      'إبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    const monthName = monthsAr[monthIndex];
    const groupKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const groupLabel = `${monthName} ${year}`;

    if (!groups[groupKey]) {
      groups[groupKey] = {
        key: groupKey,
        label: groupLabel,
        transactions: [],
        totalInvoices: 0,
        totalPayments: 0,
      };
    }

    groups[groupKey].transactions.push(t);
    if (t.type === 'invoice') {
      groups[groupKey].totalInvoices += t.amount;
    } else {
      groups[groupKey].totalPayments += t.amount;
    }
  });

  return Object.values(groups).sort((a: any, b: any) => b.key.localeCompare(a.key));
});

// نموذج تسجيل سداد
const openPaymentForm = () => {
  paymentForm.value = { amount: '', payment_method: 'cash', notes: '' };
  showPaymentModal.value = true;
};

const submitPayment = async () => {
  if (!paymentForm.value.amount || paymentForm.value.amount <= 0) {
    window.alert('برجاء إدخال مبلغ صحيح أكبر من الصفر');
    return;
  }

  submittingPayment.value = true;
  try {
    await api.recordPayment(selectedSupplier.value.id, paymentForm.value);
    window.alert('تم تسجيل الدفعة المسددة للمورد بنجاح');
    showPaymentModal.value = false;

    // إعادة تحميل قائمة الموردين لتحديث الأرصدة
    await load();

    // تحديث المورد المحدد الحالي
    const updated = suppliers.value.find((s: any) => s.id === selectedSupplier.value.id);
    if (updated) {
      selectedSupplier.value = updated;
    }

    // إعادة تحميل المعاملات وكشف الحساب للعميل
    if (selectedSupplier.value) {
      await viewDetails(selectedSupplier.value);
    }
  } catch (err: any) {
    console.error('Failed to submit payment:', err);
    window.alert(err?.message || 'تعذر تسجيل السداد');
  } finally {
    submittingPayment.value = false;
  }
};

const formatDate = (dateStr: any) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const translateMethod = (method: any) => {
  const m = {
    cash: 'نقدي',
    bank: 'تحويل بنكي',
    vodafone: 'فودافون كاش',
  };
  return m[method as keyof typeof m] || method;
};

onMounted(load);
</script>

<style scoped>
.page-header {
  margin-bottom: 20px;
}
.supplier-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.supplier-card {
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.supplier-card.clickable {
  cursor: pointer;
}
.supplier-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.supplier-card h3 {
  margin-bottom: 8px;
  color: var(--primary);
}
.supplier-card .phone {
  color: var(--text-muted, #777);
  margin-bottom: 6px;
}
.balance-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.95rem;
}
.meta {
  color: var(--text-muted, #777);
  font-size: 0.85rem;
  margin-top: 6px;
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 8px;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: 10px;
  margin-top: 5px;
}
.view-details-link {
  font-size: 0.85rem;
  color: var(--primary);
  font-weight: bold;
}

/* مودال التعديل والإضافة ومودال الدفع */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-content {
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}
.payment-form-modal {
  max-width: 400px;
}

/* مودال التفاصيل الكبيرة */
.details-modal {
  max-width: 800px;
  width: 95%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
  margin-bottom: 15px;
}
.modal-header h3 {
  margin: 0;
  color: var(--primary);
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.8rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-muted);
}
.close-btn:hover {
  color: var(--text);
}

/* شبكة تفاصيل المورد */
.supplier-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  background: var(--bg-muted, #f8f9fa);
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 15px;
  border: 1px solid var(--border);
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}
.info-item span {
  color: var(--text-muted);
}
.info-item strong {
  font-size: 1rem;
  color: var(--text);
}
.info-item.highlight strong {
  font-size: 1.1rem;
}

.modal-actions-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
.separator-line {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 12px 0;
}

/* كشف الحساب والأكورديون */
.statement-months h4 {
  margin-top: 0;
  margin-bottom: 12px;
  color: var(--text);
  font-size: 1rem;
}
.loading-state,
.empty-state {
  text-align: center;
  padding: 30px;
  color: var(--text-muted);
  font-size: 0.95rem;
}
.months-accordion {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.month-group {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-card);
}
.month-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-muted, #f8f9fa);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}
.month-header:hover {
  background: var(--border);
}
.month-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  color: var(--text);
}
.arrow-indicator {
  font-size: 0.75rem;
  color: var(--text-muted);
  width: 14px;
  text-align: center;
}
.month-totals {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
  align-items: center;
}
.month-totals .sep {
  color: var(--border);
}

.month-details-container {
  padding: 12px;
  border-top: 1px solid var(--border);
  overflow-x: auto;
  background: var(--bg-card);
}

/* جدول تفاصيل الحساب */
.details-table {
  width: 100%;
  border-collapse: collapse;
  text-align: start;
  font-size: 0.85rem;
}
.details-table th,
.details-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.details-table th {
  background: var(--bg-muted, #f8f9fa);
  color: var(--text-muted);
  font-weight: bold;
}
.details-table tr:hover {
  background: rgba(0, 0, 0, 0.01);
}

.type-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
}
.type-badge.invoice {
  background: rgba(220, 53, 69, 0.1);
  color: #dc3545;
}
.type-badge.payment {
  background: rgba(40, 167, 69, 0.1);
  color: #28a745;
}
.method-label {
  font-weight: normal;
  font-size: 0.7rem;
  opacity: 0.85;
  margin-inline-start: 4px;
}

.amount {
  font-family: monospace;
  font-size: 0.9rem;
  font-weight: bold;
  text-align: start;
}
.notes-text {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  color: var(--text-muted);
}

/* ألوان المساعد */
.text-danger {
  color: #dc3545 !important;
}
.text-success {
  color: #28a745 !important;
}

/* نموذج المدفوعات والمدخلات */
.form-group {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 0.9rem;
  font-weight: bold;
  color: var(--text);
}
.form-group input,
.form-group select,
.form-group textarea {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.9rem;
  width: 100%;
  box-sizing: border-box;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}
.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}
</style>
