<template>
  <div class="forecasting-page">
    <!-- Header -->
    <div class="page-header card">
      <div class="header-title">
        <span class="header-icon">🧠</span>
        <div>
          <h2>التنبؤ الذكي وتحليل الطلب</h2>
          <p>
            توقعات المبيعات المدعومة بالذكاء الاصطناعي الإحصائي، واستهلاك المواد الخام وجدول التزود
            بالمخزون
          </p>
        </div>
      </div>

      <!-- Filters (Warehouse) -->
      <div class="header-filters">
        <div class="form-group">
          <label>المخزن المستهدف للتحليل</label>
          <select
            v-model="selectedWarehouse"
            @change="loadForecast"
            class="warehouse-select"
            :disabled="loading"
          >
            <option v-for="w in warehouseList" :key="w.id" :value="w.id">{{ w.name_ar }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Alert Banner (Critical Stock Runway) -->
    <div v-if="criticalAlerts.length" class="alert-banner card danger">
      <div class="alert-banner-icon">⚠️</div>
      <div class="alert-banner-body">
        <h4>تنبيه مخزون حرج! أصناف تقترب من النفاد</h4>
        <p>
          التحليل يتوقع نفاد مخزون الأصناف التالية خلال أقل من 7 أيام بناءً على معدلات الطلب
          الحالية:
        </p>
        <div class="alert-badges">
          <span v-for="item in criticalAlerts" :key="item.product_id" class="critical-badge">
            {{ item.name_ar }} (ينفد خلال {{ item.runway_days }}
            {{ item.runway_days === 1 ? 'يوم' : 'أيام' }})
          </span>
        </div>
      </div>
    </div>

    <!-- Stats Summary cards -->
    <div class="grid grid-3 stats-row">
      <div class="card summary-card danger-stat">
        <div class="summary-card-body">
          <span class="stat-icon">🚨</span>
          <div class="stat-meta">
            <h3>{{ criticalAlerts.length }} أصناف</h3>
            <p>معرضة للنفاد هذا الأسبوع</p>
          </div>
        </div>
      </div>
      <div class="card summary-card warning-stat">
        <div class="summary-card-body">
          <span class="stat-icon">⚠️</span>
          <div class="stat-meta">
            <h3>{{ warningAlerts.length }} أصناف</h3>
            <p>مخزونها يكفي بين 7 و 15 يوماً</p>
          </div>
        </div>
      </div>
      <div class="card summary-card success-stat">
        <div class="summary-card-body">
          <span class="stat-icon">✅</span>
          <div class="stat-meta">
            <h3>{{ safeCount }} أصناف</h3>
            <p>مستقرة وتكفي لأكثر من 15 يوماً</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs Layout -->
    <div class="tabs-wrap">
      <div class="tabs">
        <button
          type="button"
          :class="{ active: activeTab === 'runway' }"
          @click="activeTab = 'runway'"
        >
          🎛️ مؤشر نفاد المخزون (Runway)
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'sales' }"
          @click="activeTab = 'sales'"
        >
          📈 توقع طلب المنتجات (7 أيام)
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'ingredients' }"
          @click="activeTab = 'ingredients'"
        >
          📦 توقع استهلاك المكونات (7 أيام)
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'staffing' }"
          @click="activeTab = 'staffing'"
        >
          ⏳ أوقات الذروة والشيفتات
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'pricing' }"
          @click="activeTab = 'pricing'"
        >
          💰 هوامش الربح والتسعير الذكي
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'cashflow' }"
          @click="activeTab = 'cashflow'"
        >
          💵 توقع التدفقات النقدية
        </button>
      </div>

      <!-- General Search filter -->
      <div class="search-bar">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="البحث بالاسم أو الكود في الجدول الحالي..."
          class="search-input"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="card loading-state">
      <div class="spinner"></div>
      <p>جاري سحب البيانات التاريخية للمبيعات وحساب معادلات التنبؤ وتحليل المخزون...</p>
    </div>

    <!-- Tabs Content -->
    <div v-else class="tab-content">
      <!-- TAB 1: RUNWAY -->
      <div v-if="activeTab === 'runway'" class="card table-card">
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
              <tr
                v-for="item in filteredRunway"
                :key="item.product_id"
                :class="getRowClass(item.runway_days)"
              >
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
              <tr v-if="!filteredRunway.length">
                <td colspan="7" class="empty">لا توجد أصناف مطابقة للبحث</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: SALES FORECAST -->
      <div v-if="activeTab === 'sales'" class="card table-card">
        <h3>📈 توقع طلب مبيعات المنتجات (الـ 7 أيام القادمة)</h3>
        <p class="section-desc">
          تقدير الكميات المطلوبة لكل منتج نهائي مباع خلال الأسبوع القادم، مع مراعاة العوامل الموسمية
          لكل يوم من أيام الأسبوع.
        </p>

        <div class="table-wrap">
          <table class="forecast-table">
            <thead>
              <tr>
                <th>كود المنتج</th>
                <th>المنتج</th>
                <th>التصنيف</th>
                <th v-for="(day, idx) in nextDaysLabels" :key="idx" class="center-col">
                  {{ day.weekday }} <br /><span class="muted">{{ day.date }}</span>
                </th>
                <th class="total-col">إجمالي 7 أيام</th>
                <th class="total-col">إجمالي 30 يوم</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredSales" :key="item.product_id">
                <td>
                  <code>{{ item.sku }}</code>
                </td>
                <td class="font-bold">{{ item.name_ar }}</td>
                <td class="muted">{{ item.category_name || '—' }}</td>
                <td
                  v-for="(val, idx) in item.daily_forecast"
                  :key="idx"
                  class="center-col font-bold"
                >
                  {{ val }}
                </td>
                <td class="total-col font-bold primary-color">{{ item.forecast_7d }}</td>
                <td class="total-col font-bold secondary-color">{{ item.forecast_30d }}</td>
              </tr>
              <tr v-if="!filteredSales.length">
                <td colspan="10" class="empty">
                  لا توجد أصناف مطابقة للبحث أو لا توجد توقعات مبيعات نشطة حالياً
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 3: INGREDIENTS FORECAST -->
      <div v-if="activeTab === 'ingredients'" class="card table-card">
        <h3>📦 توقع استهلاك المكونات والمواد الخام (الـ 7 أيام القادمة)</h3>
        <p class="section-desc">
          يحسب كمية المكونات والمواد الخام (مثل البن، الحليب، الأكواب، السكر) المطلوبة لتلبية
          الفواتير المتوقعة للأسبوع القادم.
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
              <tr v-for="item in filteredIngredients" :key="item.product_id">
                <td>
                  <code>{{ item.sku }}</code>
                </td>
                <td class="font-bold">{{ item.name_ar }}</td>
                <td class="muted">{{ item.category_name || '—' }}</td>
                <td
                  v-for="(val, idx) in item.daily_forecast"
                  :key="idx"
                  class="center-col font-bold"
                >
                  {{ val }}
                </td>
                <td class="total-col font-bold primary-color">
                  {{ item.forecast_7d }} {{ item.unit }}
                </td>
                <td class="total-col font-bold secondary-color">
                  {{ item.forecast_30d }} {{ item.unit }}
                </td>
              </tr>
              <tr v-if="!filteredIngredients.length">
                <td colspan="10" class="empty">
                  لا توجد أصناف مطابقة للبحث أو لا توجد وصفات نشطة تستهلك مكونات حالياً
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 4: STAFFING FORECAST (PEAK HOURS) -->
      <div v-if="activeTab === 'staffing'" class="card table-card">
        <h3>⏳ تحليل فترات الازدحام وتوقعات العمالة (Peak Hours & Staffing)</h3>
        <p class="section-desc">
          تحليل الكثافة التشغيلية ساعة بساعة بناءً على معاملات الـ 90 يوماً الماضية، لتحديد ساعات
          الذروة وتوزيع الموظفين الأنسب.
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
                <span
                  >العمالة المقترحة:
                  <strong
                    >{{ peak.recommended_staff }}
                    {{ peak.recommended_staff > 2 ? 'موظفين' : 'موظف' }}</strong
                  ></span
                >
              </div>
            </div>
          </div>
        </div>

        <div class="day-selector-row">
          <label>عرض الكثافة التفصيلية ليوم:</label>
          <div class="day-buttons">
            <button
              v-for="(dayName, idx) in [
                'الأحد',
                'الإثنين',
                'الثلاثاء',
                'الأربعاء',
                'الخميس',
                'الجمعة',
                'السبت',
              ]"
              :key="idx"
              type="button"
              class="day-btn"
              :class="{ active: selectedStaffDay === idx }"
              @click="selectedStaffDay = idx"
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
              <tr v-for="hourItem in getStaffDayData(selectedStaffDay)" :key="hourItem.hour">
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
              <tr v-if="!getStaffDayData(selectedStaffDay).length">
                <td colspan="5" class="empty">لا توجد بيانات ازدحام مسجلة لهذا اليوم حالياً</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 5: SMART PRICING -->
      <div v-if="activeTab === 'pricing'" class="card table-card">
        <h3>💰 هوامش الأرباح والتسعير الذكي (Margin Analyzer)</h3>
        <p class="section-desc">
          تحليل تكلفة المواد الخام المكونة لكل صنف ومقارنتها بسعر البيع الحالي لتحديد الأصناف ذات
          الهامش المنخفض واقتراح سعر بيع يحقق هامش الربح المستهدف (60%).
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
              <tr
                v-for="alert in filteredPricingAlerts"
                :key="alert.product_id"
                :class="'pricing-row-' + alert.status"
              >
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
              <tr v-if="!filteredPricingAlerts.length">
                <td colspan="9" class="empty">لا توجد منتجات تطابق البحث</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 6: CASH FLOW RUNWAY PROJECTION -->
      <div v-if="activeTab === 'cashflow'" class="card table-card">
        <h3>💵 توقع التدفقات النقدية والسيولة (Cash Flow Runway)</h3>
        <p class="section-desc">
          تقدير السيولة النقدية المتوفرة للـ 30 يوماً القادمة بناءً على متوسطات المبيعات اليومية
          التاريخية، مقارنةً بمتوسط المصاريف والمشتريات اليومية.
        </p>

        <div v-if="cashflowData" class="cashflow-dashboard">
          <!-- Mini stats inside cashflow tab -->
          <div class="grid grid-4 cashflow-mini-stats">
            <div class="card mini-stat-card">
              <span class="mini-icon">💰</span>
              <div class="mini-meta">
                <h4>السيولة الحالية</h4>
                <p class="font-bold">{{ formatMoney(cashflowData.currentBalance) }}</p>
              </div>
            </div>
            <div class="card mini-stat-card">
              <span class="mini-icon">📊</span>
              <div class="mini-meta">
                <h4>الرصيد المتوقع (30 يوم)</h4>
                <p
                  class="font-bold"
                  :class="cashflowData.projectedBalance30d < 0 ? 'text-danger' : 'text-success'"
                >
                  {{ formatMoney(cashflowData.projectedBalance30d) }}
                </p>
              </div>
            </div>
            <div class="card mini-stat-card">
              <span class="mini-icon">🔄</span>
              <div class="mini-meta">
                <h4>صافي التغيير المتوقع</h4>
                <p
                  class="font-bold"
                  :class="cashflowData.netChange < 0 ? 'text-danger' : 'text-success'"
                >
                  {{ cashflowData.netChange > 0 ? '+' : ''
                  }}{{ formatMoney(cashflowData.netChange) }}
                </p>
              </div>
            </div>
            <div class="card mini-stat-card">
              <span class="mini-icon">⏳</span>
              <div class="mini-meta">
                <h4>أيام البقاء الآمن (Runway)</h4>
                <p
                  class="font-bold"
                  :class="
                    cashflowData.runwayDays !== null ? 'text-danger animate-pulse' : 'text-success'
                  "
                >
                  {{
                    cashflowData.runwayDays !== null
                      ? `${cashflowData.runwayDays} يوم`
                      : 'مستقر (30+ يوم)'
                  }}
                </p>
              </div>
            </div>
          </div>

          <!-- Alert banner inside cashflow tab -->
          <div class="cashflow-alert-bar" :class="'status-' + cashflowData.status">
            <span class="alert-icon">
              {{
                cashflowData.status === 'healthy'
                  ? '✅'
                  : cashflowData.status === 'warning'
                    ? '⚠️'
                    : '🚨'
              }}
            </span>
            <p class="alert-text">{{ cashflowData.warningMsg }}</p>
          </div>

          <!-- Chart container -->
          <div
            class="chart-container"
            style="position: relative; height: 320px; margin-bottom: 24px; width: 100%"
          >
            <canvas id="cashFlowChart" ref="cashFlowChartCanvas"></canvas>
          </div>

          <!-- Table of daily points -->
          <div class="table-wrap">
            <table class="forecast-table">
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th>التاريخ</th>
                  <th>الوارد المتوقع (إيراد مبيعات)</th>
                  <th>الصادر المتوقع (مصاريف + مشتريات)</th>
                  <th>صافي التدفق اليومي</th>
                  <th>الرصيد التراكمي المتوقع</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="point in filteredCashflowPoints"
                  :key="point.date"
                  :class="point.balance < 0 ? 'row-critical' : ''"
                >
                  <td class="font-bold">{{ point.day_name }}</td>
                  <td class="muted">{{ formatDate(point.date) }}</td>
                  <td class="text-success font-bold">+{{ formatMoney(point.projected_in) }}</td>
                  <td class="text-danger font-bold">-{{ formatMoney(point.projected_out) }}</td>
                  <td
                    class="font-bold"
                    :class="
                      point.projected_in - point.projected_out < 0 ? 'text-danger' : 'text-success'
                    "
                  >
                    {{ point.projected_in - point.projected_out > 0 ? '+' : ''
                    }}{{ formatMoney(point.projected_in - point.projected_out) }}
                  </td>
                  <td class="font-bold amount">{{ formatMoney(point.balance) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else class="empty">لا تتوفر بيانات توقعات التدفق المالي حالياً.</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { forecasting as forecastingApi, warehouses as warehousesApi } from '@/api';
import { formatMoney } from '@/utils/currency';

// --- helpers for dates ---
const getNext7DaysLabels = () => {
  const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const labels = [];
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    labels.push({
      weekday: weekdays[d.getDay()],
      date: `${d.getDate()}/${d.getMonth() + 1}`,
    });
  }
  return labels;
};

// --- state ---
const loading = ref(false);
const activeTab = ref('runway');
const searchTerm = ref('');
const selectedWarehouse = ref(1);
const warehouseList = ref<any[]>([]);
const nextDaysLabels = getNext7DaysLabels();

// API data response
const salesForecast = ref<any[]>([]);
const ingredientsForecast = ref<any[]>([]);
const inventoryRunway = ref<any[]>([]);

// New AI and statistics states
const weeklyDensity = ref<Record<string, any>>({});
const peakHours = ref<any[]>([]);
const pricingAlerts = ref<any[]>([]);
const selectedStaffDay = ref(new Date().getDay());

// Cash flow states
const cashflowData = ref<any>(null);
const cashFlowChartCanvas = ref<any>(null);
let cashFlowChartInstance: any = null;
let ChartLib: any = null;

// --- computed stats ---
const criticalAlerts = computed(() =>
  inventoryRunway.value.filter((item: any) => item.runway_days <= 7),
);

const warningAlerts = computed(() =>
  inventoryRunway.value.filter((item: any) => item.runway_days > 7 && item.runway_days <= 15),
);

const safeCount = computed(
  () => inventoryRunway.value.filter((item: any) => item.runway_days > 15).length,
);

// --- search filters ---
const filteredRunway = computed(() => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return inventoryRunway.value;
  return inventoryRunway.value.filter(
    (item: any) =>
      item.name_ar.toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.category_name || '').toLowerCase().includes(q),
  );
});

const filteredSales = computed(() => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return salesForecast.value;
  return salesForecast.value.filter(
    (item: any) =>
      item.name_ar.toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.category_name || '').toLowerCase().includes(q),
  );
});

const filteredIngredients = computed(() => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return ingredientsForecast.value;
  return ingredientsForecast.value.filter(
    (item: any) =>
      item.name_ar.toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.category_name || '').toLowerCase().includes(q),
  );
});

const filteredPricingAlerts = computed(() => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return pricingAlerts.value;
  return pricingAlerts.value.filter(
    (item: any) =>
      item.name_ar.toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.category_name || '').toLowerCase().includes(q),
  );
});

const filteredCashflowPoints = computed(() => {
  const points = cashflowData.value?.dailyPoints || [];
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return points;
  return points.filter(
    (p: any) => p.day_name.toLowerCase().includes(q) || p.date.toLowerCase().includes(q),
  );
});

// --- helper UI styling functions ---
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

// Staffing specific helpers
const getStaffDayData = (dayIdx: any) => {
  const data = [];
  const dayDensity = weeklyDensity.value[dayIdx];
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
};

const getTrafficBadgeClass = (level: any) => {
  if (level === 'مرتفع') return 'badge-danger';
  if (level === 'متوسط') return 'badge-warning';
  return 'badge-success';
};

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

// --- data loaders ---
const loadForecast = async () => {
  loading.value = true;
  try {
    const res = await forecastingApi.get({ warehouse_id: selectedWarehouse.value });
    salesForecast.value = res.data?.salesForecast || [];
    ingredientsForecast.value = res.data?.ingredientsForecast || [];
    inventoryRunway.value = res.data?.inventoryRunway || [];

    // Load staffing density
    try {
      const staffingRes = await forecastingApi.getStaffingForecast({
        warehouse_id: selectedWarehouse.value,
      });
      weeklyDensity.value = staffingRes.data?.weeklyDensity || {};
      peakHours.value = staffingRes.data?.peakHours || [];
    } catch (err: any) {
      console.error('Failed to load staffing forecast:', err);
    }

    // Load pricing alerts
    try {
      const pricingRes = await forecastingApi.getSmartPricingAlerts();
      pricingAlerts.value = pricingRes.data || [];
    } catch (err: any) {
      console.error('Failed to load pricing alerts:', err);
    }

    // Load cashflow projection
    try {
      const cashflowRes = await forecastingApi.getCashFlowProjection({
        warehouse_id: selectedWarehouse.value,
      });
      cashflowData.value = cashflowRes.data || null;
      if (activeTab.value === 'cashflow') {
        nextTick(() => {
          renderCashFlowChart();
        });
      }
    } catch (err: any) {
      console.error('Failed to load cashflow projection:', err);
    }
  } catch (err: any) {
    console.error('Failed to load forecasting data:', err);
    alert('فشل سحب توقعات المبيعات والمخزون: ' + (err.message || 'خطأ سيرفر'));
  } finally {
    loading.value = false;
  }
};

const loadWarehouses = async () => {
  try {
    const res = await warehousesApi();
    warehouseList.value = res.data || [];
    if (warehouseList.value.length > 0) {
      // Find default warehouse STORE or choose the first one
      const storeWh = warehouseList.value.find(
        (w: any) => w.code === 'STORE' || w.name_ar.includes('فرع') || w.name_ar.includes('محل'),
      );
      selectedWarehouse.value = storeWh ? storeWh.id : warehouseList.value[0].id;
    }
  } catch (err: any) {
    console.error('Failed to load warehouses:', err);
  }
};

// Date formatter helper
const formatDate = (value: any) => {
  if (!value) return 'غير محدد';
  const raw = String(value).split('T')[0]!;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-') as [string, string, string];
    return `${day}/${month}/${year}`;
  }
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

// Chart.js dynamic loader
const loadChartLib = async () => {
  if (ChartLib) return ChartLib;
  const mod = await import('chart.js');
  ChartLib = mod.Chart;
  ChartLib.register(...mod.registerables);
  return ChartLib;
};

// Cash flow chart renderer
const renderCashFlowChart = async () => {
  if (!cashFlowChartCanvas.value || !cashflowData.value) return;

  if (cashFlowChartInstance) {
    cashFlowChartInstance.destroy();
    cashFlowChartInstance = null;
  }

  const Chart = await loadChartLib();
  const ctx = cashFlowChartCanvas.value.getContext('2d');

  const points = cashflowData.value.dailyPoints || [];
  const labels = points.map((p: any) => formatDate(p.date));
  const balances = points.map((p: any) => p.balance);

  const colors = {
    primary:
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#176b5b',
    grid: 'rgba(102,112,133,0.18)',
  };

  const makeGradient = (canvas: any, color: any, opacityStart = 0.35, opacityEnd = 0.01) => {
    if (!canvas) return color;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 250);
    grad.addColorStop(0, colorMix(color, opacityStart));
    grad.addColorStop(1, colorMix(color, opacityEnd));
    return grad;
  };

  const colorMix = (color: any, opacity: any) => {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  };

  const chartGradient = makeGradient(cashFlowChartCanvas.value, colors.primary, 0.3, 0.01);

  cashFlowChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'رصيد السيولة المتوقع (ج.م)',
          data: balances,
          borderColor: colors.primary,
          backgroundColor: chartGradient,
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2.5,
          hoverBackgroundColor: colors.primary,
          hoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            usePointStyle: true,
            font: {
              family: 'Outfit, Cairo, sans-serif',
            },
          },
        },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          callbacks: {
            label: (context: any) => `${context.dataset.label}: ${formatMoney(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: {
              family: 'Outfit, Cairo, sans-serif',
            },
          },
        },
        y: {
          beginAtZero: false,
          grid: {
            color: colors.grid,
          },
          ticks: {
            font: {
              family: 'Outfit, Cairo, sans-serif',
            },
            callback: (val: any) => formatMoney(val),
          },
        },
      },
    },
  });
};

watch(activeTab, (newTab: any) => {
  if (newTab === 'cashflow') {
    nextTick(() => {
      renderCashFlowChart();
    });
  }
});

onMounted(async () => {
  await loadWarehouses();
  await loadForecast();
});
</script>

<style lang="scss" scoped>
.forecasting-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;

  .header-title {
    display: flex;
    align-items: center;
    gap: 14px;
    .header-icon {
      font-size: 2.2rem;
    }
    h2 {
      margin: 0;
      font-size: 1.35rem;
      color: var(--primary-dark);
    }
    p {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
  }

  .header-filters {
    display: flex;
    align-items: center;
    .warehouse-select {
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      font-weight: 700;
      color: var(--text);
      cursor: pointer;
      min-width: 180px;
    }
  }
}

/* Alert Banner */
.alert-banner {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px;
  border-right: 4px solid var(--danger);

  &.danger {
    background: rgba(180, 35, 24, 0.06);
    border-color: var(--danger);
  }

  .alert-banner-icon {
    font-size: 1.8rem;
    line-height: 1;
  }

  .alert-banner-body {
    h4 {
      margin: 0 0 6px;
      color: var(--danger);
      font-size: 0.95rem;
      font-weight: 900;
    }
    p {
      margin: 0 0 10px;
      font-size: 0.84rem;
      color: var(--text);
    }
  }

  .alert-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .critical-badge {
    background: var(--danger);
    color: #fff;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 0.76rem;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(180, 35, 24, 0.2);
  }
}

/* Summary stats */
.stats-row {
  .summary-card {
    padding: 16px;
    display: flex;
    align-items: center;

    .summary-card-body {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .stat-icon {
      font-size: 2.2rem;
    }

    .stat-meta {
      h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 900;
      }
      p {
        margin: 2px 0 0;
        font-size: 0.78rem;
        color: var(--text-muted);
      }
    }

    &.danger-stat {
      border-right: 3px solid var(--danger);
      h3 {
        color: var(--danger);
      }
    }
    &.warning-stat {
      border-right: 3px solid var(--warning);
      h3 {
        color: var(--warning);
      }
    }
    &.success-stat {
      border-right: 3px solid var(--success);
      h3 {
        color: var(--success);
      }
    }
  }
}

/* Tabs & Search Wrap */
.tabs-wrap {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 2px;

  .tabs {
    display: flex;
    gap: 4px;

    button {
      padding: 10px 16px;
      border: 0;
      border-bottom: 3px solid transparent;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-weight: 700;
      font-size: 0.88rem;
      transition: all 0.2s ease;

      &:hover {
        color: var(--primary);
      }

      &.active {
        color: var(--primary-dark);
        border-color: var(--primary);
      }
    }
  }

  .search-bar {
    .search-input {
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      min-width: 260px;
      font-size: 0.85rem;
      background: var(--bg-card);
      color: var(--text);

      &:focus {
        outline: none;
        border-color: var(--primary);
      }
    }
  }
}

/* Tables styling */
.table-card {
  padding: 20px;

  h3 {
    margin: 0 0 6px;
    color: var(--primary-dark);
    font-size: 1.1rem;
  }
  .section-desc {
    margin: 0 0 16px;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
}

.forecast-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;

  th,
  td {
    padding: 12px 14px;
    text-align: right;
    border-bottom: 1px solid var(--border);
  }

  th {
    background: var(--bg);
    font-weight: 700;
    color: var(--text-muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }

  td.font-bold {
    font-weight: 700;
    color: var(--text-strong);
  }
  td.muted {
    color: var(--text-muted);
  }
  td.amount {
    color: var(--primary-dark);
  }

  .center-col {
    text-align: center;
  }
  .total-col {
    text-align: center;
    background: color-mix(in srgb, var(--primary) 3%, transparent);
  }

  .primary-color {
    color: var(--primary-dark);
  }
  .secondary-color {
    color: var(--accent);
  }

  tr.row-critical {
    background: rgba(180, 35, 24, 0.02);
    td {
      color: var(--danger);
    }
    code {
      background: rgba(180, 35, 24, 0.08);
      color: var(--danger);
    }
  }
  tr.row-warning {
    background: rgba(217, 119, 6, 0.02);
  }

  code {
    font-family: monospace;
    font-size: 0.78rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--text-muted);
  }

  .empty {
    text-align: center;
    color: var(--text-muted);
    padding: 36px;
    font-size: 0.9rem;
  }
}

/* Progress bar in Runway */
.runway-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;

  .progress-bar-bg {
    flex: 1;
    height: 8px;
    background: var(--border);
    border-radius: 10px;
    overflow: hidden;
    min-width: 80px;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 10px;
    transition: width 0.3s ease;
  }

  .progress-danger {
    background: var(--danger);
  }
  .progress-warning {
    background: var(--warning);
  }
  .progress-info {
    background: var(--primary);
  }
  .progress-success {
    background: var(--success);
  }

  .runway-days-text {
    font-size: 0.78rem;
    white-space: nowrap;
    min-width: 90px;
  }
}

/* Spinner / Loader */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  gap: 16px;

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--border);
    border-top: 4px solid var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  p {
    color: var(--text-muted);
    font-size: 0.9rem;
    max-width: 450px;
    margin: 0;
    line-height: 1.5;
  }
}

/* Peak Hours Tab Styling */
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

/* Pricing Table Styling overrides */
tr.pricing-row-critical {
  background: rgba(220, 38, 38, 0.01);
  td {
    border-bottom-color: rgba(220, 38, 38, 0.1);
  }
}
tr.pricing-row-warning {
  background: rgba(182, 106, 44, 0.01);
  td {
    border-bottom-color: rgba(182, 106, 44, 0.1);
  }
}

.text-danger {
  color: var(--danger) !important;
}
.text-warning {
  color: var(--warning) !important;
}
.text-success {
  color: var(--success) !important;
}
.text-muted {
  color: var(--text-muted) !important;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .tabs-wrap {
    flex-direction: column;
    align-items: stretch;
    .search-bar .search-input {
      min-width: 100%;
    }
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    .header-filters {
      margin-top: 8px;
    }
  }
}

/* Cash flow styles */
.cashflow-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cashflow-mini-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 8px;
}

.mini-stat-card {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);

  .mini-icon {
    font-size: 1.8rem;
  }

  .mini-meta {
    h4 {
      margin: 0;
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    p {
      margin: 4px 0 0;
      font-size: 1.1rem;
      color: var(--text-strong);
    }
  }
}

.cashflow-alert-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius);
  font-size: 0.88rem;
  line-height: 1.4;

  &.status-healthy {
    background: rgba(16, 185, 129, 0.08);
    border-right: 4px solid var(--success);
    color: var(--success);
  }

  &.status-warning {
    background: rgba(245, 158, 11, 0.08);
    border-right: 4px solid var(--warning);
    color: var(--warning);
  }

  &.status-danger {
    background: rgba(239, 68, 68, 0.08);
    border-right: 4px solid var(--danger);
    color: var(--danger);
  }

  .alert-icon {
    font-size: 1.25rem;
  }

  .alert-text {
    margin: 0;
  }
}

.chart-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
