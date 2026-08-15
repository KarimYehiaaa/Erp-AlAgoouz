import * as systemHealthService from '../services/systemHealthService.ts';
import { ok } from './helper.ts';

export const adminDashboard = {
  /**
   * تقرير صحة النظام (وحدة المعالجة، الذاكرة، قاعدة البيانات، الجلسات).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  health: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getSystemHealth());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة الجلسات النشطة للمستخدمين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  sessions: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getActiveSessions());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إبطال جلسة محددة حسب معرفها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  revokeSession: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.revokeSession(req.params.id), 'تم إنهاء الجلسة بنجاح');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إبطال جميع جلسات مستخدم محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  revokeAllSessions: async (req, res, next) => {
    try {
      ok(
        res,
        await systemHealthService.revokeAllUserSessions(req.params.userId),
        'تم إنهاء جميع جلسات المستخدم',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * محاولات تسجيل الدخول الفاشلة خلال الفترة المحددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  failedLogins: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getFailedLogins(req.query.hours));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * آخر الأنشطة المسجلة في النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recentActivity: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getRecentActivity(req.query.limit));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * عدادات النظام العامة (مستخدمون، منتجات، مبيعات...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  counts: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getSystemCounts());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء لقطة نسخ احتياطي فورية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  backup: async (req, res, next) => {
    try {
      const backupData = await systemHealthService.generateBackupSnapshot();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=alagoouz_erp_backup_${new Date().toISOString().slice(0, 10)}.json`,
      );
      res.send(JSON.stringify(backupData, null, 2));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إصلاح تسلسلات المعرّفات في قاعدة البيانات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  repairSequences: async (req, res, next) => {
    try {
      ok(
        res,
        await systemHealthService.repairSequences(),
        'تم إصلاح متسلسلات قاعدة البيانات بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تقرير رادار المخاطر (مخزون منخفض، تأخرات...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  riskRadar: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getRiskRadarReport());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف سجلات التدقيق الأقدم من عدد الأيام المحدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  purgeLogs: async (req, res, next) => {
    try {
      ok(
        res,
        await systemHealthService.purgeOldAuditLogs(req.body?.days),
        'تم تنظيف سجلات النشاط القديمة',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تعيين رسالة بث عامة تظهر لجميع المستخدمين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  setBroadcast: async (req, res, next) => {
    try {
      ok(
        res,
        systemHealthService.setBroadcast(req.body.title, req.body.message, req.body.level),
        'تم نشر التنبيه العام للنظام',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب رسالة البث الحالية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getBroadcast: async (req, res, next) => {
    try {
      ok(res, systemHealthService.getBroadcast());
    } catch (e: any) {
      next(e);
    }
  },
};
