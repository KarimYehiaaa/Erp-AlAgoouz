<template>
  <div class="action-center-container mb-4">
    <!-- الشريط العلوي لمركز العمليات والمخاطر -->
    <section class="command-strip panel card-premium-flow">
      <div class="command-copy">
        <div class="flex items-center gap-2 mb-1">
          <span class="action-center-tag">مركز العمليات والمخاطر</span>
          <span v-if="hasAlerts" class="pulse-beacon" :class="highestSeverity"></span>
        </div>
        <strong>{{ priorityHeadline }}</strong>
        <small>{{ prioritySubtext }}</small>
      </div>

      <!-- تصنيفات درجات الخطورة الثلاثية (🔴 حرج / 🟠 مرتفع / 🟡 متوسط) -->
      <div class="severity-chips-group" role="group" aria-label="درجات خطورة العمليات">
        <button
          type="button"
          class="severity-chip chip-critical"
          :class="{ active: showFeed && selectedSeverityFilter === 'critical' }"
          title="عرض التنبيهات الحرجة"
          @click="openFilter('critical')"
        >
          <span class="chip-indicator red"></span>
          <span class="chip-count">{{ actionCenter.red }}</span>
          <span class="chip-label">حرج</span>
        </button>

        <button
          type="button"
          class="severity-chip chip-high"
          :class="{ active: showFeed && selectedSeverityFilter === 'high' }"
          title="عرض التنبيهات مرتفعة الخطورة"
          @click="openFilter('high')"
        >
          <span class="chip-indicator orange"></span>
          <span class="chip-count">{{ actionCenter.orange }}</span>
          <span class="chip-label">مرتفع</span>
        </button>

        <button
          type="button"
          class="severity-chip chip-medium"
          :class="{ active: showFeed && selectedSeverityFilter === 'medium' }"
          title="عرض التنبيهات متوسطة الخطورة"
          @click="openFilter('medium')"
        >
          <span class="chip-indicator yellow"></span>
          <span class="chip-count">{{ actionCenter.yellow }}</span>
          <span class="chip-label">متوسط</span>
        </button>
      </div>

      <!-- البنود التشغيلية السريعة (المخزون والوصفات والتحصيل والسيولة) -->
      <RouterLink
        v-for="action in priorityActions"
        :key="action.key"
        class="command-item"
        :class="action.tone"
        :to="action.to"
      >
        <span class="command-value">{{ action.value }}</span>
        <span class="command-label">{{ action.label }}</span>
      </RouterLink>

      <!-- زر فتح/طي سجل الرقابة ومكافحة الاحتيال -->
      <div class="action-feed-toggle-wrap">
        <button
          type="button"
          class="btn-toggle-risk-feed"
          :class="{ active: showFeed, 'has-alerts': actionCenter.total > 0 }"
          @click="toggleFeed"
        >
          <AppIcon :name="showFeed ? 'arrowRight' : 'warning'" :size="15" />
          <span>{{ showFeed ? 'إخفاء الرقابة' : 'سجل الرقابة' }}</span>
          <span v-if="actionCenter.total > 0" class="risk-count-badge">{{
            actionCenter.total
          }}</span>
        </button>
      </div>
    </section>

    <!-- لوحة سجل الرقابة التفصيلية القابلة للطي -->
    <transition name="feed-expand">
      <section v-if="showFeed" class="risk-feed-drawer panel glass-glow-card mt-3">
        <div class="drawer-header">
          <div class="header-info">
            <div class="flex items-center gap-2">
              <span class="drawer-icon">
                <AppIcon name="lock" :size="16" />
              </span>
              <h3 class="drawer-title">سجل الرقابة المالية ومكافحة الاحتيال</h3>
              <span class="drawer-count-badge">{{ filteredAlerts.length }} تنبيه</span>
            </div>
            <p class="drawer-desc">
              كشف آلي للمخالفات، فروقات نقدية الورديات، الخصومات المفرطة، وتجاوزات الأمان.
            </p>
          </div>

          <!-- فلاتر درجات الخطورة -->
          <div class="filter-pills" role="tablist">
            <button
              v-for="opt in filterOptions"
              :key="opt.value"
              type="button"
              class="filter-pill-btn"
              :class="{ active: selectedSeverityFilter === opt.value }"
              @click="selectedSeverityFilter = opt.value"
            >
              {{ opt.label }}
              <span v-if="opt.count !== undefined" class="pill-count">({{ opt.count }})</span>
            </button>
          </div>
        </div>

        <!-- قائمة كروت التنبيهات -->
        <div v-if="filteredAlerts.length > 0" class="alerts-grid">
          <article
            v-for="alert in filteredAlerts"
            :key="alert.id"
            class="risk-card"
            :class="`border-severity-${alert.severity}`"
          >
            <div class="risk-card-top">
              <div class="flex items-center gap-2">
                <span class="severity-badge" :class="alert.severity">
                  {{ severityLabel(alert.severity) }}
                </span>
                <span class="alert-time">{{ formatDateTime(alert.timestamp) }}</span>
              </div>
              <span class="alert-ref-tag">{{ referenceLabel(alert.reference) }}</span>
            </div>

            <h4 class="risk-card-title">{{ alert.event }}</h4>
            <p class="risk-card-explanation">{{ alert.explanation }}</p>

            <div class="risk-card-footer">
              <div class="actor-info">
                <span v-if="alert.user?.name" class="actor-tag"> 👤 {{ alert.user.name }} </span>
                <span v-if="alert.warehouse?.name" class="warehouse-tag">
                  🏢 {{ alert.warehouse.name }}
                </span>
              </div>

              <RouterLink
                v-if="resolveAlertLink(alert.reference)"
                :to="resolveAlertLink(alert.reference)!"
                class="btn-inspect-record"
              >
                <span>فحص السجل</span>
                <AppIcon name="arrowLeft" :size="12" />
              </RouterLink>
            </div>
          </article>
        </div>

        <div v-else class="empty-alerts-state">
          <div class="empty-shield-icon">🛡️</div>
          <p class="empty-headline">لا توجد تنبيهات نشطة ضمن الفلتر المختار</p>
          <small class="empty-sub">
            العمليات المالية والمخزنية منضبطة ولا توجد أي مؤشرات اختراق أو فروقات غير معتادة.
          </small>
        </div>
      </section>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { formatMoney, abbreviateNumber, formatDateTime } from '@/utils/formatters';
import type { RiskAlert } from '../../../../shared/types';

const props = defineProps({
  stats: { type: Object, required: true },
});

const money = (val: any) => formatMoney(val || 0);
const number = (val: any) => abbreviateNumber(val || 0);

const monthCards = computed(() => props.stats?.monthCards || {});

// بيانات Action Center المجمّعة من الباكند ومحرك المخاطر
const actionCenter = computed(() => {
  return (
    props.stats?.actionCenter || {
      red: 0,
      orange: 0,
      yellow: 0,
      total: 0,
      alerts: [] as RiskAlert[],
    }
  );
});

const hasAlerts = computed(() => actionCenter.value.total > 0);

const highestSeverity = computed(() => {
  if (actionCenter.value.red > 0) return 'critical';
  if (actionCenter.value.orange > 0) return 'high';
  if (actionCenter.value.yellow > 0) return 'medium';
  return 'none';
});

// البنود التشغيلية الأربعة الأساسية
const priorityActions = computed(() => [
  {
    key: 'stock',
    label: 'مخزون منخفض',
    value: number(props.stats?.stockAlerts),
    tone: Number(props.stats?.stockAlerts || 0) ? 'danger' : 'success',
    to: '/inventory',
  },
  {
    key: 'recipes',
    label: 'وصفات ناقصة',
    value: number(props.stats?.recipeSummary?.shortageRecipes),
    tone: Number(props.stats?.recipeSummary?.shortageRecipes || 0) ? 'warning' : 'success',
    to: '/recipes',
  },
  {
    key: 'unpaid',
    label: 'غير محصل',
    value: money(props.stats?.unpaidInvoices?.amount),
    tone: Number(props.stats?.unpaidInvoices?.amount || 0) ? 'warning' : 'success',
    to: '/sales?tab=wholesale',
  },
  {
    key: 'cash',
    label: 'صافي التدفق',
    value: money(monthCards.value.cashNet),
    tone: Number(monthCards.value.cashNet || 0) >= 0 ? 'success' : 'danger',
    to: '/reports',
  },
]);

const priorityHeadline = computed(() => {
  if (actionCenter.value.red > 0) {
    return `${actionCenter.value.red} مخالفات حرجة تتطلب تدخلاً فورياً`;
  }
  if (actionCenter.value.orange > 0) {
    return `${actionCenter.value.orange} تنبيهات تشغيلية ذات أولوية عالية`;
  }
  if (actionCenter.value.yellow > 0) {
    return `${actionCenter.value.yellow} ملاحظات رقابية متوسطة الأهمية`;
  }
  const risky = priorityActions.value.filter((item: any) => item.tone !== 'success').length;
  return risky ? `${risky} بند يحتاج متابعة` : 'الوضع مستقر ومنضبط';
});

const prioritySubtext = computed(() => {
  if (actionCenter.value.total > 0) {
    return `تم رصد ${actionCenter.value.total} تنبيه عبر محرك الرقابة ومكافحة الاحتيال.`;
  }
  return 'أهم البنود التي تحتاج مراجعة قبل نهاية اليوم.';
});

// إدارة فتح وإغلاق سجل الرقابة وتصفية التنبيهات
const showFeed = ref(false);
const selectedSeverityFilter = ref<string>('all');

const toggleFeed = () => {
  showFeed.value = !showFeed.value;
};

const openFilter = (sev: string) => {
  if (showFeed.value && selectedSeverityFilter.value === sev) {
    showFeed.value = false;
  } else {
    selectedSeverityFilter.value = sev;
    showFeed.value = true;
  }
};

const filterOptions = computed(() => [
  { value: 'all', label: 'الكل', count: actionCenter.value.total },
  { value: 'critical', label: 'حرج', count: actionCenter.value.red },
  { value: 'high', label: 'مرتفع', count: actionCenter.value.orange },
  { value: 'medium', label: 'متوسط', count: actionCenter.value.yellow },
]);

const filteredAlerts = computed(() => {
  const allAlerts: RiskAlert[] = actionCenter.value.alerts || [];
  if (selectedSeverityFilter.value === 'all') return allAlerts;
  return allAlerts.filter((a) => a.severity === selectedSeverityFilter.value);
});

const severityLabel = (sev: string) => {
  switch (sev) {
    case 'critical':
      return 'حرج';
    case 'high':
      return 'مرتفع';
    case 'medium':
      return 'متوسط';
    case 'low':
      return 'منخفض';
    default:
      return sev;
  }
};

const referenceLabel = (refObj: { type: string; id: number | string }) => {
  if (!refObj) return '—';
  switch (refObj.type) {
    case 'sale':
      return `فاتورة #${refObj.id}`;
    case 'shift':
      return `وردية #${refObj.id}`;
    case 'stock_movement':
      return `حركة مخزن #${refObj.id}`;
    case 'product':
      return `صنف #${refObj.id}`;
    case 'price_change':
      return `تعديل سعر #${refObj.id}`;
    default:
      return `${refObj.type} #${refObj.id}`;
  }
};

const resolveAlertLink = (refObj: { type: string; id: number | string }) => {
  if (!refObj) return null;
  switch (refObj.type) {
    case 'sale':
      return '/sales';
    case 'shift':
      return '/shifts';
    case 'stock_movement':
    case 'product':
    case 'price_change':
      return '/inventory';
    default:
      return null;
  }
};
</script>

<style lang="scss" scoped>
@use './dashboardShared.scss';

.action-center-container {
  position: relative;
}

.action-center-tag {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pulse-beacon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  animation: beaconPulse 1.5s infinite;

  &.critical {
    background: #ef4444;
    box-shadow: 0 0 10px #ef4444;
  }
  &.high {
    background: #f97316;
    box-shadow: 0 0 8px #f97316;
  }
  &.medium {
    background: #eab308;
    box-shadow: 0 0 6px #eab308;
  }
}

@keyframes beaconPulse {
  0% {
    transform: scale(0.9);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.3);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.8;
  }
}

/* مجموعات أزرار مستوى الخطورة */
.severity-chips-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.severity-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  background: var(--surface-secondary, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--primary);
  }

  &.active {
    outline: 2px solid var(--primary);
    background: var(--surface-active, rgba(255, 255, 255, 0.08));
  }

  .chip-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &.red {
      background: #ef4444;
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
    }
    &.orange {
      background: #f97316;
      box-shadow: 0 0 6px rgba(249, 115, 22, 0.6);
    }
    &.yellow {
      background: #eab308;
      box-shadow: 0 0 6px rgba(234, 179, 8, 0.6);
    }
  }

  .chip-count {
    font-size: 0.88rem;
    font-weight: 900;
    color: var(--text-strong);
  }

  .chip-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted);
  }
}

.action-feed-toggle-wrap {
  display: flex;
  align-items: center;
}

.btn-toggle-risk-feed {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--surface-hover);
    border-color: var(--primary);
  }

  &.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }

  .risk-count-badge {
    background: #ef4444;
    color: #fff;
    font-size: 0.68rem;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 9999px;
  }
}

/* درج سجل الرقابة */
.risk-feed-drawer {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}

.drawer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(var(--primary-rgb, 199, 146, 87), 0.15);
  color: var(--primary);
}

.drawer-title {
  font-size: 0.95rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.drawer-count-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--surface-secondary);
  color: var(--text-muted);
}

.drawer-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 4px;
  margin-bottom: 0;
}

.filter-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-pill-btn {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  background: var(--surface-secondary);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: var(--text-strong);
    border-color: var(--primary);
  }

  &.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }

  .pill-count {
    opacity: 0.85;
    font-size: 0.7rem;
  }
}

/* شبكة كروت التنبيهات */
.alerts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.risk-card {
  padding: 14px;
  border-radius: 10px;
  background: var(--surface-secondary, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  &.border-severity-critical {
    border-right: 4px solid #ef4444;
  }
  &.border-severity-high {
    border-right: 4px solid #f97316;
  }
  &.border-severity-medium {
    border-right: 4px solid #eab308;
  }
}

.risk-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.severity-badge {
  font-size: 0.7rem;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 4px;

  &.critical {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  &.high {
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.3);
  }
  &.medium {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.3);
  }
  &.low {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }
}

.alert-time {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.alert-ref-tag {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--surface);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.risk-card-title {
  font-size: 0.88rem;
  font-weight: 900;
  color: var(--text-strong);
  margin: 0;
}

.risk-card-explanation {
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
  flex: 1;
}

.risk-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.actor-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.74rem;
  color: var(--text-muted);
}

.btn-inspect-record {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--primary);
  text-decoration: none;
  transition: color 0.2s;

  &:hover {
    color: var(--primary-dark);
  }
}

/* الحالة الفارغة */
.empty-alerts-state {
  text-align: center;
  padding: 28px 14px;

  .empty-shield-icon {
    font-size: 2rem;
    margin-bottom: 6px;
  }
  .empty-headline {
    font-size: 0.9rem;
    font-weight: 900;
    color: var(--text-strong);
    margin-bottom: 4px;
  }
  .empty-sub {
    font-size: 0.78rem;
    color: var(--text-muted);
  }
}

/* أنيميشن الدرج */
.feed-expand-enter-active,
.feed-expand-leave-active {
  transition: all 0.3s ease;
}

.feed-expand-enter-from,
.feed-expand-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 1024px) {
  .severity-chips-group {
    order: 3;
    width: 100%;
    justify-content: flex-start;
  }
  .action-feed-toggle-wrap {
    order: 4;
  }
}
</style>
