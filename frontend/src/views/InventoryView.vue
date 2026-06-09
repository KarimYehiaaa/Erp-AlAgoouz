<template>
  <div class="inventory-page">

    <!-- Header -->
    <div class="page-header">
      <div class="tabs inline-tabs">
        <button :class="{ active: tab === 'stock' }" @click="tab = 'stock'">📦 المخزون</button>
        <button :class="{ active: tab === 'return' }" @click="tab = 'return'">📥 استرداد بـ Excel</button>
        <button :class="{ active: tab === 'movements' }" @click="tab = 'movements'">📋 حركة المخزون</button>
      </div>
      <div class="header-actions">
        <select v-model="warehouseId" @change="load" class="warehouse-select">
          <option value="">كل المخازن</option>
          <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
        </select>
        <button v-if="tab === 'stock'" class="btn btn-outline" @click="showTransfer = true">🔄 تحويل مخزون</button>
      </div>
    </div>

    <p v-if="msg" :class="['msg', err ? 'err' : 'ok']">{{ msg }}</p>

    <!-- ===== STOCK TAB ===== -->
    <template v-if="tab === 'stock'">
      <div class="card table-wrap">
        <table class="inv-table">
          <thead>
            <tr>
              <th>المنتج</th><th>SKU</th><th>المخزن</th>
              <th>الكمية الحالية</th><th>الحد الأدنى</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in items" :key="`${i.product_id}-${i.warehouse_id}`" :class="{ 'row-low': i.is_low }">
              <td class="product-name">
                {{ i.name_ar }}
                <span v-if="i.has_active_recipe" class="recipe-chip">وصفة</span>
              </td>
              <td class="mono">{{ i.sku }}</td>
              <td>{{ i.warehouse_name }}</td>
              <td class="qty" :class="{ 'qty-low': i.is_low }">{{ fmtQty(i.quantity) }}</td>
              <td>{{ i.min_stock }}</td>
              <td>
                <span :class="['badge', i.is_low ? 'badge-danger' : 'badge-success']">
                  {{ i.is_low ? '⚠️ منخفض' : '✅ طبيعي' }}
                </span>
              </td>
              <td>
                <button
                  class="icon-btn"
                  :class="{ disabled: i.has_active_recipe }"
                  :disabled="i.has_active_recipe"
                  :title="i.has_active_recipe ? 'منتج وصفة نشطة: يتم تحديثه من مكونات الوصفة فقط' : 'تعديل'"
                  @click="openEdit(i)"
                >✎</button>
              </td>
            </tr>
            <tr v-if="!items.length"><td colspan="7" class="empty">لا توجد بيانات مخزون</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ===== EXCEL RETURN TAB ===== -->
    <template v-if="tab === 'return'">
      <div class="excel-return-page">

        <!-- Info Card -->
        <div class="card info-card">
          <div class="info-icon">📥</div>
          <div class="info-body">
            <h3>استرداد المخزون بالجملة عبر Excel</h3>
            <p>حمّل القالب — فيه كل المنتجات جاهزة بالكود والاسم والمخزون الحالي. اكتب الكمية المُستردة فقط لكل منتج، ثم ارفع الملف.</p>
          </div>
        </div>

        <!-- Steps -->
        <div class="steps-row">
          <div class="step-card">
            <div class="step-num">1</div>
            <div class="step-body">
              <strong>حمّل القالب</strong>
              <span>فيه كل المنتجات جاهزة — كود + اسم + مخزون حالي</span>
            </div>
          </div>
          <div class="step-arrow">←</div>
          <div class="step-card">
            <div class="step-num">2</div>
            <div class="step-body">
              <strong>اكتب الكمية</strong>
              <span>في عمود "كمية_الاسترداد" فقط — اترك الباقي فارغاً</span>
            </div>
          </div>
          <div class="step-arrow">←</div>
          <div class="step-card">
            <div class="step-num">3</div>
            <div class="step-body">
              <strong>افحص ثم ارفع</strong>
              <span>افحص الملف أولاً للتأكد، ثم ارفعه للتنفيذ</span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="card actions-card">
          <div class="action-group">
            <div class="action-label">
              <span class="action-num">1</span>
              <strong>تحميل القالب</strong>
              <small>اختر المخزن لتصفية المنتجات (اختياري)</small>
            </div>
            <div class="action-controls">
              <select v-model="returnWarehouseId" class="warehouse-select">
                <option value="">كل المخازن</option>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
              </select>
              <button class="btn btn-primary" :disabled="downloadingTemplate" @click="downloadTemplate">
                {{ downloadingTemplate ? '⏳ جاري التحميل...' : '📥 تحميل القالب' }}
              </button>
            </div>
          </div>

          <div class="action-divider"></div>

          <div class="action-group">
            <div class="action-label">
              <span class="action-num">2</span>
              <strong>فحص الملف قبل الرفع</strong>
              <small>تحقق من صحة البيانات بدون تنفيذ</small>
            </div>
            <div class="action-controls">
              <label class="btn btn-outline file-btn">
                🔍 فحص الملف
                <input type="file" accept=".xlsx,.xls" hidden @change="onValidate" />
              </label>
            </div>
          </div>

          <div class="action-divider"></div>

          <div class="action-group">
            <div class="action-label">
              <span class="action-num">3</span>
              <strong>رفع وتنفيذ الاسترداد</strong>
              <small>سيتم إضافة الكميات للمخزون فوراً</small>
            </div>
            <div class="action-controls">
              <label class="btn btn-success file-btn">
                📤 رفع وتنفيذ
                <input type="file" accept=".xlsx,.xls" hidden @change="onImport" />
              </label>
            </div>
          </div>
        </div>

        <!-- Result -->
        <div v-if="excelResult" class="card result-card" :class="excelResult.ok === false ? 'result-err' : 'result-ok'">
          <div class="result-header">
            <span class="result-icon">{{ excelResult.ok === false ? '❌' : excelResult.success !== undefined ? '✅' : '🔍' }}</span>
            <div>
              <strong>{{ excelResult.title }}</strong>
              <p>{{ excelResult.summary }}</p>
            </div>
          </div>

          <!-- معاينة الفحص -->
          <div v-if="excelResult.preview?.length" class="result-preview">
            <h4>معاينة (أول 5 منتجات صالحة):</h4>
            <table class="inv-table">
              <thead><tr><th>الكود</th><th>المنتج</th><th>المخزن</th><th>الكمية</th></tr></thead>
              <tbody>
                <tr v-for="(p, idx) in excelResult.preview" :key="`${p.sku}-${idx}`">
                  <td class="mono">{{ p.sku }}</td>
                  <td>{{ p.product_name }}</td>
                  <td>{{ p.warehouse_name || '—' }}</td>
                  <td class="qty">+{{ p.quantity }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- نتائج الاستيراد -->
          <div v-if="excelResult.details?.length" class="result-preview">
            <h4>المنتجات التي تم استردادها ({{ excelResult.details.length }}):</h4>
            <table class="inv-table">
              <thead><tr><th>الكود</th><th>المنتج</th><th>المخزن</th><th>الكمية المُستردة</th><th>المخزون الجديد</th></tr></thead>
              <tbody>
                <tr v-for="(d, idx) in excelResult.details" :key="`${d.sku}-${idx}`">
                  <td class="mono">{{ d.sku }}</td>
                  <td>{{ d.product_name }}</td>
                  <td>{{ d.warehouse_name || '—' }}</td>
                  <td class="qty success-text">+{{ d.quantity }}</td>
                  <td class="qty">{{ d.new_stock }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- الأخطاء -->
          <div v-if="excelResult.errors?.length || excelResult.failed?.length" class="result-errors">
            <h4>⚠️ مشاكل ({{ (excelResult.errors || excelResult.failed || []).length }}):</h4>
            <ul>
              <li v-for="(e, i) in (excelResult.errors || excelResult.failed || [])" :key="i">
                {{ typeof e === 'string' ? e : `سطر ${e.row} — ${e.sku}: ${e.message}` }}
              </li>
            </ul>
          </div>
        </div>

      </div>
    </template>

    <!-- ===== MOVEMENTS TAB ===== -->
    <template v-if="tab === 'movements'">
      <div class="card table-wrap">
        <h3 style="margin-bottom: 14px;">📋 سجل حركة المخزون</h3>
        <table class="inv-table">
          <thead>
            <tr><th>المنتج</th><th>النوع</th><th>الكمية</th><th>من</th><th>إلى</th><th>بواسطة</th><th>التاريخ</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in movements" :key="m.id">
              <td>{{ m.product_name }}</td>
              <td><span :class="['move-badge', m.movement_type]">{{ movementLabel(m.movement_type) }}</span></td>
              <td class="qty">{{ fmtQty(m.quantity) }}</td>
              <td>{{ m.from_warehouse || '—' }}</td>
              <td>{{ m.to_warehouse || '—' }}</td>
              <td>{{ m.user_name || '—' }}</td>
              <td>{{ new Date(m.created_at).toLocaleString('en-GB') }}</td>
            </tr>
            <tr v-if="!movements.length"><td colspan="7" class="empty">لا توجد حركات</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Edit Modal -->
    <div v-if="showEdit" class="modal" @click.self="showEdit = false">
      <div class="card modal-content">
        <h3>✏️ تعديل المخزون</h3>
        <form @submit.prevent="saveEdit">
          <div class="form-group"><label>المنتج</label><input :value="editForm.name_ar" disabled /></div>
          <div class="form-group"><label>المخزن</label><input :value="editForm.warehouse_name" disabled /></div>
          <div class="form-group"><label>الكمية الحالية</label><input v-model.number="editForm.quantity" type="number" min="0" step="0.001" required /></div>
          <div class="form-group"><label>الحد الأدنى</label><input v-model.number="editForm.min_stock" type="number" min="0" step="0.001" required /></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showEdit = false">إلغاء</button>
            <button type="submit" class="btn btn-primary" :disabled="savingEdit">{{ savingEdit ? 'جاري الحفظ...' : 'حفظ' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Transfer Modal -->
    <div v-if="showTransfer" class="modal" @click.self="showTransfer = false">
      <div class="card modal-content">
        <h3>🔄 تحويل بين المخازن</h3>
        <form @submit.prevent="doTransfer">
          <div class="form-group">
            <label>المنتج</label>
            <select v-model.number="transfer.product_id" required>
              <option :value="null" disabled>اختر المنتج</option>
              <option v-for="i in items" :key="i.product_id" :value="i.product_id">{{ i.name_ar }} ({{ fmtQty(i.quantity) }})</option>
            </select>
          </div>
          <div class="form-group">
            <label>من مخزن</label>
            <select v-model.number="transfer.from_warehouse_id">
              <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>إلى مخزن</label>
            <select v-model.number="transfer.to_warehouse_id">
              <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
            </select>
          </div>
          <div class="form-group"><label>الكمية</label><input v-model.number="transfer.quantity" type="number" min="0.001" step="0.001" required /></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showTransfer = false">إلغاء</button>
            <button type="submit" class="btn btn-primary">تحويل</button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { inventory as inventoryApi } from '@/api';

const tab = ref('stock');
const items = ref([]);
const movements = ref([]);
const warehouses = ref([]);
const warehouseId = ref('');
const returnWarehouseId = ref('');
const showTransfer = ref(false);
const showEdit = ref(false);
const savingEdit = ref(false);
const downloadingTemplate = ref(false);
const msg = ref('');
const err = ref(false);
const excelResult = ref(null);

const editForm = ref({ id: null, product_id: null, warehouse_id: null, name_ar: '', warehouse_name: '', quantity: 0, min_stock: 0 });
const transfer = ref({ product_id: null, from_warehouse_id: null, to_warehouse_id: null, quantity: 1 });

const fmtQty = (v) => { const n = Number(v || 0); return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3); };
const movementLabel = (t) => ({
  sale: 'بيع',
  purchase: 'شراء',
  purchase_reversal: 'عكس شراء',
  transfer: 'تحويل',
  adjustment: 'تعديل',
  return: 'استرداد',
  consumption: 'استهلاك',
  production: 'إنتاج',
  opening_production: 'رصيد افتتاحي إنتاجي',
}[t] || t || '—');

const setMsg = (text, isErr = false) => { msg.value = text; err.value = isErr; };

const load = async () => {
  const params = warehouseId.value ? { warehouse_id: warehouseId.value } : {};
  try {
    const [inv, mov, wh] = await Promise.all([
      inventoryApi.list(params),
      inventoryApi.movements({ limit: 50 }),
      inventoryApi.warehouses(),
    ]);
    items.value = inv.data || [];
    movements.value = mov.data || [];
    warehouses.value = wh.data || [];
    if (!transfer.value.from_warehouse_id && wh.data?.length) {
      transfer.value.from_warehouse_id = wh.data[0].id;
      transfer.value.to_warehouse_id = wh.data[1]?.id || wh.data[0].id;
    }
    setMsg('', false);
  } catch (e) {
    items.value = [];
    movements.value = [];
    setMsg(e.message || 'فشل تحميل بيانات المخزون.', true);
  }
};

const openEdit = (row) => {
  editForm.value = { id: row.id, product_id: row.product_id, warehouse_id: row.warehouse_id, name_ar: row.name_ar, warehouse_name: row.warehouse_name, quantity: Number(row.quantity || 0), min_stock: Number(row.min_stock || 0) };
  showEdit.value = true;
};

const saveEdit = async () => {
  const quantity = Number(editForm.value.quantity);
  const min_stock = Number(editForm.value.min_stock);
  if (isNaN(quantity) || quantity < 0) { setMsg('أدخل كمية صحيحة.', true); return; }
  savingEdit.value = true;
  try {
    await inventoryApi.adjust({
      product_id: editForm.value.product_id,
      warehouse_id: editForm.value.warehouse_id,
      quantity,
      min_stock,
      notes: 'تعديل يدوي من شاشة المخزون',
    });
    showEdit.value = false;
    setMsg(`تم حفظ تعديل ${editForm.value.name_ar} بنجاح.`);
    await load();
  } catch (e) { setMsg(e.message || 'فشل حفظ التعديل.', true); }
  finally { savingEdit.value = false; }
};

const doTransfer = async () => {
  try {
    await inventoryApi.transfer(transfer.value);
    showTransfer.value = false;
    setMsg('تم التحويل بنجاح.');
    await load();
  } catch (e) { setMsg(e.message || 'فشل تحويل المخزون.', true); }
};

// ── Excel Return ──
const downloadTemplate = async () => {
  downloadingTemplate.value = true;
  try {
    const blob = await inventoryApi.downloadReturnTemplate(returnWarehouseId.value || null);
    const url = URL.createObjectURL(new Blob([blob]));
    const a = document.createElement('a'); a.href = url; a.download = 'inventory-return-template.xlsx'; a.click(); URL.revokeObjectURL(url);
  } catch (e) { setMsg(e.message || 'فشل تحميل القالب.', true); }
  finally { downloadingTemplate.value = false; }
};

const onValidate = async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  excelResult.value = null;
  try {
    const res = await inventoryApi.validateReturnExcel(file);
    const d = res?.data || res;
    const success = Number(d.success || 0);
    excelResult.value = {
      ok: success > 0,
      title: success > 0 ? `✅ تم استرداد ${success} منتج بنجاح` : `❌ لم يتم تطبيق أي صف صالح`,
      summary: `${d.skipped || 0} صف تم تخطيه · ${d.failed?.length || 0} فشل`,
      details: d.details || [],
      failed: d.failed || [],
    };
    if (success > 0) { setMsg(`تم استرداد ${success} منتج للمخزون.`); await load(); }
  } catch (e) { excelResult.value = { ok: false, title: 'فشل فحص الملف', summary: e.message, errors: [e.message] }; }
  e.target.value = '';
};

const onImport = async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  excelResult.value = null;
  try {
    const res = await inventoryApi.importReturnExcel(file, returnWarehouseId.value || null);
    const d = res?.data || res;
    excelResult.value = {
      ok: true,
      title: `✅ تم استرداد ${d.success} منتج بنجاح`,
      summary: `${d.skipped || 0} صف تم تخطيه · ${d.failed?.length || 0} فشل`,
      details: d.details || [],
      failed: d.failed || [],
    };
    if (d.success > 0) { setMsg(`تم استرداد ${d.success} منتج للمخزون.`); await load(); }
  } catch (e) { excelResult.value = { ok: false, title: 'فشل الاستيراد', summary: e.message, errors: [e.message] }; }
  e.target.value = '';
};

onMounted(load);
</script>

<style lang="scss" scoped>
.inventory-page { display: flex; flex-direction: column; gap: 16px; }

.page-header {
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
  .header-actions { display: flex; gap: 8px; align-items: center; }
}

.inline-tabs {
  display: flex; gap: 6px;
  button {
    padding: 9px 16px; border: 2px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-elevated); cursor: pointer; font-weight: 700; font-size: 0.88rem;
    transition: var(--transition);
    &:hover { border-color: var(--primary-soft); }
    &.active { background: linear-gradient(135deg, var(--primary), var(--primary-strong)); color: #fff; border-color: transparent; box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent); }
  }
}

.warehouse-select { padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); font-size: 0.9rem; }

/* Table */
.table-wrap { overflow-x: auto; }
.inv-table {
  width: 100%; border-collapse: collapse; font-size: 0.88rem;
  th { background: var(--bg); padding: 10px 12px; text-align: right; font-weight: 700; color: var(--text-muted); font-size: 0.8rem; border-bottom: 2px solid var(--border); white-space: nowrap; }
  td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  tr:hover td { background: color-mix(in srgb, var(--primary) 3%, var(--bg-elevated)); }
  .row-low td { background: color-mix(in srgb, var(--danger) 4%, var(--bg-elevated)); }
}
.product-name { font-weight: 700; }
.recipe-chip {
  display: inline-flex;
  align-items: center;
  margin-inline-start: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--info) 25%, transparent);
  background: color-mix(in srgb, var(--info) 10%, transparent);
  color: var(--info);
  font-size: 0.72rem;
  font-weight: 800;
}
.mono { font-family: monospace; font-size: 0.82rem; color: var(--text-muted); }
.qty { font-weight: 700; }
.qty-low { color: var(--danger); }
.success-text { color: #2e7d4f; }
.empty { text-align: center; padding: 32px; color: var(--text-muted); }

/* Movement badges */
.move-badge { padding: 3px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;
  &.sale { background: rgba(46,125,79,0.12); color: #2e7d4f; }
  &.purchase { background: rgba(99,102,241,0.12); color: #4f46e5; }
  &.purchase_reversal { background: rgba(180,35,24,0.12); color: #b42318; }
  &.transfer { background: rgba(8,145,178,0.12); color: #0891b2; }
  &.adjustment { background: rgba(180,83,9,0.12); color: #b45309; }
  &.return { background: rgba(46,125,79,0.12); color: #2e7d4f; }
  &.consumption { background: rgba(180,35,24,0.12); color: #b42318; }
  &.production { background: rgba(46,125,79,0.12); color: #2e7d4f; }
  &.opening_production { background: rgba(180,83,9,0.12); color: #b45309; }
}

/* Excel Return Page */
.excel-return-page { display: flex; flex-direction: column; gap: 16px; }

.info-card {
  display: flex; align-items: flex-start; gap: 16px;
  .info-icon { font-size: 2.5rem; flex-shrink: 0; }
  h3 { margin: 0 0 6px; color: var(--primary-dark); }
  p { margin: 0; color: var(--text-muted); font-size: 0.9rem; line-height: 1.6; }
}

.steps-row {
  display: flex; align-items: center; gap: 0;
  border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;
  .step-card {
    flex: 1; display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px;
    background: var(--bg-card);
    .step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem; flex-shrink: 0; }
    strong { display: block; font-size: 0.9rem; color: var(--primary-dark); margin-bottom: 3px; }
    span { font-size: 0.8rem; color: var(--text-muted); }
  }
  .step-arrow { padding: 0 8px; color: var(--text-muted); font-size: 1.2rem; flex-shrink: 0; }
}

.actions-card { display: flex; flex-direction: column; gap: 0; padding: 0; overflow: hidden; }
.action-group {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 18px 20px; flex-wrap: wrap;
  .action-label { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    .action-num { width: 26px; height: 26px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.82rem; flex-shrink: 0; }
    strong { font-size: 0.95rem; color: var(--text-strong); }
    small { display: block; font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
  }
  .action-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
}
.action-divider { height: 1px; background: var(--border); margin: 0; }

.file-btn { cursor: pointer; position: relative; overflow: hidden; input { position: absolute; inset: 0; opacity: 0; cursor: pointer; } }
.btn-success { background: linear-gradient(135deg, #2e7d4f, #1a5c38); color: #fff; border: none; padding: 9px 18px; border-radius: var(--radius-sm); cursor: pointer; font-weight: 700; font-size: 0.9rem; transition: var(--transition); &:hover { opacity: 0.9; } }

/* Result Card */
.result-card {
  border-radius: var(--radius-md); overflow: hidden;
  &.result-ok { border: 1px solid rgba(46,125,79,0.3); background: rgba(46,125,79,0.04); }
  &.result-err { border: 1px solid rgba(180,35,24,0.3); background: rgba(180,35,24,0.04); }
  .result-header { display: flex; align-items: flex-start; gap: 14px; padding: 18px 20px;
    .result-icon { font-size: 1.8rem; flex-shrink: 0; }
    strong { display: block; font-size: 1rem; color: var(--text-strong); margin-bottom: 4px; }
    p { margin: 0; font-size: 0.88rem; color: var(--text-muted); }
  }
  .result-preview { padding: 0 20px 16px; h4 { margin: 0 0 10px; font-size: 0.9rem; color: var(--text-strong); } }
  .result-errors { padding: 0 20px 16px;
    h4 { margin: 0 0 8px; font-size: 0.9rem; color: var(--danger); }
    ul { margin: 0; padding-right: 20px; li { font-size: 0.85rem; color: var(--danger); margin: 4px 0; } }
  }
}

/* Modals */
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-content { max-width: 440px; width: 90%; }
.modal-actions { margin-top: 14px; display: flex; gap: 10px; justify-content: flex-end; }

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: var(--transition);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;

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
}

.msg { font-weight: 700; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 0.9rem; }
.msg.ok  { color: var(--success); background: color-mix(in srgb, var(--success) 10%, transparent); border: 1px solid color-mix(in srgb, var(--success) 20%, transparent); }
.msg.err { color: var(--danger);  background: color-mix(in srgb, var(--danger)  8%, transparent); border: 1px solid color-mix(in srgb, var(--danger)  20%, transparent); }

@media (max-width: 768px) {
  .steps-row { flex-direction: column; .step-arrow { transform: rotate(90deg); } }
  .action-group { flex-direction: column; align-items: flex-start; }
}
</style>
