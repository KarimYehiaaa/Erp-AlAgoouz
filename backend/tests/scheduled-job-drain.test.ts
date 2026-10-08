import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  query: vi.fn(),
  persist: vi.fn(),
  snapshot: vi.fn(),
  enqueue: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('../src/database/pool.ts', () => ({ query: state.query }));
vi.mock('../src/database/maintenanceBarrier.ts', () => ({
  runSharedMaintenanceTask: (task: () => unknown) => task(),
}));
vi.mock('../src/services/backupService.ts', () => ({ readBackupSnapshot: state.snapshot }));
vi.mock('../src/jobs/queue.ts', () => ({ enqueueBackup: state.enqueue }));
vi.mock('../src/services/cloudBackupService.ts', () => ({
  getCloudConfig: vi.fn(),
  uploadBackupToCloud: vi.fn(),
}));
vi.mock('../src/utils/crypto.ts', () => ({ encrypt: () => 'fixture-encrypted-payload' }));
vi.mock('../src/utils/backupStorage.ts', () => ({
  createBackupFileName: () => 'auto-backup-fixture.json',
  ensureBackupDirectory: vi.fn(),
  persistEncryptedBackup: state.persist,
  listStoredBackups: vi.fn(),
}));
vi.mock('../src/services/notificationService.ts', () => ({ sendAlert: state.alert }));
vi.mock('../src/services/workflowGraphService.ts', () => ({
  default: { runAutomationNow: vi.fn() },
}));
vi.mock('../src/services/loggerService.ts', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { default: logger, logger };
});

const stopCallbacks: Array<() => unknown> = [];
const releaseCallbacks: Array<() => void> = [];
function paused<T>(result: T) {
  let release!: () => void;
  const promise = new Promise<T>((resolve) => {
    release = () => resolve(result);
  });
  releaseCallbacks.push(release);
  return { promise, release };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv('NODE_ENV', 'development');
  for (const marker of ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL']) vi.stubEnv(marker, '');
  vi.stubEnv('AUTO_BACKUP_SKIP_EXTERNAL', '1');
  vi.stubEnv('AUTO_BACKUP_SKIP_CLEANUP', '1');
  state.enqueue.mockResolvedValue(false);
  state.snapshot.mockResolvedValue({ customers: [] });
  state.query.mockResolvedValue({ rows: [] });
  state.alert.mockResolvedValue(undefined);
});
afterEach(async () => {
  for (const release of releaseCallbacks.splice(0)) release();
  for (const stop of stopCallbacks.splice(0)) await stop();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('direct scheduled job ownership', () => {
  it('waits for a direct backup file write after Redis falls back to local execution', async () => {
    const write = paused({ file: 'auto-backup-fixture.json', path: '/fixture/backup.json' });
    state.persist.mockReturnValue(write.promise);
    const backup = await import('../src/services/autoBackupService.ts');
    stopCallbacks.push(backup.stopAutoBackupScheduler);
    backup.initAutoBackupScheduler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.persist).toHaveBeenCalledOnce();
    let drained = false;
    const shutdown = backup.drainAutoBackupScheduler().then(() => {
      drained = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    write.release();
    await shutdown;
    expect(drained).toBe(true);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(state.persist).toHaveBeenCalledOnce();
  });

  it('waits for an initial automation tick before database shutdown', async () => {
    const tick = paused({ rows: [] });
    state.query.mockReturnValue(tick.promise);
    const automation = await import('../src/services/automationSchedulerService.ts');
    stopCallbacks.push(automation.stopAutomationScheduler);
    automation.initAutomationScheduler();
    expect(state.query).toHaveBeenCalledOnce();
    let drained = false;
    const shutdown = automation.drainAutomationScheduler().then(() => {
      drained = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    tick.release();
    await shutdown;
    expect(drained).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.query).toHaveBeenCalledOnce();
  });

  it('waits for scheduled maintenance and its notification before completing shutdown', async () => {
    vi.setSystemTime(new Date(2026, 9, 4, 3, 0, 0));
    const notification = paused(undefined);
    state.alert.mockReturnValue(notification.promise);
    const maintenance = await import('../src/services/maintenanceService.ts');
    const timer = maintenance.initDatabaseMaintenanceScheduler();
    stopCallbacks.push(() => {
      if (timer) clearInterval(timer);
    });
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(state.query).toHaveBeenCalledWith('VACUUM ANALYZE');
    expect(state.alert).toHaveBeenCalledOnce();
    let drained = false;
    const shutdown = maintenance.drainDatabaseMaintenanceScheduler().then(() => {
      drained = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    notification.release();
    await shutdown;
    expect(drained).toBe(true);
  });

  it('initializing maintenance twice owns only one timer', async () => {
    const maintenance = await import('../src/services/maintenanceService.ts');
    const first = maintenance.initDatabaseMaintenanceScheduler();
    const second = maintenance.initDatabaseMaintenanceScheduler();
    stopCallbacks.push(() => {
      if (first) clearInterval(first);
      if (second) clearInterval(second);
    });
    expect(second).toBe(first);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['VERCEL_ENV', 'VERCEL_URL'])(
    'every scheduler respects inherited %s serverless markers',
    async (marker) => {
      vi.stubEnv(marker, 'fixture-serverless');
      const backup = await import('../src/services/autoBackupService.ts');
      const automation = await import('../src/services/automationSchedulerService.ts');
      const maintenance = await import('../src/services/maintenanceService.ts');
      backup.initAutoBackupScheduler();
      automation.initAutomationScheduler();
      const timer = maintenance.initDatabaseMaintenanceScheduler();
      stopCallbacks.push(backup.stopAutoBackupScheduler, automation.stopAutomationScheduler, () => {
        if (timer) clearInterval(timer);
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(state.query).not.toHaveBeenCalled();
    },
  );
});
