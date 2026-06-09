import { defineStore } from 'pinia';
import { ref } from 'vue';

export const STYLE_PRESETS = [
  { id: 'modern', name: 'حديث', icon: 'theme', desc: 'تشغيلي هادئ للقراءة اليومية' },
  { id: 'graphite', name: 'جرافيت', icon: 'reports', desc: 'رمادي احترافي عالي الوضوح' },
  { id: 'contrast', name: 'تباين عال', icon: 'warning', desc: 'ألوان قوية للشاشات البعيدة' },
];

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(localStorage.getItem('sidebarOpen') !== 'false');
  const colorMode = ref(localStorage.getItem('colorMode') || 'light');
  const savedPreset = localStorage.getItem('stylePreset');
  const stylePreset = ref(STYLE_PRESETS.some((item) => item.id === savedPreset) ? savedPreset : 'modern');
  const notifications = ref([]);

  const syncSidebarWidth = () => {
    const width = sidebarOpen.value ? '280px' : '76px';
    document.documentElement.style.setProperty('--sidebar-current-width', width);
  };

  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value;
    localStorage.setItem('sidebarOpen', String(sidebarOpen.value));
    syncSidebarWidth();
  };

  const toggleColorMode = () => {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light';
    applyTheme();
  };

  const setStylePreset = (id) => {
    if (!STYLE_PRESETS.some((item) => item.id === id)) return;
    stylePreset.value = id;
    applyTheme();
  };

  const applyTheme = () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', colorMode.value);
    root.setAttribute('data-style', stylePreset.value);
    localStorage.setItem('colorMode', colorMode.value);
    localStorage.setItem('stylePreset', stylePreset.value);
    localStorage.setItem('theme', colorMode.value);
    syncSidebarWidth();
  };

  const initTheme = () => applyTheme();

  syncSidebarWidth();

  return {
    sidebarOpen,
    colorMode,
    stylePreset,
    theme: colorMode,
    notifications,
    toggleSidebar,
    toggleColorMode,
    toggleTheme: toggleColorMode,
    setStylePreset,
    applyTheme,
    initTheme,
  };
});
