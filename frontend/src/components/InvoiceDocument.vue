<template>
  <div class="invoice-doc" dir="rtl" lang="ar">
    <header class="inv-header">
      <div class="inv-brand">
        <AppLogo size="lg" :rounded="true" />
        <div>
          <h1>{{ company.name_ar || 'بن العجوز' }}</h1>
          <p class="tagline">{{ company.tagline || 'للحب التركي' }}</p>
          <p><strong>العنوان:</strong> {{ displayAddress }}</p>
          <p><strong>الهاتف:</strong> {{ displayPhone }}</p>
          <p v-if="company.tax_number"><strong>الرقم الضريبي:</strong> {{ company.tax_number }}</p>
        </div>
      </div>
      <div class="inv-title-box">
        <span class="inv-type">فاتورة عميل</span>
        <span class="inv-number">{{ invoice.invoice_number }}</span>
      </div>
    </header>

    <div class="inv-parties">
      <div class="party-box">
        <h4>بيانات العميل</h4>
        <p><strong>الاسم:</strong> {{ invoice.customer_name || 'عميل نقدي' }}</p>
        <p v-if="invoice.customer_phone"><strong>الهاتف:</strong> {{ invoice.customer_phone }}</p>
        <p v-if="invoice.customer_address">
          <strong>العنوان:</strong> {{ invoice.customer_address }}
        </p>
      </div>
      <div class="party-box meta">
        <p><strong>تاريخ الإصدار:</strong> {{ formatDate(invoice.issued_at) }}</p>
        <p v-if="invoice.due_date">
          <strong>تاريخ الاستحقاق:</strong> {{ formatDate(invoice.due_date) }}
        </p>
        <p>
          <strong>حالة الدفع:</strong> <span :class="payClass">{{ payLabel }}</span>
        </p>
        <p v-if="invoice.issued_by"><strong>أصدرها:</strong> {{ invoice.issued_by }}</p>
      </div>
    </div>

    <table class="inv-table">
      <thead>
        <tr>
          <th>#</th>
          <th>البيان</th>
          <th>الكمية</th>
          <th>سعر الوحدة</th>
          <th>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, i) in displayItems" :key="i">
          <td>{{ i + 1 }}</td>
          <td>{{ item.description || item.product_name }}</td>
          <td>{{ item.quantity }}</td>
          <td>{{ formatMoney(item.unit_price) }}</td>
          <td>{{ formatMoney(item.total_amount) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="inv-footer-row">
      <div class="stamp-box">
        <span>رقم الفاتورة</span>
        <strong>{{ invoice.invoice_number }}</strong>
      </div>
      <div class="totals-box">
        <div class="total-line">
          <span>الخصم</span><span>{{ formatMoney(invoice.discount_amount) }}</span>
        </div>
        <div class="total-line">
          <span>ض.ق.م ({{ taxRate }}%)</span><span>{{ formatMoney(invoice.tax_amount) }}</span>
        </div>
        <div class="total-line grand">
          <span>الإجمالي المستحق</span><span>{{ formatMoney(invoice.total_amount) }}</span>
        </div>
        <div class="total-line tafqeet-line">
          <span class="tafqeet-text">{{ tafqeetText }}</span>
        </div>
      </div>
    </div>

    <p v-if="invoice.notes" class="inv-notes"><strong>ملاحظات:</strong> {{ invoice.notes }}</p>

    <footer class="inv-footer">
      <p>نتشرف بخدمتكم دائمًا، ونشكركم على ثقتكم في {{ company.name_ar || 'بن العجوز' }}.</p>
      <p class="small">لأي استفسار، تواصل معنا على {{ displayPhone }}.</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppLogo from '@/components/AppLogo.vue';
import { formatMoney, TAX_RATE } from '@/utils/currency';
import { tafqeet } from '@/utils/tafqeet';

const props = defineProps({
  invoice: { type: Object, required: true },
});

const tafqeetText = computed(() => tafqeet(props.invoice?.total_amount));

const company = computed(() => props.invoice.company || {});
const displayAddress = computed(() => company.value.address || 'جمهورية مصر العربية');
const displayPhone = computed(() => company.value.phone || '01000000000');
const taxRate = computed(() => props.invoice.tax?.rate ?? TAX_RATE);
const displayItems = computed(() =>
  Array.isArray(props.invoice.items) ? props.invoice.items : [],
);

const payLabel = computed(
  () =>
    (
      ({
        paid: 'مدفوعة',
        unpaid: 'غير مدفوعة',
        partial: 'مدفوعة جزئيًا',
        refunded: 'مستردة',
      }) as Record<string, string>
    )[props.invoice.payment_status] || props.invoice.payment_status,
);

const payClass = computed(
  () =>
    (
      ({
        paid: 'paid',
        unpaid: 'unpaid',
        partial: 'partial',
        refunded: 'refunded',
      }) as Record<string, string>
    )[props.invoice.payment_status] || '',
);

const formatDate = (d: any) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
</script>

<style lang="scss" scoped>
.invoice-doc {
  background: #fff;
  color: #1a1510;
  padding: 40px;
  max-width: 800px;
  margin: 0 auto;
  font-family: 'Cairo', sans-serif;
}
.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding-bottom: 20px;
  border-bottom: 3px solid #5c3d2e;
  margin-bottom: 24px;
}
.inv-brand {
  display: flex;
  gap: 16px;
  align-items: center;
  h1 {
    font-size: 1.6rem;
    color: #5c3d2e;
    margin: 0 0 4px;
  }
  .tagline {
    color: #8b5e3c;
    font-size: 0.85rem;
    margin: 0 0 6px;
  }
  p {
    margin: 2px 0;
    font-size: 0.85rem;
    color: #555;
  }
}
.inv-title-box {
  text-align: left;
  background: linear-gradient(135deg, #5c3d2e, #8b5e3c);
  color: #fff;
  padding: 16px 24px;
  border-radius: 12px;
  .inv-type {
    display: block;
    font-size: 0.85rem;
    opacity: 0.9;
  }
  .inv-number {
    display: block;
    font-size: 1.35rem;
    font-weight: 800;
    margin-top: 4px;
  }
}
.inv-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}
.party-box {
  background: #f8f6f3;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid #e8e0d5;
  h4 {
    margin: 0 0 10px;
    color: #5c3d2e;
    font-size: 0.95rem;
  }
  p {
    margin: 4px 0;
    font-size: 0.9rem;
  }
}
.paid {
  color: #2e7d4f;
  font-weight: 700;
}
.unpaid {
  color: #c0392b;
  font-weight: 700;
}
.partial {
  color: #c17d2e;
  font-weight: 700;
}
.inv-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 24px;
  th {
    background: #5c3d2e;
    color: #fff;
    padding: 12px;
    text-align: right;
    font-size: 0.9rem;
  }
  td {
    padding: 12px;
    border-bottom: 1px solid #e8e0d5;
    font-size: 0.9rem;
  }
  tbody tr:nth-child(even) {
    background: #faf8f5;
  }
}
.inv-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  margin-bottom: 20px;
}
.stamp-box {
  border: 2px dashed #5c3d2e;
  border-radius: 10px;
  padding: 16px;
  min-width: 180px;
  text-align: center;
  span {
    display: block;
    color: #7a5b4d;
    margin-bottom: 6px;
  }
  strong {
    color: #5c3d2e;
    font-size: 1rem;
  }
}
.totals-box {
  min-width: 280px;
  background: #f8f6f3;
  padding: 16px 20px;
  border-radius: 10px;
  border: 1px solid #e8e0d5;
}
.total-line {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 0.95rem;
  &.grand {
    border-top: 2px solid #5c3d2e;
    margin-top: 8px;
    padding-top: 12px;
    font-size: 1.15rem;
    font-weight: 800;
    color: #5c3d2e;
  }
  &.tafqeet-line {
    justify-content: flex-start;
    font-size: 0.85rem;
    color: #555;
    .tafqeet-text {
      font-style: italic;
    }
  }
}
.inv-notes {
  background: #fff9e6;
  padding: 12px;
  border-radius: 8px;
  border-right: 4px solid #c9a227;
  font-size: 0.9rem;
}
.inv-footer {
  text-align: center;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #e8e0d5;
  color: #666;
  .small {
    font-size: 0.8rem;
    margin-top: 4px;
  }
}
</style>
