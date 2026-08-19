/**
 * controllers/automationController.ts — وحدة التحكم في إعدادات وعمليات الأتمتة
 * ══════════════════════════════════════════════════════════════════════════
 */

import { Request, Response, NextFunction } from 'express';
import AutomationService from '../services/automationService.ts';
import SchedulerService from '../services/schedulerService.ts';
import TelegramService from '../services/telegramService.ts';
import TelegramBotService from '../services/telegramBotService.ts';

export class AutomationController {
  /**
   * جلب جميع الأتمتة المتاحة
   */
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const list = await AutomationService.listAutomations();
      const activeTasks = SchedulerService.getActiveTasksList();
      res.json({
        success: true,
        data: {
          automations: list,
          activeCronTasks: activeTasks,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * جلب أتمتة واحدة
   */
  static async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const auto = await AutomationService.getAutomation(req.params.id as string);
      if (!auto) {
        return res.status(404).json({ success: false, message: 'الأتمتة غير موجودة' });
      }
      res.json({ success: true, data: auto });
    } catch (err) {
      next(err);
    }
  }

  /**
   * تحديث أتمتة (تفعيل/تعطيل، تغيير الموعد، أو إعدادات القنوات)
   */
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await AutomationService.updateAutomation(req.params.id as string, req.body);
      // إعادة تحميل الجدولة بعد التعديل
      await SchedulerService.reloadSchedules();
      // إذا تم تعديل إعدادات تليجرام، يتم تحديث محرك البوت التفاعلي فوراً
      if (req.body?.config?.bot_token) {
        TelegramBotService.restartListening().catch(() => {});
      }
      res.json({
        success: true,
        message: 'تم حفظ إعدادات الأتمتة بنجاح',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * تشغيل أتمتة تجريبياً فوراً
   */
  static async triggerManual(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AutomationService.executeAutomation(req.params.id as string, {
        isManualRun: true,
        ...req.body,
      });

      res.json({
        success: result.success,
        message: result.message,
        data: result.data,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * اختبار اتصال بوت تليجرام
   */
  static async testTelegram(req: Request, res: Response, next: NextFunction) {
    try {
      const { botToken, chatId } = req.body;
      const result = await TelegramService.sendTestMessage({ botToken, chatId });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'فشل إرسال رسالة الاختبار',
        });
      }

      // تشغيل الاستماع فور نجاح الاختبار
      TelegramBotService.restartListening().catch(() => {});

      res.json({
        success: true,
        message: 'تم إرسال رسالة الاختبار بنجاح إلى شات تليجرام! 📲',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * جلب سجلات التشغيل
   */
  static async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const autoId = req.query.automation_id ? Number(req.query.automation_id) : undefined;

      const logs = await AutomationService.getLogs(limit, offset, autoId);
      res.json({ success: true, data: { logs } });
    } catch (err) {
      next(err);
    }
  }
}

export default AutomationController;
