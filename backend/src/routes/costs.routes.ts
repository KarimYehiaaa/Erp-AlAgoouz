/**
 * routes/costs.routes.ts — التكاليف والوصفات
 *  - الوصفات (إنشاء/تعديل/حذف/إنتاج) وحساب تكاليفها
 *  - سجل الإنتاج وعكس العمليات
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import { requireIdempotency } from '../middleware/idempotency.ts';
import { recipeSchema, recipeProductionSchema, reverseProductionSchema } from './schemas.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// ─── Costs / Recipes ──────────────────────────────────────────────────────────
router.get('/costs/recipes', authenticate, authorize('products.view'), api.costs.listRecipes);
router.get('/costs/recipes/:id', authenticate, authorize('products.view'), api.costs.getRecipe);
router.post(
  '/costs/recipes',
  authenticate,
  authorize('products.add'),
  requireIdempotency,
  validateBody(recipeSchema),
  api.costs.createRecipe,
);
router.put(
  '/costs/recipes/:id',
  authenticate,
  authorize('products.edit'),
  requireIdempotency,
  validateBody(recipeSchema),
  api.costs.updateRecipe,
);
router.delete(
  '/costs/recipes/:id',
  authenticate,
  authorize('products.delete'),
  api.costs.deleteRecipe,
);
router.post(
  '/costs/recipes/:id/produce',
  authenticate,
  authorize('products.add'),
  requireIdempotency,
  validateBody(recipeProductionSchema),
  api.costs.produceRecipe,
);
router.get(
  '/costs/productions',
  authenticate,
  authorize('products.view'),
  api.costs.listProductions,
);
router.post(
  '/costs/productions/:movementId/reverse',
  authenticate,
  authorize('products.add'),
  requireIdempotency,
  validateBody(reverseProductionSchema),
  api.costs.reverseProduction,
);

/**
 * موجّه التكاليف والوصفات.
 */
export default router;
