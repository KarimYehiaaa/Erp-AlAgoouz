import * as costsService from '../services/costsService.js';
import * as recipesService from '../services/recipesService.js';
import { ok } from './helper.js';

export const costs = {
  listRecipes: async (_req, res, next) => { try { ok(res, await costsService.getRecipes()); } catch (e) { next(e); } },
  getRecipe: async (req, res, next) => { try { ok(res, await costsService.getRecipeById(req.params.id)); } catch (e) { next(e); } },
  createRecipe: async (req, res, next) => { try { ok(res, await costsService.createRecipe(req.body, req.user.id), 'تم إنشاء الوصفة بنجاح'); } catch (e) { next(e); } },
  updateRecipe: async (req, res, next) => { try { ok(res, await costsService.updateRecipe(req.params.id, req.body), 'تم تحديث الوصفة بنجاح'); } catch (e) { next(e); } },
  deleteRecipe: async (req, res, next) => { try { await costsService.deleteRecipe(req.params.id); ok(res, null, 'تم حذف الوصفة بنجاح'); } catch (e) { next(e); } },
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
          req.user.id
        ),
        'تم إنتاج الدفعة بنجاح'
      );
    } catch (e) { next(e); }
  },
  listProductions: async (req, res, next) => {
    try { ok(res, await recipesService.listProductionBatches(req.query)); } catch (e) { next(e); }
  },
  reverseProduction: async (req, res, next) => {
    try {
      const movementId = Number(req.params.movementId);
      const reverseQty = req.body?.reverse_qty ? Number(req.body.reverse_qty) : undefined;
      ok(
        res,
        await recipesService.reverseProductionBatch(movementId, req.user.id, { reverseQty }),
        'تم عكس عملية الإنتاج بنجاح'
      );
    } catch (e) { next(e); }
  },
};
