import * as systemHealthService from '../services/systemHealthService.js';
import { ok } from './helper.js';

export const adminDashboard = {
  health: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getSystemHealth());
    } catch (e) {
      next(e);
    }
  },
  sessions: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getActiveSessions());
    } catch (e) {
      next(e);
    }
  },
  revokeSession: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.revokeSession(req.params.id), 'تم إنهاء الجلسة بنجاح');
    } catch (e) {
      next(e);
    }
  },
  revokeAllSessions: async (req, res, next) => {
    try {
      ok(
        res,
        await systemHealthService.revokeAllUserSessions(req.params.userId),
        'تم إنهاء جميع جلسات المستخدم',
      );
    } catch (e) {
      next(e);
    }
  },
  failedLogins: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getFailedLogins(req.query.hours));
    } catch (e) {
      next(e);
    }
  },
  recentActivity: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getRecentActivity(req.query.limit));
    } catch (e) {
      next(e);
    }
  },
  counts: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getSystemCounts());
    } catch (e) {
      next(e);
    }
  },
  backup: async (req, res, next) => {
    try {
      const backupData = await systemHealthService.generateBackupSnapshot();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=alagoouz_erp_backup_${new Date().toISOString().slice(0, 10)}.json`,
      );
      res.send(JSON.stringify(backupData, null, 2));
    } catch (e) {
      next(e);
    }
  },
  repairSequences: async (req, res, next) => {
    try {
      ok(
        res,
        await systemHealthService.repairSequences(),
        'تم إصلاح متسلسلات قاعدة البيانات بنجاح',
      );
    } catch (e) {
      next(e);
    }
  },
  riskRadar: async (req, res, next) => {
    try {
      ok(res, await systemHealthService.getRiskRadarReport());
    } catch (e) {
      next(e);
    }
  },
  purgeLogs: async (req, res, next) => {
    try {
      ok(
        res,
        await systemHealthService.purgeOldAuditLogs(req.body?.days),
        'تم تنظيف سجلات النشاط القديمة',
      );
    } catch (e) {
      next(e);
    }
  },
  setBroadcast: async (req, res, next) => {
    try {
      ok(
        res,
        systemHealthService.setBroadcast(req.body.title, req.body.message, req.body.level),
        'تم نشر التنبيه العام للنظام',
      );
    } catch (e) {
      next(e);
    }
  },
  getBroadcast: async (req, res, next) => {
    try {
      ok(res, systemHealthService.getBroadcast());
    } catch (e) {
      next(e);
    }
  },
};
