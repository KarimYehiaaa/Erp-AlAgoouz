import * as userService from '../services/userService.ts';
import { ok, wrap } from './helper.ts';
const users = {
  /**
   * قائمة المستخدمين مع الأدوار.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await userService.getUsers());
  }),
  /**
   * إنشاء مستخدم جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await userService.createUser(req.body), 'تم إنشاء المستخدم بنجاح');
  }),
  /**
   * تحديث مستخدم (البيانات، الدور، الحالة).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(
      res,
      await userService.updateUser(Number(req.params.id), req.body),
      'تم تحديث المستخدم بنجاح',
    );
  }),
  /**
   * حذف مستخدم.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    ok(res, await userService.deleteUser(Number(req.params.id), userId), 'تم حذف المستخدم بنجاح');
  }),
  /**
   * قائمة الأدوار.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  roles: wrap(async (req, res) => {
    ok(res, await userService.getRoles());
  }),
  /**
   * إنشاء دور جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createRole: wrap(async (req, res) => {
    ok(res, await userService.createRole(req.body), 'تم إنشاء المنصب بنجاح');
  }),
  /**
   * تحديث دور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateRole: wrap(async (req, res) => {
    ok(res, await userService.updateRole(Number(req.params.id), req.body), 'تم تعديل المنصب بنجاح');
  }),
  /**
   * حذف دور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteRole: wrap(async (req, res) => {
    ok(res, await userService.deleteRole(Number(req.params.id)), 'تم حذف المنصب بنجاح');
  }),
  /**
   * إشعارات المستخدم الحالي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  notifications: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    ok(res, await userService.getNotifications(userId));
  }),
  /**
   * تعليم إشعار واحد كمقروء.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  markNotificationRead: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    await userService.markNotificationRead(Number(req.params.id), userId);
    ok(res, { success: true });
  }),
  /**
   * تعليم كل الإشعارات كمقروءة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  markAllNotificationsRead: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    await userService.markAllNotificationsRead(userId);
    ok(res, { success: true });
  }),
  /**
   * جلب إعدادات النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  settings: wrap(async (req, res) => {
    ok(res, await userService.getSettings());
  }),
  /**
   * تحديث إعداد نظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateSetting: wrap(async (req, res) => {
    const userId = req.user?.id || req.user?.userId;
    await userService.upsertSetting(req.params.key, req.body.value, userId);
    ok(res, null);
  }),
  /**
   * قائمة التقارير المتاحة للمستخدم.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  reports: wrap(async (req, res) => {
    ok(res, await userService.getReports(req.params.type, req.query));
  }),
  /**
   * قائمة كل الصلاحيات المتاحة في النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  listPermissions: wrap(async (req, res) => {
    ok(res, await userService.getPermissions());
  }),
  /**
   * قائمة الصلاحيات الكاملة في النظام (اسم بديل).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  permissions: wrap(async (req, res) => {
    ok(res, await userService.getPermissions());
  }),
  /**
   * صلاحيات دور محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getRolePermissions: wrap(async (req, res) => {
    ok(res, await userService.getRolePermissions(Number(req.params.id)));
  }),
  /**
   * تحديث صلاحيات دور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateRolePermissions: wrap(async (req, res) => {
    ok(
      res,
      await userService.updateRolePermissions(Number(req.params.id), req.body.permissionIds),
      'تم تحديث صلاحيات الدور بنجاح',
    );
  }),
};
export { users };
