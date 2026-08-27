<!--
  BranchLiquidity.vue — بطاقات مؤشر سيولة واحتياطي الصندوق للفروع (Battery)
  تعرض لكل فرع مؤشر بطارية يوضح مدى تغطية المصاريف التشغيلية
  (المعيار: تغطية 15 يوماً). استُخرجت من DashboardView لتقليل حجمه
  (كان الملف 2,483 سطرًا) — بنفس نمط SalesSummaryCard.
-->
<template>
  <section class="overview-grid" style="margin-top: var(--space-5)">
    <article class="panel chart-panel wide">
      <div class="panel-head">
        <div>
          <h2>
            <AppIcon name="gauge" style="margin-left: 8px; color: var(--primary)" />
            مؤشر سيولة واحتياطي الصندوق للفروع (Branch Liquidity)
          </h2>
          <p>تقييم المخزون المالي الاحتياطي لتغطية المصاريف التشغيلية (المعيار: تغطية 15 يوماً)</p>
        </div>
        <span class="badge badge-success">مؤشر نشط</span>
      </div>
      <div class="branch-liquidity-grid">
        <div v-for="branch in branches" :key="branch.name" class="branch-liquidity-card">
          <div class="branch-info">
            <h3>{{ branch.name }}</h3>
            <span class="cash-value">{{ props.formatMoney(branch.cash) }}</span>
          </div>
          <div class="battery-wrapper">
            <div class="battery-body">
              <div
                class="battery-level"
                :style="{ width: branch.percent + '%', backgroundColor: branch.color }"
              ></div>
            </div>
            <div class="battery-tip"></div>
          </div>
          <div class="branch-meta">
            <span class="days-label"
              >يغطي: <strong>{{ branch.days }} يوم</strong></span
            >
            <span class="status-badge" :style="{ color: branch.color }">{{ branch.status }}</span>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

/**
 * عنصر بيانات فرع واحد لمؤشر السيولة.
 */
export interface BranchLiquidityItem {
  /** اسم الفرع */
  name: string;
  /** الرصيد النقدي الحالي */
  cash: number;
  /** نسبة التغطية (0-100) */
  percent: number;
  /** لون المؤشر حسب الحالة */
  color: string;
  /** عدد أيام التغطية المتوقعة */
  days: number;
  /** وصف الحالة (آمن/متوسط/حرج...) */
  status: string;
}

/**
 * بطاقات مؤشر السيولة للفروع — تستهلك من DashboardView.
 *
 * @props branches     قائمة الفروع `BranchLiquidityItem[]`
 * @props formatMoney  دالة تنسيق المبالغ (تمرر من الأب لضمان تطابق العرض)
 */
const props = defineProps<{
  branches: BranchLiquidityItem[];
  formatMoney: (_value: number | null | undefined) => string;
}>();
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

/*  Branch Liquidity Battery Indicators */
.branch-liquidity-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}
@media (max-width: 1024px) {
  .branch-liquidity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .branch-liquidity-grid {
    grid-template-columns: 1fr;
  }
}

.branch-liquidity-card {
  padding: 16px;
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }
}

.branch-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  h3 {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-strong);
  }
  .cash-value {
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--primary);
  }
}

.battery-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  height: 24px;
  padding-right: 4px;
}

.battery-body {
  flex-grow: 1;
  height: 100%;
  border: 2px solid var(--border-strong);
  border-radius: 5px;
  padding: 2px;
  background: color-mix(in srgb, var(--border) 40%, transparent);
  overflow: hidden;
}

.battery-level {
  height: 100%;
  border-radius: 2px;
  transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.battery-tip {
  width: 4px;
  height: 8px;
  background: var(--border-strong);
  border-radius: 0 3px 3px 0;
  margin-right: -1px;
}

.branch-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.76rem;
  color: var(--text-muted);
  font-weight: 700;

  strong {
    color: var(--text-strong);
  }
  .status-badge {
    font-weight: 800;
  }
}
</style>
