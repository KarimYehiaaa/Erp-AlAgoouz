import { ref, computed } from 'vue';

export interface AppUpdateState {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'current' | 'error' | string;
  version?: string;
  message?: string;
  percent?: number;
}

// State shared across components and views
const updateState = ref<AppUpdateState>({ state: 'idle' });
const appVersion = ref<string>('1.0.15');
const showUpdateModal = ref<boolean>(false);
const isCheckingManual = ref<boolean>(false);
let isInitialized = false;

export function useAppUpdater() {
  const isAvailable = computed(() => updateState.value.state === 'available');
  const isDownloading = computed(() => updateState.value.state === 'downloading');
  const isDownloaded = computed(() => updateState.value.state === 'downloaded');
  const isChecking = computed(
    () => updateState.value.state === 'checking' || isCheckingManual.value,
  );
  const isCurrent = computed(() => updateState.value.state === 'current');
  const isError = computed(() => updateState.value.state === 'error');
  const hasUpdate = computed(() => isAvailable.value || isDownloading.value || isDownloaded.value);

  const downloadPercent = computed(() => {
    if (typeof updateState.value.percent === 'number') {
      return Math.min(100, Math.max(0, Math.round(updateState.value.percent)));
    }
    return 0;
  });

  const initUpdater = async () => {
    if (typeof window === 'undefined') return;

    if (!isInitialized) {
      isInitialized = true;

      if (window.electronAPI) {
        try {
          const devInfo = await window.electronAPI.getDeviceInfo?.();
          if (devInfo?.appVersion) {
            appVersion.value = devInfo.appVersion;
          }
        } catch (err) {
          console.warn('[Updater] Could not retrieve device version:', err);
        }

        try {
          const initialStatus = await window.electronAPI.getUpdateStatus?.();
          if (initialStatus) {
            updateState.value = initialStatus;
          }
        } catch (err) {
          console.warn('[Updater] Could not retrieve initial update status:', err);
        }

        window.electronAPI.onUpdateStatus?.((status) => {
          updateState.value = status;
          if (status.state !== 'checking') {
            isCheckingManual.value = false;
          }
        });
      }
    }
  };

  const checkForUpdates = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.checkForUpdates) {
      updateState.value = {
        state: 'current',
        message: 'أنت في بيئة المتصفح التجريبية (Web Mode). التحديث متاح عبر تطبيق Electron المكتبي.',
      };
      return;
    }

    try {
      isCheckingManual.value = true;
      updateState.value = { state: 'checking' };
      const res = await window.electronAPI.checkForUpdates();
      if (!res?.success && res?.message) {
        console.info('[Updater] Check response:', res.message);
      }
    } catch (err: any) {
      isCheckingManual.value = false;
      updateState.value = {
        state: 'error',
        message: err?.message || 'فشل الاتصال بخادم التحديثات',
      };
    }
  };

  const installUpdate = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.installUpdate) {
      console.warn('[Updater] installUpdate called without electronAPI');
      return;
    }
    try {
      await window.electronAPI.installUpdate();
    } catch (err: any) {
      updateState.value = {
        state: 'error',
        message: err?.message || 'فشل تثبيت التحديث التلقائي',
      };
    }
  };

  const openUpdateModal = () => {
    showUpdateModal.value = true;
  };

  const closeUpdateModal = () => {
    showUpdateModal.value = false;
  };

  return {
    updateState,
    appVersion,
    showUpdateModal,
    isAvailable,
    isDownloading,
    isDownloaded,
    isChecking,
    isCurrent,
    isError,
    hasUpdate,
    downloadPercent,
    initUpdater,
    checkForUpdates,
    installUpdate,
    openUpdateModal,
    closeUpdateModal,
  };
}
