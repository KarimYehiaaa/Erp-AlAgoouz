<template>
  <div class="card table-card">
    <h3>📦 توقع استهلاك المكونات والمواد الخام (الـ 7 أيام القادمة)</h3>
    <p class="section-desc">
      يحسب كمية المكونات والمواد الخام (مثل البن، الحليب، الأكواب، السكر) المطلوبة لتلبية الفواتير
      المتوقعة للأسبوع القادم.
    </p>

    <div class="table-wrap">
      <table class="forecast-table">
        <thead>
          <tr>
            <th>كود المكون</th>
            <th>المكون / المادة الخام</th>
            <th>التصنيف</th>
            <th v-for="(day, idx) in nextDaysLabels" :key="idx" class="center-col">
              {{ day.weekday }} <br /><span class="muted">{{ day.date }}</span>
            </th>
            <th class="total-col">مجموع 7 أيام</th>
            <th class="total-col">مجموع 30 يوم</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.product_id">
            <td>
              <code>{{ item.sku }}</code>
            </td>
            <td class="font-bold">{{ item.name_ar }}</td>
            <td class="muted">{{ item.category_name || '—' }}</td>
            <td v-for="(val, idx) in item.daily_forecast" :key="idx" class="center-col font-bold">
              {{ val }}
            </td>
            <td class="total-col font-bold primary-color">
              {{ item.forecast_7d }} {{ item.unit }}
            </td>
            <td class="total-col font-bold secondary-color">
              {{ item.forecast_30d }} {{ item.unit }}
            </td>
          </tr>
          <tr v-if="!items.length">
            <td colspan="10" class="empty">
              لا توجد أصناف مطابقة للبحث أو لا توجد وصفات نشطة تستهلك مكونات حالياً
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
// تبويب توقع استهلاك المكونات — جدول بالكميات المطلوبة لكل يوم من الأيام السبعة القادمة.
defineProps<{ items: any[]; nextDaysLabels: { weekday: string; date: string }[] }>();
</script>

<style lang="scss" scoped>
@use './forecastShared.scss';
</style>
