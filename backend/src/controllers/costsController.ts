import * as costsService from '../services/costsService.ts';
import * as recipesService from '../services/recipesService.ts';
import { ok, wrap } from './helper.ts';

export const costs = {
  /**
   * قائمة وصفات التصنيع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  listRecipes: wrap(async (_req, res) => {
    ok(res, await costsService.getRecipes());
  }),
  /**
   * جلب وصفة تصنيع حسب معرفها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getRecipe: wrap(async (req, res) => {
    ok(res, await costsService.getRecipeById(req.params.id));
  }),
  /**
   * إنشاء وصفة تصنيع جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createRecipe: wrap(async (req, res) => {
    ok(res, await costsService.createRecipe(req.body, req.user.id), 'تم إنشاء الوصفة بنجاح');
  }),
  /**
   * تحديث وصفة تصنيع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateRecipe: wrap(async (req, res) => {
    ok(res, await costsService.updateRecipe(req.params.id, req.body), 'تم تحديث الوصفة بنجاح');
  }),
  /**
   * حذف وصفة تصنيع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteRecipe: wrap(async (req, res) => {
    await costsService.deleteRecipe(req.params.id);
    ok(res, null, 'تم حذف الوصفة بنجاح');
  }),
  /**
   * تنفيذ إنتاج منتج مُصنّع من وصفة (خصم المكونات من المخزون).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  produceRecipe: wrap(async (req, res) => {
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
  }),
  /**
   * سجل عمليات الإنتاج المنفذة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  listProductions: wrap(async (req, res) => {
    ok(res, await recipesService.listProductionBatches(req.query));
  }),
  /**
   * التراجع عن عملية إنتاج وإعادة المكونات للمخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  reverseProduction: wrap(async (req, res) => {
    const movementId = Number(req.params.movementId);
    const reverseQty = req.body?.reverse_qty ? Number(req.body.reverse_qty) : undefined;
    ok(
      res,
      await recipesService.reverseProductionBatch(movementId, req.user.id, { reverseQty }),
      'تم عكس عملية الإنتاج بنجاح',
    );
  }),
};
