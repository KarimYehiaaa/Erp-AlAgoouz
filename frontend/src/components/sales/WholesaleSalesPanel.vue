<!--
  WholesaleSalesPanel.vue — تبويب "جملة": جدول فواتير الجملة للعملاء
  ═════════════════════════════════════════════════════════════════
  يعرض فواتير مبيعات الجملة مع روابط العرض/الطباعة والتعديل.
  استُخرج من SalesView لتقليل حجم الملف المركزي (كان 2,463 سطرًا).
-->
<template>
  <div class="wholesale-view-wrap">
    <div class="card table-wrap list-card sales-history-card">
      <div
        class="history-head"
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        "
      >
        <div>
          <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700">فواتير الجملة</h3>
          <p style="margin: 4px 0 0 0; opacity: 0.8; font-size: 0.9rem">
            {{ sales.length }} فاتورة
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: 10px">
          <router-link
            to="/invoices/create"
            class="btn btn-primary"
            style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600"
          >
            <span>+ فاتورة جديدة</span>
          </router-link>
          <router-link
            to="/invoices/quotes"
            class="btn btn-outline"
            style="display: inline-flex; align-items: center; gap: 6px"
          >
            <span>عرض أسعار</span>
          </router-link>
          <span class="history-total">{{ formatMoney(periodTotal) }}</span>
        </div>
      </div>
      <BaseTable
        :items="sales"
        :columns="activeColumns"
        :loading="loadingSales"
        empty-message="لا توجد فواتير مبيعات جملة للعملاء في هذه الفترة"
      >
        <template #cell-sale_date="{ item }">
          <span class="history-date">{{ formatDate(item.sale_date || item.created_at) }}</span>
        </template>
        <template #cell-sale_number="{ item }">
          <span class="mono" style="font-weight: 700">{{
            item.sale_number || item.invoice_number || '—'
          }}</span>
        </template>
        <template #cell-customer_name="{ item }">
          <span class="customer-chip" style="font-weight: 800; color: var(--accent, #c77a2f)">
            👤 {{ item.customer_name || item.customer_name_ar || 'عميل جملة' }}
          </span>
        </template>
        <template #cell-total_amount="{ item }">
          <span class="history-amount">{{ formatMoney(item.total_amount) }}</span>
        </template>
        <template #cell-payment_status="{ item }">
          <span class="history-payment" :class="paymentBadge(item.payment_status)">
            {{ paymentStatusLabel(item.payment_status) }}
          </span>
        </template>
        <template #cell-actions="{ item }">
          <router-link
            :to="`/invoices/${item.invoice_id || item.id}`"
            class="btn btn-outline btn-sm"
            style="margin-left: 6px"
          >
            عرض / طباعة
          </router-link>
          <router-link
            :to="`/invoices/${item.invoice_id || item.id}/edit`"
            class="btn btn-outline btn-sm"
          >
            تعديل
          </router-link>
        </template>
      </BaseTable>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * تبويب فواتير الجملة — يستهلك من SalesView.
 *
 * @props sales              فواتير الجملة
 * @props activeColumns      أعمدة الجدول النشطة
 * @props loadingSales       حالة تحميل القائمة
 * @props periodTotal        إجمالي الفترة
 * @props formatMoney        دالة تنسيق المبالغ
 * @props formatDate         دالة تنسيق التاريخ
 * @props paymentBadge       دالة تلوين شارة حالة الدفع
 * @props paymentStatusLabel دالة تسمية حالة الدفع
 */
import BaseTable from '@/components/ui/BaseTable.vue';

defineProps<{
  sales: any[];
  activeColumns: any[];
  loadingSales: boolean;
  periodTotal: number;
  formatMoney: (_value: number | null | undefined) => string;
  formatDate: (_d: any) => string;
  paymentBadge: (_s: any) => string[];
  paymentStatusLabel: (_s: any) => string;
}>();
</script>

<style lang="scss" scoped>
.list-card {
  max-height: 640px;
  overflow: auto;
}
.sales-history-card {
  padding: 0;
}
.history-head {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 20px 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--card-bg) 96%, var(--primary) 4%),
    var(--bg-elevated)
  );
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border));
}
.history-total {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 13px;
  border-radius: 999px;
  color: var(--primary-strong);
  background: color-mix(in srgb, var(--primary) 9%, var(--bg-elevated));
  border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border));
  font-weight: 950;
  white-space: nowrap;
}
.list-card table {
  border-collapse: separate;
  border-spacing: 0 9px;
  padding: 0 14px 14px;
}
.list-card thead th {
  position: sticky;
  top: 77px;
  z-index: 2;
  border: 0;
  background: color-mix(in srgb, var(--bg-elevated) 96%, var(--primary) 3%);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 950;
  padding-block: 10px;
}
.list-card tbody td {
  border-top: 1px solid color-mix(in srgb, var(--primary) 9%, var(--border));
  border-bottom: 1px solid color-mix(in srgb, var(--primary) 9%, var(--border));
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  font-weight: 800;
  padding-block: 13px;
}
.list-card tbody td:first-child {
  border-inline-start: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border));
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.list-card tbody td:last-child {
  border-inline-end: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border));
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.list-card tbody tr:hover td {
  background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated));
}
.history-date {
  color: var(--text-muted);
  font-weight: 900;
  white-space: nowrap;
}
.history-amount {
  color: var(--text-strong);
  font-size: 0.98rem;
  font-weight: 950;
  white-space: nowrap;
}
.history-payment .badge {
  min-width: 74px;
  justify-content: center;
}
.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 24px;
}
@media (max-width: 640px) {
  .list-card {
    max-height: none;
    overflow: hidden;
  }
  .list-card table,
  .list-card thead,
  .list-card tbody,
  .list-card tr,
  .list-card th,
  .list-card td {
    display: block;
  }
  .list-card table {
    border-spacing: 0;
    padding: 0 12px 12px;
  }
  .list-card thead {
    display: none;
  }
  .list-card tbody {
    display: grid;
    gap: 10px;
  }
  .list-card tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border));
    border-radius: var(--radius-md);
    background:
      radial-gradient(
        circle at 0 100%,
        color-mix(in srgb, var(--accent) 10%, transparent),
        transparent 38%
      ),
      color-mix(in srgb, var(--bg-elevated) 82%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }
  .list-card tbody td,
  .list-card tbody td:first-child,
  .list-card tbody td:last-child {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
  }
  .list-card tbody tr:hover td,
  .payment-open td,
  .payment-open:hover td {
    background: transparent;
  }
  .list-card tbody td:nth-child(1) {
    grid-column: 1;
    color: var(--text-strong);
    font-size: 0.95rem;
    font-weight: 950;
  }
  .list-card tbody td:nth-child(2) {
    grid-column: 2;
    color: var(--text-strong);
    font-size: 0.98rem;
    font-weight: 950;
    white-space: nowrap;
  }
  .list-card tbody td:nth-child(3) {
    align-self: center;
  }
  .list-card tbody td:nth-child(4) {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    padding-top: 2px;
  }
  .list-card tbody td.empty {
    grid-column: 1 / -1;
    padding: 18px;
  }
}
</style>
