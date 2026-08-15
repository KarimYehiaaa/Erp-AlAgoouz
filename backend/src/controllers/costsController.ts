import * as costsService from '../services/costsService.ts';
import * as recipesService from '../services/recipesService.ts';
import { ok } from './helper.ts';

export const costs = {
  /**
   * قائمة وصفات التصنيع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  listRecipes: async (_req, res, next) => {
    try {
      ok(res, await costsService.getRecipes());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب وصفة تصنيع حسب معرفها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getRecipe: async (req, res, next) => {
    try {
      ok(res, await costsService.getRecipeById(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء وصفة تصنيع جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createRecipe: async (req, res, next) => {
    try {
      ok(res, await costsService.createRecipe(req.body, req.user.id), 'تم إنشاء الوصفة بنجاح');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث وصفة تصنيع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateRecipe: async (req, res, next) => {
    try {
      ok(res, await costsService.updateRecipe(req.params.id, req.body), 'تم تحديث الوصفة بنجاح');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف وصفة تصنيع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteRecipe: async (req, res, next) => {
    try {
      await costsService.deleteRecipe(req.params.id);
      ok(res, null, 'تم حذف الوصفة بنجاح');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تنفيذ إنتاج منتج مُصنّع من وصفة (خصم المكونات من المخزون).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  produceRecipe: async (req, res, next) => {
    try {
      ok(
        res,
        await recipesService.produceRecipeBatch(
          {
            recipeId: req.params.id,
            quantity: req.body?.quantity,
            warehouseId: req.body?.warehouse_id,
            notes: req.body?.notes,
            mode: req.body?.mode,
          },
          req.user.id,
        ),
        'تم إنتاج الدفعة بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * سجل عمليات الإنتاج المنفذة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  listProductions: async (req, res, next) => {
    try {
      ok(res, await recipesService.listProductionBatches(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * التراجع عن عملية إنتاج وإعادة المكونات للمخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  reverseProduction: async (req, res, next) => {
    try {
      const movementId = Number(req.params.movementId);
      const reverseQty = req.body?.reverse_qty ? Number(req.body.reverse_qty) : undefined;
      ok(
        res,
        await recipesService.reverseProductionBatch(movementId, req.user.id, { reverseQty }),
        'تم عكس عملية الإنتاج بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
};
