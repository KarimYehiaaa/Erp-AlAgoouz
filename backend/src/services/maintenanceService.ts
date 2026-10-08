import { query } from '../database/pool.ts';
import logger from './loggerService.ts';
import { sendAlert } from './notificationService.ts';
import { runSharedMaintenanceTask } from '../database/maintenanceBarrier.ts';

let lastRunDate = '';
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;
let scheduledMaintenance: Promise<void> | null = null;

/**
 * تنفيذ صيانة قاعدة البيانات (VACUUM + إصلاح التسلسلات + تنظيف).
 * @returns {Promise<any>}
 */
export const runDatabaseMaintenance = async () =>
  runSharedMaintenanceTask(async () => {
    logger.info(' [بن العجوز ERP] بدء عملية صيانة قاعدة البيانات التلقائية (VACUUM ANALYZE)...');
    const startTime = Date.now();

    try {
      // VACUUM ANALYZE cleans up dead tuples and updates statistics for the query planner
      await query('VACUUM ANALYZE');

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const msg = ` [بن العجوز ERP] اكتملت صيانة قاعدة البيانات بنجاح (VACUUM ANALYZE) خلال ${duration} ثانية.`;

      logger.info(msg);
      await sendAlert(' صيانة قاعدة البيانات', msg, 'info');
    } catch (err: any) {
      const errorMsg = ` [بن العجوز ERP] فشلت صيانة قاعدة البيانات التلقائية: ${err.message}`;
      logger.error(errorMsg);
      await sendAlert(' صيانة قاعدة البيانات', errorMsg, 'error');
    }
  });

/**
 * تشغيل مجدول صيانة قاعدة البيانات الدوري.
 * @returns {NodeJS.Timeout | null}
 */
export const initDatabaseMaintenanceScheduler = () => {
  // Keep recurring maintenance out of tests and serverless instances.
  if (
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    process.env.NODE_ENV === 'test'
  )
    return null;
  if (maintenanceTimer) return maintenanceTimer;

  logger.info(
    ' [بن العجوز ERP] تم تفعيل جدولة صيانة قاعدة البيانات (كل يوم أحد الساعة 3:00 صباحاً).',
  );

  // Check every 30 minutes
  const CHECK_INTERVAL = 30 * 60 * 1000;

  maintenanceTimer = setInterval(() => {
    if (scheduledMaintenance) return;
    const now = new Date();
    const todayStr = now.toDateString();

    // 0 is Sunday, 3 is 3 AM
    if (now.getDay() === 0 && now.getHours() === 3 && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      scheduledMaintenance = runDatabaseMaintenance()
        .then(() => undefined)
        .catch((err: any) => {
          lastRunDate = '';
          logger.error('تعذر بدء مهمة صيانة قاعدة البيانات:', err.message);
        })
        .finally(() => {
          scheduledMaintenance = null;
        });
    }
  }, CHECK_INTERVAL);
  return maintenanceTimer;
};

export const stopDatabaseMaintenanceScheduler = () => {
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  maintenanceTimer = null;
};

export const drainDatabaseMaintenanceScheduler = async () => {
  stopDatabaseMaintenanceScheduler();
  if (scheduledMaintenance) await scheduledMaintenance;
};

export default initDatabaseMaintenanceScheduler;
