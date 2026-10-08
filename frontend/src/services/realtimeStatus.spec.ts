import { watch } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { dashboardRefreshIntervalMs, setRealtimeConnected } from './realtimeStatus';

afterEach(() => {
  setRealtimeConnected(false);
});

describe('realtime connection status', () => {
  it('uses the fast polling interval when disconnected and relaxes it when connected', () => {
    const intervals: number[] = [];
    const stop = watch(dashboardRefreshIntervalMs, (interval) => intervals.push(interval), {
      flush: 'sync',
    });

    setRealtimeConnected(true);
    setRealtimeConnected(false);
    stop();

    expect(intervals).toEqual([60_000, 12_000]);
    expect(dashboardRefreshIntervalMs.value).toBe(12_000);
  });
});
