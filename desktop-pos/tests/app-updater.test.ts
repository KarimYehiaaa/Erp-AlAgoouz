import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppUpdater } from '../src/composables/useAppUpdater';

describe('useAppUpdater Composable', () => {
  let mockElectronAPI: any;

  beforeEach(() => {
    mockElectronAPI = {
      getDeviceInfo: vi.fn().mockResolvedValue({
        hostname: 'POS-TEST',
        platform: 'win32',
        arch: 'x64',
        appVersion: '1.0.15',
        terminalCode: 'TRM-01',
      }),
      getUpdateStatus: vi.fn().mockResolvedValue({
        state: 'idle',
      }),
      checkForUpdates: vi.fn().mockResolvedValue({
        success: true,
      }),
      installUpdate: vi.fn().mockResolvedValue({
        success: true,
      }),
      onUpdateStatus: vi.fn(),
    };

    (global as any).window = {
      electronAPI: mockElectronAPI,
    };
  });

  it('1. Initializes updater and loads initial device info and update status', async () => {
    const updater = useAppUpdater();

    await updater.initUpdater();

    expect(mockElectronAPI.getDeviceInfo).toHaveBeenCalled();
    expect(mockElectronAPI.getUpdateStatus).toHaveBeenCalled();
    expect(mockElectronAPI.onUpdateStatus).toHaveBeenCalled();
    expect(updater.appVersion.value).toBe('1.0.15');
    expect(updater.updateState.value.state).toBe('idle');
  });

  it('2. Computes download percent accurately with bounds [0, 100]', () => {
    const updater = useAppUpdater();

    updater.updateState.value = {
      state: 'downloading',
      percent: 45.6,
    };
    expect(updater.downloadPercent.value).toBe(46);

    updater.updateState.value = {
      state: 'downloading',
      percent: 120,
    };
    expect(updater.downloadPercent.value).toBe(100);

    updater.updateState.value = {
      state: 'downloading',
      percent: -10,
    };
    expect(updater.downloadPercent.value).toBe(0);
  });

  it('3. Computes update state flags (isAvailable, isDownloading, isDownloaded, hasUpdate)', () => {
    const updater = useAppUpdater();

    updater.updateState.value = { state: 'idle' };
    expect(updater.isAvailable.value).toBe(false);
    expect(updater.isDownloading.value).toBe(false);
    expect(updater.isDownloaded.value).toBe(false);
    expect(updater.hasUpdate.value).toBe(false);

    updater.updateState.value = { state: 'available', version: '1.0.16' };
    expect(updater.isAvailable.value).toBe(true);
    expect(updater.hasUpdate.value).toBe(true);

    updater.updateState.value = { state: 'downloading', percent: 60 };
    expect(updater.isDownloading.value).toBe(true);
    expect(updater.hasUpdate.value).toBe(true);

    updater.updateState.value = { state: 'downloaded', version: '1.0.16' };
    expect(updater.isDownloaded.value).toBe(true);
    expect(updater.hasUpdate.value).toBe(true);
  });

  it('4. Triggers checkForUpdates via electron API', async () => {
    const updater = useAppUpdater();

    await updater.checkForUpdates();

    expect(mockElectronAPI.checkForUpdates).toHaveBeenCalled();
    expect(updater.updateState.value.state).toBe('checking');
  });

  it('5. Handles web mode gracefully when electronAPI is absent', async () => {
    delete (global as any).window.electronAPI;

    const updater = useAppUpdater();
    await updater.checkForUpdates();

    expect(updater.updateState.value.state).toBe('current');
    expect(updater.updateState.value.message).toContain('Web Mode');
  });

  it('6. Triggers installUpdate via electron API', async () => {
    const updater = useAppUpdater();

    await updater.installUpdate();

    expect(mockElectronAPI.installUpdate).toHaveBeenCalled();
  });

  it('7. Controls modal visibility correctly', () => {
    const updater = useAppUpdater();

    updater.openUpdateModal();
    expect(updater.showUpdateModal.value).toBe(true);

    updater.closeUpdateModal();
    expect(updater.showUpdateModal.value).toBe(false);
  });
});
