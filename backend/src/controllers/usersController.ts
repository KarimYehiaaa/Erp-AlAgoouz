import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService.js';
import { ok } from './helper.js';
import type { AuthRequest } from '../types/index.js';

export const users = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.getUsers());
    } catch (e) {
      next(e);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || req.user?.userId;
      ok(res, await userService.createUser(req.body), 'تم إنشاء المستخدم بنجاح');
    } catch (e) {
      next(e);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      ok(
        res,
        await userService.updateUser(Number(req.params.id), req.body),
        'تم تحديث المستخدم بنجاح',
      );
    } catch (e) {
      next(e);
    }
  },
  delete: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || req.user?.userId;
      ok(res, await userService.deleteUser(Number(req.params.id), userId), 'تم حذف المستخدم بنجاح');
    } catch (e) {
      next(e);
    }
  },
  roles: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.getRoles());
    } catch (e) {
      next(e);
    }
  },
  createRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.createRole(req.body), 'تم إنشاء المنصب بنجاح');
    } catch (e) {
      next(e);
    }
  },
  updateRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.updateRole(Number(req.params.id), req.body), 'تم تعديل المنصب بنجاح');
    } catch (e) {
      next(e);
    }
  },
  deleteRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.deleteRole(Number(req.params.id)), 'تم حذف المنصب بنجاح');
    } catch (e) {
      next(e);
    }
  },
  notifications: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || req.user?.userId;
      ok(res, await userService.getNotifications(userId));
    } catch (e) {
      next(e);
    }
  },
  settings: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.getSettings());
    } catch (e) {
      next(e);
    }
  },
  updateSetting: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || req.user?.userId;
      await userService.upsertSetting(req.params.key as string, req.body.value, userId);
      ok(res, null);
    } catch (e) {
      next(e);
    }
  },
  reports: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.getReports(req.params.type as string, req.query));
    } catch (e) {
      next(e);
    }
  },
  listPermissions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.getPermissions());
    } catch (e) {
      next(e);
    }
  },
  getRolePermissions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await userService.getRolePermissions(Number(req.params.id)));
    } catch (e) {
      next(e);
    }
  },
  updateRolePermissions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(
        res,
        await userService.updateRolePermissions(Number(req.params.id), req.body.permissionIds),
        'تم تحديث صلاحيات الدور بنجاح',
      );
    } catch (e) {
      next(e);
    }
  },
};
