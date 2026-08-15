import Bull from 'bullmq';
import IORedisModule from 'ioredis';

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
        } catch (_) {}
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
            console.log(`[Job] Executing backup job ${job.id}`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            console.log(`[Job] Backup job ${job.id} completed successfully`);
          }
        },
        { connection },
      );

      systemWorker!.on('completed', (job) => {
        console.log(`[Queue] Job ${job.id} has completed!`);
      });

      systemWorker!.on('failed', (job, err) => {
        console.error(`[Queue] Job ${job?.id} has failed with ${err.message}`);
      });
    })
    .catch((err) => {
      console.warn(`[Queue] ⚠️ فشل تهيئة نظام الطوابير: ${err.message}`);
    });
}

/**
 * إضافة مهمة نسخ احتياطي إلى الطابور (مع 3 محاولات وإرجاع تصاعدي).
 * @returns {Promise<void>}
 */
export const addBackupJob = async () => {
  if (isVercel || !systemQueue || !redisReady) return;
  await systemQueue!.add(
    'backup',
    { time: new Date().toISOString() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
};
