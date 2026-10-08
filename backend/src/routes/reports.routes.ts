/**
 * routes/reports.routes.ts — التقارير والتنبؤ الذكي
 *  - التنبؤ بالطلب والتوصيات (copilot, staffing, pricing, cashflow)
 *  - تقارير الأرباح والخسائر (P&L) والتقارير العامة
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { validateBody, validateQuery } from '../middleware/validate.ts';
import {
  enforceWarehouseAccess,
  requireGlobalWarehouseRole,
} from '../middleware/warehouseAccess.ts';
import { commonQuerySchema, copilotSchema } from './schemas.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// ─── Reports & AI Forecasting ─────────────────────────────────────────────────
router.get(
  '/forecasting',
  authenticate,
  authorize('reports.view'),
  validateQuery(commonQuerySchema),
  enforceWarehouseAccess,
  api.forecasting.getDemandForecast,
);
router.get(
  '/forecasting/basket-associations',
  authenticate,
  authorize('pos.view'),
  api.forecasting.getBasketAssociations,
);
router.post(
  '/forecasting/copilot',
  authenticate,
  authorize('dashboard.add'),
  validateBody(copilotSchema),
  api.forecasting.askCopilot,
);
router.get(
  '/forecasting/staffing',
  authenticate,
  authorize('reports.view'),
  validateQuery(commonQuerySchema),
  enforceWarehouseAccess,
  api.forecasting.getStaffingForecast,
);
router.get(
  '/forecasting/pricing-alerts',
  authenticate,
  authorize('products.view'),
  api.forecasting.getSmartPricingAlerts,
);
router.get(
  '/forecasting/cashflow-projection',
  authenticate,
  authorize('reports.view'),
  requireGlobalWarehouseRole,
  validateQuery(commonQuerySchema),
  enforceWarehouseAccess,
  api.forecasting.getCashFlowProjection,
);
router.get(
  '/expenses/suggest-category',
  authenticate,
  authorize('expenses.view'),
  api.forecasting.suggestExpenseCategory,
);
// P&L — يجب أن تكون قبل /:type عشان Express ما يأخذش pl كـ type
router.get('/reports/pl/monthly', authenticate, authorize('reports.view'), api.pl.report);
router.get('/reports/pl/trend', authenticate, authorize('reports.view'), api.pl.trend);
router.get('/reports/:type', authenticate, authorize('reports.view'), api.users.reports);

/**
 * موجّه التقارير والتنبؤ الذكي.
 */
export default router;
