import Bull from 'bullmq';
import IORedisModule, { type Redis } from 'ioredis';
import { createBackup } from '../services/backupService.ts';
import logger from '../services/loggerService.ts';

// bullmq/ioredis ship CJS with class exports; cast for construction in ESM.
const { Queue, Worker } = Bull as any;
const IORedis = IORedisModule as any;

export let systemQueue: import('bullmq').Queue | null = null;
export let systemWorker: import('bullmq').Worker | null = null;
let connection: Redis | null = null;
let redisReady = false;
let initializing: Promise<boolean> | null = null;
let stopping: Promise<void> | null = null;
let generation = 0;

const queueAllowed = () =>
  process.env.NODE_ENV !== 'test' &&
  !process.env.VERCEL &&
  !process.env.VERCEL_ENV &&
  !process.env.VERCEL_URL &&
  !!process.env.REDIS_URL;

async function probeRedis(url: string): Promise<boolean> {
  const probe = new IORedis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    connectTimeout: 3000,
    commandTimeout: 3000,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  probe.on('error', () => {});
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

async function releaseOwnedResources() {
  redisReady = false;
  const ownedWorker = systemWorker;
  const ownedQueue = systemQueue;
  const ownedConnection = connection;
  const errors: unknown[] = [];
  // Drain the worker while its queue, Redis and database are still available.
  for (const resource of [ownedWorker, ownedQueue]) {
    if (resource) {
      try {
        await resource.close();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (ownedConnection) {
    try {
      await ownedConnection.quit();
    } catch (error) {
      errors.push(error);
      ownedConnection.disconnect();
    }
  }
  systemWorker = null;
  systemQueue = null;
  connection = null;
  if (errors.length) throw new AggregateError(errors, 'System queue shutdown failed.');
}

/** Explicit boot only: imports must never consume jobs or connect to operator Redis. */
export const initSystemQueue = (): Promise<boolean> => {
  if (!queueAllowed() || stopping) return Promise.resolve(false);
  if (redisReady) return Promise.resolve(true);
  if (initializing) return initializing;
  const epoch = generation;
  initializing = (async () => {
    try {
      if (!(await probeRedis(process.env.REDIS_URL!)) || epoch !== generation) return false;
      connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
      connection!.on('error', () => logger.error('[Queue] تعذر الاتصال بـRedis.'));
      systemQueue = new Queue('system-queue', { connection });
      systemQueue!.on('error', () => logger.error('[Queue] تعذر تنفيذ عملية في طابور Redis.'));
      systemWorker = new Worker(
        'system-queue',
        async (job) => {
          if (job.name === 'backup') {
            logger.info(`[Job] تنفيذ مهمة نسخ احتياطي ${job.id}`);
            const result = await createBackup();
            logger.info(`[Job] اكتملت المهمة ${job.id} بنجاح`);
            return result;
          }
          if (job.name === 'auto_backup') {
            const { runAutoBackup } = await import('../services/autoBackupService.ts');
            logger.info(`[Job] تنفيذ مهمة نسخ احتياطي تلقائي ${job.id}`);
            const result = await runAutoBackup();
            if (result.status === 'partial') {
              logger.warn(
                `[Job] حُفظت النسخة المحلية للمهمة ${job.id} مع تنبيهات: ${result.warnings.join(', ')}`,
              );
            } else {
              logger.info(`[Job] اكتملت المهمة ${job.id} بنجاح`);
            }
            return result;
          }
          throw new Error('Unsupported system queue job.');
        },
        { connection },
      );
      systemWorker!.on('error', () => logger.error('[Queue] تعذر تنفيذ عملية في عامل Redis.'));
      systemWorker!.on('completed', (job) => logger.info(`[Queue] اكتملت المهمة ${job.id}`));
      systemWorker!.on('failed', (job, err) =>
        logger.error(`[Queue] فشلت المهمة ${job?.id}: ${err.message}`),
      );
      redisReady = true;
      logger.info('[Queue] تم الاتصال بـRedis — نظام الطوابير مُفعّل');
      return true;
    } catch {
      await releaseOwnedResources();
      logger.warn('[Queue] تعذر تهيئة الطابور — سيُستخدم النسخ المباشر.');
      return false;
    } finally {
      initializing = null;
    }
  })();
  return initializing;
};

/** Idempotent shutdown; cancel a pending probe before it can create a late worker. */
export const stopSystemQueue = (): Promise<void> => {
  if (stopping) return stopping;
  ++generation;
  redisReady = false;
  stopping = (async () => {
    try {
      if (initializing) await initializing;
      await releaseOwnedResources();
    } finally {
      stopping = null;
    }
  })();
  return stopping;
};

/** Returns false when disabled so the caller can perform a direct local backup. */
export const enqueueBackup = async (kind: 'full' | 'auto' = 'full'): Promise<boolean> => {
  if (!queueAllowed() || !systemQueue || !redisReady) return false;
  await systemQueue.add(
    kind === 'auto' ? 'auto_backup' : 'backup',
    { time: new Date().toISOString() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
  return true;
};

/** @deprecated Use enqueueBackup instead. */
export const addBackupJob = async () => {
  await enqueueBackup('full');
};
