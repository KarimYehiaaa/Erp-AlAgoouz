<template>
  <div class="card table-card">
    <h3>💰 هوامش الأرباح والتسعير الذكي (Margin Analyzer)</h3>
    <p class="section-desc">
      تحليل تكلفة المواد الخام المكونة لكل صنف ومقارنتها بسعر البيع الحالي لتحديد الأصناف ذات الهامش
      المنخفض واقتراح سعر بيع يحقق هامش الربح المستهدف (60%).
    </p>

    <div class="table-wrap">
      <table class="forecast-table">
        <thead>
          <tr>
            <th>كود الصنف</th>
            <th>اسم الصنف</th>
            <th>التصنيف</th>
            <th>سعر التكلفة</th>
            <th>سعر البيع الحالي</th>
            <th>هامش الربح الفعلي</th>
            <th>الحالة</th>
            <th>السعر المقترح (هامش 60%)</th>
            <th>فرق السعر المطلوب</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="alert in items" :key="alert.product_id" :class="'pricing-row-' + alert.status">
            <td>
              <code>{{ alert.sku }}</code>
            </td>
            <td class="font-bold">{{ alert.name_ar }}</td>
            <td class="muted">{{ alert.category_name || '—' }}</td>
            <td class="amount">{{ formatMoney(alert.cost) }}</td>
            <td class="font-bold">{{ formatMoney(alert.current_price) }}</td>
            <td class="font-bold" :class="getMarginClass(alert.status)">{{ alert.margin }}%</td>
            <td>
              <span class="badge" :class="getPricingBadgeClass(alert.status)">
                {{ alert.status_ar }}
              </span>
            </td>
            <td class="font-bold primary-color">{{ formatMoney(alert.suggested_price) }}</td>
            <td class="font-bold" :class="getPriceDiffClass(alert)">
              {{ getPriceDiffText(alert) }}
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="9" class="empty">لا توجد منتجات تطابق البحث</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoney } from '@/utils/currency';

// تبويب هوامش الربح والتسعير الذكي — جدول تنبيهات الهامش مع السعر المقترح.
defineProps<{ items: any[] }>();

const getPricingBadgeClass = (status: any) => {
  if (status === 'critical') return 'badge-danger';
  if (status === 'warning') return 'badge-warning';
  return 'badge-success';
};

const getMarginClass = (status: any) => {
  if (status === 'critical') return 'text-danger font-bold';
  if (status === 'warning') return 'text-warning font-bold';
  return 'text-success font-bold';
};

const getPriceDiffClass = (alert: any) => {
  if (alert.status === 'healthy') return 'text-muted';
  return 'text-danger font-bold';
};

const getPriceDiffText = (alert: any) => {
  const diff = alert.suggested_price - alert.current_price;
  if (diff <= 0) return 'سعر مناسب';
  return `+${formatMoney(diff)}`;
};
</script>

<style lang="scss" scoped>
@use './forecastShared.scss';
</style>
