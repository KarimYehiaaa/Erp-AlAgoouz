<template>
  <div class="invoice-form-page">
    <div class="page-header">
      <router-link to="/invoices" class="btn btn-outline">← الفواتير</router-link>
      <h2>{{ isEdit ? `تعديل الفاتورة #${invoiceNumber}` : 'إنشاء فاتورة عميل يدويًا' }}</h2>
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
            <input v-model="form.discount_percent" type="text" inputmode="decimal" />
          </div>
          <div class="form-group">
            <label>خصم (مبلغ ج.م)</label>
            <input v-model="form.discount_amount" type="text" inputmode="decimal" />
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
        <button type="button" class="btn btn-outline btn-block" style="margin-bottom: 8px;" @click="showPreview = true">
          👁️ معاينة الفاتورة قبل الإصدار
        </button>
        <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
          {{ saving ? (isEdit ? 'جاري الحفظ...' : 'جاري الإصدار...') : (isEdit ? 'حفظ التعديلات' : 'إصدار الفاتورة') }}
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
                <input 
                  v-model="line.description" 
                  list="products-list" 
                  class="desc-input" 
                  placeholder="اسم المنتج أو وصف البند..." 
                  @input="onProductType(line)" 
                  required 
                />
              </td>
              <td><input v-model="line.quantity" type="text" inputmode="decimal" required /></td>
              <td><input v-model="line.unit_price" type="text" inputmode="decimal" required /></td>
              <td><input v-model="line.discount_amount" type="text" inputmode="decimal" /></td>
              <td class="line-total">{{ formatMoney(lineTotal(line)) }}</td>
              <td>
                <button v-if="form.items.length > 1" type="button" class="btn btn-sm btn-danger" @click="removeLine(i)">×</button>
              </td>
            </tr>
          </tbody>
        </table>
        
        <!-- Autocomplete Suggestions Datalist -->
        <datalist id="products-list">
          <option v-for="p in products" :key="p.id" :value="p.name_ar">{{ p.name_ar }}</option>
        </datalist>
      </div>
    </form>

    <!-- Invoice Preview Modal -->
    <div v-if="showPreview" class="modal-backdrop fade-in" @click.self="showPreview = false">
      <div class="modal-card card glassmorphic animate-zoom-in" style="max-width: 700px; width: 90%; margin: 40px auto; padding: 24px;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
          <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: var(--primary);">👁️ معاينة الفاتورة قبل الإصدار</h3>
          <button type="button" class="btn-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);" @click="showPreview = false">×</button>
        </div>
        <div class="modal-body" style="direction: rtl; text-align: right;">
          <!-- Elegant Invoice Preview Sheet -->
          <div class="invoice-sheet" style="background: var(--bg-soft); border-radius: 8px; padding: 24px; border: 1px solid var(--border);">
            <div class="invoice-sheet-header" style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--border); padding-bottom: 16px; margin-bottom: 20px;">
              <div>
                <h4 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: var(--primary);">بن العجوز ERP</h4>
                <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">فاتورة مبيعات</p>
              </div>
              <div style="text-align: left;">
                <p style="margin: 0; font-size: 0.85rem; font-weight: 700;">التاريخ: {{ form.issued_at }}</p>
                <p v-if="form.due_date" style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--danger);">الاستحقاق: {{ form.due_date }}</p>
              </div>
            </div>
            
            <div class="invoice-sheet-meta" style="margin-bottom: 20px;">
              <p style="margin: 0 0 6px 0; font-size: 0.9rem;"><strong>العميل:</strong> {{ getCustomerName() }}</p>
              <p style="margin: 0; font-size: 0.9rem;"><strong>حالة الدفع:</strong> 
                <span class="badge" :class="form.payment_status" style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">
                  {{ form.payment_status === 'paid' ? 'مدفوعة' : form.payment_status === 'unpaid' ? 'غير مدفوعة' : 'مدفوعة جزئياً' }}
                </span>
              </p>
            </div>
            
            <table class="preview-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="border-bottom: 1.5px solid var(--border-strong); text-align: right;">
                  <th style="padding: 8px 4px; font-size: 0.85rem; color: var(--text-muted);">البند / المنتج</th>
                  <th style="padding: 8px 4px; font-size: 0.85rem; color: var(--text-muted); text-align: center;">الكمية</th>
                  <th style="padding: 8px 4px; font-size: 0.85rem; color: var(--text-muted); text-align: left;">سعر الوحدة</th>
                  <th style="padding: 8px 4px; font-size: 0.85rem; color: var(--text-muted); text-align: left;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(line, idx) in form.items.filter(l => l.description?.trim())" :key="idx" style="border-bottom: 1px solid var(--border);">
                  <td style="padding: 8px 4px; font-size: 0.85rem;">{{ line.description }}</td>
                  <td style="padding: 8px 4px; font-size: 0.85rem; text-align: center;">{{ line.quantity }}</td>
                  <td style="padding: 8px 4px; font-size: 0.85rem; text-align: left;">{{ formatMoney(Number(line.unit_price)) }}</td>
                  <td style="padding: 8px 4px; font-size: 0.85rem; text-align: left; font-weight: 700;">{{ formatMoney(lineTotal(line)) }}</td>
                </tr>
              </tbody>
            </table>
            
            <div class="invoice-sheet-totals" style="display: flex; flex-direction: column; align-items: flex-start; width: 100%; max-width: 250px; margin-right: auto; gap: 8px;">
              <div style="display: flex; justify-content: space-between; width: 100%; font-size: 0.85rem;">
                <span>المجموع الفرعي:</span> <strong>{{ formatMoney(subtotal) }}</strong>
              </div>
              <div v-if="discountTotal > 0" style="display: flex; justify-content: space-between; width: 100%; font-size: 0.85rem; color: var(--danger);">
                <span>الخصم:</span> <strong>-{{ formatMoney(discountTotal) }}</strong>
              </div>
              <div v-if="form.tax_enabled" style="display: flex; justify-content: space-between; width: 100%; font-size: 0.85rem;">
                <span>ضريبة القيمة المضافة:</span> <strong>{{ formatMoney(taxAmount) }}</strong>
              </div>
              <div style="border-top: 1.5px solid var(--border-strong); width: 100%; margin-top: 4px; padding-top: 8px; display: flex; justify-content: space-between; font-size: 1.05rem; color: var(--primary);">
                <span>الإجمالي النهائي:</span> <strong>{{ formatMoney(grandTotal) }}</strong>
              </div>
            </div>
            
            <div v-if="form.notes" style="margin-top: 20px; padding-top: 12px; border-top: 1px dashed var(--border); font-size: 0.8rem; color: var(--text-muted);">
              <strong>ملاحظات الشروط:</strong> {{ form.notes }}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px;">
          <button type="button" class="btn btn-outline" @click="showPreview = false">إغلاق المعاينة</button>
          <button type="button" class="btn btn-primary" @click="triggerSubmitFromPreview">
            {{ isEdit ? 'تأكيد وحفظ الفاتورة' : 'إصدار الفاتورة الآن' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="error-msg">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { invoices as invoicesApi, customers as customersApi, products as productsApi } from '@/api';
import { formatMoney, TAX_RATE } from '@/utils/currency';
import { parseLocalizedNumber } from '@/utils/numberParsing';

const router = useRouter();
const route = useRoute();
const customers = ref([]);
const products = ref([]);
const saving = ref(false);
const error = ref('');
const showPreview = ref(false);

const getCustomerName = () => {
  const c = customers.value.find((x) => x.id === form.value.customer_id);
  return c ? c.name_ar : 'عميل نقدي (بدون تسجيل)';
};

const triggerSubmitFromPreview = () => {
  showPreview.value = false;
  submit();
};

const isEdit = computed(() => !!route.params.id);
const invoiceNumber = ref('');

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
  const qty = parseLocalizedNumber(line.quantity);
  const price = parseLocalizedNumber(line.unit_price);
  const disc = parseLocalizedNumber(line.discount_amount);
  return Math.max(0, qty * price - disc);
};

const subtotal = computed(() => form.value.items.reduce((s, l) => s + lineTotal(l), 0));
const discountTotal = computed(() => {
  const pct = (subtotal.value * parseLocalizedNumber(form.value.discount_percent)) / 100;
  const amt = parseLocalizedNumber(form.value.discount_amount);
  return pct + amt;
});
const afterDiscount = computed(() => Math.max(0, subtotal.value - discountTotal.value));
const taxAmount = computed(() => (form.value.tax_enabled ? (afterDiscount.value * TAX_RATE) / 100 : 0));
const grandTotal = computed(() => afterDiscount.value + taxAmount.value);

const onProductType = (line) => {
  const p = products.value.find((x) => x.name_ar === line.description);
  if (p) {
    line.product_id = p.id;
    line.unit_price = Number(p.sale_price) || 0;
  } else {
    line.product_id = null;
  }
};

const addLine = () => form.value.items.push(emptyLine());
const removeLine = (i) => form.value.items.splice(i, 1);

const loadInvoice = async () => {
  try {
    const res = await invoicesApi.get(route.params.id);
    const inv = res.data;
    if (!inv) throw new Error('لم يتم العثور على الفاتورة');
    invoiceNumber.value = inv.invoice_number || '';
    form.value = {
      customer_id: inv.customer_id,
      issued_at: inv.issued_at ? inv.issued_at.slice(0, 10) : today(),
      due_date: inv.due_date ? inv.due_date.slice(0, 10) : '',
      payment_status: inv.payment_status,
      tax_enabled: Number(inv.tax_amount) > 0,
      discount_percent: Number(inv.discount_percent) || 0,
      discount_amount: Number(inv.discount_amount) || 0,
      notes: inv.notes || '',
      items: inv.items && inv.items.length ? inv.items.map(item => ({
        product_id: item.product_id,
        description: item.description,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        discount_amount: Number(item.discount_amount) || 0,
      })) : [emptyLine()],
    };
  } catch (e) {
    error.value = e.message || 'فشل تحميل الفاتورة';
  }
};

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
    if (isEdit.value) {
      await invoicesApi.update(route.params.id, payload);
      router.push(`/invoices/${route.params.id}`);
    } else {
      const res = await invoicesApi.create(payload);
      router.push(`/invoices/${res.data.id}`);
    }
  } catch (e) {
    error.value = e.message || (isEdit.value ? 'فشل تحديث الفاتورة' : 'فشل إنشاء الفاتورة');
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

  if (isEdit.value) {
    await loadInvoice();
  }
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
