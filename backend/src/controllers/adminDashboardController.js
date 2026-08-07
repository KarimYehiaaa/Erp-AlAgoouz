import * as systemHealthService from '../services/systemHealthService.js';
import { ok } from './helper.js';

export const adminDashboard = {
  health: async (req, res, next) => {
    try { ok(res, await systemHealthService.getSystemHealth()); } catch (e) { next(e); }
  },
  sessions: async (req, res, next) => {
    try { ok(res, await systemHealthService.getActiveSessions()); } catch (e) { next(e); }
  },
  revokeSession: async (req, res, next) => {
    try { ok(res, await systemHealthService.revokeSession(req.params.id), 'تم إنهاء الجلسة بنجاح'); } catch (e) { next(e); }
  },
  revokeAllSessions: async (req, res, next) => {
    try { ok(res, await systemHealthService.revokeAllUserSessions(req.params.userId), 'تم إنهاء جميع جلسات المستخدم'); } catch (e) { next(e); }
  },
  failedLogins: async (req, res, next) => {
    try { ok(res, await systemHealthService.getFailedLogins(req.query.hours)); } catch (e) { next(e); }
  },
  recentActivity: async (req, res, next) => {
    try { ok(res, await systemHealthService.getRecentActivity(req.query.limit)); } catch (e) { next(e); }
  },
  counts: async (req, res, next) => {
    try { ok(res, await systemHealthService.getSystemCounts()); } catch (e) { next(e); }
  },
};
