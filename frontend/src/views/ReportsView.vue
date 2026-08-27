<template>
  <div class="reports-page">
    <!-- Header -->
    <div class="reports-header card">
      <div class="header-title">
        <span class="header-icon"></span>
        <div>
          <h2>التقارير الشاملة</h2>
          <p>ملخص كامل لكل أقسام النظام — مبيعات، مخزون، أرباح، مصروفات، عملاء، مشتريات</p>
        </div>
      </div>
      <div class="header-filters">
        <div class="form-group">
          <label>من</label>
          <input v-model="filters.from_date" type="date" />
        </div>
        <div class="form-group">
          <label>إلى</label>
          <input v-model="filters.to_date" type="date" />
        </div>
        <div class="form-group month-picker-group">
          <label>&nbsp;</label>
          <div class="month-filter-btn" title="اختر الشهر بالكامل">
            <AppIcon name="calendar" :size="18" />
            <input type="month" class="month-picker-overlay" @change="selectMonth" />
          </div>
        </div>
        <div class="quick-dates">
          <button @click="setQuick('today')">اليوم</button>
          <button @click="setQuick('week')">أسبوع</button>
          <button @click="setQuick('month')">شهر</button>
          <button @click="setQuick('year')">سنة</button>
          <button @click="setQuick('all')">الكل</button>
        </div>
        <button class="btn btn-primary" :disabled="loading" @click="loadActiveTab">
          {{ loading ? '⏳' : ' تحديث' }}
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="report-tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        :class="['tab-btn', { active: activeTab === t.id }]"
        @click="loadTab(t.id)"
      >
        <span class="tab-icon">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>
    <div v-if="loading" class="loading-state card">⏳ جاري تحميل التقرير...</div>

    <!-- ===== TAB COMPONENTS ===== -->
    <SummaryTab
      v-if="!loading && activeTab === 'summary'"
      :summary="summary"
      :profit-margin-pct="profitMarginPct"
    />
    <ProfitLossTab
      v-if="activeTab === 'pl'"
      :pl-data="plData"
      :pl-trend="plTrend"
      :pl-loading="plLoading"
      :pl-error="plError"
      @retry="loadTab('pl')"
    />
    <SalesTab
      v-if="!loading && activeTab === 'sales'"
      :rows="filteredSalesRows"
      :filter="salesFilter"
      :total="salesTotal"
      :profit="salesProfit"
      :count="salesCount"
      @filter="salesFilter = $event"
    />
    <InventoryTab
      v-if="!loading && activeTab === 'inventory'"
      :inventory="reportData.inventory"
      :low-stock="lowStockProducts"
      :low-stock-count="lowStockCount"
      :total-value="totalInventoryValue"
    />
    <ProfitTab
      v-if="!loading && activeTab === 'profit'"
      :profit="reportData.profit"
      :total-revenue="profitTotalRevenue"
      :total-cost="profitTotalCost"
      :total-net="profitTotalNet"
    />
    <ExpensesTab
      v-if="!loading && activeTab === 'expenses'"
      :expenses="reportData.expenses"
      :total="expensesTotal"
      :count="expensesCount"
    />
    <PurchasesTab v-if="!loading && activeTab === 'purchases'" :purchases="reportData.purchases" />
    <CustomersTab
      v-if="!loading && activeTab === 'customers'"
      :customers="reportData.customers"
      :total="customersTotal"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import AppIcon from '@/components/AppIcon.vue';
import { useReportsData } from '@/composables/useReportsData';
import SummaryTab from '@/components/reports/SummaryTab.vue';
import ProfitLossTab from '@/components/reports/ProfitLossTab.vue';
import SalesTab from '@/components/reports/SalesTab.vue';
import InventoryTab from '@/components/reports/InventoryTab.vue';
import ProfitTab from '@/components/reports/ProfitTab.vue';
import ExpensesTab from '@/components/reports/ExpensesTab.vue';
import PurchasesTab from '@/components/reports/PurchasesTab.vue';
import CustomersTab from '@/components/reports/CustomersTab.vue';

const {
  tabs,
  activeTab,
  loading,
  error,
  summary,
  salesFilter,
  reportData,
  plData,
  plTrend,
  plLoading,
  plError,
  filters,
  selectMonth,
  setQuick,
  profitMarginPct,
  filteredSalesRows,
  salesTotal,
  salesProfit,
  salesCount,
  lowStockProducts,
  lowStockCount,
  totalInventoryValue,
  profitTotalRevenue,
  profitTotalCost,
  profitTotalNet,
  expensesTotal,
  expensesCount,
  customersTotal,
  loadTab,
  loadActiveTab,
} = useReportsData();

onMounted(() => loadTab('summary'));
</script>

<style lang="scss" scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Header */
.reports-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
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
      font-size: 1.3rem;
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
    align-items: flex-end;
    gap: 10px;
    flex-wrap: wrap;
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      label {
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 700;
      }
      input {
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg);
        font-size: 0.88rem;
      }
    }
    .month-picker-group {
      border: none !important;
      background: transparent !important;
      padding: 0 !important;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .month-filter-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      cursor: pointer;
      transition: all 0.2s;
    }
    .month-filter-btn:hover {
      background: var(--bg-hover);
      border-color: var(--primary);
      color: var(--primary);
    }
    .month-picker-overlay {
      position: absolute;
      inset: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
  }
  .quick-dates {
    display: flex;
    gap: 4px;
    button {
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-muted);
      transition: var(--transition);
      &:hover {
        border-color: var(--primary);
        color: var(--primary-dark);
      }
    }
  }
}

/* Tabs */
.report-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.88rem;
    transition: var(--transition);
    .tab-icon {
      font-size: 1rem;
    }
    &:hover {
      border-color: var(--primary-soft);
    }
    &.active {
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
      color: #fff;
      border-color: transparent;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 35%, transparent);
    }
  }
}

/* Misc */
.loading-state {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 1rem;
}
.error-msg {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  padding: 10px 14px;
  border-radius: var(--radius-sm);
}

@media (max-width: 700px) {
  .reports-header {
    flex-direction: column;
  }
  .header-filters {
    width: 100%;
  }
}
</style>
