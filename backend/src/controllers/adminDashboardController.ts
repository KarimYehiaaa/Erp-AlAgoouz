import * as systemHealthService from '../services/systemHealthService.ts';
import { ok, wrap } from './helper.ts';

export const adminDashboard = {
  /**
   * تقرير صحة النظام (وحدة المعالجة، الذاكرة، قاعدة البيانات، الجلسات).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  health: wrap(async (req, res) => {
    ok(res, await systemHealthService.getSystemHealth());
  }),
  /**
   * قائمة الجلسات النشطة للمستخدمين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  sessions: wrap(async (req, res) => {
    ok(res, await systemHealthService.getActiveSessions());
  }),
  /**
   * إبطال جلسة محددة حسب معرفها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  revokeSession: wrap(async (req, res) => {
    ok(res, await systemHealthService.revokeSession(req.params.id), 'تم إنهاء الجلسة بنجاح');
  }),
  /**
   * إبطال جميع جلسات مستخدم محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  revokeAllSessions: wrap(async (req, res) => {
    ok(
      res,
      await systemHealthService.revokeAllUserSessions(req.params.userId),
      'تم إنهاء جميع جلسات المستخدم',
    );
  }),
  /**
   * محاولات تسجيل الدخول الفاشلة خلال الفترة المحددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  failedLogins: wrap(async (req, res) => {
    ok(res, await systemHealthService.getFailedLogins(req.query.hours));
  }),
  /**
   * آخر الأنشطة المسجلة في النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  recentActivity: wrap(async (req, res) => {
    ok(res, await systemHealthService.getRecentActivity(req.query.limit));
  }),
  /**
   * عدادات النظام العامة (مستخدمون، منتجات، مبيعات...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  counts: wrap(async (req, res) => {
    ok(res, await systemHealthService.getSystemCounts());
  }),
  /**
   * إنشاء لقطة تشخيصية فورية للبيانات (عينة سريعة للأدمن).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  backup: wrap(async (req, res) => {
    const backupData = await systemHealthService.generateDiagnosticSnapshot();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=alagoouz_erp_snapshot_${new Date().toISOString().slice(0, 10)}.json`,
    );
    res.send(JSON.stringify(backupData, null, 2));
  }),
  /**
   * إصلاح تسلسلات المعرّفات في قاعدة البيانات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  repairSequences: wrap(async (req, res) => {
    ok(res, await systemHealthService.repairSequences(), 'تم إصلاح متسلسلات قاعدة البيانات بنجاح');
  }),
  /**
   * تقرير رادار المخاطر (مخزون منخفض، تأخرات...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  riskRadar: wrap(async (req, res) => {
    ok(res, await systemHealthService.getRiskRadarReport());
  }),
  /**
   * حذف سجلات التدقيق الأقدم من عدد الأيام المحدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  purgeLogs: wrap(async (req, res) => {
    ok(
      res,
      await systemHealthService.purgeOldAuditLogs(req.body?.days),
      'تم تنظيف سجلات النشاط القديمة',
    );
  }),
  /**
   * تعيين رسالة بث عامة تظهر لجميع المستخدمين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  setBroadcast: wrap(async (req, res) => {
    ok(
      res,
      systemHealthService.setBroadcast(req.body.title, req.body.message, req.body.level),
      'تم نشر التنبيه العام للنظام',
    );
  }),
  /**
   * جلب رسالة البث الحالية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getBroadcast: wrap(async (req, res) => {
    ok(res, systemHealthService.getBroadcast());
  }),
};
