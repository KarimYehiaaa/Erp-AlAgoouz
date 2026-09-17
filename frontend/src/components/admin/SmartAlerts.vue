<template>
  <div class="alerts-panel">
    <div class="alerts-header">
      <h3 class="alerts-title">تنبيهات ذكية</h3>
      <span v-if="totalAlerts" class="alerts-badge">{{ totalAlerts }}</span>
    </div>

    <div v-if="!groups.length" class="alerts-empty">لا توجد تنبيهات — النظام يعمل بشكل ممتاز</div>

    <div v-else class="alerts-list">
      <div v-for="group in groups" :key="group.key" class="alert-group">
        <div class="alert-group-header" :class="group.severity">
          <AppIcon :name="group.icon" :size="16" class="alert-group-icon" />
          <span class="alert-group-label">{{ group.label }}</span>
          <span class="alert-group-count">{{ group.count }}</span>
        </div>
        <div v-for="(item, idx) in group.items.slice(0, 5)" :key="idx" class="alert-item">
          <span class="alert-item-text">{{
            item.text || item.name || item.product_name || JSON.stringify(item)
          }}</span>
          <span v-if="item.value" class="alert-item-value">{{ item.value }}</span>
        </div>
        <div v-if="group.items.length > 5" class="alert-more">
          +{{ group.items.length - 5 }} عنصر آخر
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps({
  alerts: { type: Object, default: () => ({}) },
});

const groups = computed(() => {
  const a = props.alerts || {};
  const result = [];

  // Low Stock Products
  if (a.lowStockProducts?.length) {
    result.push({
      key: 'lowStock',
      icon: 'inventory',
      label: 'منتجات تحت حد الطلب',
      severity: 'critical',
      count: a.lowStockProducts.length,
      items: a.lowStockProducts.map((p: any) => ({
        text: p.name || p.product_name,
        value: `${p.quantity ?? p.current_qty ?? '?'} / ${p.reorder_level ?? p.min_qty ?? '?'}`,
      })),
    });
  }

  // Products without cost
  if (a.noCostProducts?.length) {
    result.push({
      key: 'noCost',
      icon: 'costs',
      label: 'منتجات بدون سعر تكلفة',
      severity: 'warning',
      count: a.noCostProducts.length,
      items: a.noCostProducts.map((p: any) => ({ text: p.name || p.product_name })),
    });
  }

  // Customer debts
  if (a.customerDebts?.length) {
    result.push({
      key: 'debts',
      icon: 'warning',
      label: 'مديونيات عملاء',
      severity: 'warning',
      count: a.customerDebts.length,
      items: a.customerDebts.map((c: any) => ({
        text: c.name || c.customer_name,
        value: `${new Intl.NumberFormat('ar-EG').format(c.balance || c.total_due || 0)} ج.م`,
      })),
    });
  }

  // Supplier balances
  if (a.supplierBalances?.length) {
    result.push({
      key: 'suppliers',
      icon: 'truck',
      label: 'أرصدة موردين مستحقة',
      severity: 'info',
      count: a.supplierBalances.length,
      items: a.supplierBalances.map((s: any) => ({
        text: s.name || s.supplier_name,
        value: `${new Intl.NumberFormat('ar-EG').format(s.balance || s.total_due || 0)} ج.م`,
      })),
    });
  }

  // Pending credit sales
  if (a.pendingCreditSales?.length) {
    result.push({
      key: 'credit',
      icon: 'clock',
      label: 'مبيعات آجلة مفتوحة',
      severity: 'info',
      count: a.pendingCreditSales.length,
      items: a.pendingCreditSales.map((s: any) => ({
        text: s.customer_name || `فاتورة #${s.id}`,
        value: `${new Intl.NumberFormat('ar-EG').format(s.remaining || s.amount || 0)} ج.م`,
      })),
    });
  }

  return result;
});

const totalAlerts = computed(() => groups.value.reduce((sum: any, g: any) => sum + g.count, 0));
</script>

<style scoped>
.alerts-panel {
  border-radius: 16px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}

.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.06));
}

.alerts-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-strong, #fff);
}

.alerts-badge {
  font-size: 0.78rem;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.alerts-empty {
  padding: 30px 20px;
  text-align: center;
  color: var(--success);
  font-size: 0.9rem;
  font-weight: 600;
}

.alerts-list {
  max-height: 400px;
  overflow-y: auto;
}

.alert-group {
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.06));
}

.alert-group:last-child {
  border-bottom: none;
}

.alert-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  font-weight: 800;
  font-size: 0.85rem;
}

.alert-group-header.critical {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.06);
}
.alert-group-header.warning {
  color: var(--warning);
  background: rgba(245, 158, 11, 0.06);
}
.alert-group-header.info {
  color: var(--info);
  background: rgba(59, 130, 246, 0.06);
}

.alert-group-icon {
  font-size: 1.1rem;
}

.alert-group-label {
  flex: 1;
}

.alert-group-count {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
}

.alert-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-block: 8px;
  padding-inline: 36px 20px;
  font-size: 0.8rem;
  color: var(--text, #ccc);
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.03));
}

.alert-item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-item-value {
  font-weight: 700;
  font-size: 0.76rem;
  color: var(--text-strong, #fff);
  font-feature-settings: 'tnum';
  margin-inline-start: 10px;
  white-space: nowrap;
}

.alert-more {
  padding-block: 6px;
  padding-inline: 36px 20px;
  font-size: 0.72rem;
  color: var(--text-muted, #888);
  font-weight: 600;
}
</style>
