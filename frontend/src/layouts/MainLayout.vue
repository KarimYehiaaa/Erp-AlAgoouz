<template>
  <div
    class="layout"
    :class="{ 'sidebar-collapsed': !appStore.sidebarOpen }"
    :data-route="route.name"
  >
    <AppSidebar />
    <div v-if="appStore.sidebarOpen" class="sidebar-overlay" @click="appStore.toggleSidebar"></div>
    <div class="layout-main">
      <AppNavbar />
      <main class="layout-content">
        <ErrorBoundary>
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </ErrorBoundary>
      </main>
    </div>
    <CommandPalette />
    <NotificationDrawer />

    <!-- Global Premium Toasts Container -->
    <ToastContainer />

    <!-- Floating Shortcuts HUD Overlay -->
    <div
      v-if="showShortcutsHUD"
      class="modal"
      @click.self="showShortcutsHUD = false"
      style="z-index: 99999"
    >
      <div
        class="modal-content shortcuts-hud"
        style="padding: 24px; direction: rtl; text-align: right"
      >
        <div
          class="hud-header"
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--border);
            padding-bottom: 12px;
            margin-bottom: 18px;
          "
        >
          <h3 style="margin: 0; color: var(--text-strong); font-size: 1.15rem; font-weight: 850">
            ⌨️ لوحة اختصارات النظام السريعة
          </h3>
          <button
            @click="showShortcutsHUD = false"
            style="
              border: none;
              background: transparent;
              font-size: 1.2rem;
              cursor: pointer;
              color: var(--text-muted);
            "
          >
            ✕
          </button>
        </div>
        <div class="hud-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px">
          <div class="hud-group">
            <h4
              style="
                margin-top: 0;
                color: var(--accent);
                font-weight: 800;
                font-size: 0.92rem;
                border-bottom: 1px solid var(--border);
                padding-bottom: 6px;
                margin-bottom: 10px;
              "
            >
              🗺️ التنقل السريع (Alt + مفتاح)
            </h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 8px">
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Alt + D</span
                >
                لوحة التحكم الرئيسية
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Alt + P</span
                >
                الكاشير المباشر (POS)
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Alt + S</span
                >
                إعدادات النظام
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Alt + I</span
                >
                إدارة الفواتير
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Alt + M</span
                >
                الجرد والمخزن
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Alt + R</span
                >
                إدارة الوصفات
              </li>
            </ul>
          </div>
          <div class="hud-group">
            <h4
              style="
                margin-top: 0;
                color: var(--accent);
                font-weight: 800;
                font-size: 0.92rem;
                border-bottom: 1px solid var(--border);
                padding-bottom: 6px;
                margin-bottom: 10px;
              "
            >
              💡 مفاتيح عامة ومساعدة
            </h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 8px">
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >؟</span
                >
                أو
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >?</span
                >
                فتح/إغلاق هذه المساعدة
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >F11</span
                >
                ملء الشاشة
              </li>
              <li
                style="
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.84rem;
                  color: var(--text);
                "
              >
                <span
                  style="
                    background: var(--primary-soft);
                    color: var(--primary-strong);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 800;
                    font-family: monospace;
                  "
                  >Ctrl + P</span
                >
                طباعة الفاتورة الفورية
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import AppSidebar from '@/components/AppSidebar.vue';
import AppNavbar from '@/components/AppNavbar.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import NotificationDrawer from '@/components/NotificationDrawer.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import ErrorBoundary from '@/components/ui/ErrorBoundary.vue';
import { useAppStore } from '@/stores/app';

const appStore = useAppStore();
const router = useRouter();
const route = useRoute();
const showShortcutsHUD = ref(false);

const handleGlobalShortcuts = (e) => {
  if (e.key === '?' || e.key === '؟') {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      showShortcutsHUD.value = !showShortcutsHUD.value;
      return;
    }
  }

  const shortcutsEnabled = localStorage.getItem('shortcuts_enabled') !== 'false';
  if (!shortcutsEnabled) return;

  if (e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'p') {
      e.preventDefault();
      router.push('/branch-sales');
    } else if (key === 'd') {
      e.preventDefault();
      router.push('/');
    } else if (key === 's') {
      e.preventDefault();
      router.push('/settings');
    } else if (key === 'i') {
      e.preventDefault();
      router.push('/invoices');
    } else if (key === 'm') {
      e.preventDefault();
      router.push('/inventory');
    } else if (key === 'r') {
      e.preventDefault();
      router.push('/recipes');
    } else if (key === 'h') {
      e.preventDefault();
      router.push('/hr');
    }
  }
};

watch(
  () => route.path,
  () => {
    if (window.innerWidth <= 992 && appStore.sidebarOpen) {
      appStore.toggleSidebar();
    }
  },
);

onMounted(() => {
  window.addEventListener('keydown', handleGlobalShortcuts);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalShortcuts);
});
</script>

<style lang="scss" scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

.layout-main {
  flex: 1;
  margin-right: var(--sidebar-current-width, var(--sidebar-width));
  transition: margin var(--transition);
  min-width: 0;
}

.sidebar-collapsed .layout-main {
  margin-right: var(--sidebar-collapsed);
}

.layout-content {
  padding: clamp(16px, 2vw, 28px);
  padding-top: calc(var(--navbar-height) + 20px);
  min-height: calc(100vh - var(--navbar-height));
}

@media (max-width: 992px) {
  .layout-main {
    margin-right: 0;
  }
}

/* ── Global Toasts ── */
.toast-container {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 380px;
  width: calc(100vw - 48px);
  pointer-events: none;
}

.toast-alert {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-md, 10px);
  background: var(--primary);
  color: var(--bg-elevated);
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border);
  font-weight: 700;
  font-size: 0.88rem;
  direction: rtl;

  &.success {
    background: #15803d !important;
    color: #ffffff !important;
    border-color: #166534 !important;
  }

  &.error {
    background: #dc2626 !important;
    color: #ffffff !important;
    border-color: #991b1b !important;
  }

  &.warning {
    background: #d97706 !important;
    color: #ffffff !important;
    border-color: #92400e !important;
  }
}

.toast-message {
  flex: 1;
}

.toast-undo-btn {
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 800;
  font-size: 0.78rem;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.35);
  }
}

.toast-close-btn {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
  font-size: 0.85rem;
  padding: 2px;

  &:hover {
    opacity: 1;
  }
}

/* Slide Transition */
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(-40px) scale(0.9);
}
.sidebar-overlay {
  display: none;
}

@media (max-width: 992px) {
  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    z-index: 99;
    animation: fadeIn 0.2s ease-out;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
