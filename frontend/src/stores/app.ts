import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | string;
  duration: number;
  onUndo?: (() => void) | null;
}

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(localStorage.getItem('sidebarOpen') !== 'false');
  const notifications = ref<any[]>([]);
  const notificationDrawerOpen = ref(false);
  const isOnline = ref(navigator.onLine);
  const pendingSyncCount = ref(0);
  const dataRefreshTrigger = ref(0);

  const triggerDataRefresh = () => {
    dataRefreshTrigger.value++;
  };

  const toggleNotificationDrawer = () => {
    notificationDrawerOpen.value = !notificationDrawerOpen.value;
  };

  const syncSidebarWidth = () => {
    const width = sidebarOpen.value ? '280px' : '76px';
    document.documentElement.style.setProperty('--sidebar-current-width', width);
  };

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
    localStorage.setItem('sidebarOpen', String(sidebarOpen.value));
    syncSidebarWidth();
  };

  const privacyMode = ref(localStorage.getItem('privacyMode') === 'true');

  const togglePrivacyMode = () => {
    privacyMode.value = !privacyMode.value;
    localStorage.setItem('privacyMode', String(privacyMode.value));
    applyPrivacyMode();
  };

  const applyPrivacyMode = () => {
    if (privacyMode.value) {
      document.documentElement.classList.add('privacy-enabled');
    } else {
      document.documentElement.classList.remove('privacy-enabled');
    }
  };

  const dataDensity = ref(localStorage.getItem('dataDensity') || 'cozy');

  const toggleDataDensity = () => {
    dataDensity.value = dataDensity.value === 'cozy' ? 'compact' : 'cozy';
    localStorage.setItem('dataDensity', dataDensity.value);
    applyDataDensity();
  };

  const applyDataDensity = () => {
    if (dataDensity.value === 'compact') {
      document.documentElement.classList.add('density-compact');
    } else {
      document.documentElement.classList.remove('density-compact');
    }
  };

  // ── الوضع الداكن (Espresso) — يُخزَّن في localStorage ويُطبَّق عبر data-theme ──
  const darkMode = ref(localStorage.getItem('darkMode') === 'true');

  const toggleDarkMode = () => {
    darkMode.value = !darkMode.value;
    localStorage.setItem('darkMode', String(darkMode.value));
    applyDarkMode();
  };

  const applyDarkMode = () => {
    const root = document.documentElement;
    if (darkMode.value) {
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.removeAttribute('data-theme');
      root.style.colorScheme = 'light';
    }
    // مزامنة لون شريط المتصفح (theme-color) مع الثيم
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', darkMode.value ? '#16100c' : '#fdf8f3');
    // إشعار الرسوم البيانية لإعادة الرسم بألوان الثيم الجديد
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { dark: darkMode.value } }));
  };

  // ── وضع تركيز الكاشير: إخفاء كل شيء إلا شاشة العمل (البيع) ──
  const focusMode = ref(false);

  const toggleFocusMode = () => {
    focusMode.value = !focusMode.value;
    applyFocusMode();
  };

  const applyFocusMode = () => {
    if (focusMode.value) {
      document.documentElement.classList.add('cashier-focus');
    } else {
      document.documentElement.classList.remove('cashier-focus');
    }
  };

  const initTheme = () => {
    syncSidebarWidth();
    applyPrivacyMode();
    applyDataDensity();
    applyDarkMode();

    // Cleanup old theme values from local storage if they exist
    localStorage.removeItem('colorMode');
    localStorage.removeItem('stylePreset');
    localStorage.removeItem('theme');
  };

  syncSidebarWidth();
  applyPrivacyMode();
  applyDataDensity();
  applyDarkMode();

  const toasts = ref<Toast[]>([]);

  const addToast = (
    message: any,
    type: string = 'info',
    duration: number = 4000,
    onUndo: (() => void) | null = null,
  ) => {
    let msgText = message;
    let msgType = type;
    if (typeof message === 'object' && message !== null) {
      msgText = message.message || JSON.stringify(message);
      if (message.type) msgType = message.type;
    }
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    toasts.value.push({ id, message: msgText, type: msgType, duration, onUndo });
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  };

  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter((t: any) => t.id !== id);
  };

  return {
    sidebarOpen,
    notifications,
    notificationDrawerOpen,
    isOnline,
    pendingSyncCount,
    dataRefreshTrigger,
    triggerDataRefresh,
    toggleSidebar,
    initTheme,
    toggleNotificationDrawer,
    privacyMode,
    togglePrivacyMode,
    toasts,
    addToast,
    removeToast,
    dataDensity,
    toggleDataDensity,
    applyDataDensity,
    darkMode,
    toggleDarkMode,
    applyDarkMode,
    focusMode,
    toggleFocusMode,
    applyFocusMode,
  };
});
