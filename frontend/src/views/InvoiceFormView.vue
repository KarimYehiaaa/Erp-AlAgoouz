<template>
  <div class="invoice-form-page">
    <div class="page-header">
      <router-link to="/invoices" class="btn btn-outline">← الفواتير</router-link>
      <h2>إنشاء فاتورة عميل يدويًا</h2>
    </div>

    <form class="grid grid-2 form-layout" @submit.prevent="submit">
      <div class="card form-panel">
        <h3>بيانات الفاتورة</h3>
        <div class="form-group">
          <label>العميل</label>
          <select v-model="form.customer_id">
            <option :value="null">عميل نقدي (بدون تسجيل)</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name_ar }} — {{ c.code }}</option>
          </select>
        </div>
        <div class="grid grid-2">
          <div class="form-group">
            <label>تاريخ الإصدار *</label>
            <input v-model="form.issued_at" type="date" required />
          </div>
          <div class="form-group">
            <label>تاريخ الاستحقاق</label>
            <input v-model="form.due_date" type="date" />
          </div>
        </div>
        <div class="grid grid-2">
          <div class="form-group">
            <label>حالة الدفع</label>
            <select v-model="form.payment_status">
              <option value="paid">مدفوعة</option>
              <option value="unpaid">غير مدفوعة</option>
              <option value="partial">مدفوعة جزئيًا</option>
            </select>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.tax_enabled" type="checkbox" />
              تطبيق ض.ق.م ({{ TAX_RATE }}%)
            </label>
          </div>
        </div>
        <div class="grid grid-2">
          <div class="form-group">
            <label>خصم (%)</label>
            <input v-model.number="form.discount_percent" type="number" min="0" max="100" step="0.01" />
          </div>
          <div class="form-group">
            <label>خصم (مبلغ ج.م)</label>
            <input v-model.number="form.discount_amount" type="number" min="0" step="0.01" />
          </div>
        </div>
        <div class="form-group">
          <label>ملاحظات</label>
          <textarea v-model="form.notes" rows="2" placeholder="شروط الدفع، تفاصيل إضافية..."></textarea>
        </div>
      </div>

      <div class="card totals-panel">
        <h3>ملخص المبالغ</h3>
        <div class="summary-line"><span>المجموع الفرعي</span><strong>{{ formatMoney(subtotal) }}</strong></div>
        <div class="summary-line"><span>الخصم</span><strong>{{ formatMoney(discountTotal) }}</strong></div>
        <div class="summary-line"><span>ض.ق.م</span><strong>{{ formatMoney(taxAmount) }}</strong></div>
        <div class="summary-line grand"><span>الإجمالي</span><strong>{{ formatMoney(grandTotal) }}</strong></div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
          {{ saving ? 'جاري الإصدار...' : 'إصدار الفاتورة' }}
        </button>
      </div>

      <div class="card items-panel span-2">
        <div class="items-head">
          <h3>بنود الفاتورة</h3>
          <button type="button" class="btn btn-outline btn-sm" @click="addLine">+ إضافة بند</button>
        </div>
        <table class="items-table">
          <thead>
            <tr>
              <th>البيان</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>خصم البند</th>
              <th>الإجمالي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, i) in form.items" :key="i">
              <td>
                <select v-model="line.product_id" class="product-select" @change="onProductPick(line)">
                  <option :value="null">— اختر المنتج —</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name_ar }}</option>
                </select>
                <input v-model="line.description" type="text" class="desc-input" placeholder="وصف البند" required />
              </td>
              <td><input v-model.number="line.quantity" type="number" min="0.001" step="0.001" required /></td>
              <td><input v-model.number="line.unit_price" type="number" min="0" step="0.01" required /></td>
              <td><input v-model.number="line.discount_amount" type="number" min="0" step="0.01" /></td>
              <td class="line-total">{{ formatMoney(lineTotal(line)) }}</td>
              <td>
                <button v-if="form.items.length > 1" type="button" class="btn btn-sm btn-danger" @click="removeLine(i)">×</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </form>

    <p v-if="error" class="error-msg">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { invoices as invoicesApi, customers as customersApi, products as productsApi } from '@/api';
import { formatMoney, TAX_RATE } from '@/utils/currency';

const router = useRouter();
const customers = ref([]);
const products = ref([]);
const saving = ref(false);
const error = ref('');

const today = () => new Date().toISOString().slice(0, 10);

const emptyLine = () => ({
  product_id: null,
  description: '',
  quantity: 1,
  unit_price: 0,
  discount_amount: 0,
});

const form = ref({
  customer_id: null,
  issued_at: today(),
  due_date: '',
  payment_status: 'paid',
  tax_enabled: true,
  discount_percent: 0,
  discount_amount: 0,
  notes: '',
  items: [emptyLine()],
});

const lineTotal = (line) => {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const disc = Number(line.discount_amount) || 0;
  return Math.max(0, qty * price - disc);
};

const subtotal = computed(() => form.value.items.reduce((s, l) => s + lineTotal(l), 0));
const discountTotal = computed(() => {
  const pct = (subtotal.value * (Number(form.value.discount_percent) || 0)) / 100;
  const amt = Number(form.value.discount_amount) || 0;
  return pct + amt;
});
const afterDiscount = computed(() => Math.max(0, subtotal.value - discountTotal.value));
const taxAmount = computed(() => (form.value.tax_enabled ? (afterDiscount.value * TAX_RATE) / 100 : 0));
const grandTotal = computed(() => afterDiscount.value + taxAmount.value);

const onProductPick = (line) => {
  const p = products.value.find((x) => x.id === line.product_id);
  if (!p) return;
  line.description = p.name_ar || line.description;
  line.unit_price = Number(p.sale_price) || line.unit_price || 0;
};

const addLine = () => form.value.items.push(emptyLine());
const removeLine = (i) => form.value.items.splice(i, 1);

const submit = async () => {
  error.value = '';
  const validItems = form.value.items.filter((l) => l.description?.trim() && lineTotal(l) > 0);
  if (!validItems.length) {
    error.value = 'أضف بندًا واحدًا على الأقل بمبلغ أكبر من صفر';
    return;
  }
  saving.value = true;
  try {
    const payload = {
      customer_id: form.value.customer_id,
      issued_at: form.value.issued_at,
      due_date: form.value.due_date || null,
      payment_status: form.value.payment_status,
      tax_enabled: form.value.tax_enabled,
      tax_percent: TAX_RATE,
      discount_percent: form.value.discount_percent || 0,
      discount_amount: form.value.discount_amount || 0,
      notes: form.value.notes || null,
      items: validItems.map((l) => ({
        product_id: l.product_id || null,
        description: l.description.trim(),
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount || 0,
      })),
    };
    const res = await invoicesApi.create(payload);
    router.push(`/invoices/${res.data.id}`);
  } catch (e) {
    error.value = e.message || 'فشل إنشاء الفاتورة';
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  const [cRes, pRes] = await Promise.all([
    customersApi.list({ limit: 500 }),
    productsApi.list({ limit: 1000 }),
  ]);
  customers.value = cRes.data || [];
  products.value = pRes.data || [];
});
</script>

<style lang="scss" scoped>
.invoice-form-page { max-width: 1100px; margin: 0 auto; }
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  h2 { margin: 0; font-size: 1.2rem; color: var(--primary); }
}
.form-layout { align-items: start; }
.span-2 { grid-column: 1 / -1; }
.items-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  h3 { margin: 0; }
}
.items-table {
  width: 100%;
  th { text-align: right; padding: 10px; font-size: 0.85rem; color: var(--text-muted); }
  td { padding: 8px; vertical-align: top; }
  input, select {
    width: 100%;
    padding: 8px;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .product-select { margin-bottom: 6px; }
  .line-total { font-weight: 700; white-space: nowrap; color: var(--primary); }
}
.totals-panel {
  .summary-line {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    &.grand {
      font-size: 1.15rem;
      color: var(--primary);
      border-bottom: none;
      margin-top: 8px;
    }
  }
  .btn-block { width: 100%; margin-top: 20px; }
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 28px;
  cursor: pointer;
}
.error-msg {
  color: #c0392b;
  background: #fdecea;
  padding: 12px;
  border-radius: 8px;
  margin-top: 16px;
}
</style>
