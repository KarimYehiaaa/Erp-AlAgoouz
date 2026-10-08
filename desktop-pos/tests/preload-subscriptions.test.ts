import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

describe('preload event subscriptions', () => {
  beforeEach(() => {
    vi.resetModules();
    electron.exposeInMainWorld.mockReset();
    electron.invoke.mockReset();
    electron.on.mockReset();
    electron.removeListener.mockReset();
  });

  it.each([
    ['onUpdateStatus', 'updater:status', { state: 'checking' }],
    ['onBarcodeScan', 'barcode:scanned', '1234567890123'],
    ['onSyncUpdated', 'sync:updated', { synced: 2, remaining: 1 }],
  ] as const)(
    '%s forwards data and returns a working unsubscribe function',
    async (method, channel, payload) => {
      await import('../electron/preload');
      const api = electron.exposeInMainWorld.mock.calls[0]?.[1] as Record<
        string,
        (callback: (value: unknown) => void) => () => void
      >;
      const callback = vi.fn();
      const unsubscribe = api[method](callback);
      const listener = electron.on.mock.calls[0]?.[1] as (event: unknown, value: unknown) => void;

      expect(electron.on).toHaveBeenCalledWith(channel, expect.any(Function));
      listener({}, payload);
      expect(callback).toHaveBeenCalledWith(payload);

      unsubscribe();
      expect(electron.removeListener).toHaveBeenCalledWith(channel, listener);
    },
  );
});
