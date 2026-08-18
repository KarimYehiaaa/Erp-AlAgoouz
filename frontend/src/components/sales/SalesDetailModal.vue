<template>
  <div v-if="sale" class="modal" @click.self="$emit('close')">
    <div class="card modal-content sale-detail-modal">
      <div class="modal-header">
        <h3>تفاصيل الفاتورة #{{ sale.sale_number }}</h3>
        <button type="button" class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <div class="sale-info-grid">
        <div class="info-item">
          <span class="label">التاريخ:</span>
          <span class="value">{{ formatDate(sale.created_at) }}</span>
        </div>
        <div class="info-item">
          <span class="label">العميل:</span>
          <span class="value">{{ sale.customer_name || 'عميل نقدي' }}</span>
        </div>
        <div class="info-item">
          <span class="label">نوع البيع:</span>
          <span class="value badge">{{ saleTypeLabel(sale.sale_type) }}</span>
        </div>
        <div class="info-item">
          <span class="label">حالة الدفع:</span>
          <span class="value badge" :class="sale.payment_status">{{
            paymentStatusLabel(sale.payment_status)
          }}</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sale.items || []" :key="item.id">
              <td>{{ item.product_name || item.name_ar }}</td>
              <td>{{ item.quantity }}</td>
              <td>{{ formatMoney(item.unit_price) }}</td>
              <td>{{ formatMoney(item.total_amount ?? item.total_price) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sale-totals">
        <div class="total-row">
          <span>الإجمالي الفرعي:</span>
          <strong>{{ formatMoney(sale.subtotal || sale.total_amount) }}</strong>
        </div>
        <div v-if="sale.discount_amount > 0" class="total-row discount">
          <span>الخصم:</span>
          <strong>-{{ formatMoney(sale.discount_amount) }}</strong>
        </div>
        <div class="total-row grand-total">
          <span>صافي الفاتورة:</span>
          <strong>{{ formatMoney(sale.final_amount || sale.total_amount) }}</strong>
        </div>
      </div>

      <!-- المدفوعات وسجل الإرجاع -->
      <div
        v-if="sale.payments?.length || sale.status === 'returned'"
        class="payment-log"
      >
        <h4>💳 المدفوعات وسجل الإرجاع</h4>
        <table v-if="sale.payments?.length" class="table table-sm">
          <thead>
            <tr>
              <th>طريقة الدفع</th>
              <th>المبلغ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, i) in sale.payments" :key="i">
              <td>{{ paymentMethodLabel(p.method) }}</td>
              <td>{{ formatMoney(p.amount) }}</td>
              <td>
                <span v-if="p.refunded" class="badge refunded-badge">مسترد</span>
                <span v-else class="badge paid-badge">مدفوع</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="sale.status === 'returned'" class="return-log">
          <div class="return-log-row">
            <span>⏱️ تاريخ الإرجاع:</span>
            <strong>{{ formatDate(sale.returned_at) }}</strong>
          </div>
          <div class="return-log-row refunded-amount">
            <span>💰 المبلغ المسترد:</span>
            <strong>{{ formatMoney(sale.refunded_amount) }}</strong>
          </div>
          <div v-if="sale.notes" class="return-log-row notes">
            <span>📝 ملاحظات الإرجاع:</span>
            <span>{{ sale.notes }}</span>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-outline" @click="$emit('close')">إغلاق</button>
        <button type="button" class="btn btn-primary" @click="$emit('print', sale)">
          <AppIcon name="print" :size="16" /> طباعة الفاتورة
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils/currency';

defineProps({
  sale: { type: Object, default: null },
});

defineEmits(['close', 'print']);

const formatDate = (d: any) => (d ? new Date(d).toLocaleString('ar-EG') : '—');

const saleTypeLabel = (type: any) => {
  const map = { branch: 'فرع/محل', wholesale: 'جملة', pos: 'POS' };
  return map[type as keyof typeof map] || type || 'عام';
};

const paymentStatusLabel = (status: any) => {
  const map = {
    paid: 'مدفوع',
    partial: 'جزئي',
    unpaid: 'آجل',
    refunded: 'مسترد (مرتجع)',
    cancelled: 'ملغي',
  };
  return map[status as keyof typeof map] || status || 'مدفوع';
};

const paymentMethodLabel = (m: any) => {
  const map = { cash: 'كاش', card: 'بطاقة', transfer: 'تحويل', credit: 'آجل' };
  return map[m as keyof typeof map] || m || '—';
};
</script>

<style lang="scss" scoped>
.sale-detail-modal {
  max-width: 600px;
  width: 90%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;

  h3 {
    margin: 0;
  }
  .btn-close {
    border: none;
    background: transparent;
    font-size: 1.2rem;
    cursor: pointer;
  }
}

.sale-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
}

.info-item {
  font-size: 0.88rem;
  .label {
    color: var(--text-muted);
    margin-left: 6px;
  }
  .value {
    font-weight: 600;
  }
}

.sale-totals {
  margin-top: 16px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.total-row {
  display: flex;
  gap: 16px;
  font-size: 0.9rem;

  &.grand-total {
    font-size: 1.1rem;
    color: var(--primary);
    margin-top: 4px;
  }
}

.payment-log {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);

  h4 {
    margin: 0 0 10px;
    font-size: 0.95rem;
  }

  .table-sm {
    th,
    td {
      padding: 6px 8px;
      font-size: 0.85rem;
    }
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
  }
  .refunded-badge {
    background: #fdecea;
    color: #c0392b;
  }
  .paid-badge {
    background: #e8f8ef;
    color: #1e8449;
  }
}

.return-log {
  margin-top: 10px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;

  .return-log-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    padding: 4px 0;

    span:first-child {
      color: var(--text-muted);
    }

    &.refunded-amount {
      font-weight: 700;
      color: var(--danger);
    }

    &.notes {
      align-items: flex-start;
      span:last-child {
        text-align: left;
        white-space: pre-line;
        color: var(--text-muted);
      }
    }
  }
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
</style>
