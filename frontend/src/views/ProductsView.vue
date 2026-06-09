<template>
  <div class="products-page">
    <div class="page-header">
      <div class="tabs inline-tabs">
        <button type="button" :class="{ active: tab === 'list' }" @click="tab = 'list'">📋 المنتجات</button>
        <button type="button" :class="{ active: tab === 'return' }" @click="tab = 'return'; loadReturns()">↩️ استرداد منتجات</button>
      </div>
      <div v-if="tab === 'list'" class="header-actions">
        <button type="button" class="btn btn-outline" @click="downloadTemplate">📥 قالب Excel</button>
        <button type="button" class="btn btn-outline" @click="exportProducts">📤 تصدير المنتجات (Excel)</button>
        <label class="btn btn-outline import-btn">
          📥 استيراد وتعديل (Excel)
          <input type="file" accept=".xlsx,.xls" hidden @change="onImport" />
        </label>
        <button type="button" class="btn btn-primary" :disabled="loading" @click="openForm()">
          {{ loading ? 'جاري التحميل...' : '+ إضافة منتج' }}
        </button>
      </div>
    </div>

    <p v-if="importMsg" class="import-msg" :class="{ err: importErr }">{{ importMsg }}</p>

    <div v-if="tab === 'list'" class="products-stats card">
      <div class="stat-item">
        <div class="stat-label">عدد المنتجات</div>
        <div class="stat-value">{{ products.length }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">المنتجات النشطة</div>
        <div class="stat-value">{{ activeProductsCount }}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">المنتجات منخفضة المخزون</div>
        <div class="stat-value">{{ lowStockCount }}</div>
      </div>
    </div>

    <template v-if="tab === 'list'">
      <div class="card table-wrap">
        <table class="products-table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>التصنيف</th>
              <th>شراء</th>
              <th>بيع</th>
              <th>المخزن</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in products" :key="p.id">
              <td class="product-name-cell">
                <div class="product-title">
                  <span class="product-name">{{ p.name_ar }}</span>
                  <span class="product-sku">{{ p.sku }}</span>
                </div>
                <span class="product-unit-badge">{{ unitLabel(p.unit) }}</span>
              </td>
              <td>{{ p.category_name || '—' }}</td>
              <td>{{ formatMoney(p.purchase_price) }}</td>
              <td>{{ formatMoney(p.sale_price) }}</td>
              <td class="warehouse-cell">{{ p.primary_warehouse_name || '—' }}</td>
              <td>{{ p.is_active ? 'نشط' : 'معطل' }}</td>
              <td class="actions-cell">
                <button type="button" class="icon-btn" title="تعديل" @click="editProduct(p)">✏️</button>
                <button
                  type="button"
                  class="icon-btn"
                  :class="{ disabled: p.has_active_recipe }"
                  :disabled="p.has_active_recipe"
                  :title="p.has_active_recipe ? 'منتج وصفة نشطة: لا يتم استرداد مخزونه مباشرة' : 'استرداد'"
                  @click="openReturn(p)"
                >↩</button>
                <button type="button" class="icon-btn danger" title="حذف المنتج" @click="deleteOneProduct(p)">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="danger-mini card">
        <span>حذف كل المنتجات</span>
        <button type="button" class="btn btn-sm btn-danger" @click="deleteAllProducts">حذف الكل</button>
      </div>
    </template>

    <template v-else>
      <div class="grid grid-2">
        <div class="card form-card">
          <h3>استرداد منتج للمخزن</h3>
          <p class="hint">يستخدم عند مرتجع عميل أو تصحيح جرد</p>
          <form @submit.prevent="submitReturn">
            <div class="form-group">
              <label>المنتج *</label>
              <select v-model="returnForm.product_id" required>
                <option :value="null" disabled>اختر المنتج</option>
                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name_ar }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>المخزن *</label>
              <select v-model="returnForm.warehouse_id" required>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>الكمية *</label>
              <input v-model.number="returnForm.quantity" type="number" min="0.001" step="0.001" required />
            </div>
            <div class="form-group">
              <label>السبب</label>
              <select v-model="returnForm.reason">
                <option value="customer_return">مرتجع عميل</option>
                <option value="damaged">تالف</option>
                <option value="expired">منتهي</option>
                <option value="correction">تصحيح جرد</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div class="form-group">
              <label>ملاحظات</label>
              <textarea v-model="returnForm.notes" rows="2" placeholder="تفاصيل إضافية..." />
            </div>
            <button type="submit" class="btn btn-primary" :disabled="returning">
              {{ returning ? 'جاري الحفظ...' : 'تأكيد الاسترداد' }}
            </button>
          </form>
        </div>

        <div class="card table-wrap">
          <h3>سجل الاستردادات</h3>
          <table>
            <thead>
              <tr><th>التاريخ</th><th>المنتج</th><th>المخزن</th><th>الكمية</th><th>بواسطة</th><th>ملاحظات</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in returns" :key="r.id">
                <td>{{ formatDateTime(r.created_at) }}</td>
                <td>{{ r.product_name }}</td>
                <td>{{ r.warehouse_name || '—' }}</td>
                <td><span class="badge badge-success">+{{ r.quantity }}</span></td>
                <td>{{ r.user_name || '—' }}</td>
                <td>{{ r.notes || '—' }}</td>
              </tr>
              <tr v-if="!returns.length"><td colspan="6" class="empty">لا توجد استردادات</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-if="showForm" class="modal" @click.self="showForm = false">
      <div class="card modal-content">
        <h3>{{ form.id ? 'تعديل' : 'إضافة' }} منتج</h3>
        <form @submit.prevent="saveProduct">
          <div class="grid grid-2">
            <div class="form-group">
              <label>كود المنتج</label>
              <input v-model="form.sku" :placeholder="form.id ? '' : nextSkuPreview || 'سيتم توليده تلقائيًا عند الحفظ'" :readonly="!form.id" />
              <small v-if="!form.id" class="field-hint">الكود التالي: <strong class="mono">{{ nextSkuPreview || '...' }}</strong></small>
            </div>
            <div class="form-group"><label>الباركود</label><input v-model="form.barcode" /></div>
            <div class="form-group"><label>اسم المنتج</label><input v-model="form.name_ar" required /></div>
            <div class="form-group"><label>التصنيف</label>
              <select v-model="form.category_id">
                <option :value="null">بدون تصنيف</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name_ar }}</option>
              </select>
            </div>
            <div class="form-group"><label>سعر الشراء</label><input v-model.number="form.purchase_price" type="number" step="0.01" /></div>
            <div class="form-group"><label>سعر البيع</label><input v-model.number="form.sale_price" type="number" step="0.01" required /></div>
            <div class="form-group"><label>المخزن</label>
              <select v-model="form.primary_warehouse_id">
                <option :value="null" disabled>{{ warehouses.length ? 'اختر المخزن' : 'لا توجد مخازن متاحة' }}</option>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
              </select>
            </div>
            <div class="form-group"><label>الوحدة</label>
              <select v-model="form.unit" required>
                <option v-for="unit in availableUnits" :key="unit" :value="unit">{{ unitLabel(unit) }}</option>
              </select>
            </div>
          </div>
          <p v-if="formMsg" class="form-msg" :class="{ err: formErr }">{{ formMsg }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" :disabled="savingProduct" @click="showForm = false">إلغاء</button>
            <button type="submit" class="btn btn-primary" :disabled="savingProduct">
              {{ savingProduct ? 'جاري الحفظ...' : 'حفظ' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="showReturnModal" class="modal" @click.self="showReturnModal = false">
      <div class="card modal-content">
        <h3>استرداد: {{ returnForm.product_name }}</h3>
        <form @submit.prevent="submitReturn">
          <div class="form-group">
            <label>المخزن</label>
            <select v-model="returnForm.warehouse_id" required>
              <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>الكمية</label>
            <input v-model.number="returnForm.quantity" type="number" min="0.001" step="0.001" required />
          </div>
          <div class="form-group">
            <label>ملاحظات</label>
            <input v-model="returnForm.notes" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showReturnModal = false">إلغاء</button>
            <button type="submit" class="btn btn-primary">استرداد</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { products as api, warehouses as warehousesApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';

const { categories, units: productUnits, loadMeta, unitLabel, unitNames } = useProductMeta();

const tab = ref('list');
const importMsg = ref('');
const importErr = ref(false);
const products = ref([]);
const warehouses = ref([]);
const returns = ref([]);
const showForm = ref(false);
const showReturnModal = ref(false);
const nextSkuPreview = ref('');
const loading = ref(false);
const savingProduct = ref(false);
const returning = ref(false);
const formMsg = ref('');
const formErr = ref(false);

const form = ref({
  sku: '',
  barcode: '',
  name_ar: '',
  category_id: 1,
  purchase_price: 0,
  sale_price: 0,
  unit: 'count',
  primary_warehouse_id: null,
});

const skuPrefix = 'AGoouz-';

const buildNextSku = (rows = []) => {
  const maxNumber = rows.reduce((max, product) => {
    const match = String(product?.sku || '').match(/^AGoouz-(\d+)$/);
    if (!match) return max;
    return Math.max(max, Number(match[1] || 0));
  }, 0);
  return `${skuPrefix}${String(maxNumber + 1).padStart(3, '0')}`;
};

const refreshNextSkuPreview = async () => {
  const fallback = buildNextSku(products.value);
  nextSkuPreview.value = fallback;
  try {
    const res = await api.nextSku();
    const sku = res?.data?.sku;
    if (sku) nextSkuPreview.value = sku;
  } catch {
    nextSkuPreview.value = fallback;
  }
  if (showForm.value && !form.value.id) {
    form.value.sku = nextSkuPreview.value;
  }
};

const returnForm = ref({
  product_id: null,
  product_name: '',
  warehouse_id: null,
  quantity: 1,
  reason: 'customer_return',
  notes: '',
});

const reasonLabels = {
  customer_return: 'مرتجع عميل',
  damaged: 'تالف',
  expired: 'منتهي',
  correction: 'تصحيح جرد',
  other: 'أخرى',
};

const availableUnits = computed(() => unitNames(form.value.unit));

const formatDateTime = (d) => new Date(d).toLocaleString('en-GB');
const activeProductsCount = computed(() => products.value.filter((p) => p.is_active).length);
const lowStockCount = computed(() => products.value.filter((p) => Number(p.total_stock || 0) <= Number(p.min_stock || 0)).length);

const load = async () => {
  loading.value = true;
  try {
    await loadMeta();
    const [p, w] = await Promise.all([api.list(), warehousesApi()]);
    products.value = p.data;
    warehouses.value = w.data;
    nextSkuPreview.value = buildNextSku(products.value);
    if (!returnForm.value.warehouse_id && w.data?.length) returnForm.value.warehouse_id = w.data[0].id;
  } catch (e) {
    console.error('فشل تحميل المنتجات:', e);
  } finally {
    loading.value = false;
  }
};

const loadReturns = async () => {
  const res = await api.returns({ limit: 50 });
  returns.value = res?.data || [];
};

const openForm = (p = null) => {
  formMsg.value = '';
  formErr.value = false;
  form.value = p
    ? {
      ...p,
      primary_warehouse_id: p.primary_warehouse_id || warehouses.value[0]?.id || null,
      _original_primary_warehouse_id: p.primary_warehouse_id || warehouses.value[0]?.id || null,
    }
    : {
      sku: buildNextSku(products.value),
      barcode: '',
      name_ar: '',
      category_id: categories.value[0]?.id || null,
      purchase_price: 0,
      sale_price: 0,
      unit: unitNames()[0] || 'قطعة',
      primary_warehouse_id: warehouses.value[0]?.id || null,
      _original_primary_warehouse_id: null,
    };
  showForm.value = true;
  if (!p) {
    nextSkuPreview.value = form.value.sku;
    refreshNextSkuPreview();
  }
};

const editProduct = (p) => openForm(p);

const saveProduct = async () => {
  if (savingProduct.value) return;
  formMsg.value = '';
  formErr.value = false;

  const primaryWarehouseId = Number(form.value.primary_warehouse_id);
  if (!primaryWarehouseId) {
    formErr.value = true;
    formMsg.value = 'اختر مخزن المنتج أولًا. لو القائمة فاضية راجع إعدادات المخازن.';
    return;
  }

  savingProduct.value = true;
  try {
    const payload = {
      ...form.value,
      primary_warehouse_id: primaryWarehouseId,
    };
    delete payload._original_primary_warehouse_id;
    payload.category_id = payload.category_id || null;
    payload.barcode = String(payload.barcode || '').trim() || null;

    if (form.value.id) {
      await api.update(form.value.id, payload);
    } else {
      await api.create(payload);
    }

    showForm.value = false;
    importErr.value = false;
    importMsg.value = form.value.id ? 'تم حفظ تعديل المنتج بنجاح' : 'تم إضافة المنتج بنجاح';
    await load();
  } catch (e) {
    formErr.value = true;
    formMsg.value = e.message || 'فشل حفظ المنتج';
  } finally {
    savingProduct.value = false;
  }
};

const openReturn = (p) => {
  returnForm.value = {
    product_id: p.id,
    product_name: p.name_ar,
    warehouse_id: p.primary_warehouse_id || warehouses.value[0]?.id || null,
    quantity: 1,
    reason: 'customer_return',
    notes: '',
  };
  showReturnModal.value = true;
};

const submitReturn = async () => {
  returning.value = true;
  const reasonText = reasonLabels[returnForm.value.reason] || returnForm.value.reason;
  const notes = [reasonText, returnForm.value.notes].filter(Boolean).join(' - ');
  try {
    const res = await api.returnStock({
      product_id: returnForm.value.product_id,
      warehouse_id: returnForm.value.warehouse_id,
      quantity: returnForm.value.quantity,
      notes,
    });
    alert(`تم الاسترداد بنجاح. المخزون الجديد: ${res?.data?.new_quantity ?? '—'}`);
    showReturnModal.value = false;
    await load();
    if (tab.value === 'return') await loadReturns();
  } catch (e) {
    alert(e.message);
  } finally {
    returning.value = false;
  }
};

const downloadTemplate = async () => {
  try {
    const blob = await api.downloadTemplate();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bin-al-ajouz-products-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || 'فشل تحميل القالب');
  }
};

const exportProducts = async () => {
  try {
    loading.value = true;
    const blob = await api.exportProducts();
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bin-al-ajouz-products-export.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(e.message || 'فشل تصدير المنتجات');
  } finally {
    loading.value = false;
  }
};

const onImport = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importMsg.value = '';
  importErr.value = false;

  try {
    const res = await api.importExcel(file);
    const d = res.data;
    const failCount = d.failed?.length || 0;
    const parseCount = d.parseErrors?.length || 0;

    importMsg.value = `تم استيراد ${d.success} منتج (${d.created} جديد، ${d.updated} تحديث)` +
      (failCount ? ` — فشل ${failCount}` : '') +
      (parseCount ? ` — أخطاء قراءة ${parseCount}` : '');

    importErr.value = failCount > 0 || parseCount > 0;
    await load();
  } catch (err) {
    importErr.value = true;
    importMsg.value = err.message || 'فشل الاستيراد';
  }

  e.target.value = '';
};

const deleteAllProducts = async () => {
  const confirmed = window.confirm('تأكيد نهائي: سيتم حذف كل المنتجات الحالية. هل تريد المتابعة؟');
  if (!confirmed) return;

  try {
    const res = await api.deleteAllSafe();
    const count = res?.data?.deletedCount ?? products.value.length;
    importErr.value = false;
    importMsg.value = `تم حذف كل المنتجات بنجاح (${count} منتج)`;
    await load();
  } catch (e) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل حذف كل المنتجات';
  }
};

const deleteOneProduct = async (product) => {
  const confirmed = window.confirm(`تأكيد حذف المنتج: ${product?.name_ar || ''} ؟`);
  if (!confirmed) return;

  try {
    await api.delete(product.id);
    importErr.value = false;
    importMsg.value = `تم حذف المنتج: ${product?.name_ar || product?.sku || product?.id}`;
    await load();
  } catch (e) {
    importErr.value = true;
    importMsg.value = e.message || 'فشل حذف المنتج';
  }
};

onMounted(load);
</script>

<style lang="scss" scoped>
.products-page { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.import-btn { cursor: pointer; margin: 0; }

.import-msg {
  padding: 12px 16px; border-radius: var(--radius-sm);
  background: rgba(46,125,79,0.1); color: var(--success);
  border: 1px solid rgba(46,125,79,0.2); font-size: 0.9rem;
  &.err { background: rgba(180,35,24,0.08); color: var(--danger); border-color: rgba(180,35,24,0.2); }
}

/* Stats bar */
.products-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.stat-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  background: linear-gradient(160deg, var(--surface-1), var(--surface-2));
  transition: var(--transition);
  &:hover { box-shadow: var(--shadow-sm); }
}
.stat-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; font-weight: 600; }
.stat-value { font-size: 1.2rem; font-weight: 800; color: var(--text-strong); }

/* Tabs */
.inline-tabs {
  display: flex; gap: 6px;
  button {
    padding: 9px 18px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    transition: var(--transition);
    &:hover { border-color: var(--primary-soft); }
    &.active { background: linear-gradient(135deg, var(--primary), var(--primary-strong)); color: #fff; border-color: transparent; box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent); }
  }
}

/* Table */
.actions-cell { display: flex; gap: 6px; flex-wrap: nowrap; white-space: nowrap; }

.products-table {
  th { font-weight: 800; color: var(--text-muted); font-size: 0.8rem; }
  td { font-weight: 600; color: var(--text); }
  tbody tr:hover td { background: color-mix(in srgb, var(--primary) 5%, var(--bg-elevated)); }
}

.warehouse-cell { font-size: 0.84rem; font-weight: 600; white-space: nowrap; }

.product-name-cell { display: flex; align-items: center; gap: 8px; }
.product-title { display: flex; flex-direction: column; gap: 2px; }
.product-name { font-size: 0.95rem; font-weight: 800; }
.product-sku { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; direction: ltr; text-align: right; }

.product-unit-badge {
  font-size: 0.75rem; font-weight: 700;
  color: var(--info);
  background: color-mix(in srgb, var(--info) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--info) 25%, transparent);
  border-radius: 999px; padding: 2px 8px;
}

.field-hint {
  display: block;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.icon-btn {
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  background: var(--bg-elevated); cursor: pointer;
  font-size: 0.85rem; transition: var(--transition);
  &:hover { background: var(--bg); border-color: var(--primary-soft); }
  &.disabled,
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(1);
  }
  &.disabled:hover,
  &:disabled:hover {
    background: var(--bg-elevated);
    border-color: var(--border);
  }
  &.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent);
    &:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
  }
}

.danger-mini {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 16px; font-size: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger) 4%, transparent);
}

.form-card h3 { margin-bottom: 8px; }
.hint { color: var(--text-muted); font-size: 0.88rem; margin-bottom: 16px; }
.empty { text-align: center; padding: 32px; color: var(--text-muted); }

.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-content { width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
.modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
.form-msg {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(46,125,79,0.1);
  color: var(--success);
  border: 1px solid rgba(46,125,79,0.2);
  font-weight: 700;
  font-size: 0.86rem;
}
.form-msg.err {
  background: rgba(180,35,24,0.08);
  color: var(--danger);
  border-color: rgba(180,35,24,0.2);
}

@media (max-width: 900px) { .products-stats { grid-template-columns: 1fr; } }
</style>
