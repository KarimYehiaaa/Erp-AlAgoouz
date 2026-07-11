import { query } from '../database/pool.js';
import logger from './loggerService.js';
import { sendAlert } from './notificationService.js';

let lastRunDate = '';

export const runDatabaseMaintenance = async () => {
  logger.info('🧹 [بن العجوز ERP] بدء عملية صيانة قاعدة البيانات التلقائية (VACUUM ANALYZE)...');
  const startTime = Date.now();

  try {
    // VACUUM ANALYZE cleans up dead tuples and updates statistics for the query planner
    await query('VACUUM ANALYZE');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const msg = `✅ [بن العجوز ERP] اكتملت صيانة قاعدة البيانات بنجاح (VACUUM ANALYZE) خلال ${duration} ثانية.`;
    
    logger.info(msg);
    await sendAlert('🧹 صيانة قاعدة البيانات', msg, 'info');
  } catch (err) {
    const errorMsg = `❌ [بن العجوز ERP] فشلت صيانة قاعدة البيانات التلقائية: ${err.message}`;
    logger.error(errorMsg);
    await sendAlert('🧹 صيانة قاعدة البيانات', errorMsg, 'error');
  }
};

export const initDatabaseMaintenanceScheduler = () => {
  logger.info('📅 [بن العجوز ERP] تم تفعيل جدولة صيانة قاعدة البيانات (كل يوم أحد الساعة 3:00 صباحاً).');

  // Check every 30 minutes
  const CHECK_INTERVAL = 30 * 60 * 1000;
  
  setInterval(async () => {
    const now = new Date();
    const todayStr = now.toDateString();

    // 0 is Sunday, 3 is 3 AM
    if (now.getDay() === 0 && now.getHours() === 3 && lastRunDate !== todayStr) {
      lastRunDate = todayStr;
      await runDatabaseMaintenance();
    }
  }, CHECK_INTERVAL);
};

export default initDatabaseMaintenanceScheduler;
