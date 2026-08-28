<template>
  <div class="risk-radar">
    <div class="radar-header">
      <h3 class="radar-title">رادار المخاطر والتنبيهات التشغيلية</h3>
      <span class="radar-badge">تحديث فوري</span>
    </div>

    <div v-if="loading" class="radar-loading">جاري فحص رادار المخاطر...</div>

    <div v-else class="radar-grid">
      <!-- 1. Overdue Customers Debt -->
      <div class="radar-card warning">
        <div class="card-head">
          <span class="card-icon"><AppIcon name="warning" :size="18" /></span>
          <h4>أعلى ديون العملاء</h4>
        </div>
        <ul v-if="data.overdueCustomers?.length" class="radar-list">
          <li v-for="c in data.overdueCustomers" :key="c.id">
            <span class="item-name">{{ c.name }}</span>
            <span class="item-val danger">{{ formatMoney(c.current_balance) }}</span>
          </li>
        </ul>
        <div v-else class="radar-empty">لا توجد مديونيات مرتفعة</div>
      </div>

      <!-- 2. Low Margin Products -->
      <div class="radar-card danger">
        <div class="card-head">
          <span class="card-icon"><AppIcon name="trendingDown" :size="18" /></span>
          <h4>منتجات بهامش ربح ضعيف (أقل من 10%)</h4>
        </div>
        <ul v-if="data.lowMarginProducts?.length" class="radar-list">
          <li v-for="p in data.lowMarginProducts" :key="p.id">
            <span class="item-name">{{ p.name_ar }}</span>
            <span class="item-val danger">{{ p.margin_percent }}% هامش</span>
          </li>
        </ul>
        <div v-else class="radar-empty">جميع تسعيرات المنتجات ممتازة</div>
      </div>

      <!-- 3. Out of Stock Items -->
      <div class="radar-card critical">
        <div class="card-head">
          <span class="card-icon"><AppIcon name="inventory" :size="18" /></span>
          <h4>منتجات برصيد 0 بالمخزون</h4>
        </div>
        <ul v-if="data.outOfStockProducts?.length" class="radar-list">
          <li v-for="p in data.outOfStockProducts" :key="p.id">
            <span class="item-name">{{ p.name_ar }}</span>
            <span class="item-val muted">الرصيد: 0</span>
          </li>
        </ul>
        <div v-else class="radar-empty">المخزون متوفر بالكامل</div>
      </div>

      <!-- 4. Stale Unpaid Invoices -->
      <div class="radar-card info">
        <div class="card-head">
          <span class="card-icon"><AppIcon name="clock" :size="18" /></span>
          <h4>فواتير آجة ومتأخرة (> 30 يوم)</h4>
        </div>
        <ul v-if="data.staleInvoices?.length" class="radar-list">
          <li v-for="inv in data.staleInvoices" :key="inv.id">
            <span class="item-name"
              >{{ inv.invoice_number }} - {{ inv.customer_name || 'عميل' }}</span
            >
            <span class="item-val warning">{{
              formatMoney(inv.total_amount - inv.paid_amount)
            }}</span>
          </li>
        </ul>
        <div v-else class="radar-empty">لا توجد فواتير متأخرة</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney } from '@/utils/currency';

defineProps({
  data: {
    type: Object,
    default: () => ({
      overdueCustomers: [],
      lowMarginProducts: [],
      outOfStockProducts: [],
      staleInvoices: [],
    }),
  },
  loading: Boolean,
});
</script>

<style scoped>
.risk-radar {
  border-radius: 16px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  padding: 20px;
}

.radar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.radar-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
}

.radar-badge {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
}

.radar-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.radar-card {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.card-head h4 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
}

.radar-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.radar-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.82rem;
  padding: 4px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
}

.radar-list li:last-child {
  border-bottom: none;
}

.item-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}

.item-val {
  font-weight: 800;
}

.item-val.danger {
  color: var(--danger);
}
.item-val.warning {
  color: var(--warning);
}
.item-val.muted {
  color: var(--text-muted);
}

.radar-empty {
  font-size: 0.8rem;
  color: #94a3b8;
  padding: 8px 0;
  text-align: center;
}
</style>
