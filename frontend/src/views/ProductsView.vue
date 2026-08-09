<template>
  <div class="products-page">
    <div class="page-header">
      <div class="tabs inline-tabs">
        <button type="button" :class="{ active: tab === 'list' }" @click="tab = 'list'">
          📋 المنتجات
        </button>
        <button
          type="button"
          :class="{ active: tab === 'return' }"
          @click="
            tab = 'return';
            loadReturns();
          "
        >
          ↩️ استرداد منتجات
        </button>
      </div>
      <div v-if="tab === 'list'" class="header-actions">
        <button type="button" class="btn btn-outline" @click="downloadTemplate">
          <AppIcon name="download" :size="16" /> قالب Excel
        </button>
        <button type="button" class="btn btn-outline" @click="exportProducts">
          <AppIcon name="download" :size="16" /> تصدير المنتجات (Excel)
        </button>
        <label class="btn btn-outline import-btn">
          <AppIcon name="download" :size="16" style="transform: rotate(180deg)" /> استيراد وتعديل
          (Excel)
          <input type="file" accept=".xlsx,.xls" hidden @change="onImport" />
        </label>
        <button type="button" class="btn btn-add" :disabled="loading" @click="openForm()">
          <AppIcon name="add" :size="16" />
          {{ loading ? 'جاري التحميل...' : 'إضافة منتج' }}
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
        <BaseTable
          :items="products"
          :columns="productsColumns"
          :loading="loading"
          empty-message="لا توجد منتجات مسجلة"
        >
          <template #cell-name="{ item }">
            <div class="product-name-cell">
              <div class="product-title">
                <span class="product-name">{{ item.name_ar }}</span>
                <span class="product-sku">{{ item.sku }}</span>
              </div>
              <span class="product-unit-badge">{{ unitLabel(item.unit) }}</span>
            </div>
          </template>
          <template #cell-category="{ item }">
            {{ item.category_name || '—' }}
          </template>
          <template #cell-purchase_price="{ item }">
            {{ formatMoney(item.purchase_price) }}
          </template>
          <template #cell-sale_price="{ item }">
            {{ formatMoney(item.sale_price) }}
          </template>
          <template #cell-total_quantity="{ item }">
            <span class="warehouse-cell" style="font-weight: 800; color: var(--accent, #c77a2f)">
              📦 {{ item.total_quantity !== undefined ? item.total_quantity : item.quantity || 0 }}
            </span>
          </template>
          <template #cell-status="{ item }">
            {{ item.is_active ? 'نشط' : 'معطل' }}
          </template>
          <template #cell-actions="{ item }">
            <div class="actions-cell">
              <button type="button" class="icon-btn edit" title="تعديل" @click="editProduct(item)">
                <AppIcon name="edit" :size="16" />
              </button>
              <button
                type="button"
                class="icon-btn"
                :class="{ disabled: item.has_active_recipe }"
                :disabled="item.has_active_recipe"
                :title="
                  item.has_active_recipe
                    ? 'منتج وصفة نشطة: لا يتم استرداد مخزونه مباشرة'
                    : 'استرداد'
                "
                @click="openReturn(item)"
              >
                <AppIcon name="arrowLeft" :size="16" />
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="حذف المنتج"
                @click="deleteOneProduct(item)"
              >
                <AppIcon name="delete" :size="16" />
              </button>
            </div>
          </template>
        </BaseTable>
      </div>

      <div class="danger-mini card">
        <span>حذف كل المنتجات</span>
        <button type="button" class="btn btn-sm btn-delete" @click="deleteAllProducts">
          <AppIcon name="delete" :size="14" /> حذف الكل
        </button>
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
              <input
                v-model.number="returnForm.quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
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
              <AppIcon name="arrowLeft" :size="16" />
              {{ returning ? 'جاري الحفظ...' : 'تأكيد الاسترداد' }}
            </button>
          </form>
        </div>

        <div class="card table-wrap">
          <h3>سجل الاستردادات</h3>
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المنتج</th>
                <th>المخزن</th>
                <th>الكمية</th>
                <th>بواسطة</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in returns" :key="r.id">
                <td>{{ formatDateTime(r.created_at) }}</td>
                <td>{{ r.product_name }}</td>
                <td>{{ r.warehouse_name || '—' }}</td>
                <td>
                  <span class="badge badge-success">+{{ r.quantity }}</span>
                </td>
                <td>{{ r.user_name || '—' }}</td>
                <td>{{ r.notes || '—' }}</td>
              </tr>
              <tr v-if="!returns.length">
                <td colspan="6" class="empty">لا توجد استردادات</td>
              </tr>
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
              <input
                v-model="form.sku"
                :placeholder="form.id ? '' : nextSkuPreview || 'سيتم توليده تلقائيًا عند الحفظ'"
                :readonly="!form.id"
              />
              <small v-if="!form.id" class="field-hint"
                >الكود التالي: <strong class="mono">{{ nextSkuPreview || '...' }}</strong></small
              >
            </div>
            <div class="form-group"><label>الباركود</label><input v-model="form.barcode" /></div>
            <div class="form-group">
              <label>اسم المنتج</label><input v-model="form.name_ar" required />
            </div>
            <div class="form-group">
              <label>التصنيف</label>
              <select v-model="form.category_id">
                <option :value="null">بدون تصنيف</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name_ar }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>سعر الشراء</label
              ><input v-model.number="form.purchase_price" type="number" step="0.01" />
            </div>
            <div class="form-group">
              <label>سعر البيع</label
              ><input v-model.number="form.sale_price" type="number" step="0.01" required />
            </div>
            <div class="form-group">
              <label>الوحدة</label>
              <select v-model="form.unit" required>
                <option v-for="unit in availableUnits" :key="unit" :value="unit">
                  {{ unitLabel(unit) }}
                </option>
              </select>
            </div>

            <div class="form-group span-2" v-if="warehouses.length" style="margin-top: 6px">
              <div
                style="
                  background: var(--bg-elevated, rgba(255, 255, 255, 0.03));
                  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
                  padding: 14px;
                  border-radius: 12px;
                "
              >
                <label
                  style="
                    font-weight: 800;
                    font-size: 0.92rem;
                    color: var(--accent, #c77a2f);
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                  "
                >
                  📦 توزيع كميات المخزون بالمنشأة
                </label>
                <small
                  style="
                    display: block;
                    color: var(--text-muted, #888);
                    font-size: 0.78rem;
                    margin-bottom: 12px;
                  "
                >
                  حدد الرصيد المتاح في التخزين الخلفي (المخزن الرئيسي) والرصيد المعروض في صالة البيع
                  (الفرع):
                </small>
                <div class="grid grid-2" style="gap: 12px">
                  <div v-for="w in warehouses" :key="w.id" class="form-group" style="margin: 0">
                    <label
                      style="
                        font-size: 0.82rem;
                        font-weight: 700;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 4px;
                      "
                    >
                      <span>{{ w.name_ar }}</span>
                      <span
                        v-if="w.type === 'main' || w.code === 'MAIN'"
                        style="
                          font-size: 0.72rem;
                          color: #3b82f6;
                          font-weight: 800;
                          background: rgba(59, 130, 246, 0.1);
                          padding: 2px 6px;
                          border-radius: 4px;
                        "
                        >🏢 مخزن رئيسي</span
                      >
                      <span
                        v-else
                        style="
                          font-size: 0.72rem;
                          color: #10b981;
                          font-weight: 800;
                          background: rgba(16, 185, 129, 0.1);
                          padding: 2px 6px;
                          border-radius: 4px;
                        "
                        >🏪 محل البيع / الفرع</span
                      >
                    </label>
                    <input
                      v-model.number="form.warehouse_stocks[w.id]"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="أدخل الكمية..."
                      style="font-weight: 700; font-size: 1rem"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-if="formMsg" class="form-msg" :class="{ err: formErr }">{{ formMsg }}</p>
          <div class="modal-actions">
            <button
              type="button"
              class="btn btn-outline"
              :disabled="savingProduct"
              @click="showForm = false"
            >
              إلغاء
            </button>
            <button type="submit" class="btn btn-save" :disabled="savingProduct">
              <AppIcon name="save" :size="16" />
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
            <input
              v-model.number="returnForm.quantity"
              type="number"
              min="0.001"
              step="0.001"
              required
            />
          </div>
          <div class="form-group">
            <label>ملاحظات</label>
            <input v-model="returnForm.notes" />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showReturnModal = false">
              إلغاء
            </button>
            <button type="submit" class="btn btn-primary">
              <AppIcon name="arrowLeft" :size="16" /> استرداد
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { products as api, warehouses as warehousesApi } from '@/api';
import { formatMoney } from '@/utils/currency';
import { useProductMeta } from '@/composables/useProductMeta';
import BaseTable from '@/components/ui/BaseTable.vue';

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

const productsColumns = [
  { key: 'name', label: 'المنتج' },
  { key: 'category', label: 'القسم' },
  { key: 'purchase_price', label: 'الشراء' },
  { key: 'sale_price', label: 'البيع' },
  { key: 'total_quantity', label: 'الإجمالي' },
  { key: 'status', label: 'الحالة' },
  { key: 'actions', label: '', align: 'right' },
];

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
const lowStockCount = computed(
  () => products.value.filter((p) => Number(p.total_stock || 0) <= Number(p.min_stock || 0)).length,
);

const load = async () => {
  loading.value = true;
  try {
    await loadMeta();
    const [p, w] = await Promise.all([api.list(), warehousesApi()]);
    products.value = p.data;
    warehouses.value = w.data;
    nextSkuPreview.value = buildNextSku(products.value);
    if (!returnForm.value.warehouse_id && w.data?.length)
      returnForm.value.warehouse_id = w.data[0].id;
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

  const stocksObj = {};
  warehouses.value.forEach((w) => {
    stocksObj[w.id] = 0;
  });
  if (p && p.stock_details) {
    const list = Array.isArray(p.stock_details) ? p.stock_details : [];
    list.forEach((item) => {
      if (item.warehouse_id) {
        stocksObj[item.warehouse_id] = Number(item.quantity || 0);
      }
    });
  }

  form.value = p
    ? {
        ...p,
        primary_warehouse_id: p.primary_warehouse_id || warehouses.value[0]?.id || null,
        _original_primary_warehouse_id: p.primary_warehouse_id || warehouses.value[0]?.id || null,
        warehouse_stocks: stocksObj,
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
        warehouse_stocks: stocksObj,
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

  const primaryWarehouseId =
    Number(form.value.primary_warehouse_id) || warehouses.value[0]?.id || 1;

  savingProduct.value = true;
  try {
    const payload = {
      ...form.value,
      primary_warehouse_id: primaryWarehouseId,
      warehouse_stocks: form.value.warehouse_stocks,
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

    importMsg.value =
      `تم استيراد ${d.success} منتج (${d.created} جديد، ${d.updated} تحديث)` +
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
    const res = await api.deleteAll();
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

const onInventoryUpdated = (e) => {
  try {
    // If detail provided, we could optimize to only refresh affected product
    load();
  } catch (err) {
    console.warn('inventory-updated handler error', err);
  }
};

onMounted(() => {
  load();
  window.addEventListener('inventory-updated', onInventoryUpdated);
});

onBeforeUnmount(() => {
  window.removeEventListener('inventory-updated', onInventoryUpdated);
});
</script>

<style lang="scss" scoped>
.products-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.import-btn {
  cursor: pointer;
  margin: 0;
}

.import-msg {
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: rgba(46, 125, 79, 0.1);
  color: var(--success);
  border: 1px solid rgba(46, 125, 79, 0.2);
  font-size: 0.9rem;
  &.err {
    background: rgba(180, 35, 24, 0.08);
    color: var(--danger);
    border-color: rgba(180, 35, 24, 0.2);
  }
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
  &:hover {
    box-shadow: var(--shadow-sm);
  }
}
.stat-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}
.stat-value {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text-strong);
}

/* Tabs */
.inline-tabs {
  display: flex;
  gap: 6px;
  button {
    padding: 9px 18px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    transition: var(--transition);
    &:hover {
      border-color: var(--primary-soft);
    }
    &.active {
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
      color: #fff;
      border-color: transparent;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }
}

/* Table */
.actions-cell {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.products-table {
  th {
    font-weight: 800;
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  td {
    font-weight: 600;
    color: var(--text);
  }
  tbody tr:hover td {
    background: color-mix(in srgb, var(--primary) 5%, var(--bg-elevated));
  }
}

.warehouse-cell {
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
}

.product-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.product-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.product-name {
  font-size: 0.95rem;
  font-weight: 800;
}
.product-sku {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: monospace;
  direction: ltr;
  text-align: right;
}

.product-unit-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--info);
  background: color-mix(in srgb, var(--info) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--info) 25%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
}

.field-hint {
  display: block;
  margin-top: 6px;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.danger-mini {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  font-size: 0.9rem;
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--danger) 4%, transparent);
}

.form-card h3 {
  margin-bottom: 8px;
}
.hint {
  color: var(--text-muted);
  font-size: 0.88rem;
  margin-bottom: 16px;
}
.empty {
  text-align: center;
  padding: 32px;
  color: var(--text-muted);
}

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
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}
.form-msg {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: rgba(46, 125, 79, 0.1);
  color: var(--success);
  border: 1px solid rgba(46, 125, 79, 0.2);
  font-weight: 700;
  font-size: 0.86rem;
}
.form-msg.err {
  background: rgba(180, 35, 24, 0.08);
  color: var(--danger);
  border-color: rgba(180, 35, 24, 0.2);
}

@media (max-width: 900px) {
  .products-stats {
    grid-template-columns: 1fr;
  }
}
</style>
