<template>
  <div class="purchases-page">
    <div class="card form-card">
      <h3>{{ editingInvoiceId ? 'تعديل فاتورة مشتريات' : 'إدخال فاتورة مشتريات' }}</h3>
      <div class="grid grid-2">
        <div class="form-group">
          <label>تاريخ الفاتورة</label>
          <input v-model="form.invoice_date" type="date" />
        </div>
        <div class="form-group">
          <label>المورد</label>
          <select v-model.number="form.supplier_id" class="field-like">
            <option :value="null">— بدون مورد —</option>
            <option v-for="s in suppliersList" :key="s.id" :value="s.id">{{ s.name_ar }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>ملاحظات</label>
          <input v-model="form.notes" />
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>المنتج</th>
            <th>المخزن</th>
            <th>الوحدة</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>الإجمالي</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in form.items" :key="i">
            <td>
              <select v-model.number="item.product_id" class="field-like" @change="onProductChange(item)">
                <option :value="null">اختر المنتج</option>
                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name_ar }} ({{ unitLabel(p.unit) }})</option>
              </select>
            </td>
            <td>
              <span class="warehouse-chip" :class="{ missing: !item.warehouse_name }">
                {{ item.warehouse_name || 'حدد المنتج' }}
              </span>
            </td>
            <td>
              <select v-model="item.unit" class="field-like">
                <option v-for="u in unitNames(item.unit)" :key="u" :value="u">{{ unitLabel(u) }}</option>
              </select>
            </td>
            <td><input v-model.number="item.quantity" class="field-like" type="number" min="0.001" step="0.001" /></td>
            <td><input v-model.number="item.unit_price" class="field-like" type="number" min="0" step="0.01" /></td>
            <td>{{ formatMoney((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)) }}</td>
            <td><button type="button" class="btn btn-sm btn-danger" @click="removeItem(i)" :disabled="form.items.length === 1">حذف</button></td>
          </tr>
        </tbody>
      </table>

      <div class="actions">
        <button type="button" class="btn btn-outline" @click="addItem">+ صنف</button>
        <div class="total">الإجمالي: {{ formatMoney(totalAmount) }}</div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" :disabled="saving" @click="saveInvoice">
          {{ saving ? 'جاري الحفظ...' : (editingInvoiceId ? 'حفظ التعديل' : 'حفظ الفاتورة') }}
        </button>
        <button v-if="editingInvoiceId" type="button" class="btn btn-outline" :disabled="saving" @click="cancelEdit">
          إلغاء التعديل
        </button>
      </div>

      <p v-if="msg" :class="['msg', err ? 'err' : 'ok']">{{ msg }}</p>
    </div>

    <div class="card">
      <h3>آخر فواتير المشتريات</h3>
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
          <tr v-for="inv in invoices" :key="inv.id">
            <td>{{ inv.invoice_number }}</td>
            <td>{{ inv.invoice_date }}</td>
            <td>{{ inv.supplier_name || '—' }}</td>
            <td>{{ inv.warehouse_name }}</td>
            <td>{{ formatMoney(inv.total_amount) }}</td>
            <td>{{ inv.items?.length || 0 }}</td>
            <td>
              <button
                type="button"
                class="btn btn-sm btn-outline"
                @click="editInvoice(inv)"
                :disabled="saving"
              >
                تعديل
              </button>
              <button
                type="button"
                class="btn btn-sm btn-danger"
                @click="deleteInvoice(inv.id, inv.invoice_number)"
                :disabled="saving"
              >
                حذف
              </button>
            </td>
          </tr>
          <tr v-if="!invoices.length">
            <td colspan="7">لا توجد بيانات</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { products as productsApi, purchases as purchasesApi, suppliers as suppliersApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

const { units: productUnits, loadMeta, unitLabel, unitNames } = useProductMeta();

const products = ref([]);
const invoices = ref([]);
const suppliersList = ref([]);
const saving = ref(false);
const msg = ref('');
const err = ref(false);
const editingInvoiceId = ref(null);

const emptyItem = () => ({ product_id: null, warehouse_name: '', unit: unitNames()[0] || 'قطعة', quantity: 1, unit_price: 0 });
const form = ref({
  invoice_date: new Date().toISOString().slice(0, 10),
  supplier_id: null,
  notes: '',
  items: [emptyItem()],
});

const totalAmount = computed(() =>
  form.value.items.reduce((s, x) => s + (Number(x.quantity) || 0) * (Number(x.unit_price) || 0), 0)
);

const load = async () => {
  const [p, inv, sup] = await Promise.all([
    productsApi.list({ limit: 5000 }),
    purchasesApi.list({ limit: 50 }),
    suppliersApi.list(),
  ]);
  products.value = p.data || [];
  invoices.value = inv.data || [];
  suppliersList.value = sup.data || [];
  await loadMeta();
};

const onProductChange = (item) => {
  const p = products.value.find((x) => x.id === item.product_id);
  if (!p) return;
  item.warehouse_name = p.primary_warehouse_name || '';
  item.unit = p.unit || 'count';
  item.unit_price = Number(p.purchase_price) || 0;
};

const addItem = () => form.value.items.push(emptyItem());
const removeItem = (i) => form.value.items.splice(i, 1);

const resetForm = () => {
  editingInvoiceId.value = null;
  form.value = {
    invoice_date: new Date().toISOString().slice(0, 10),
    supplier_id: null,
    notes: '',
    items: [emptyItem()],
  };
};

const editInvoice = (invoice) => {
  editingInvoiceId.value = invoice.id;
  form.value = {
    invoice_date: String(invoice.invoice_date || '').slice(0, 10),
    supplier_id: invoice.supplier_id || null,
    notes: invoice.notes || '',
    items: (invoice.items || []).map((item) => ({
      product_id: item.product_id,
      warehouse_name: item.warehouse_name || '',
      unit: item.unit || 'count',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
    })),
  };
  if (!form.value.items.length) form.value.items = [emptyItem()];
  msg.value = `جاري تعديل فاتورة ${invoice.invoice_number}`;
  err.value = false;
};

const cancelEdit = () => {
  resetForm();
  msg.value = '';
  err.value = false;
};

const deleteInvoice = async (id, invoiceNumber) => {
  if (!id) return;
  const ok = confirm(`هل تريد حذف فاتورة المشتريات ${invoiceNumber}?`);
  if (!ok) return;

  msg.value = '';
  err.value = false;
  saving.value = true;
  try {
    await purchasesApi.delete(id);
    msg.value = 'تم حذف فاتورة المشتريات وتحديث المخزون';
    await load();
  } catch (e) {
    err.value = true;
    msg.value = e.message || 'فشل الحذف';
  } finally {
    saving.value = false;
  }
};

const saveInvoice = async () => {
  msg.value = '';
  err.value = false;
  saving.value = true;
  try {
    const items = form.value.items.filter((x) => x.product_id && Number(x.quantity) > 0);
    if (!items.length) throw new Error('أضف صنفًا واحدًا على الأقل');
    const payload = {
      invoice_date: form.value.invoice_date,
      supplier_id: form.value.supplier_id || null,
      notes: form.value.notes,
      items,
    };
    if (editingInvoiceId.value) {
      const res = await purchasesApi.update(editingInvoiceId.value, payload);
      const shortages = res?.data?.shortages || [];
      msg.value = shortages.length
        ? `تم تعديل فاتورة المشتريات، مع وجود ${shortages.length} بند لم يتم عكس كامل كميته من المخزون القديم`
        : 'تم تعديل فاتورة المشتريات وتحديث المخزون';
    } else {
      await purchasesApi.create(payload);
      msg.value = 'تم حفظ فاتورة المشتريات وتحديث المخزون';
    }
    resetForm();
    await load();
  } catch (e) {
    err.value = true;
    msg.value = e.message || 'فشل الحفظ';
  } finally {
    saving.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.purchases-page { display: flex; flex-direction: column; gap: 16px; }
.items-table { width: 100%; }
.items-table th, .items-table td { padding: 8px; text-align: right; vertical-align: middle; }
.items-table input, .items-table select { width: 100%; }
.field-like {
  width: 100%; padding: 10px 12px;
  border: 2px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg-elevated); font-size: 0.9rem; font-weight: 600;
  transition: var(--transition);
  &:focus { outline: none; border-color: var(--primary); }
}
.warehouse-chip {
  display: inline-flex; align-items: center; min-height: 38px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--info) 10%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--info) 24%, transparent);
  color: var(--text-strong); font-weight: 700; white-space: nowrap;
}
.warehouse-chip.missing {
  background: var(--bg-elevated);
  border-color: var(--border);
  color: var(--text-muted);
}
.actions { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.total { font-weight: 800; color: var(--text-strong); }
.msg.ok  { color: var(--success); font-weight: 700; }
.msg.err { color: var(--danger);  font-weight: 700; }
</style>
