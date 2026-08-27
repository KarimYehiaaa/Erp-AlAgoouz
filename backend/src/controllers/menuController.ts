/**
 * controllers/menuController.ts — معالج طلبات إدارة وتصميم المنيو
 * ═════════════════════════════════════════════════════════════════
 */
import type { Request, Response, NextFunction } from 'express';
import * as menuService from '../services/menuService.ts';
import { ok, wrap } from './helper.ts';

export const menuController = {
  /** قائمة المنيوهات */
  list: wrap(async (_req: Request, res: Response, next: NextFunction) => {
    ok(res, await menuService.getMenus());
  }),

  /** جلب تفاصيل منيو محدد */
  get: wrap(async (req: Request, res: Response, next: NextFunction) => {
    ok(res, await menuService.getMenuById(Number(req.params.id)));
  }),

  /** جلب المنيو النشط الحالي */
  getActive: wrap(async (_req: Request, res: Response, next: NextFunction) => {
    ok(res, await menuService.getActiveMenu());
  }),

  /** إنشاء منيو جديد */
  create: wrap(async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const data = await menuService.saveMenu(req.body, undefined, userId);
    ok(res, data, 'تم إنشاء وتصميم المنيو بنجاح');
  }),

  /** تحديث منيو قائم */
  update: wrap(async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const data = await menuService.saveMenu(req.body, Number(req.params.id), userId);
    ok(res, data, 'تم حفظ تعديلات المنيو بنجاح');
  }),

  /** حذف منيو */
  delete: wrap(async (req: Request, res: Response, next: NextFunction) => {
    ok(res, await menuService.deleteMenu(Number(req.params.id)), 'تم حذف المنيو بنجاح');
  }),

  /** جلب قائمة المنتجات المتاحة للاختيار السريع */
  getAvailableProducts: wrap(async (_req: Request, res: Response, next: NextFunction) => {
    ok(res, await menuService.getAvailableProductsForMenu());
  }),
};
