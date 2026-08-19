/**
 * services/schedulerService.ts — خدمة جدولة المهام الدورية (Cron Scheduler)
 * ═════════════════════════════════════════════════════════════════════════
 * تُدير مهام الخلفية وتشغل التقارير في أوقاتها المحددة تلقائياً.
 */

import cron from 'node-cron';
import AutomationService from './automationService.ts';
import logger from './loggerService.ts';

interface ScheduledTaskEntry {
  id: number;
  key: string;
  task: ReturnType<typeof cron.schedule>;
}

export class SchedulerService {
  private static tasks: Map<string, ScheduledTaskEntry> = new Map();
  private static isInitialized = false;

  /**
   * تهيئة وبدء تشغيل جميع المهام المجدولة النشطة
   */
  static async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    logger.info('⚡ [Scheduler] جاري تهيئة محرك المهام المجدولة (Cron Engine)...');
    await this.reloadSchedules();
  }

  /**
   * إعادة تحميل وتحديث جميع الجداول الزمنية من قاعدة البيانات
   */
  static async reloadSchedules() {
    try {
      // إيقاف وتفريغ المهام السابقة
      for (const [key, entry] of this.tasks.entries()) {
        entry.task.stop();
        this.tasks.delete(key);
      }

      const automations = await AutomationService.listAutomations();
      const cronAutomations = automations.filter(
        (a) => a.trigger_type === 'cron' && a.is_enabled && a.cron_expression,
      );

      for (const auto of cronAutomations) {
        if (!cron.validate(auto.cron_expression!)) {
          logger.warn(
            `⚠️ [Scheduler] تعبير Cron غير صالح لأتمتة "${auto.name_ar}": ${auto.cron_expression}`,
          );
          continue;
        }

        const scheduledTask = cron.schedule(
          auto.cron_expression!,
          async () => {
            logger.info(`⏰ [Scheduler] تشغيل أوتوماتيكي لـ: ${auto.name_ar} (${auto.key})`);
            try {
              await AutomationService.executeAutomation(auto.key);
            } catch (err: any) {
              logger.error(`❌ [Scheduler] فشل تشغيل ${auto.key}: ${err.message}`);
            }
          },
          {
            timezone: 'Africa/Cairo',
          },
        );

        this.tasks.set(auto.key, {
          id: auto.id,
          key: auto.key,
          task: scheduledTask,
        });

        logger.info(
          `✅ [Scheduler] تم جدولة "${auto.name_ar}" بموعد: ${auto.cron_expression} (بتوقيت القاهرة)`,
        );
      }

      logger.info(`⚡ [Scheduler] تم تفعيل (${this.tasks.size}) مهام أتمتة مجدولة بنجاح.`);
    } catch (err: any) {
      logger.error(`❌ [Scheduler] خطأ أثناء تحميل المهام المجدولة: ${err.message}`);
    }
  }

  /**
   * جلب قائمة المهام المجدولة الفعالة حالياً
   */
  static getActiveTasksList() {
    return Array.from(this.tasks.keys());
  }
}

export default SchedulerService;
