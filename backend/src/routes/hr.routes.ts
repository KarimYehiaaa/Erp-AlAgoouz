/**
 * routes/hr.routes.ts — الموارد البشرية والمستخدمون والإعدادات
 *  - الموارد البشرية: الورديات/الموظفون/الحضور/السلف/الرواتب
 *  - المستخدمون والأدوار والصلاحيات
 *  - الإعدادات والإشعارات
 */
import { Router } from 'express';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import {
  shiftSchema,
  employeeSchema,
  employeeUpdateSchema,
  attendanceSchema,
  advanceSchema,
  payrollSchema,
  payrollPaySchema,
  userCreateSchema,
  userUpdateSchema,
  createRoleSchema,
  updateRoleSchema,
  updateRolePermissionsSchema,
  settingUpdateSchema,
} from './schemas.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// ─── HR / Payroll ─────────────────────────────────────────────────────────────
router.get('/hr/summary', authenticate, authorize('hr.view'), api.hr.summary);
router.get('/hr/shifts', authenticate, authorize('hr.view'), api.hr.shifts);
router.post(
  '/hr/shifts',
  authenticate,
  authorize('hr.add'),
  validateBody(shiftSchema),
  api.hr.createShift,
);
router.get('/hr/employees', authenticate, authorize('hr.view'), api.hr.employees);
router.post(
  '/hr/employees',
  authenticate,
  authorize('hr.add'),
  validateBody(employeeSchema),
  api.hr.createEmployee,
);
router.put(
  '/hr/employees/:id',
  authenticate,
  authorize('hr.edit'),
  validateBody(employeeUpdateSchema),
  api.hr.updateEmployee,
);
router.delete('/hr/employees/:id', authenticate, authorize('hr.delete'), api.hr.deleteEmployee);
router.get('/hr/attendance', authenticate, authorize('hr.view'), api.hr.attendance);
router.post(
  '/hr/attendance',
  authenticate,
  authorize('hr.add'),
  validateBody(attendanceSchema),
  api.hr.saveAttendance,
);
router.delete('/hr/attendance/:id', authenticate, authorize('hr.delete'), api.hr.deleteAttendance);
router.get('/hr/advances', authenticate, authorize('hr.view'), api.hr.advances);
router.post(
  '/hr/advances',
  authenticate,
  authorize('hr.add'),
  validateBody(advanceSchema),
  api.hr.createAdvance,
);
router.delete('/hr/advances/:id', authenticate, authorize('hr.delete'), api.hr.deleteAdvance);
router.get('/hr/payroll/preview', authenticate, authorize('hr.view'), api.hr.previewPayroll);
router.get('/hr/payroll', authenticate, authorize('hr.view'), api.hr.payrollRuns);
router.post(
  '/hr/payroll',
  authenticate,
  authorize('hr.add'),
  validateBody(payrollSchema),
  api.hr.createPayroll,
);
router.get('/hr/payroll/:id', authenticate, authorize('hr.view'), api.hr.getPayroll);
router.post(
  '/hr/payroll/:id/approve',
  authenticate,
  authorize('hr.pay', 'hr.manage'),
  api.hr.approvePayroll,
);
router.post(
  '/hr/payroll/:id/pay',
  authenticate,
  authorize('hr.pay'),
  validateBody(payrollPaySchema),
  api.hr.payPayroll,
);

// ─── Users & Settings ─────────────────────────────────────────────────────────
router.get('/users', authenticate, authorize('users.view'), api.users.list);
router.post(
  '/users',
  authenticate,
  authorize('users.add'),
  validateBody(userCreateSchema),
  auditLog('user_create', 'users'),
  api.users.create,
);
router.put(
  '/users/:id',
  authenticate,
  authorize('users.edit'),
  validateBody(userUpdateSchema),
  auditLog('user_update', 'users'),
  api.users.update,
);
router.delete(
  '/users/:id',
  authenticate,
  authorize('users.delete'),
  auditLog('user_delete', 'users'),
  api.users.delete,
);
router.get('/roles', authenticate, authorize('users.view'), api.users.roles);
router.post(
  '/roles',
  authenticate,
  authorize('users.add'),
  validateBody(createRoleSchema),
  auditLog('role_create', 'users'),
  api.users.createRole,
);
router.put(
  '/roles/:id',
  authenticate,
  authorize('users.edit'),
  validateBody(updateRoleSchema),
  auditLog('role_update', 'users'),
  api.users.updateRole,
);
router.delete(
  '/roles/:id',
  authenticate,
  authorize('users.delete'),
  auditLog('role_delete', 'users'),
  api.users.deleteRole,
);
router.get('/permissions', authenticate, authorize('users.view'), api.users.listPermissions);
router.get(
  '/roles/:id/permissions',
  authenticate,
  authorize('users.view'),
  api.users.getRolePermissions,
);
router.post(
  '/roles/:id/permissions',
  authenticate,
  authorize('users.add'),
  validateBody(updateRolePermissionsSchema),
  auditLog('role_permissions_update', 'users'),
  api.users.updateRolePermissions,
);
router.get('/notifications', authenticate, api.users.notifications);
router.patch('/notifications/read-all', authenticate, api.users.markAllNotificationsRead);
router.patch('/notifications/:id/read', authenticate, api.users.markNotificationRead);
router.get('/settings', authenticate, authorize('settings.view'), api.users.settings);
router.put(
  '/settings/:key',
  authenticate,
  authorize('settings.edit'),
  validateBody(settingUpdateSchema),
  api.users.updateSetting,
);

/**
 * موجّه الموارد البشرية والمستخدمين والإعدادات.
 */
export default router;
