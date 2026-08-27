/**
 * routes/admin.routes.ts — النسخ الاحتياطي ولوحة الإدارة
 *  - النسخ الاحتياطي والاستعادة والتنظيف (admin فقط)
 *  - لوحة الإدارة: الجلسات/الفحوصات/سجلات الدخول/البث/الإصلاحات
 */
import { Router } from 'express';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { requireConfirmation } from '../middleware/confirmAction.ts';
import { upload, requireAdmin } from './helpers.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// ─── Backup / Restore — admin only ───────────────────────────────────────────
// إصلاح: كانت متاحة لأي settings.manage بدون تمييز
router.get(
  '/backup/create',
  authenticate,
  authorize('settings.view'),
  requireAdmin,
  auditLog('backup_create', 'backup'),
  api.backup.create,
);
router.get('/backup/list', authenticate, authorize('settings.view'), requireAdmin, api.backup.list);
router.get(
  '/backup/download/:name',
  authenticate,
  authorize('settings.view'),
  requireAdmin,
  api.backup.download,
);
// BUG-16 FIX: تسجيل audit log لعمليات الاستعادة والحذف الكلي (الأكثر خطورة)
router.post(
  '/backup/restore',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  requireConfirmation('CONFIRM_RESTORE_BACKUP'),
  auditLog('backup_restore', 'backup'),
  api.backup.restore,
);
router.post(
  '/backup/restore-file',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  upload.single('file'),
  requireConfirmation('CONFIRM_RESTORE_BACKUP'),
  auditLog('backup_restore_file', 'backup'),
  api.backup.restoreFile,
);
router.post(
  '/backup/clear',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  requireConfirmation('CONFIRM_CLEAR'),
  auditLog('data_clear', 'backup'),
  api.backup.clear,
);
router.post(
  '/backup/cloud-test',
  authenticate,
  authorize('settings.add'),
  requireAdmin,
  api.backup.cloudTest,
);
router.get(
  '/backup/logs',
  authenticate,
  authorize('settings.view'),
  requireAdmin,
  api.backup.getLogs,
);

// ─── Admin Dashboard ─────────────────────────────────────────────────────────
router.get('/admin/health', authenticate, requireAdmin, api.adminDashboard.health);
router.get('/admin/sessions', authenticate, requireAdmin, api.adminDashboard.sessions);
router.delete(
  '/admin/sessions/:id',
  authenticate,
  requireAdmin,
  auditLog('session_revoke', 'admin'),
  api.adminDashboard.revokeSession,
);
router.delete(
  '/admin/sessions/user/:userId',
  authenticate,
  requireAdmin,
  auditLog('all_sessions_revoke', 'admin'),
  api.adminDashboard.revokeAllSessions,
);
router.get('/admin/failed-logins', authenticate, requireAdmin, api.adminDashboard.failedLogins);
router.get('/admin/activity', authenticate, requireAdmin, api.adminDashboard.recentActivity);
router.get('/admin/counts', authenticate, requireAdmin, api.adminDashboard.counts);
router.get(
  '/admin/backup',
  authenticate,
  requireAdmin,
  auditLog('admin_backup', 'admin'),
  api.adminDashboard.backup,
);
router.post(
  '/admin/repair-sequences',
  authenticate,
  requireAdmin,
  auditLog('admin_repair_sequences', 'admin'),
  api.adminDashboard.repairSequences,
);
router.get('/admin/risk-radar', authenticate, requireAdmin, api.adminDashboard.riskRadar);
router.post(
  '/admin/purge-logs',
  authenticate,
  requireAdmin,
  auditLog('admin_purge_logs', 'admin'),
  api.adminDashboard.purgeLogs,
);
router.post(
  '/admin/broadcast',
  authenticate,
  requireAdmin,
  auditLog('admin_broadcast', 'admin'),
  api.adminDashboard.setBroadcast,
);
router.get('/admin/broadcast', authenticate, api.adminDashboard.getBroadcast);

/**
 * موجّه النسخ الاحتياطي ولوحة الإدارة.
 */
export default router;
