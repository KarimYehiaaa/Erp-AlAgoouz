import * as userService from '../services/userService.ts';
import { ok } from './helper.ts';
const users = {
  /**
   * قائمة المستخدمين مع الأدوار.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await userService.getUsers());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء مستخدم جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.createUser(req.body),
        '\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث مستخدم (البيانات، الدور، الحالة).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.updateUser(Number(req.params.id), req.body),
        '\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف مستخدم.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      ok(
        res,
        await userService.deleteUser(Number(req.params.id), userId),
        '\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة الأدوار.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  roles: async (req, res, next) => {
    try {
      ok(res, await userService.getRoles());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء دور جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createRole: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.createRole(req.body),
        '\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0646\u0635\u0628 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث دور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateRole: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.updateRole(Number(req.params.id), req.body),
        '\u062A\u0645 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0646\u0635\u0628 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف دور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteRole: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.deleteRole(Number(req.params.id)),
        '\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0646\u0635\u0628 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إشعارات المستخدم الحالي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  notifications: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      ok(res, await userService.getNotifications(userId));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب إعدادات النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  settings: async (req, res, next) => {
    try {
      ok(res, await userService.getSettings());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث إعداد نظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateSetting: async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      await userService.upsertSetting(req.params.key, req.body.value, userId);
      ok(res, null);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة التقارير المتاحة للمستخدم.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  reports: async (req, res, next) => {
    try {
      ok(res, await userService.getReports(req.params.type, req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة كل الصلاحيات المتاحة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  listPermissions: async (req, res, next) => {
    try {
      ok(res, await userService.getPermissions());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * صلاحيات دور محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getRolePermissions: async (req, res, next) => {
    try {
      ok(res, await userService.getRolePermissions(Number(req.params.id)));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث صلاحيات دور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateRolePermissions: async (req, res, next) => {
    try {
      ok(
        res,
        await userService.updateRolePermissions(Number(req.params.id), req.body.permissionIds),
        '\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u062F\u0648\u0631 \u0628\u0646\u062C\u0627\u062D',
      );
    } catch (e: any) {
      next(e);
    }
  },
};
export { users };
