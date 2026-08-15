<template>
  <div
    v-if="appStore.notificationDrawerOpen"
    class="drawer-overlay"
    @click.self="appStore.toggleNotificationDrawer"
  >
    <div class="drawer-panel card">
      <div class="drawer-header">
        <div class="header-title">
          <span class="bell-icon">🔔</span>
          <h3>مركز تنبيهات التشغيل</h3>
        </div>
        <div class="header-actions">
          <button
            class="icon-btn edit"
            @click="fetchAlerts"
            :disabled="loading"
            title="تحديث التنبيهات"
          >
            <span v-if="loading">⏳</span>
            <AppIcon v-else name="theme" :size="16" />
          </button>
          <button class="close-btn" @click="appStore.toggleNotificationDrawer">✕</button>
        </div>
      </div>

      <div v-if="loading && !appStore.notifications.length" class="drawer-loading">
        <div class="spinner"></div>
        <p>جاري فحص حالة النظام وجلب التنبيهات...</p>
      </div>

      <div v-else-if="!appStore.notifications.length" class="drawer-empty">
        <span class="shield-icon">🛡️</span>
        <h4>النظام يعمل بشكل ممتاز</h4>
        <p>لا توجد تنبيهات تشغيل أو مديونيات متأخرة حالياً.</p>
      </div>

      <div v-else class="drawer-content">
        <div
          v-for="alert in appStore.notifications"
          :key="alert.type"
          class="alert-card"
          :class="alert.severity"
        >
          <div class="alert-head">
            <span class="severity-indicator"></span>
            <span class="alert-title">{{ alert.title }}</span>
          </div>
          <p class="alert-msg">{{ alert.message }}</p>
          <div class="alert-actions">
            <button class="btn btn-sm btn-outline" @click="handleAction(alert)">
              متابعة القسم ←
            </button>
          </div>
        </div>
      </div>

      <div class="drawer-footer">آخر فحص: {{ lastChecked }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { operations } from '@/api';

const router = useRouter();
const appStore = useAppStore();
const loading = ref(false);
const lastChecked = ref('—');

const fetchAlerts = async () => {
  loading.value = true;
  try {
    const res = await operations.alerts();
    appStore.notifications = res.data?.alerts || [];
    lastChecked.value = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e: any) {
    console.error('❌ Error fetching alerts:', e);
  } finally {
    loading.value = false;
  }
};

const handleAction = (alert: any) => {
  if (alert.action_to) {
    router.push(alert.action_to);
  }
  appStore.toggleNotificationDrawer();
};

// Fetch alerts whenever drawer is opened
watch(
  () => appStore.notificationDrawerOpen,
  (open: any) => {
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
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(4px);
  z-index: 9990;
  display: flex;
  justify-content: flex-start; /* Slides in from left in RTL layout */
}

.drawer-panel {
  width: min(420px, 92vw);
  height: 100vh;
  background: var(--glass-bg);
  border-left: 1px solid var(--glass-border);
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  animation: slideLeft 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes slideLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;

    .bell-icon {
      font-size: 1.25rem;
    }

    h3 {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-strong);
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .close-btn {
      background: transparent;
      border: none;
      font-size: 1.2rem;
      cursor: pointer;
      color: var(--text-muted);
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;

      &:hover {
        background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated));
        color: var(--text-strong);
      }
    }
  }
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-card {
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-right: 4px solid var(--border-strong);
  transition: all 0.2s ease;

  .alert-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;

    .severity-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .alert-title {
      font-weight: 800;
      font-size: 0.92rem;
      color: var(--text-strong);
    }
  }

  .alert-msg {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.5;
    margin-bottom: 10px;
  }

  /* Colors based on severity */
  &.danger {
    border-right-color: var(--danger);
    .severity-indicator {
      background: var(--danger);
    }
  }

  &.warning {
    border-right-color: var(--warning);
    .severity-indicator {
      background: var(--warning);
    }
  }

  &.info {
    border-right-color: var(--info);
    .severity-indicator {
      background: var(--info);
    }
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-xs);
  }
}

.drawer-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--text-muted);
  font-size: 0.88rem;
  gap: 16px;

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.drawer-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;

  .shield-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
    display: inline-block;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.05));
  }

  h4 {
    font-size: 0.95rem;
    font-weight: 800;
    color: var(--text-strong);
    margin-bottom: 4px;
  }

  p {
    font-size: 0.78rem;
    color: var(--text-muted);
    max-width: 240px;
    line-height: 1.5;
  }
}

.drawer-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-soft) 40%, transparent);
  color: var(--text-muted);
  font-size: 0.72rem;
}
</style>
