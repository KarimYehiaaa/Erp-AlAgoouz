<template>
  <div class="tab-content animate-fade-in">
    <div class="filters-bar card">
      <div class="filter-group">
        <label class="inline-label">من تاريخ</label>
        <input type="date" v-model="wastageFromDate" class="date-input" />
      </div>
      <div class="filter-group">
        <label class="inline-label">إلى تاريخ</label>
        <input type="date" v-model="wastageToDate" class="date-input" />
      </div>
      <div class="filter-group reset-group">
        <button
          class="btn btn-outline"
          @click="
            wastageFromDate = '';
            wastageToDate = '';
          "
        >
          تفريغ الفلتر
        </button>
      </div>
    </div>

    <!-- High Wastage Warning Alert -->
    <div v-if="highWastageItems.length" class="alert alert-danger animate-fade-in">
      <strong><AppIcon name="warning" :size="16" /> تنبيه هدر مرتفع:</strong> هناك منتجات تجاوزت
      نسبة الفاقد بها 15% خلال هذه الفترة:
      <ul>
        <li v-for="item in highWastageItems" :key="item.id">
          {{ item.name }} (نسبة الفاقد: {{ computeWastePct(item).toFixed(1) }}%) - الهدر الفعلي:
          {{ item.actual_waste }} {{ item.unit }}
        </li>
      </ul>
    </div>

    <!-- Wastage Table -->
    <div class="card table-card">
      <div v-if="loadingWastage" class="loading-state">⏳ جاري حساب الهدر والفواقد...</div>
      <div v-else-if="!wastageReport.length" class="empty-state">
        <AppIcon name="trash" :size="48" />
        <p>لا توجد حركات استهلاك أو تسويات هدر خلال الفترة المحددة</p>
      </div>
      <div v-else class="table-wrap">
        <table class="costs-table">
          <thead>
            <tr>
              <th>اسم الخامة / المنتج</th>
              <th>التصنيف</th>
              <th>الوحدة</th>
              <th>الاستهلاك النظري (المبيعات والإنتاج)</th>
              <th>الهدر والفاقد الفعلي (التسويات)</th>
              <th>إجمالي المنصرف والضائع</th>
              <th>نسبة الهدر</th>
              <th>حالة الهدر</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in wastageReport" :key="row.id">
              <td>
                <strong>{{ row.name }}</strong>
              </td>
              <td>
                <span class="category-badge">{{ row.category || '—' }}</span>
              </td>
              <td>{{ unitLabel(row.unit) }}</td>
              <td class="number-cell">{{ formatQty(row.theoretical_consumption) }}</td>
              <td class="number-cell text-danger">{{ formatQty(row.actual_waste) }}</td>
              <td class="number-cell">
                {{ formatQty(row.theoretical_consumption + row.actual_waste) }}
              </td>
              <td class="price-cell text-bold">{{ computeWastePct(row).toFixed(1) }}%</td>
              <td>
                <span :class="['waste-badge', wasteStatusClass(row)]">
                  {{ wasteStatusLabel(row) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { reports as reportsApi } from '@/api';

/**
 * تبويب تقرير الهدر والفواقد — يحمّل التقرير داخلياً حسب الفلاتر.
 *
 * @props formatQty — تنسيق الكميات
 * @props unitLabel — تسمية الوحدة
 */
defineProps<{
  formatQty: (_v: any) => string;
  unitLabel: (_u: any) => string;
}>();

// ─── state ────────────────────────────────────────────────────────────────────
const wastageReport = ref<any[]>([]);
const loadingWastage = ref(false);
const wastageFromDate = ref('');
const wastageToDate = ref('');

// ─── helpers ──────────────────────────────────────────────────────────────────
const computeWastePct = (row: any) => {
  const theoretical = Number(row.theoretical_consumption || 0);
  const waste = Number(row.actual_waste || 0);
  const total = theoretical + waste;
  if (!total) return 0;
  return (waste / total) * 100;
};

const wasteStatusLabel = (row: any) => {
  const pct = computeWastePct(row);
  if (pct < 5) return 'ممتاز (آمن)';
  if (pct < 15) return 'مقبول (متوسط)';
  return 'مرتفع (خطر )';
};

const wasteStatusClass = (row: any) => {
  const pct = computeWastePct(row);
  if (pct < 5) return 'waste-safe';
  if (pct < 15) return 'waste-warning';
  return 'waste-danger';
};

const highWastageItems = computed(() => {
  return wastageReport.value.filter((row: any) => computeWastePct(row) >= 15);
});

// ─── data loading ─────────────────────────────────────────────────────────────
const loadWastageReport = async () => {
  loadingWastage.value = true;
  try {
    const res = await reportsApi('wastage', {
      from_date: wastageFromDate.value || null,
      to_date: wastageToDate.value || null,
    });
    wastageReport.value = res.data || [];
  } catch (e: any) {
    console.error('فشل تحميل تقرير الهدر:', e.message);
  } finally {
    loadingWastage.value = false;
  }
};

watch([wastageFromDate, wastageToDate], loadWastageReport);

onMounted(loadWastageReport);
</script>

<style lang="scss" scoped>
@import './costsTable.css';

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.animate-fade-in {
  animation: fadeIn 0.25s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filters-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  .filter-group {
    flex: 1;
    min-width: 160px;
  }
  select {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    font-size: 0.9rem;
  }
}

.alert {
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 20px;
  &.alert-danger {
    background: rgba(180, 35, 24, 0.06);
    border: 1px solid rgba(180, 35, 24, 0.2);
    color: #b42318;
  }
}

/* Wastage view styling */
.inline-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 6px;
  display: block;
}
.date-input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  width: 100%;
}
.reset-group {
  display: flex;
  align-items: flex-end;
}

.waste-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  &.waste-safe {
    background: rgba(46, 125, 79, 0.1);
    color: #2e7d4f;
  }
  &.waste-warning {
    background: rgba(245, 158, 11, 0.1);
    color: #b45309;
  }
  &.waste-danger {
    background: rgba(180, 35, 24, 0.1);
    color: #b42318;
  }
}
</style>
