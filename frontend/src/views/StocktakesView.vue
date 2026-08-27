<template>
  <div class="stocktakes-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-title">
        <h1>جرد المخازن والتسويات</h1>
        <p>
          إدارة ومطابقة كميات المخازن الفعلية بالكميات الدفترية وتسوية الفروقات مالياً ومخزنياً.
        </p>
      </div>
      <div class="header-actions">
        <button v-permission="'inventory.add'" class="btn btn-primary" @click="openCreateModal">
          <span class="btn-icon"></span> بدء جرد جديد
        </button>
      </div>
    </div>

    <!-- Alert Messages -->
    <div v-if="msg" :class="['msg', err ? 'err' : 'ok']">
      {{ msg }}
    </div>

    <!-- Stocktakes List Table -->
    <div class="card table-wrap">
      <div class="table-header-filters">
        <h3>سجل عمليات الجرد السابقة</h3>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>المستودع</th>
            <th>تاريخ البدء</th>
            <th>بواسطة</th>
            <th>عدد الأصناف</th>
            <th>قيمة العجز (-)</th>
            <th>قيمة الزيادة (+)</th>
            <th>الحالة</th>
            <th>تاريخ الاعتماد</th>
            <th class="actions-col">الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in stocktakesList"
            :key="s.id"
            :class="{ 'row-draft': s.status === 'draft' }"
          >
            <td class="wh-name">{{ s.warehouse_name }}</td>
            <td class="date-col">{{ fmtDateTime(s.created_at) }}</td>
            <td>{{ s.creator_name }}</td>
            <td class="num-col">{{ s.items_count }}</td>
            <td class="deficit-col" :class="{ 'has-val': s.total_deficit_value > 0 }">
              {{ s.status === 'completed' ? fmtCurrency(s.total_deficit_value) : '-' }}
            </td>
            <td class="surplus-col" :class="{ 'has-val': s.total_surplus_value > 0 }">
              {{ s.status === 'completed' ? fmtCurrency(s.total_surplus_value) : '-' }}
            </td>
            <td>
              <span
                :class="['badge', s.status === 'completed' ? 'badge-success' : 'badge-warning']"
              >
                {{ s.status === 'completed' ? ' معتمد ومسوى' : ' مسودة معلقة' }}
              </span>
            </td>
            <td class="date-col">{{ s.completed_at ? fmtDateTime(s.completed_at) : '-' }}</td>
            <td class="actions-col">
              <button
                v-if="s.status === 'draft'"
                class="btn btn-xs btn-primary"
                @click="goToDetails(s.id)"
              >
                استكمال الجرد
              </button>
              <button v-else class="btn btn-xs btn-outline" @click="goToDetails(s.id)">
                عرض التفاصيل
              </button>

              <button
                v-permission="'inventory.delete'"
                v-if="s.status === 'draft'"
                class="btn btn-xs btn-danger-link"
                title="حذف المسودة"
                @click="confirmDelete(s)"
              ></button>
            </td>
          </tr>
          <tr v-if="!stocktakesList.length && !loading">
            <td colspan="9" class="empty">لا توجد عمليات جرد سابقة مضافة حالياً.</td>
          </tr>
          <tr v-if="loading">
            <td colspan="9" class="empty">جاري تحميل البيانات...</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Stocktake Modal -->
    <div v-if="showCreateModal" class="modal">
      <div class="card modal-content">
        <div class="modal-header">
          <h3>بدء عملية جرد جديدة</h3>
          <button class="close-btn" @click="showCreateModal = false">×</button>
        </div>
        <form @submit.prevent="handleCreate">
          <div class="form-group">
            <label for="warehouse">اختر المخزن المراد جرده *</label>
            <select id="warehouse" v-model="form.warehouse_id" required class="form-control">
              <option value="">-- اختر المخزن --</option>
              <option v-for="w in warehousesList" :key="w.id" :value="w.id">
                {{ w.name_ar }} ({{ w.code }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="notes">ملاحظات الجرد</label>
            <textarea
              id="notes"
              v-model="form.notes"
              placeholder="مثال: جرد نهاية شهر يونيو 2026"
              class="form-control"
              rows="3"
            ></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showCreateModal = false">
              إلغاء
            </button>
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              {{ submitting ? 'جاري التحضير...' : 'بدء الجرد الفعلي' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="stocktakeToDelete" class="modal">
      <div class="card modal-content confirm-modal">
        <div class="modal-header">
          <h3 class="danger-title">تأكيد حذف مسودة الجرد</h3>
          <button class="close-btn" @click="stocktakeToDelete = null">×</button>
        </div>
        <div class="modal-body">
          <p>
            هل أنت متأكد من رغبتك في حذف مسودة الجرد الخاصة بمستودع
            <strong>{{ stocktakeToDelete.warehouse_name }}</strong
            >؟
          </p>
          <p class="warning-alert">
            تنبيه: سيتم حذف كافة الكميات المدخلة حالياً من قبل الموظفين ولا يمكن استرجاعها.
          </p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" @click="stocktakeToDelete = null">
            إلغاء
          </button>
          <button type="button" class="btn btn-danger" @click="handleDelete" :disabled="submitting">
            نعم، احذف المسودة
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { stocktakes as stocktakeApi, warehouses as warehousesApi } from '@/api';

const router = useRouter();

const stocktakesList = ref<any[]>([]);
const warehousesList = ref<any[]>([]);
const loading = ref(false);
const submitting = ref(false);
const showCreateModal = ref(false);
const stocktakeToDelete = ref<any>(null);

const msg = ref('');
const err = ref(false);

const form = ref({
  warehouse_id: '',
  notes: '',
});

const flashMsg = (text: any, isErr = false) => {
  msg.value = text;
  err.value = isErr;
  setTimeout(() => {
    msg.value = '';
  }, 5000);
};

const loadData = async () => {
  loading.value = true;
  try {
    const [stRes, whRes] = await Promise.all([stocktakeApi.list(), warehousesApi()]);
    stocktakesList.value = stRes.data || [];
    warehousesList.value = (whRes.data || []).filter((w: any) => w.is_active);
  } catch (e: any) {
    flashMsg(e.message || 'فشل في تحميل بيانات الجرد والمستودعات', true);
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  form.value.warehouse_id = '';
  form.value.notes = '';
  showCreateModal.value = true;
};

const handleCreate = async () => {
  submitting.value = true;
  try {
    const res = await stocktakeApi.create({
      warehouse_id: form.value.warehouse_id,
      notes: form.value.notes,
    });
    showCreateModal.value = false;
    flashMsg('تم بدء مسودة جرد جديدة بنجاح.');
    // التحويل لصفحة الجرد الفعلي فوراً
    router.push(`/stocktakes/${res.data.id}`);
  } catch (e: any) {
    flashMsg(e.message || 'فشل في بدء عملية الجرد', true);
  } finally {
    submitting.value = false;
  }
};

const confirmDelete = (stocktake: any) => {
  stocktakeToDelete.value = stocktake;
};

const handleDelete = async () => {
  if (!stocktakeToDelete.value) return;
  submitting.value = true;
  try {
    await stocktakeApi.delete(stocktakeToDelete.value.id);
    flashMsg('تم حذف مسودة الجرد بنجاح.');
    stocktakeToDelete.value = null;
    await loadData();
  } catch (e: any) {
    flashMsg(e.message || 'فشل في حذف مسودة الجرد', true);
  } finally {
    submitting.value = false;
  }
};

const goToDetails = (id: any) => {
  router.push(`/stocktakes/${id}`);
};

const fmtDateTime = (isoStr: any) => {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtCurrency = (val: any) => {
  if (val === undefined || val === null) return '-';
  return Number(val).toLocaleString('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
  });
};

onMounted(loadData);
</script>

<style scoped lang="scss">
.stocktakes-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;

  .header-title {
    h1 {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text-strong);
      margin-bottom: 4px;
    }
    p {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
  }
}

.table-header-filters {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-strong);
  }
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: right;

  th {
    background: var(--bg-card-header, var(--bg));
    padding: 12px 18px;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    color: var(--text);
    transition: background 150ms;
  }

  tr:hover td {
    background: rgba(var(--primary-rgb, 80, 70, 229), 0.02);
  }

  .wh-name {
    font-weight: 700;
    color: var(--text-strong);
  }

  .date-col {
    color: var(--text-muted);
    font-size: 0.8rem;
    direction: ltr;
    text-align: right;
  }

  .num-col {
    font-weight: 600;
  }

  .deficit-col {
    color: var(--text-muted);
    font-weight: 600;

    &.has-val {
      color: var(--danger, #b42318);
    }
  }

  .surplus-col {
    color: var(--text-muted);
    font-weight: 600;

    &.has-val {
      color: var(--success, #2e7d4f);
    }
  }

  .actions-col {
    white-space: nowrap;
    text-align: left;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
}

.row-draft td {
  background-color: rgba(247, 144, 9, 0.02);
}

/* Modals */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  max-width: 500px;
  width: 100%;
  padding: 24px;
  border-radius: var(--radius-lg);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  animation: modalScale 200ms cubic-bezier(0.16, 1, 0.3, 1);
  background: var(--bg-card);

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;

    h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-strong);
    }

    .danger-title {
      color: var(--danger);
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: var(--text-muted);
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
      &:hover {
        color: var(--text-strong);
      }
    }
  }

  .form-group {
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-weight: 700;
      font-size: 0.88rem;
      color: var(--text-strong);
    }
  }

  .modal-body {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 12px;

    .warning-alert {
      background-color: rgba(247, 144, 9, 0.08);
      border-right: 4px solid var(--warning);
      padding: 12px;
      border-radius: var(--radius-xs);
      font-size: 0.85rem;
      color: color-mix(in srgb, var(--warning) 80%, black);
      font-weight: 600;
    }
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }
}

/* Helper Buttons UI */
.btn-xs {
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  border-radius: var(--radius-xs);
}

.btn-danger-link {
  background: transparent;
  border: 1px solid transparent;
  color: var(--danger);
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: all 150ms;
  font-size: 1rem;

  &:hover {
    background: rgba(180, 35, 24, 0.08);
    border-color: rgba(180, 35, 24, 0.15);
  }
}

.msg {
  font-weight: 700;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  animation: slideDown 250ms ease;

  &.ok {
    color: var(--success);
    background: color-mix(in srgb, var(--success) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
  }

  &.err {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  }
}

@keyframes modalScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideDown {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
