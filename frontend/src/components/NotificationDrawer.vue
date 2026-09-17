<template>
  <div
    v-if="appStore.notificationDrawerOpen"
    class="drawer-overlay"
    @click.self="appStore.toggleNotificationDrawer"
  >
    <div
      class="drawer-panel card"
      role="dialog"
      aria-modal="true"
      aria-label="مركز الإجراءات والتنبيهات"
    >
      <!-- Header -->
      <div class="drawer-header">
        <div class="header-title">
          <span class="bell-icon"><AppIcon name="bell" :size="18" /></span>
          <div>
            <h3>مركز الإجراءات والتنبيهات</h3>
            <p class="header-subtitle">الرقابة والعمليات اللحظية</p>
          </div>
        </div>
        <div class="header-actions">
          <button
            class="icon-btn"
            @click="fetchAlerts"
            :disabled="loading"
            title="تحديث التنبيهات"
            aria-label="تحديث التنبيهات"
          >
            <AppIcon name="refresh" :size="15" :class="{ 'spin-icon': loading }" />
          </button>
          <button
            class="icon-btn"
            @click="appStore.toggleNotificationDrawer"
            title="إغلاق"
            aria-label="إغلاق المركز"
          >
            <AppIcon name="close" :size="15" />
          </button>
        </div>
      </div>

      <!-- Severity Filter Tabs -->
      <div class="severity-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeFilter === 'all' }"
          @click="activeFilter = 'all'"
        >
          الكل ({{ appStore.notifications.length }})
        </button>
        <button
          type="button"
          class="tab-btn danger"
          :class="{ active: activeFilter === 'critical' }"
          @click="activeFilter = 'critical'"
        >
          حرجة ({{ criticalCount }})
        </button>
        <button
          type="button"
          class="tab-btn warning"
          :class="{ active: activeFilter === 'warning' }"
          @click="activeFilter = 'warning'"
        >
          انتباه ({{ warningCount }})
        </button>
        <button
          type="button"
          class="tab-btn info"
          :class="{ active: activeFilter === 'info' }"
          @click="activeFilter = 'info'"
        >
          معلومات ({{ infoCount }})
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading && !appStore.notifications.length" class="drawer-loading">
        <AppIcon name="refresh" :size="24" class="spin-icon" />
        <p>جاري تدقيق حالة النظام وتحميل التنبيهات التشغيلية...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="!filteredAlerts.length" class="drawer-empty">
        <span class="shield-icon"><AppIcon name="shieldCheck" :size="40" /></span>
        <h4>جميع الأنظمة تعمل بكفاءة تامة</h4>
        <p>لا توجد تنبيهات معلقة أو مديونيات متأخرة ضمن هذا التصنيف.</p>
      </div>

      <!-- Alerts List -->
      <div v-else class="drawer-content">
        <div
          v-for="alert in filteredAlerts"
          :key="alert.type || alert.id"
          class="action-card"
          :class="alert.severity"
        >
          <div class="card-head">
            <div class="head-left">
              <span class="severity-badge" :class="alert.severity">
                {{ getSeverityLabel(alert.severity) }}
              </span>
              <span class="source-tag">{{ getSourceLabel(alert) }}</span>
            </div>
            <span class="time-label">{{ lastChecked }}</span>
          </div>

          <h4 class="card-title">{{ alert.title }}</h4>
          <p class="card-desc">{{ alert.message }}</p>

          <div class="card-actions">
            <button
              type="button"
              class="btn btn-sm"
              :class="alert.severity === 'danger' ? 'btn-danger' : 'btn-outline'"
              @click="handleAction(alert)"
            >
              <span>{{ getActionLabel(alert) }}</span>
              <AppIcon name="arrowLeft" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="drawer-footer">
        <span>آخر تدقيق آلي: {{ lastChecked }}</span>
        <button
          v-if="appStore.notifications.length"
          type="button"
          class="clear-all-link"
          @click="clearNotifications"
        >
          تعليم الكل كمقروء
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/AppIcon.vue';
import { useAppStore } from '@/stores/app';
import { operations } from '@/api';

const router = useRouter();
const appStore = useAppStore();
const loading = ref(false);
const lastChecked = ref('—');
const activeFilter = ref<'all' | 'critical' | 'warning' | 'info'>('all');

const fetchAlerts = async () => {
  loading.value = true;
  try {
    const [res, notifRes] = await Promise.all([
      operations.alerts(),
      operations.notifications().catch(() => null),
    ]);
    const alerts = res.data?.alerts || [];

    const savedNotifs = (notifRes?.data || []).filter((n: any) => !n.is_read);
    const mappedNotifs = savedNotifs.map((n: any) => ({
      type: `notification_${n.id}`,
      notification_id: n.id,
      severity: n.type === 'danger' ? 'danger' : n.type === 'warning' ? 'warning' : 'info',
      title: n.title_ar,
      message: n.message_ar,
      count: 1,
      action_to: '',
      items: [],
    }));

    appStore.notifications = [...mappedNotifs, ...alerts];
    lastChecked.value = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e: any) {
    console.error('Error fetching action center alerts:', e);
  } finally {
    loading.value = false;
  }
};

const criticalCount = computed(
  () =>
    appStore.notifications.filter((n: any) => n.severity === 'danger' || n.severity === 'critical')
      .length,
);
const warningCount = computed(
  () => appStore.notifications.filter((n: any) => n.severity === 'warning').length,
);
const infoCount = computed(
  () => appStore.notifications.filter((n: any) => n.severity === 'info').length,
);

const filteredAlerts = computed(() => {
  if (activeFilter.value === 'all') return appStore.notifications;
  if (activeFilter.value === 'critical') {
    return appStore.notifications.filter(
      (n: any) => n.severity === 'danger' || n.severity === 'critical',
    );
  }
  return appStore.notifications.filter((n: any) => n.severity === activeFilter.value);
});

function getSeverityLabel(severity: string) {
  if (severity === 'danger' || severity === 'critical') return 'حرج';
  if (severity === 'warning') return 'تنبيه';
  return 'إشعار';
}

function getSourceLabel(alert: any) {
  if (alert.title?.includes('مخزون')) return 'إدارة المخزون';
  if (alert.title?.includes('نقد') || alert.title?.includes('عجز')) return 'الخزينة والمالية';
  if (alert.title?.includes('فاتورة') || alert.title?.includes('إلغاء')) return 'نقاط البيع';
  if (alert.title?.includes('أمان') || alert.title?.includes('مخاطر')) return 'محرك الأمان';
  return 'النظام العام';
}

function getActionLabel(alert: any) {
  if (alert.title?.includes('مخزون')) return 'مراجعة المخزون';
  if (alert.title?.includes('نقد') || alert.title?.includes('عجز')) return 'مراجعة العجز';
  if (alert.title?.includes('سداد')) return 'كشف الحساب';
  return 'الانتقال للقسم';
}

const handleAction = (alert: any) => {
  if (alert.action_to) {
    router.push(alert.action_to);
  } else if (alert.title?.includes('مخزون')) {
    router.push('/inventory');
  } else if (alert.title?.includes('نقد') || alert.title?.includes('عجز')) {
    router.push('/branch-sales');
  } else {
    router.push('/reports');
  }
  appStore.toggleNotificationDrawer();
};

const clearNotifications = async () => {
  try {
    await operations.markAllNotificationsRead();
  } catch {
    // Ignore error
  }
  appStore.notifications = [];
};

watch(
  () => appStore.notificationDrawerOpen,
  (open: boolean) => {
    if (open) {
      fetchAlerts();
    }
  },
);

onMounted(() => {
  if (appStore.notificationDrawerOpen) {
    fetchAlerts();
  }
});
</script>

<style lang="scss" scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: drawerBackdropFade var(--motion-dropdown) ease;
}

@keyframes drawerBackdropFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.drawer-panel {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  max-width: 440px;
  height: 100vh;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
  animation: slideInDrawer var(--motion-dropdown) cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideInDrawer {
  from {
    transform: translateX(-100%);
    opacity: 0.8;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;

  h3 {
    font-size: 0.96rem;
    font-weight: 800;
    margin: 0;
    color: var(--color-text-strong);
  }
}

.header-subtitle {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  margin: 0;
}

.bell-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  display: grid;
  place-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.severity-tabs {
  display: flex;
  padding: 8px 16px;
  gap: 6px;
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border-subtle);
}

.tab-btn {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  background: transparent;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--color-text);
  }

  &.active {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text-strong);
    font-weight: 700;
  }

  &.danger.active {
    color: var(--color-danger);
  }
  &.warning.active {
    color: var(--color-warning);
  }
  &.info.active {
    color: var(--color-info);
  }
}

.drawer-loading {
  padding: 60px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.88rem;
}

.drawer-empty {
  padding: 60px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;

  h4 {
    font-size: 0.96rem;
    font-weight: 700;
    color: var(--color-text-strong);
    margin: 0;
  }
  p {
    font-size: 0.82rem;
    color: var(--color-text-muted);
    margin: 0;
    max-width: 280px;
  }
}

.shield-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--color-success-soft);
  color: var(--color-success);
  display: grid;
  place-items: center;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-card {
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    transform var(--motion-hover),
    box-shadow var(--motion-hover),
    border-color var(--motion-hover);

  &:hover {
    border-color: var(--color-border-strong);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1.5px);
  }

  &.danger,
  &.critical {
    border-inline-start: 4px solid var(--color-danger);
  }
  &.warning {
    border-inline-start: 4px solid var(--color-warning);
  }
  &.info {
    border-inline-start: 4px solid var(--color-info);
  }
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.severity-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-xs);

  &.danger,
  &.critical {
    background: var(--color-danger-soft);
    color: var(--color-danger);
  }
  &.warning {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }
  &.info {
    background: var(--color-info-soft);
    color: var(--color-info);
  }
}

.source-tag {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.time-label {
  font-size: 0.7rem;
  color: var(--color-text-subtle);
}

.card-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text-strong);
  margin: 0;
}

.card-desc {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin: 0;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.drawer-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.clear-all-link {
  background: transparent;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
