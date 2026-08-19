/**
 * controllers/menuController.ts — معالج طلبات إدارة وتصميم المنيو
 * ═════════════════════════════════════════════════════════════════
 */
import type { Request, Response, NextFunction } from 'express';
import * as menuService from '../services/menuService.ts';
import { ok } from './helper.ts';

export const menuController = {
  /** قائمة المنيوهات */
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await menuService.getMenus());
    } catch (e) {
      next(e);
    }
  },

  /** جلب تفاصيل منيو محدد */
  get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await menuService.getMenuById(Number(req.params.id)));
    } catch (e) {
      next(e);
    }
  },

  /** جلب المنيو النشط الحالي */
  getActive: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await menuService.getActiveMenu());
    } catch (e) {
      next(e);
    }
  },

  /** إنشاء منيو جديد */
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const data = await menuService.saveMenu(req.body, undefined, userId);
      ok(res, data, 'تم إنشاء وتصميم المنيو بنجاح');
    } catch (e) {
      next(e);
    }
  },

  /** تحديث منيو قائم */
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const data = await menuService.saveMenu(req.body, Number(req.params.id), userId);
      ok(res, data, 'تم حفظ تعديلات المنيو بنجاح');
    } catch (e) {
      next(e);
    }
  },

  /** حذف منيو */
  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await menuService.deleteMenu(Number(req.params.id)), 'تم حذف المنيو بنجاح');
    } catch (e) {
      next(e);
    }
  },

  /** جلب قائمة المنتجات المتاحة للاختيار السريع */
  getAvailableProducts: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await menuService.getAvailableProductsForMenu());
    } catch (e) {
      next(e);
    }
  },
};
