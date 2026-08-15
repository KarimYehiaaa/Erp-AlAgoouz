<template>
  <div class="stocktake-form-page">
    <!-- Header -->
    <div class="page-header" v-if="stocktake">
      <div class="header-title">
        <div class="back-link-wrap">
          <router-link to="/stocktakes" class="back-link">← العودة لقائمة الجرد</router-link>
        </div>
        <h1>📋 جرد مخزن: {{ stocktake.warehouse_name }}</h1>
        <div class="metadata">
          <span class="meta-item"><strong>بواسطة:</strong> {{ stocktake.creator_name }}</span>
          <span class="meta-item"
            ><strong>تاريخ البدء:</strong> {{ fmtDateTime(stocktake.created_at) }}</span
          >
          <span v-if="stocktake.status === 'completed'" class="meta-item"
            ><strong>تاريخ الاعتماد:</strong> {{ fmtDateTime(stocktake.completed_at) }}</span
          >
          <span
            :class="['badge', stocktake.status === 'completed' ? 'badge-success' : 'badge-warning']"
          >
            {{ stocktake.status === 'completed' ? '✅ معتمد ومسوى' : '📝 مسودة معلقة' }}
          </span>
        </div>
      </div>
      <div class="header-actions" v-if="stocktake.status === 'draft'">
        <button class="btn btn-outline" @click="handleSave(false)" :disabled="saving">
          {{ saving ? 'جاري الحفظ...' : '💾 حفظ كمسودة' }}
        </button>
        <button class="btn btn-primary" @click="openConfirmModal" :disabled="saving">
          ⚡ اعتماد الجرد وتسوية الفروق
        </button>
      </div>
    </div>

    <!-- Live Status Message -->
    <div v-if="msg" :class="['msg', err ? 'err' : 'ok']">
      {{ msg }}
    </div>

    <!-- Summary Cards -->
    <div class="summary-cards" v-if="stocktake">
      <div class="summary-card">
        <div class="card-icon">📦</div>
        <div class="card-body">
          <span class="card-label">إجمالي الأصناف</span>
          <span class="card-value">{{ stocktake.items.length }}</span>
        </div>
      </div>

      <div class="summary-card" :class="{ 'warning-border': countedCount > 0 }">
        <div class="card-icon">✏️</div>
        <div class="card-body">
          <span class="card-label">أصناف تم جردها</span>
          <span class="card-value">{{ countedCount }} / {{ stocktake.items.length }}</span>
        </div>
      </div>

      <div class="summary-card" :class="{ 'danger-border': liveDeficitValue > 0 }">
        <div class="card-icon">🔻</div>
        <div class="card-body">
          <span class="card-label">إجمالي قيمة العجز</span>
          <span class="card-value danger-text">{{ fmtCurrency(liveDeficitValue) }}</span>
        </div>
      </div>

      <div class="summary-card" :class="{ 'success-border': liveSurplusValue > 0 }">
        <div class="card-icon">🔺</div>
        <div class="card-body">
          <span class="card-label">إجمالي قيمة الزيادة</span>
          <span class="card-value success-text">{{ fmtCurrency(liveSurplusValue) }}</span>
        </div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="card filter-bar" v-if="stocktake">
      <div class="search-input-wrap">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          v-model="searchQuery"
          placeholder="ابحث باسم المنتج أو الـ SKU..."
          class="search-input"
        />
      </div>
      <div class="filter-options">
        <label>تصفية البنود:</label>
        <select v-model="filterStatus" class="filter-select">
          <option value="all">كل الأصناف</option>
          <option value="counted">أصناف تم جردها</option>
          <option value="uncounted">أصناف لم تجرد بعد</option>
          <option value="variance">أصناف بها فروقات (+/-)</option>
          <option value="no-variance">أصناف مطابقة</option>
        </select>
      </div>
    </div>

    <!-- Items Table -->
    <div class="card table-wrap" v-if="stocktake">
      <table class="items-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>اسم المنتج</th>
            <th>الوحدة</th>
            <th class="num-col">الدفترية (السيستم)</th>
            <th class="num-col input-col">الكمية الفعلية</th>
            <th class="num-col">الفرق</th>
            <th class="num-col">تكلفة الوحدة (WAC)</th>
            <th class="num-col">قيمة الفرق</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filteredItems"
            :key="item.id"
            :class="{
              'row-variance': item.actual_quantity !== null && Math.abs(item.difference) > 0.0001,
            }"
          >
            <td class="mono font-sm">{{ item.sku }}</td>
            <td class="product-name">{{ item.product_name }}</td>
            <td class="unit-cell">{{ item.unit }}</td>
            <td class="num-col font-bold">{{ fmtQty(item.system_quantity) }}</td>
            <td class="num-col input-col">
              <input
                type="number"
                step="0.001"
                v-model="item.actual_quantity"
                @input="calculateDiff(item)"
                placeholder="أدخل الكمية..."
                class="qty-input"
                :disabled="stocktake.status === 'completed' || saving"
              />
            </td>
            <td class="num-col font-bold" :class="getDiffClass(item.difference)">
              {{ fmtDiff(item.difference) }}
            </td>
            <td class="num-col">{{ fmtCost(item.unit_cost) }}</td>
            <td class="num-col font-bold" :class="getDiffClass(item.difference)">
              {{
                fmtCurrency(item.actual_quantity === null ? null : item.difference * item.unit_cost)
              }}
            </td>
          </tr>
          <tr v-if="!filteredItems.length">
            <td colspan="8" class="empty">لا توجد منتجات تطابق شروط البحث والتصفية.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Reconciliation Confirm Modal -->
    <div v-if="showConfirmModal" class="modal">
      <div class="card modal-content confirm-reconcile-modal">
        <div class="modal-header">
          <h3 class="warning-title">⚡ اعتماد الجرد النهائي والتسوية</h3>
          <button class="close-btn" @click="showConfirmModal = false">×</button>
        </div>
        <div class="modal-body">
          <p>أنت على وشك اعتماد عملية جرد المخزن بشكل نهائي. هذا الإجراء سيقوم بما يلي:</p>
          <ul class="modal-list">
            <li>
              تحديث كميات المنتجات في مخزن <strong>{{ stocktake.warehouse_name }}</strong> لتطابق
              الكمية الفعلية المجرودة.
            </li>
            <li>تسجيل حركات تسوية مخزنية (Adjustment) تلقائياً لكل منتج به فرق.</li>
            <li>إغلاق هذا الجرد وحفظ قيمه المالية تاريخياً.</li>
          </ul>

          <div class="reconcile-summary">
            <h4>الملخص المالي للتسوية:</h4>
            <div class="reconcile-row">
              <span>إجمالي قيمة العجز:</span>
              <span class="danger-text font-bold">{{ fmtCurrency(liveDeficitValue) }}</span>
            </div>
            <div class="reconcile-row">
              <span>إجمالي قيمة الزيادة:</span>
              <span class="success-text font-bold">{{ fmtCurrency(liveSurplusValue) }}</span>
            </div>
            <div class="reconcile-row final-row">
              <span>صافي التسوية المالية:</span>
              <span
                :class="[
                  liveSurplusValue - liveDeficitValue >= 0 ? 'success-text' : 'danger-text',
                  'font-bold',
                ]"
              >
                {{ fmtCurrency(liveSurplusValue - liveDeficitValue) }}
              </span>
            </div>
          </div>

          <p class="caution-alert">
            ⚠️ تحذير: بعد الاعتماد، لن تتمكن من تعديل كميات هذا الجرد مرة أخرى نهائياً.
          </p>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" @click="showConfirmModal = false">
            إلغاء
          </button>
          <button type="button" class="btn btn-primary" @click="handleComplete" :disabled="saving">
            {{ saving ? 'جاري التسوية والاعتماد...' : 'نعم، اعتمد وسوّي الفروقات' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { stocktakes as stocktakeApi } from '@/api';

const route = useRoute();
const router = useRouter();

const stocktakeId = route.params.id;
const stocktake = ref<any>(null);
const loading = ref(false);
const saving = ref(false);
const showConfirmModal = ref(false);

const searchQuery = ref('');
const filterStatus = ref('all');

const msg = ref('');
const err = ref(false);

const flashMsg = (text: any, isErr = false) => {
  msg.value = text;
  err.value = isErr;
  setTimeout(() => {
    msg.value = '';
  }, 5000);
};

const loadDetails = async () => {
  loading.value = true;
  try {
    const res = await stocktakeApi.get(stocktakeId);
    // معالجة الكميات الفارغة (null) لتمثيلها بشكل صحيح في المدخلات
    if (res.data && res.data.items) {
      res.data.items = res.data.items.map((item: any) => {
        return {
          ...item,
          actual_quantity: item.actual_quantity === null ? null : Number(item.actual_quantity),
        };
      });
    }
    stocktake.value = res.data;
  } catch (e: any) {
    flashMsg(e.message || 'فشل تحميل تفاصيل عملية الجرد', true);
  } finally {
    loading.value = false;
  }
};

const calculateDiff = (item: any) => {
  if (item.actual_quantity === null || item.actual_quantity === '') {
    item.actual_quantity = null;
    item.difference = null;
  } else {
    item.difference = item.actual_quantity - item.system_quantity;
  }
};

// الحسابات المباشرة (Live Calculations) للفروقات والملخص المالي
const countedCount = computed(() => {
  if (!stocktake.value) return 0;
  return stocktake.value.items.filter((item: any) => item.actual_quantity !== null).length;
});

const liveDeficitValue = computed(() => {
  if (!stocktake.value) return 0;
  return stocktake.value.items.reduce((total: any, item: any) => {
    if (item.actual_quantity !== null && item.difference < 0) {
      return total + Math.abs(item.difference) * item.unit_cost;
    }
    return total;
  }, 0);
});

const liveSurplusValue = computed(() => {
  if (!stocktake.value) return 0;
  return stocktake.value.items.reduce((total: any, item: any) => {
    if (item.actual_quantity !== null && item.difference > 0) {
      return total + item.difference * item.unit_cost;
    }
    return total;
  }, 0);
});

// تصفية وعرض البنود طبقاً للبحث والخيارات المحددة
const filteredItems = computed(() => {
  if (!stocktake.value) return [];
  return stocktake.value.items.filter((item: any) => {
    // 1. تصفية البحث بالاسم أو الرمز SKU
    const matchQuery =
      item.product_name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.value.toLowerCase());

    if (!matchQuery) return false;

    // 2. تصفية حالة الجرد والفرق
    if (filterStatus.value === 'counted') {
      return item.actual_quantity !== null;
    } else if (filterStatus.value === 'uncounted') {
      return item.actual_quantity === null;
    } else if (filterStatus.value === 'variance') {
      return item.actual_quantity !== null && Math.abs(item.difference) > 0.0001;
    } else if (filterStatus.value === 'no-variance') {
      return item.actual_quantity !== null && Math.abs(item.difference) <= 0.0001;
    }

    return true;
  });
});

const handleSave = async (silent = false) => {
  if (!stocktake.value) return;
  saving.value = true;
  try {
    // إرسال فقط المعرفات والكميات الفعلية المحدثة
    const payloadItems = stocktake.value.items.map((item: any) => ({
      product_id: item.product_id,
      actual_quantity: item.actual_quantity,
    }));

    await stocktakeApi.updateItems(stocktakeId, {
      items: payloadItems,
      notes: stocktake.value.notes,
    });

    if (!silent) flashMsg('تم حفظ مسودة الجرد بنجاح.');
    return true;
  } catch (e: any) {
    flashMsg(e.message || 'فشل في حفظ مسودة الجرد', true);
    return false;
  } finally {
    saving.value = false;
  }
};

const openConfirmModal = async () => {
  // نقوم بالحفظ تلقائياً أولاً
  const saved = await handleSave(true);
  if (saved) {
    showConfirmModal.value = true;
  }
};

const handleComplete = async () => {
  saving.value = true;
  try {
    const res = (await stocktakeApi.complete(stocktakeId)) as any;
    showConfirmModal.value = false;
    flashMsg(res.message || 'تم اعتماد وتسوية الجرد بنجاح.');
    // إعادة تحميل التفاصيل لإظهار الوضع المعتمد (المغلق)
    await loadDetails();
  } catch (e: any) {
    flashMsg(e.message || 'فشل في اعتماد وتسوية الجرد المالي والمخزني', true);
  } finally {
    saving.value = false;
  }
};

const getDiffClass = (diff: any) => {
  if (diff === null || diff === undefined) return '';
  if (diff < 0) return 'deficit-text';
  if (diff > 0) return 'surplus-text';
  return '';
};

const fmtQty = (val: any) => {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('ar-EG', { maximumFractionDigits: 3 });
};

const fmtDiff = (diff: any) => {
  if (diff === null || diff === undefined) return '-';
  const prefix = diff > 0 ? '+' : '';
  return prefix + Number(diff).toLocaleString('ar-EG', { maximumFractionDigits: 3 });
};

const fmtCost = (val: any) => {
  if (val === undefined || val === null) return '-';
  return (
    Number(val).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) +
    ' ج.م'
  );
};

const fmtCurrency = (val: any) => {
  if (val === undefined || val === null) return '-';
  return Number(val).toLocaleString('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
  });
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

onMounted(loadDetails);
</script>

<style scoped lang="scss">
.stocktake-form-page {
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
      margin-bottom: 6px;
    }

    .back-link-wrap {
      margin-bottom: 4px;
      .back-link {
        font-size: 0.85rem;
        color: var(--primary);
        font-weight: 700;
        text-decoration: none;
        &:hover {
          text-decoration: underline;
        }
      }
    }

    .metadata {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      font-size: 0.82rem;
      color: var(--text-muted);

      .meta-item strong {
        color: var(--text-strong);
      }
    }
  }
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;

  .summary-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

    .card-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      border-radius: 50%;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .card-label {
        font-size: 0.8rem;
        color: var(--text-muted);
        font-weight: 700;
      }

      .card-value {
        font-size: 1.3rem;
        font-weight: 800;
        color: var(--text-strong);
      }
    }

    &.warning-border {
      border-right: 4px solid var(--warning);
    }

    &.danger-border {
      border-right: 4px solid var(--danger);
    }

    &.success-border {
      border-right: 4px solid var(--success);
    }
  }
}

.filter-bar {
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;

  .search-input-wrap {
    flex: 1;
    min-width: 280px;
    position: relative;

    .search-icon {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .search-input {
      width: 100%;
      padding: 10px 40px 10px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg);
      color: var(--text-strong);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 150ms;
      &:focus {
        border-color: var(--primary);
      }
    }
  }

  .filter-options {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-strong);

    .filter-select {
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg);
      color: var(--text-strong);
      outline: none;
      cursor: pointer;
    }
  }
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  text-align: right;

  th {
    background: var(--bg-card-header, var(--bg));
    padding: 12px 16px;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    color: var(--text);
  }

  tr:hover td {
    background: rgba(var(--primary-rgb, 80, 70, 229), 0.01);
  }

  .product-name {
    font-weight: 700;
    color: var(--text-strong);
  }

  .unit-cell {
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .num-col {
    text-align: left;
    white-space: nowrap;
  }

  .input-col {
    width: 160px;
  }

  .qty-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    background: var(--bg);
    color: var(--text-strong);
    font-weight: 700;
    font-size: 0.92rem;
    text-align: left;
    outline: none;
    transition: all 150ms;

    &:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 80, 70, 229), 0.15);
    }

    &:disabled {
      background: var(--bg-card-header, var(--bg));
      border-color: transparent;
      cursor: not-allowed;
      color: var(--text-strong);
    }
  }
}

.row-variance td {
  background-color: rgba(247, 144, 9, 0.015);
}

.deficit-text {
  color: var(--danger, #b42318) !important;
}

.surplus-text {
  color: var(--success, #2e7d4f) !important;
}

.danger-text {
  color: var(--danger, #b42318);
}

.success-text {
  color: var(--success, #2e7d4f);
}

.font-bold {
  font-weight: 700;
}

.font-sm {
  font-size: 0.8rem;
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
  max-width: 550px;
  width: 100%;
  padding: 24px;
  border-radius: var(--radius-lg);
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  background: var(--bg-card);
  animation: modalScale 200ms cubic-bezier(0.16, 1, 0.3, 1);

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 12px;

    h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-strong);
    }

    .warning-title {
      color: var(--primary);
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

  .modal-body {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 16px;

    .modal-list {
      margin: 0;
      padding-right: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      li {
        color: var(--text);
      }
    }

    .reconcile-summary {
      background-color: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      margin: 4px 0;

      h4 {
        margin: 0 0 12px;
        font-size: 0.92rem;
        font-weight: 800;
        color: var(--text-strong);
      }

      .reconcile-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 0.88rem;
        border-bottom: 1px dashed var(--border);
        color: var(--text);

        &:last-child {
          border-bottom: none;
        }

        &.final-row {
          margin-top: 8px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
          font-size: 0.95rem;
        }
      }
    }

    .caution-alert {
      background-color: rgba(180, 35, 24, 0.05);
      border-right: 4px solid var(--danger);
      padding: 12px;
      border-radius: var(--radius-xs);
      font-size: 0.85rem;
      color: var(--danger);
      font-weight: 700;
    }
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
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

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;

    .search-input-wrap {
      min-width: 100%;
    }
  }
}
</style>
