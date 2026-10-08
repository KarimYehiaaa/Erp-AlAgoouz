import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  redisConstructor: vi.fn(),
  queueConstructor: vi.fn(),
  workerConstructor: vi.fn(),
  disconnect: vi.fn(),
  quit: vi.fn(),
  queueClose: vi.fn(),
  workerClose: vi.fn(),
  add: vi.fn(),
  createBackup: vi.fn(),
  readBackupSnapshot: vi.fn(),
  connect: vi.fn(),
  queueEmitter: null as import('node:events').EventEmitter | null,
  workerEmitter: null as import('node:events').EventEmitter | null,
}));
vi.mock('../src/services/backupService.ts', () => ({
  createBackup: state.createBackup,
  readBackupSnapshot: state.readBackupSnapshot,
}));
vi.mock('../src/services/loggerService.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('ioredis', () => ({
  default: class RedisFixture {
    constructor(...args: unknown[]) {
      state.redisConstructor(...args);
    }
    on() {
      return this;
    }
    connect = state.connect;
    ping = vi.fn().mockResolvedValue('PONG');
    disconnect = state.disconnect;
    quit = state.quit;
  },
}));
vi.mock('bullmq', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    default: {
      Queue: class QueueFixture extends EventEmitter {
        constructor(...args: unknown[]) {
          super();
          state.queueConstructor(...args);
          state.queueEmitter = this;
        }
        close = state.queueClose;
        add = state.add;
      },
      Worker: class WorkerFixture extends EventEmitter {
        constructor(...args: unknown[]) {
          super();
          state.workerConstructor(...args);
          state.workerEmitter = this;
        }
        close = state.workerClose;
      },
    },
  };
});

let queueModule: typeof import('../src/jobs/queue.ts') | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const operation of [
    state.connect,
    state.quit,
    state.queueClose,
    state.workerClose,
    state.add,
  ]) {
    operation.mockResolvedValue(undefined);
  }
  queueModule = undefined;
  state.queueEmitter = null;
  state.workerEmitter = null;
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL_URL', '');
  vi.stubEnv('REDIS_URL', 'redis://fixture.invalid:6379');
});
afterEach(async () => {
  if (queueModule && 'stopSystemQueue' in queueModule) await queueModule.stopSystemQueue();
  vi.unstubAllEnvs();
});

it('importing the queue never starts Redis or a consumer', async () => {
  queueModule = await import('../src/jobs/queue.ts');
  expect(state.redisConstructor).not.toHaveBeenCalled();
  expect(state.workerConstructor).not.toHaveBeenCalled();
  expect(await queueModule.enqueueBackup()).toBe(false);
});

it('an omitted Redis URL does not depend on a hidden local Redis installation', async () => {
  vi.stubEnv('REDIS_URL', '');
  queueModule = await import('../src/jobs/queue.ts');
  expect(await queueModule.initSystemQueue()).toBe(false);
  expect(state.redisConstructor).not.toHaveBeenCalled();
  expect(await queueModule.enqueueBackup()).toBe(false);
});

it('optional Redis queue and worker errors have handlers instead of becoming fatal process errors', async () => {
  queueModule = await import('../src/jobs/queue.ts');
  await queueModule.initSystemQueue();
  expect(() =>
    state.queueEmitter!.emit('error', new Error('Isolated queue transport failure')),
  ).not.toThrow();
  expect(() =>
    state.workerEmitter!.emit('error', new Error('Isolated worker transport failure')),
  ).not.toThrow();
});

it('failed worker cleanup still releases the queue and Redis and reports failure', async () => {
  queueModule = await import('../src/jobs/queue.ts');
  await queueModule.initSystemQueue();
  state.workerClose.mockRejectedValueOnce(new Error('Isolated close failure'));
  await expect(queueModule.stopSystemQueue()).rejects.toThrow('System queue shutdown failed');
  expect(state.queueClose).toHaveBeenCalledOnce();
  expect(state.quit).toHaveBeenCalledOnce();
  expect(queueModule.systemWorker).toBeNull();
  expect(await queueModule.enqueueBackup()).toBe(false);
});

it('test and all Vercel markers refuse queue initialization even with inherited Redis settings', async () => {
  queueModule = await import('../src/jobs/queue.ts');
  expect(queueModule.initSystemQueue).toBeTypeOf('function');
  for (const marker of ['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL']) {
    const previous = process.env[marker];
    process.env[marker] = marker === 'NODE_ENV' ? 'test' : 'fixture';
    try {
      expect(await queueModule.initSystemQueue()).toBe(false);
    } finally {
      process.env[marker] = previous;
    }
  }
  expect(state.redisConstructor).not.toHaveBeenCalled();
});

it('concurrent initialization owns only one worker and shutdown drains it before closing Redis', async () => {
  queueModule = await import('../src/jobs/queue.ts');
  expect(queueModule.initSystemQueue).toBeTypeOf('function');
  expect(await Promise.all([queueModule.initSystemQueue(), queueModule.initSystemQueue()])).toEqual(
    [true, true],
  );
  expect(state.workerConstructor).toHaveBeenCalledTimes(1);
  expect(await queueModule.enqueueBackup('auto')).toBe(true);
  expect(state.add).toHaveBeenCalledWith(
    'auto_backup',
    expect.any(Object),
    expect.objectContaining({ attempts: 3 }),
  );
  await queueModule.stopSystemQueue();
  expect(state.workerClose).toHaveBeenCalledOnce();
  expect(state.queueClose).toHaveBeenCalledOnce();
  expect(state.quit).toHaveBeenCalledOnce();
  expect(state.workerClose.mock.invocationCallOrder[0]).toBeLessThan(
    state.queueClose.mock.invocationCallOrder[0],
  );
  expect(state.queueClose.mock.invocationCallOrder[0]).toBeLessThan(
    state.quit.mock.invocationCallOrder[0],
  );
  expect(await queueModule.enqueueBackup()).toBe(false);
  expect(queueModule.systemWorker).toBeNull();
  expect(queueModule.systemQueue).toBeNull();
});

it('an unavailable Redis probe releases its connection and leaves the direct-backup fallback available', async () => {
  state.connect.mockRejectedValue(new Error('Isolated Redis unavailable'));
  queueModule = await import('../src/jobs/queue.ts');
  expect(queueModule.initSystemQueue).toBeTypeOf('function');
  expect(await queueModule.initSystemQueue()).toBe(false);
  expect(state.disconnect).toHaveBeenCalledOnce();
  expect(state.workerConstructor).not.toHaveBeenCalled();
  expect(await queueModule.enqueueBackup()).toBe(false);
});

it('shutdown during a pending connection probe prevents a late worker from starting', async () => {
  let connected!: () => void;
  state.connect.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        connected = resolve;
      }),
  );
  queueModule = await import('../src/jobs/queue.ts');
  const started = queueModule.initSystemQueue();
  const stopped = queueModule.stopSystemQueue();
  connected();
  expect(await started).toBe(false);
  await stopped;
  expect(state.workerConstructor).not.toHaveBeenCalled();
  expect(state.disconnect).toHaveBeenCalledOnce();
});

it('backup processor preserves failure propagation and returns the successful file receipt', async () => {
  queueModule = await import('../src/jobs/queue.ts');
  await queueModule.initSystemQueue();
  const processJob = state.workerConstructor.mock.calls[0][1];
  state.createBackup.mockRejectedValueOnce(new Error('Isolated snapshot write failure'));
  await expect(processJob({ id: 'fixture', name: 'backup' })).rejects.toThrow(
    'Isolated snapshot write failure',
  );
  state.createBackup.mockResolvedValueOnce({ file: 'backup-fixture.json' });
  expect(await processJob({ id: 'fixture', name: 'backup' })).toEqual({
    file: 'backup-fixture.json',
  });
  await expect(processJob({ id: 'fixture', name: 'unknown' })).rejects.toThrow(
    'Unsupported system queue job',
  );
});

it('stopping the scheduler prevents both startup and recurring backups from running later', async () => {
  vi.useFakeTimers();
  const { initAutoBackupScheduler, stopAutoBackupScheduler } =
    await import('../src/services/autoBackupService.ts');
  try {
    initAutoBackupScheduler();
    initAutoBackupScheduler();
    expect(vi.getTimerCount()).toBe(2);
    stopAutoBackupScheduler();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(state.readBackupSnapshot).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
  } finally {
    stopAutoBackupScheduler();
    vi.useRealTimers();
  }
});
