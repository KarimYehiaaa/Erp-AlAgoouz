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
      <RunwayTab v-if="activeTab === 'runway'" :items="filteredRunway" />
      <SalesForecastTab
        v-else-if="activeTab === 'sales'"
        :items="filteredSales"
        :next-days-labels="nextDaysLabels"
      />
      <IngredientsForecastTab
        v-else-if="activeTab === 'ingredients'"
        :items="filteredIngredients"
        :next-days-labels="nextDaysLabels"
      />
      <StaffingTab
        v-else-if="activeTab === 'staffing'"
        :peak-hours="peakHours"
        :weekly-density="weeklyDensity"
      />
      <PricingTab v-else-if="activeTab === 'pricing'" :items="filteredPricingAlerts" />
      <CashflowTab
        v-else-if="activeTab === 'cashflow'"
        :cashflow-data="cashflowData"
        :search-term="searchTerm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { forecasting as forecastingApi, warehouses as warehousesApi } from '@/api';
import RunwayTab from '@/components/forecasting/RunwayTab.vue';
import SalesForecastTab from '@/components/forecasting/SalesForecastTab.vue';
import IngredientsForecastTab from '@/components/forecasting/IngredientsForecastTab.vue';
import StaffingTab from '@/components/forecasting/StaffingTab.vue';
import PricingTab from '@/components/forecasting/PricingTab.vue';
import CashflowTab from '@/components/forecasting/CashflowTab.vue';

// --- helpers for dates ---
const getNext7DaysLabels = () => {
  const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const labels: { weekday: string; date: string }[] = [];
  const today = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    labels.push({
      weekday: weekdays[d.getDay()]!,
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

// Cash flow states
const cashflowData = ref<any>(null);

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
const filterBySearch = (items: any[]) => {
  const q = searchTerm.value.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item: any) =>
      item.name_ar.toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.category_name || '').toLowerCase().includes(q),
  );
};

const filteredRunway = computed(() => filterBySearch(inventoryRunway.value));
const filteredSales = computed(() => filterBySearch(salesForecast.value));
const filteredIngredients = computed(() => filterBySearch(ingredientsForecast.value));
const filteredPricingAlerts = computed(() => filterBySearch(pricingAlerts.value));

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
      selectedWarehouse.value = storeWh ? storeWh.id : warehouseList.value[0]!.id;
    }
  } catch (err: any) {
    console.error('Failed to load warehouses:', err);
  }
};

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
</style>
