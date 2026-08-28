<template>
  <div class="inventory-page">
    <!-- Header -->
    <div class="page-header">
      <div class="hub-tabs">
        <button class="hub-tab" :class="{ active: tab === 'stock' }" @click="switchTab('stock')">
          <AppIcon name="inventory" :size="16" /> المخزون
        </button>
        <button
          class="hub-tab"
          :class="{ active: tab === 'stocktakes' }"
          @click="switchTab('stocktakes')"
        >
          <AppIcon name="stocktake" :size="16" /> جرد المخازن والتسويات
        </button>
        <button
          class="hub-tab"
          :class="{ active: tab === 'movements' }"
          @click="switchTab('movements')"
        >
          <AppIcon name="activity" :size="16" /> حركة المخزون
        </button>
        <button class="hub-tab" :class="{ active: tab === 'return' }" @click="switchTab('return')">
          <AppIcon name="upload" :size="16" /> استرداد بـ Excel
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
          <AppIcon name="truck" :size="16" /> تحويل جديد
        </button>
      </div>
    </div>

    <p v-if="msg" :class="['msg', err ? 'err' : 'ok']">{{ msg }}</p>

    <!-- ===== STOCK TAB ===== -->
    <Transition name="hub-fade" mode="out-in">
      <!-- ===== STOCK TAB ===== -->
      <StockTab
        v-if="tab === 'stock'"
        key="stock"
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

      <!-- ===== STOCKTAKES TAB ===== -->
      <div v-else-if="tab === 'stocktakes'" key="stocktakes" class="tab-view-container">
        <StocktakesView />
      </div>

      <!-- ===== MOVEMENTS TAB ===== -->
      <MovementsTab
        v-else-if="tab === 'movements'"
        key="movements"
        :items="filteredMovements"
        :columns="movementsColumns"
        v-model:movement-type-filter="movementTypeFilter"
        :movement-label="movementLabel"
        :fmt-qty="fmtQty"
        @print-voucher="printTransferVoucherFromMovement"
      />

      <!-- ===== EXCEL RETURN TAB ===== -->
      <ReturnTab
        v-else-if="tab === 'return'"
        key="return"
        :warehouses="warehouses"
        v-model:return-warehouse-id="returnWarehouseId"
        :downloading-template="downloadingTemplate"
        :excel-result="excelResult"
        @download="downloadTemplate"
        @validate="onValidate"
        @import="onImport"
      />
    </Transition>

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

          <div class="form-group mt-2" v-if="warehouses.length">
            <div class="p-3 bg-elevated border border-border rounded-xl">
              <label class="flex items-center gap-2 mb-1 font-extrabold text-sm text-accent">
                توزيع رصيد المخزون بالمنشأة
              </label>
              <small class="block mb-3 text-xs text-muted">
                حدد الكميات المتاحة في المخزن الرئيسي وفي مخزن المحل / الفرع:
              </small>
              <div class="grid grid-2 gap-3">
                <div v-for="w in warehouses" :key="w.id" class="form-group m-0">
                  <label class="flex items-center justify-between mb-1 text-sm font-bold">
                    <span>{{ w.name_ar }}</span>
                    <span
                      v-if="
                        w.type === 'main' ||
                        w.code === 'MAIN' ||
                        (w.name_ar && w.name_ar.includes('رئيسي'))
                      "
                      class="badge badge-info text-xs px-1.5 py-0.5"
                    >
                      مخزن رئيسي</span
                    >
                    <span v-else class="badge badge-success text-xs px-1.5 py-0.5">
                      مخزن المحل / الفرع</span
                    >
                  </label>
                  <input
                    v-model.number="editForm.warehouse_stocks[w.id]"
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="أدخل الكمية..."
                    class="font-bold text-base"
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

        <div class="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            class="btn btn-sm btn-outline text-info font-extrabold text-xs"
            style="border-color: color-mix(in srgb, var(--info) 30%, transparent)"
            @click="setTransferDirection('main', 'store')"
          >
            من الرئيسي للفرع
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline text-success font-extrabold text-xs"
            style="border-color: color-mix(in srgb, var(--success) 30%, transparent)"
            @click="setTransferDirection('store', 'main')"
          >
            من الفرع للرئيسي
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline font-bold text-xs"
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
                class="mt-2 flex flex-col gap-1.5 text-sm font-bold"
              >
                <small class="text-success block">
                  ℹ الكمية المتوفرة حالياً في مخزن المصدر:
                  {{ fmtQty(selectedTransferProduct.quantity) }}
                </small>
                <small class="text-muted block">
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
                <label class="font-extrabold text-sm text-accent">
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
          class="voucher-header pb-3 mb-4 flex justify-between items-center"
          style="border-bottom: 2px solid var(--border)"
        >
          <div>
            <h2 class="m-0 text-xl font-extrabold text-accent">بن العجوز ERP</h2>
            <p class="m-0 mt-1 text-sm text-muted">إذن نقل وتحويل مخزني رسمي</p>
          </div>
          <div class="text-left">
            <span class="badge badge-info text-sm font-extrabold px-2.5 py-1">
              {{ currentVoucher?.transfer_number || 'TRF-VOUCHER' }}
            </span>
            <small class="block mt-1 text-muted">{{
              formatDateTime(currentVoucher?.created_at || Date.now())
            }}</small>
          </div>
        </div>

        <div
          class="voucher-meta grid grid-cols-2 gap-3 p-3 rounded-lg mb-4"
          style="background: color-mix(in srgb, var(--text) 3%, transparent)"
        >
          <div>
            <strong class="block text-sm text-muted">من مخزن (المصدر):</strong>
            <span class="text-info font-extrabold text-base">{{
              currentVoucher?.from_warehouse_name
            }}</span>
          </div>
          <div>
            <strong class="block text-sm text-muted">إلى مخزن (الوجهة):</strong>
            <span class="text-success font-extrabold text-base">{{
              currentVoucher?.to_warehouse_name
            }}</span>
          </div>
        </div>

        <table class="inv-table w-full mb-5" style="border-collapse: collapse">
          <thead>
            <tr class="text-right" style="background: var(--bg-elevated)">
              <th class="p-2">#</th>
              <th class="p-2">المنتج</th>
              <th class="p-2">الكود</th>
              <th class="p-2">الكمية المحولة</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(it, idx) in (currentVoucher?.items as any[]) || []"
              :key="idx"
              style="border-bottom: 1px solid var(--border)"
            >
              <td class="p-2">{{ idx + 1 }}</td>
              <td class="p-2 font-bold">{{ it.product_name }}</td>
              <td class="p-2 mono">{{ it.sku || '—' }}</td>
              <td class="p-2 font-extrabold text-success">
                {{ fmtQty(it.quantity) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div
          class="voucher-signatures grid grid-cols-2 gap-5 mt-6 pt-4 text-center"
          style="border-top: 1px dashed var(--border)"
        >
          <div>
            <small class="block text-muted mb-6">توقيع المُسلّم (أمين مخزن المصدر)</small>
            <span>........................................</span>
          </div>
          <div>
            <small class="block text-muted mb-6">توقيع المستلم (مسؤول مخزن الوجهة)</small>
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
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { inventory as inventoryApi } from '@/api';
import AppIcon from '@/components/AppIcon.vue';
import StockTab from '@/components/inventory/StockTab.vue';
import ReturnTab from '@/components/inventory/ReturnTab.vue';
import MovementsTab from '@/components/inventory/MovementsTab.vue';
import StocktakesView from '@/views/StocktakesView.vue';
import { formatMoney } from '@/utils/currency';
import { formatDateTime } from '@/utils/formatters';
import { useInventoryStock } from '@/composables/useInventoryStock';
import { useInventoryTransfers } from '@/composables/useInventoryTransfers';
import { useInventoryExcel } from '@/composables/useInventoryExcel';

const route = useRoute();
const router = useRouter();

const tab = ref((route.query.tab as string) || 'stock');

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && newTab !== tab.value) {
      tab.value = String(newTab);
    }
  },
);

const switchTab = (newTab: string) => {
  tab.value = newTab;
  router.replace({ query: { ...route.query, tab: newTab } }).catch(() => {});
};
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
