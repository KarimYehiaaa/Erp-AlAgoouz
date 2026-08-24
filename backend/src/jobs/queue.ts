import Bull from 'bullmq';
import IORedisModule from 'ioredis';

import { createBackup } from '../services/backupService.ts';
import logger from '../services/loggerService.ts';

// bullmq/ioredis ship CJS with class exports; cast through any for construction in ESM
const { Queue, Worker } = Bull as any;
const IORedis = IORedisModule as any;

const isVercel = process.env.VERCEL === 'true' || !!process.env.VERCEL;

/** طابور BullMQ النظامي (يُنشأ عند توفر Redis) — null إن كان معطلاً. */
export let systemQueue: import('bullmq').Queue | null = null;
/** عامل BullMQ النظامي (يُنشأ عند توفر Redis) — null إن كان معطلاً. */
export let systemWorker: import('bullmq').Worker | null = null;

/**
 * Redis اختياري — إذا لم يوجد REDIS_URL ولم يوجد Redis محلي،
 * لا يتم إنشاء Queue/Worker على الإطلاق ولا يتم طباعة أخطاء متكررة.
 */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redisReady = false;

/**
 * فحص توفر Redis بشكل غير مزعج (مهلة 3 ثوانٍ، بدون إعادة محاولة).
 * @returns {Promise<boolean>} true إذا كان Redis متاحًا
 */
async function probeRedis() {
  return new Promise((resolve) => {
    const probe = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // لا إعادة محاولة
      connectTimeout: 3000, // 3 ثوان فقط
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    // كتم الأخطاء أثناء الفحص
    probe.on('error', () => {});

    probe
      .connect()
      .then(() => probe.ping())
      .then(() => {
        probe.disconnect();
        resolve(true);
      })
      .catch(() => {
        try {
          probe.disconnect();
        } catch {
          // تجاهل مقصود
        }
        resolve(false);
      });
  });
}

if (!isVercel) {
  probeRedis()
    .then((available) => {
      if (!available) {
        console.log(
          '[Queue] ⚠️ Redis غير متاح — نظام الطوابير (BullMQ) معطّل. ' +
            'لتفعيله: ثبّت Redis أو أضف REDIS_URL في .env',
        );
        return;
      }

      redisReady = true;
      console.log('[Queue] ✅ تم الاتصال بـ Redis — نظام الطوابير مُفعّل');

      const connection = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
      });

      // كتم أخطاء الاتصال بعد الإنشاء
      connection.on('error', (err) => {
        console.error(`[Queue] خطأ Redis: ${err.message}`);
      });

      // Setup Main Queue
      systemQueue = new Queue('system-queue', { connection });

      // Worker
      systemWorker = new Worker(
        'system-queue',
        async (job) => {
          if (job.name === 'backup') {
            logger.info(`[Job] تنفيذ مهمة نسخ احتياطي ${job.id}`);
            await createBackup();
            logger.info(`[Job] اكتملت المهمة ${job.id} بنجاح`);
          } else if (job.name === 'auto_backup') {
            // استيراد ديناميكي لتفادي التدوير مع autoBackupService
            const { runAutoBackup } = await import('../services/autoBackupService.ts');
            logger.info(`[Job] تنفيذ مهمة نسخ احتياطي تلقائي ${job.id}`);
            await runAutoBackup();
            logger.info(`[Job] اكتملت المهمة ${job.id} بنجاح`);
          }
        },
        { connection },
      );

      systemWorker!.on('completed', (job) => {
        logger.info(`[Queue] اكتملت المهمة ${job.id}`);
      });

      systemWorker!.on('failed', (job, err) => {
        logger.error(`[Queue] فشلت المهمة ${job?.id}: ${err.message}`);
      });
    })
    .catch((err) => {
      console.warn(`[Queue] ⚠️ فشل تهيئة نظام الطوابير: ${err.message}`);
    });
}

/**
 * إضافة مهمة نسخ احتياطي إلى الطابور (مع 3 محاولات وإرجاع تصاعدي).
 * @param {'full'|'auto'} [kind] نوع النسخة: كاملة أو تلقائية (مع رفع سحابي وتنظيف)
 * @returns {Promise<boolean>} true إذا تمت الجدولة عبر الطابور، false إذا كان الطابور غير متاح
 */
export const enqueueBackup = async (kind: 'full' | 'auto' = 'full'): Promise<boolean> => {
  if (isVercel || !systemQueue || !redisReady) return false;
  await systemQueue!.add(
    kind === 'auto' ? 'auto_backup' : 'backup',
    { time: new Date().toISOString() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
  return true;
};

/**
 * إضافة مهمة نسخ احتياطي إلى الطابور (مع 3 محاولات وإرجاع تصاعدي).
 * @returns {Promise<void>}
 * @deprecated استخدم enqueueBackup بدلاً منها
 */
export const addBackupJob = async () => {
  await enqueueBackup('full');
};
