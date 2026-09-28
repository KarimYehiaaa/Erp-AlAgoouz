<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="card modal-content returns-modal">
      <div class="modal-header-row">
        <div class="header-title">
          <AppIcon name="history" :size="20" />
          <h3>فواتير اليوم والمرتجع السريع</h3>
        </div>
        <button type="button" class="close-modal-btn" @click="emit('close')">
          <AppIcon name="close" :size="16" />
        </button>
      </div>

      <div class="returns-search-box">
        <span class="search-icon"><AppIcon name="search" :size="16" /></span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="ابحث برقم الفاتورة أو المبلغ أو رقم البيع..."
          class="returns-search-input"
          autofocus
        />
      </div>

      <div class="returns-table-wrap">
        <div v-if="loading" class="returns-loading">
          <span>جاري تحميل فواتير اليوم...</span>
        </div>
        <table v-else class="returns-table">
          <thead>
            <tr>
              <th>رقم البيع</th>
              <th>الوقت</th>
              <th>الأصناف</th>
              <th>الإجمالي</th>
              <th>طريقة الدفع</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sale in filteredInvoices" :key="sale.id || sale.sale_number">
              <td class="sale-number">{{ sale.sale_number || `#${sale.id}` }}</td>
              <td>{{ formatTime(sale.sale_date || sale.created_at) }}</td>
              <td>{{ sale.items_count || (sale.items?.length ?? 0) }} منتج</td>
              <td class="amount">{{ formatMoney(sale.total_amount) }}</td>
              <td>
                <span class="payment-badge">{{ formatPaymentMethod(sale.payment_method) }}</span>
              </td>
              <td>
                <span class="status-badge" :class="sale.status || 'completed'">
                  {{ sale.status === 'returned' ? 'مرتجع' : 'مكتمل' }}
                </span>
              </td>
              <td class="actions-cell">
                <button
                  type="button"
                  class="btn-action-print"
                  @click="emit('print', sale)"
                  title="طباعة إيصال الفاتورة"
                >
                  <AppIcon name="printer" :size="13" />
                  <span>طباعة</span>
                </button>
                <button
                  v-if="sale.status !== 'returned'"
                  type="button"
                  class="btn-action-return"
                  @click="emit('return', sale)"
                  title="عمل استرداد / مرتجع وإعادة المخزون"
                >
                  <AppIcon name="arrowRightLeft" :size="13" />
                  <span>مرتجع</span>
                </button>
              </td>
            </tr>
            <tr v-if="!filteredInvoices.length">
              <td colspan="7" class="empty-row">لا توجد فواتير مطابقة لبحثك في وردية اليوم</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="emit('close')">إغلاق (Esc)</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { formatMoney } from '../utils/currency';

const props = defineProps<{
  isOpen: boolean;
  invoices: any[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  print: [sale: any];
  return: [sale: any];
}>();

const searchQuery = ref('');

const formatTime = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
};

const formatPaymentMethod = (method: string) => {
  switch (method) {
    case 'cash':
      return 'نقدي (كاش)';
    case 'card':
      return 'فيزا / مدى';
    case 'transfer':
    case 'instapay':
      return 'إنستاباي / محفظة';
    case 'credit':
      return 'آجل';
    case 'split':
      return 'دفع مجزأ';
    default:
      return method || 'نقدي';
  }
};

const filteredInvoices = computed(() => {
  const list = props.invoices || [];
  if (!searchQuery.value.trim()) return list;
  const q = searchQuery.value.toLowerCase().trim();
  return list.filter((s) => {
    const num = String(s.sale_number || s.id || '').toLowerCase();
    const total = String(s.total_amount || '');
    return num.includes(q) || total.includes(q);
  });
});
</script>

<style lang="scss" scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(5px);
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.returns-modal {
  width: 100%;
  max-width: 820px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: #1e130b;
  border: 1px solid #d4a373;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  color: #fffaf2;
}

.modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  padding-bottom: 10px;

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #faedcd;

    h3 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 850;
    }
  }

  .close-modal-btn {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #fff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #f87171;
    }
  }
}

.returns-search-box {
  position: relative;
  margin-bottom: 14px;

  .search-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #d4a373;
  }

  .returns-search-input {
    width: 100%;
    padding: 10px 38px 10px 14px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(212, 163, 115, 0.3);
    border-radius: 10px;
    color: #fff;
    font-size: 0.88rem;
    box-sizing: border-box;

    &:focus {
      outline: none;
      border-color: #d4a373;
      box-shadow: 0 0 10px rgba(212, 163, 115, 0.3);
    }
  }
}

.returns-table-wrap {
  flex: 1;
  overflow-y: auto;
  border: 1px solid rgba(212, 163, 115, 0.15);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  margin-bottom: 14px;
}

.returns-loading {
  padding: 30px;
  text-align: center;
  color: #d4a373;
  font-weight: 700;
}

.returns-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;

  th {
    background: rgba(212, 163, 115, 0.12);
    padding: 10px;
    text-align: right;
    color: #faedcd;
    font-weight: 800;
    border-bottom: 1px solid rgba(212, 163, 115, 0.2);
  }

  td {
    padding: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: #e2e8f0;

    &.sale-number {
      font-weight: 800;
      color: #faedcd;
    }

    &.amount {
      font-weight: 850;
      color: #faedcd;
    }

    &.empty-row {
      text-align: center;
      padding: 30px;
      color: #94a3b8;
    }
  }

  tr:hover td {
    background: rgba(212, 163, 115, 0.06);
  }
}

.payment-badge {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.74rem;
  color: #cbd5e1;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.74rem;
  font-weight: 750;

  &.completed {
    background: rgba(22, 163, 74, 0.2);
    color: #86efac;
    border: 1px solid rgba(22, 163, 74, 0.35);
  }

  &.returned {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
}

.actions-cell {
  display: flex;
  gap: 6px;

  .btn-action-print,
  .btn-action-return {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.74rem;
    font-weight: 750;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-action-print {
    background: rgba(212, 163, 115, 0.15);
    border: 1px solid rgba(212, 163, 115, 0.3);
    color: #faedcd;

    &:hover {
      background: #d4a373;
      color: #140d08;
    }
  }

  .btn-action-return {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;

    &:hover {
      background: #dc2626;
      color: #fff;
    }
  }
}

.modal-actions {
  display: flex;
  justify-content: flex-end;

  .btn-cancel {
    padding: 8px 18px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.15);
    }
  }
}
</style>
