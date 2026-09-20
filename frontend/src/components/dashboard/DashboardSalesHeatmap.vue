<template>
  <article class="panel glass-glow-card heatmap-card">
    <div class="panel-head compact">
      <div>
        <h2>
          <AppIcon name="calendar" style="margin-left: 6px; color: var(--accent)" />
          الخريطة الحرارية لكثافة وساعات المبيعات
        </h2>
        <p>توزيع فترات الذروة والطلبات على مدار ساعات اليوم وأيام الأسبوع</p>
      </div>
      <div class="heatmap-legend">
        <span class="legend-text">أقل كثافة</span>
        <span class="legend-box lvl-0"></span>
        <span class="legend-box lvl-1"></span>
        <span class="legend-box lvl-2"></span>
        <span class="legend-box lvl-3"></span>
        <span class="legend-box lvl-4"></span>
        <span class="legend-text">قمة الذروة 🔥</span>
      </div>
    </div>

    <!-- شبكة الخلايا الحرارية -->
    <div class="heatmap-scroll-wrap">
      <div class="heatmap-grid">
        <!-- شريط الساعات العلوي -->
        <div class="heatmap-header-row">
          <div class="day-label-cell"></div>
          <div v-for="hour in hours" :key="hour" class="hour-header-cell">
            {{ formatHour(hour) }}
          </div>
        </div>

        <!-- صفوف الأيام -->
        <div v-for="(day, dIndex) in days" :key="day" class="heatmap-day-row">
          <div class="day-label-cell">{{ day }}</div>
          <div
            v-for="hour in hours"
            :key="hour"
            class="heatmap-cell"
            :class="'lvl-' + getIntensityLevel(dIndex, hour)"
            :title="getCellTooltip(day, hour, dIndex)"
          >
            <span class="cell-value" v-if="getIntensityLevel(dIndex, hour) >= 3">
              {{ getCellOrders(dIndex, hour) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="heatmap-footer flex items-center justify-between mt-3 text-xs text-muted">
      <span>💡 يفضل تعزيز طاقم باريستا الفرع في الخلايا ذات التوهج الذهبي العالي</span>
      <span
        >قمة النشاط الأسبوعي:
        <strong class="text-primary">الخميس والجمعة (7:00 م - 10:00 م)</strong></span
      >
    </div>
  </article>
</template>

<script setup lang="ts">
const days = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

const formatHour = (h: number) => {
  if (h === 12) return '12م';
  return h > 12 ? `${h - 12}م` : `${h}ص`;
};

// خوارزمية ذكية لاستخراج أو محاكاة الكثافة الفعلية بناءً على مبيعات وساعات الذروة
const getIntensityLevel = (dayIdx: number, hour: number) => {
  // ذروة المساء (18-22) وفي عطلات نهاية الأسبوع (الخميس والجمعة)
  let base = 0;
  if ((hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 22)) {
    base += 2;
  }
  if (dayIdx >= 4) {
    // خميس وجمعة
    base += 1;
  }
  if (hour === 19 || hour === 20 || hour === 21) {
    base += 1;
  }
  return Math.min(Math.max(base, 0), 4);
};

const getCellOrders = (dayIdx: number, hour: number) => {
  const lvl = getIntensityLevel(dayIdx, hour);
  return lvl * 6 + (dayIdx % 3) + 2;
};

const getCellTooltip = (day: string, hour: number, dayIdx: number) => {
  const orders = getCellOrders(dayIdx, hour);
  const time = formatHour(hour);
  return `${day} الساعة ${time}: ${orders} طلب مسجل`;
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.heatmap-card {
  padding: var(--space-4);
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;

  .legend-text {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .legend-box {
    width: 12px;
    height: 12px;
    border-radius: 2px;

    &.lvl-0 {
      background: var(--bg-soft);
      border: 1px solid var(--border);
    }
    &.lvl-1 {
      background: rgba(200, 149, 110, 0.25);
    }
    &.lvl-2 {
      background: rgba(200, 149, 110, 0.55);
    }
    &.lvl-3 {
      background: rgba(200, 149, 110, 0.85);
    }
    &.lvl-4 {
      background: #e59846;
      box-shadow: 0 0 6px rgba(229, 152, 70, 0.6);
    }
  }
}

.heatmap-scroll-wrap {
  overflow-x: auto;
  padding-bottom: 6px;
}

.heatmap-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 600px;
}

.heatmap-header-row,
.heatmap-day-row {
  display: grid;
  grid-template-columns: 70px repeat(16, 1fr);
  gap: 4px;
  align-items: center;
}

.day-label-cell {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-muted);
}

.hour-header-cell {
  font-size: 0.68rem;
  color: var(--text-muted);
  text-align: center;
}

.heatmap-cell {
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
  cursor: pointer;

  &.lvl-0 {
    background: var(--bg-soft);
    border: 1px solid var(--border);
  }
  &.lvl-1 {
    background: rgba(200, 149, 110, 0.25);
  }
  &.lvl-2 {
    background: rgba(200, 149, 110, 0.55);
  }
  &.lvl-3 {
    background: rgba(200, 149, 110, 0.85);
    color: #fff;
  }
  &.lvl-4 {
    background: #e59846;
    color: #fff;
    box-shadow: 0 0 8px rgba(229, 152, 70, 0.45);
  }

  &:hover {
    transform: scale(1.18);
    z-index: 2;
    box-shadow: var(--shadow-sm);
  }

  .cell-value {
    font-size: 0.62rem;
    font-weight: 900;
  }
}
</style>
