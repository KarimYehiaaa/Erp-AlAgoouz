<template>
  <div class="card table-card">
    <h3>🔋 مدى كفاية المخزون الحالي (Inventory Runway)</h3>
    <p class="section-desc">
      يحسب المدة الزمنية بالأيام المتبقية قبل نفاد رصيد المخزن الحالي لكل صنف بناءً على استهلاكه
      اليومي المتوقع.
    </p>

    <div class="table-wrap">
      <table class="forecast-table">
        <thead>
          <tr>
            <th>كود الصنف</th>
            <th>اسم الصنف</th>
            <th>التصنيف</th>
            <th>الرصيد الحالي</th>
            <th>متوسط السحب اليومي المتوقع</th>
            <th style="width: 250px">مؤشر البقاء (Runway)</th>
            <th>تاريخ النفاد المتوقع</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.product_id" :class="getRowClass(item.runway_days)">
            <td>
              <code>{{ item.sku }}</code>
            </td>
            <td class="font-bold">{{ item.name_ar }}</td>
            <td class="muted">{{ item.category_name || '—' }}</td>
            <td>{{ item.current_stock }} {{ item.unit }}</td>
            <td class="amount font-bold">{{ item.avg_daily_demand }} {{ item.unit }}</td>
            <td>
              <div class="runway-progress-wrap">
                <div class="progress-bar-bg">
                  <div
                    class="progress-bar-fill"
                    :style="{ width: getProgressWidth(item.runway_days) + '%' }"
                    :class="getProgressBarClass(item.runway_days)"
                  ></div>
                </div>
                <span class="runway-days-text font-bold">
                  {{ getRunwayText(item.runway_days) }}
                </span>
              </div>
            </td>
            <td>
              <span class="badge" :class="getBadgeClass(item.runway_days)">
                {{ getOosDateText(item.out_of_stock_date, item.runway_days) }}
              </span>
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="7" class="empty">لا توجد أصناف مطابقة للبحث</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
// تبويب مؤشر نفاد المخزون — عرض صفوف الـ runway مع أشرطة التقدم والشارات.
defineProps<{ items: any[] }>();

const getRowClass = (days: any) => {
  if (days <= 3) return 'row-critical';
  if (days <= 7) return 'row-warning';
  return '';
};

const getProgressWidth = (days: any) => {
  if (days >= 30) return 100;
  if (days <= 0) return 5;
  return Math.min(100, Math.ceil((days / 30) * 100));
};

const getProgressBarClass = (days: any) => {
  if (days <= 3) return 'progress-danger';
  if (days <= 7) return 'progress-warning';
  if (days <= 15) return 'progress-info';
  return 'progress-success';
};

const getRunwayText = (days: any) => {
  if (days === 999) return 'مستقر (أكثر من شهر)';
  if (days === 0) return 'منفد حالياً 🚨';
  if (days === 1) return 'يوم واحد فقط';
  if (days === 2) return 'يومين';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوم`;
};

const getOosDateText = (date: any, days: any) => {
  if (days === 999) return 'مستقر';
  if (days === 0) return 'منفد';
  return date;
};

const getBadgeClass = (days: any) => {
  if (days <= 3) return 'badge-danger';
  if (days <= 7) return 'badge-warning';
  if (days <= 15) return 'badge-info';
  return 'badge-success';
};
</script>

<style lang="scss" scoped>
@use './forecastShared.scss';
</style>
