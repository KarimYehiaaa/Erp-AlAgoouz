<template>
  <div class="card table-card">
    <h3>⏳ تحليل فترات الازدحام وتوقعات العمالة (Peak Hours & Staffing)</h3>
    <p class="section-desc">
      تحليل الكثافة التشغيلية ساعة بساعة بناءً على معاملات الـ 90 يوماً الماضية، لتحديد ساعات الذروة
      وتوزيع الموظفين الأنسب.
    </p>

    <div class="peak-hours-grid">
      <div class="peak-header-sub">🔥 أعلى 5 ساعات ذروة مبيعاً وازدحاماً:</div>
      <div class="grid grid-5">
        <div
          v-for="(peak, idx) in peakHours"
          :key="idx"
          class="card peak-card"
          :class="'traffic-' + peak.traffic_level"
        >
          <div class="peak-badge">الترتيب #{{ idx + 1 }}</div>
          <div class="peak-day">{{ peak.day_name }}</div>
          <div class="peak-time">الساعة {{ peak.hour_formatted }}</div>
          <div class="peak-meta">
            <span
              >متوسط الطلبات: <strong>{{ peak.avg_transactions }}</strong></span
            >
            <span>
              العمالة المقترحة:
              <strong
                >{{ peak.recommended_staff }}
                {{ peak.recommended_staff > 2 ? 'موظفين' : 'موظف' }}</strong
              >
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="day-selector-row">
      <label>عرض الكثافة التفصيلية ليوم:</label>
      <div class="day-buttons">
        <button
          v-for="(dayName, idx) in dayNames"
          :key="idx"
          type="button"
          class="day-btn"
          :class="{ active: selectedDay === idx }"
          @click="selectedDay = idx"
        >
          {{ dayName }}
        </button>
      </div>
    </div>

    <div class="table-wrap" style="margin-top: 16px">
      <table class="forecast-table">
        <thead>
          <tr>
            <th>الساعة</th>
            <th>كثافة المعاملات (متوسط)</th>
            <th>متوسط إيراد الساعة (ج.م)</th>
            <th>مستوى الازدحام</th>
            <th>توصية عدد موظفي الشيفت</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="hourItem in staffDayData" :key="hourItem.hour">
            <td class="font-bold">الساعة {{ hourItem.hour_formatted }}</td>
            <td>{{ hourItem.avg_transactions }} طلب / ساعة</td>
            <td class="amount font-bold">{{ formatMoney(hourItem.avg_revenue) }}</td>
            <td>
              <span class="badge" :class="getTrafficBadgeClass(hourItem.traffic_level)">
                {{ hourItem.traffic_level }}
              </span>
            </td>
            <td class="font-bold">
              {{ hourItem.recommended_staff }}
              {{ hourItem.recommended_staff > 2 ? 'موظفين' : 'موظف' }}
            </td>
          </tr>
          <tr v-if="!staffDayData.length">
            <td colspan="5" class="empty">لا توجد بيانات ازدحام مسجلة لهذا اليوم حالياً</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { formatMoney } from '@/utils/currency';

// تبويب أوقات الذروة والشيفتات — بطاقات أعلى 5 ساعات + منتقي اليوم + جدول الكثافة التفصيلي.
const props = defineProps<{ peakHours: any[]; weeklyDensity: Record<string, any> }>();

const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const selectedDay = ref(new Date().getDay());

const staffDayData = computed(() => {
  const data: any[] = [];
  const dayDensity = props.weeklyDensity[selectedDay.value];
  if (!dayDensity) return [];

  for (let h = 8; h <= 23; h++) {
    const hourData = dayDensity[h];
    if (hourData) {
      data.push({
        hour: h,
        hour_formatted: `${h}:00`,
        avg_transactions: hourData.avg_transactions,
        avg_revenue: hourData.avg_revenue,
        traffic_level: hourData.traffic_level,
        recommended_staff: hourData.recommended_staff,
      });
    }
  }
  return data;
});

const getTrafficBadgeClass = (level: any) => {
  if (level === 'مرتفع') return 'badge-danger';
  if (level === 'متوسط') return 'badge-warning';
  return 'badge-success';
};
</script>

<style lang="scss" scoped>
@use './forecastShared.scss';

.peak-hours-grid {
  margin-bottom: 24px;
  background: var(--surface-2);
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px dashed var(--border);

  .peak-header-sub {
    font-weight: 800;
    font-size: 0.95rem;
    color: var(--text-strong);
    margin-bottom: 12px;
  }
}

.peak-card {
  padding: 14px;
  border: 1px solid var(--border);
  text-align: center;
  position: relative;
  overflow: hidden;
  transition: all var(--transition);

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .peak-badge {
    position: absolute;
    top: 0;
    right: 0;
    background: var(--primary);
    color: #fff;
    font-size: 0.68rem;
    padding: 2px 8px;
    border-bottom-left-radius: var(--radius-sm);
    font-weight: 800;
  }

  .peak-day {
    font-weight: 800;
    font-size: 1rem;
    margin-top: 10px;
    color: var(--text-strong);
  }

  .peak-time {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 4px 0 10px;
  }

  .peak-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.76rem;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    color: var(--text);

    strong {
      color: var(--text-strong);
    }
  }

  &.traffic-مرتفع {
    border-top: 4px solid var(--danger);
    .peak-badge {
      background: var(--danger);
    }
  }

  &.traffic-متوسط {
    border-top: 4px solid var(--warning);
    .peak-badge {
      background: var(--warning);
    }
  }

  &.traffic-منخفض {
    border-top: 4px solid var(--success);
    .peak-badge {
      background: var(--success);
    }
  }
}

.day-selector-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  flex-wrap: wrap;

  label {
    font-weight: 800;
    font-size: 0.9rem;
    color: var(--text-strong);
  }

  .day-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .day-btn {
      padding: 6px 14px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: 50px;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition);

      &:hover {
        background: var(--surface-3);
        color: var(--primary);
      }

      &.active {
        background: var(--primary);
        border-color: var(--primary-strong);
        color: #fff;
      }
    }
  }
}
</style>
