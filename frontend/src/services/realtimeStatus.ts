import { computed, ref } from 'vue';

export const realtimeConnected = ref(false);
export const AUTO_REFRESH_INTERVAL_MS = 60_000;
export const FALLBACK_REFRESH_INTERVAL_MS = 12_000;
export const dashboardRefreshIntervalMs = computed(() =>
  realtimeConnected.value ? AUTO_REFRESH_INTERVAL_MS : FALLBACK_REFRESH_INTERVAL_MS,
);
export const dashboardRefreshIntervalSeconds = computed(() =>
  Math.round(dashboardRefreshIntervalMs.value / 1000),
);

export const setRealtimeConnected = (connected: boolean) => {
  realtimeConnected.value = connected;
};
