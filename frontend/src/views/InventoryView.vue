<template>
  <div class="inventory-page">
    <!-- Header -->
    <div class="page-header">
      <div class="tabs inline-tabs">
        <button :class="{ active: tab === 'stock' }" @click="tab = 'stock'">📦 المخزون</button>
        <button :class="{ active: tab === 'return' }" @click="tab = 'return'">
          📥 استرداد بـ Excel
        </button>
        <button :class="{ active: tab === 'movements' }" @click="tab = 'movements'">
          🔄 حركة المخزون
        </button>
      </div>
      <div class="header-actions">
        <select v-model="warehouseId" @change="load" class="warehouse-select">
          <option value="">كل المخازن</option>
          <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
        </select>
        <button
          v-permission="'inventory.edit'"
          v-if="tab === 'stock'"
          class="btn btn-outline"
          @click="openTransferModal"
        >
          🚚 تحويل جديد
        </button>
      </div>
    </div>

    <p v-if="msg" :class="['msg', err ? 'err' : 'ok']">{{ msg }}</p>

    <!-- ===== STOCK TAB ===== -->
    <StockTab
      :items="items"
      :loading="loading"
      :stock-columns="stockColumns"
      :total-inventory-value="totalInventoryValue"
      :main-warehouse-value="mainWarehouseValue"
      :branch-warehouse-value="branchWarehouseValue"
      :get-item-stock-value="getItemStockValue"
      :get-main-qty="getMainQty"
      :get-branch-qty="getBranchQty"
      :is-highlighted="isHighlighted"
      :fmt-qty="fmtQty"
      :format-money="formatMoney"
      @open-transfer="openTransferProduct"
      @open-edit="openEdit"
      @open-wastage="openWastage"
    />

    <!-- ===== EXCEL RETURN TAB ===== -->
    <ReturnTab
      :warehouses="warehouses"
      v-model:return-warehouse-id="returnWarehouseId"
      :downloading-template="downloadingTemplate"
      :excel-result="excelResult"
      @download="downloadTemplate"
      @validate="onValidate"
      @import="onImport"
    />

    <!-- ===== MOVEMENTS TAB ===== -->
    <MovementsTab
      :items="filteredMovements"
      :columns="movementsColumns"
      v-model:movement-type-filter="movementTypeFilter"
      :movement-label="movementLabel"
      :fmt-qty="fmtQty"
      @print-voucher="printTransferVoucherFromMovement"
    />

    <!-- Edit Modal -->
    <div v-if="showEdit" class="modal" @click.self="showEdit = false">
      <div class="card modal-content" style="max-width: 550px">
        <h3>تعديل الكميات وتوزيع المخزون</h3>
        <form @submit.prevent="saveEdit">
          <div class="form-group">
            <label>اسم المنتج</label>
            <input :value="editForm.name_ar" disabled style="font-weight: 700" />
          </div>

          <div class="form-group">
            <label>الحد الأدنى الإجمالي للمخزون (للتنبيه)</label>
            <input
              v-model.number="editForm.min_stock"
              type="number"
              min="0"
              step="0.001"
              required
              placeholder="مثال: 5"
            />
          </div>

          <div class="form-group" v-if="warehouses.length" style="margin-top: 10px">
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
                توزيع رصيد المخزون بالمنشأة
              </label>
              <small
                style="
                  display: block;
                  color: var(--text-muted, #888);
                  font-size: 0.78rem;
                  margin-bottom: 12px;
                "
              >
                حدد الكميات المتاحة في المخزن الرئيسي وفي مخزن المحل / الفرع:
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
                      v-if="
                        w.type === 'main' ||
                        w.code === 'MAIN' ||
                        (w.name_ar && w.name_ar.includes('رئيسي'))
                      "
                      style="
                        font-size: 0.72rem;
                        color: #3b82f6;
                        font-weight: 800;
                        background: rgba(59, 130, 246, 0.1);
                        padding: 2px 6px;
                        border-radius: 4px;
                      "
                    >
                      مخزن رئيسي</span
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
                    >
                      مخزن المحل / الفرع</span
                    >
                  </label>
                  <input
                    v-model.number="editForm.warehouse_stocks[w.id]"
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

          <div class="modal-actions" style="margin-top: 16px">
            <button type="button" class="btn btn-outline" @click="showEdit = false">إلغاء</button>
            <button type="submit" class="btn btn-primary" :disabled="savingEdit">
              {{ savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Transfer Modal -->
    <div v-if="showTransfer" class="modal" @click.self="showTransfer = false">
      <div class="card modal-content" style="max-width: 650px">
        <h3>تحويل بين المخازن وإذن نقل مخزني</h3>

        <!-- Mode Switcher -->
        <div class="tabs inline-tabs" style="margin-bottom: 14px">
          <button
            type="button"
            :class="{ active: transferMode === 'single' }"
            @click="transferMode = 'single'"
          >
            تحويل صنف فردي
          </button>
          <button
            type="button"
            :class="{ active: transferMode === 'batch' }"
            @click="transferMode = 'batch'"
          >
            إذن تحويل متعدد البنود
          </button>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap">
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="
              font-size: 0.78rem;
              font-weight: 800;
              color: #3b82f6;
              border-color: rgba(59, 130, 246, 0.3);
            "
            @click="setTransferDirection('main', 'store')"
          >
            من الرئيسي للفرع
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="
              font-size: 0.78rem;
              font-weight: 800;
              color: #10b981;
              border-color: rgba(16, 185, 129, 0.3);
            "
            @click="setTransferDirection('store', 'main')"
          >
            من الفرع للرئيسي
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            style="font-size: 0.78rem; font-weight: 700"
            @click="swapTransferDirection"
          >
            عكس الاتجاه
          </button>
        </div>

        <form @submit.prevent="doTransfer">
          <div class="grid grid-2" style="gap: 12px">
            <div class="form-group">
              <label>من مخزن (المصدر) *</label>
              <select v-model.number="transfer.from_warehouse_id" required>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
              </select>
            </div>

            <div class="form-group">
              <label>إلى مخزن (الوجهة) *</label>
              <select v-model.number="transfer.to_warehouse_id" required>
                <option
                  v-for="w in warehouses"
                  :key="w.id"
                  :value="w.id"
                  :disabled="w.id === transfer.from_warehouse_id"
                >
                  {{ w.name_ar }}
                </option>
              </select>
            </div>
          </div>

          <!-- SINGLE ITEM MODE -->
          <template v-if="transferMode === 'single'">
            <div class="form-group">
              <label>المنتج (المصدر) *</label>
              <select
                v-model.number="transfer.product_id"
                required
                :disabled="loadingTransferProducts"
              >
                <option :value="null" disabled>
                  {{
                    loadingTransferProducts ? 'جاري تحميل المنتجات المتاحة...' : 'اختر منتج المصدر'
                  }}
                </option>
                <option v-for="p in transferProducts" :key="p.product_id" :value="p.product_id">
                  {{ p.name_ar }} (المتاح: {{ fmtQty(p.quantity) }})
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>المنتج (الوجهة) *</label>
              <select v-model.number="transfer.to_product_id" required>
                <option :value="null" disabled>اختر منتج الوجهة</option>
                <option v-for="p in allProducts" :key="p.id" :value="p.id">
                  {{ p.name_ar }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>الكمية المراد تحويلها *</label>
              <input
                v-model.number="transfer.quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
              <div
                v-if="selectedTransferProduct"
                style="
                  margin-top: 8px;
                  display: flex;
                  flex-direction: column;
                  gap: 6px;
                  font-size: 0.82rem;
                  font-weight: 700;
                "
              >
                <small style="color: #2e7d4f; display: block">
                  ℹ الكمية المتوفرة حالياً في مخزن المصدر:
                  {{ fmtQty(selectedTransferProduct.quantity) }}
                </small>
                <small style="color: #64748b; display: block">
                  ℹ الكمية المتوفرة حالياً في مخزن الوجهة:
                  {{
                    fmtQty(selectedTransferDestProduct ? selectedTransferDestProduct.quantity : 0)
                  }}
                </small>
              </div>
            </div>
          </template>

          <!-- BATCH ITEMS MODE -->
          <template v-else>
            <div style="margin-top: 10px; margin-bottom: 12px">
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 8px;
                "
              >
                <label style="font-weight: 800; font-size: 0.9rem; color: var(--accent, #c77a2f)">
                  بنود إذن التحويل المخزني ({{ batchItems.length }})
                </label>
                <button type="button" class="btn btn-sm btn-outline" @click="addBatchRow">
                  + إضافة بند للإذن
                </button>
              </div>

              <div
                v-for="(bItem, idx) in batchItems"
                :key="idx"
                style="
                  display: flex;
                  gap: 8px;
                  align-items: center;
                  background: var(--bg-elevated, rgba(255, 255, 255, 0.03));
                  padding: 8px;
                  border-radius: 8px;
                  margin-bottom: 8px;
                "
              >
                <div style="flex: 2">
                  <select v-model.number="bItem.product_id" required style="font-size: 0.84rem">
                    <option :value="null" disabled>اختر المنتج</option>
                    <option v-for="p in transferProducts" :key="p.product_id" :value="p.product_id">
                      {{ p.name_ar }} (المتاح: {{ fmtQty(p.quantity) }})
                    </option>
                  </select>
                </div>
                <div style="flex: 1">
                  <input
                    v-model.number="bItem.quantity"
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="الكمية..."
                    required
                    style="font-size: 0.84rem"
                  />
                </div>
                <button
                  type="button"
                  class="icon-btn btn-danger"
                  title="حذف البند"
                  :disabled="batchItems.length <= 1"
                  @click="removeBatchRow(idx)"
                ></button>
              </div>
            </div>
          </template>

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showTransfer = false">
              إلغاء
            </button>
            <button type="submit" class="btn btn-primary" :disabled="loadingTransferProducts">
              <AppIcon name="save" :size="16" /> تنفيذ وإخراج إذن التحويل
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Printable Transfer Voucher Document Modal -->
    <div v-if="showVoucherModal" class="modal" @click.self="showVoucherModal = false">
      <div class="card modal-content transfer-voucher-doc" style="max-width: 650px; padding: 24px">
        <div
          class="voucher-header"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--border, #ccc);
            padding-bottom: 12px;
            margin-bottom: 16px;
          "
        >
          <div>
            <h2
              style="margin: 0; font-size: 1.3rem; font-weight: 800; color: var(--accent, #c77a2f)"
            >
              بن العجوز ERP
            </h2>
            <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--text-muted)">
              إذن نقل وتحويل مخزني رسمي
            </p>
          </div>
          <div style="text-align: left">
            <span
              class="badge badge-info"
              style="font-size: 0.9rem; font-weight: 800; padding: 4px 10px"
              >{{ currentVoucher?.transfer_number || 'TRF-VOUCHER' }}</span
            >
            <small style="display: block; margin-top: 4px; color: var(--text-muted)">{{
              formatDateTime(currentVoucher?.created_at || Date.now())
            }}</small>
          </div>
        </div>

        <div
          class="voucher-meta"
          style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            background: rgba(0, 0, 0, 0.03);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
          "
        >
          <div>
            <strong style="display: block; font-size: 0.8rem; color: var(--text-muted)"
              >من مخزن (المصدر):</strong
            >
            <span style="color: var(--info); font-weight: 800; font-size: 1rem">{{
              currentVoucher?.from_warehouse_name
            }}</span>
          </div>
          <div>
            <strong style="display: block; font-size: 0.8rem; color: var(--text-muted)"
              >إلى مخزن (الوجهة):</strong
            >
            <span style="color: var(--success); font-weight: 800; font-size: 1rem">{{
              currentVoucher?.to_warehouse_name
            }}</span>
          </div>
        </div>

        <table
          class="inv-table"
          style="width: 100%; border-collapse: collapse; margin-bottom: 20px"
        >
          <thead>
            <tr style="background: var(--bg-elevated, #f4f4f4); text-align: right">
              <th style="padding: 8px">#</th>
              <th style="padding: 8px">المنتج</th>
              <th style="padding: 8px">الكود</th>
              <th style="padding: 8px">الكمية المحولة</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(it, idx) in (currentVoucher?.items as any[]) || []"
              :key="idx"
              style="border-bottom: 1px solid var(--border)"
            >
              <td style="padding: 8px">{{ idx + 1 }}</td>
              <td style="padding: 8px; font-weight: 700">{{ it.product_name }}</td>
              <td style="padding: 8px" class="mono">{{ it.sku || '—' }}</td>
              <td style="padding: 8px; font-weight: 800; color: var(--success)">
                {{ fmtQty(it.quantity) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div
          class="voucher-signatures"
          style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px dashed var(--border);
            text-align: center;
          "
        >
          <div>
            <small style="display: block; color: var(--text-muted); margin-bottom: 24px"
              >توقيع المُسلّم (أمين مخزن المصدر)</small
            >
            <span>........................................</span>
          </div>
          <div>
            <small style="display: block; color: var(--text-muted); margin-bottom: 24px"
              >توقيع المستلم (مسؤول مخزن الوجهة)</small
            >
            <span>........................................</span>
          </div>
        </div>

        <div
          class="modal-actions no-print"
          style="margin-top: 24px; display: flex; justify-content: space-between"
        >
          <button type="button" class="btn btn-outline" @click="showVoucherModal = false">
            إغلاق
          </button>
          <button type="button" class="btn btn-primary" @click="printVoucher">
            طباعة إذن التحويل
          </button>
        </div>
      </div>
    </div>

    <!-- Wastage Modal -->
    <div v-if="showWastage" class="modal" @click.self="showWastage = false">
      <div class="card modal-content border-danger">
        <h3 class="text-danger">تسجيل إعدام / هالك</h3>
        <p style="margin-bottom: 15px; font-size: 0.9em; color: var(--text-muted)">
          سيتم إنقاص هذه الكمية من المخزون وتحميل تكلفتها على المصروفات (قسم الهالك).
        </p>
        <form @submit.prevent="saveWastage">
          <div class="form-group">
            <label>المنتج</label><input :value="wastageForm.name_ar" disabled />
          </div>
          <div class="form-group">
            <label>الكمية المتاحة</label><input :value="fmtQty(wastageForm.current_qty)" disabled />
          </div>
          <div class="form-group">
            <label>كمية الهالك</label
            ><input
              v-model.number="wastageForm.quantity"
              type="number"
              min="0.001"
              :max="wastageForm.current_qty"
              step="0.001"
              required
            />
          </div>
          <div class="form-group">
            <label>السبب / ملاحظات</label
            ><input
              v-model="wastageForm.notes"
              required
              placeholder="مثال: انتهاء صلاحية، انسكاب..."
            />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showWastage = false">
              إلغاء
            </button>
            <button type="submit" class="btn btn-danger" :disabled="savingWastage">
              {{ savingWastage ? 'جاري التسجيل...' : 'تسجيل هالك' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { inventory as inventoryApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';
import StockTab from '@/components/inventory/StockTab.vue';
import ReturnTab from '@/components/inventory/ReturnTab.vue';
import MovementsTab from '@/components/inventory/MovementsTab.vue';
import { formatMoney } from '@/utils/currency';
import { formatDateTime } from '@/utils/formatters';
import { useInventoryStock } from '@/composables/useInventoryStock';
import { useInventoryTransfers } from '@/composables/useInventoryTransfers';
import { useInventoryExcel } from '@/composables/useInventoryExcel';

const tab = ref('stock');
const warehouseId = ref('');
const msg = ref('');
const err = ref(false);
const warehouses = ref<any[]>([]);

const setMsg = (text: string, isErr = false) => {
  msg.value = text;
  err.value = isErr;
};

const loadWarehouses = async () => {
  const wh = await inventoryApi.warehouses();
  warehouses.value = wh.data || [];
};

const load = async () => {
  try {
    await Promise.all([
      stock.loadStock(warehouseId.value),
      transfers.loadMovements(),
      loadWarehouses(),
    ]);
    transfers.setDefaultWarehouses();
    setMsg('', false);
  } catch (e: any) {
    setMsg(e.message || 'فشل تحميل بيانات المخزون.', true);
  }
};

const stock = useInventoryStock({ warehouses, warehouseId, setMsg, reload: () => load() });
const transfers = useInventoryTransfers({ warehouses, setMsg, reload: () => load() });
const excel = useInventoryExcel({ setMsg, reload: () => load() });

const fmtQty = (v: any) => {
  const n = Number(v || 0);
  return n % 1 === 0 ? n.toLocaleString('en-GB') : n.toFixed(3);
};
const movementLabel = (t: any) =>
  (
    ({
      sale: 'بيع',
      purchase: 'شراء',
      purchase_reversal: 'عكس شراء',
      transfer: 'تحويل',
      adjustment: 'تعديل',
      wastage: 'هالك',
      return: 'استرداد',
      consumption: 'استهلاك',
      production: 'إنتاج',
      opening_production: 'رصيد افتتاحي إنتاجي',
    }) as Record<string, string>
  )[t] ||
  t ||
  '—';

// ── المخزون (جدول + تقييم + تعديل/هالك) ──
const {
  items,
  loading,
  stockColumns,
  getItemStockValue,
  totalInventoryValue,
  mainWarehouseValue,
  branchWarehouseValue,
  getMainQty,
  getBranchQty,
  isHighlighted,
  editForm,
  showEdit,
  savingEdit,
  openEdit,
  saveEdit,
  wastageForm,
  showWastage,
  savingWastage,
  openWastage,
  saveWastage,
} = stock;

// ── التحويلات وحركة المخزون ──
const {
  filteredMovements,
  movementsColumns,
  movementTypeFilter,
  showTransfer,
  transfer,
  transferMode,
  batchItems,
  showVoucherModal,
  currentVoucher,
  transferProducts,
  allProducts,
  loadingTransferProducts,
  selectedTransferProduct,
  selectedTransferDestProduct,
  openTransferModal,
  openTransferProduct,
  setTransferDirection,
  swapTransferDirection,
  doTransfer,
  addBatchRow,
  removeBatchRow,
  printVoucher,
  printTransferVoucherFromMovement,
} = transfers;

// ── الاسترداد عبر Excel ──
const {
  returnWarehouseId,
  downloadingTemplate,
  excelResult,
  downloadTemplate,
  onValidate,
  onImport,
} = excel;

onMounted(load);
</script>

<style lang="scss" scoped>
.inventory-page {
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
  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
}

.inline-tabs {
  display: flex;
  gap: 6px;
  button {
    padding: 9px 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.88rem;
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

.warehouse-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 0.9rem;
}

/* Voucher table (inside the view's modal) */
.inv-table {
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
    white-space: nowrap;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tr:last-child td {
    border-bottom: 0;
  }
}
.mono {
  font-family: monospace;
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* Modals (owned by the view) */
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
  max-width: 440px;
  width: 90%;
}
.modal-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

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

  &:hover {
    background: var(--bg);
    border-color: var(--primary-soft);
  }

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

.msg {
  font-weight: 700;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
}
.msg.ok {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
}
.msg.err {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
}
</style>
