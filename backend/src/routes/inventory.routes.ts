/**
 * routes/inventory.routes.ts — المخزون والفواتير وعروض الأسعار
 *  - المخزون (حركات/تحويلات/تسويات/مرتجعات) والمستودعات
 *  - الجرد الدوري (Stocktake)
 *  - فواتير المبيعات (PDF) وعروض الأسعار
 */
import { Router } from 'express';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { requireConfirmation } from '../middleware/confirmAction.ts';
import { validateBody, validateQuery } from '../middleware/validate.ts';
import { enforceWarehouseAccess } from '../middleware/warehouseAccess.ts';
import { requireIdempotency } from '../middleware/idempotency.ts';
import { upload } from './helpers.ts';
import {
  commonQuerySchema,
  inventoryTransferSchema,
  inventoryAdjustSchema,
  stocktakeCreateSchema,
  stocktakeUpdateSchema,
  invoiceSchema,
  quoteTemplateSchema,
  quotePdfSchema,
} from './schemas.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// ─── Inventory ────────────────────────────────────────────────────────────────
router.get('/inventory', authenticate, authorize('inventory.view'), api.inventory.list);
router.get(
  '/inventory/movements',
  authenticate,
  authorize('inventory.view'),
  api.inventory.movements,
);
router.get(
  '/inventory/return-template',
  authenticate,
  authorize('inventory.view'),
  api.inventory.returnTemplate,
);
router.post(
  '/inventory/return-validate',
  authenticate,
  authorize('inventory.add'),
  upload.single('file'),
  api.inventory.validateReturnExcel,
);
router.post(
  '/inventory/return-import',
  authenticate,
  authorize('inventory.add'),
  upload.single('file'),
  api.inventory.importReturnExcel,
);
router.get('/warehouses', authenticate, api.inventory.warehouses);
router.post(
  '/inventory/transfer',
  authenticate,
  authorize('inventory.add'),
  enforceWarehouseAccess,
  requireIdempotency,
  validateBody(inventoryTransferSchema),
  api.inventory.transfer,
);
router.post(
  '/inventory/adjust',
  authenticate,
  authorize('inventory.add'),
  enforceWarehouseAccess,
  requireIdempotency,
  validateBody(inventoryAdjustSchema),
  auditLog('inventory_adjust', 'inventory'),
  api.inventory.adjust,
);
router.delete(
  '/inventory',
  authenticate,
  authorize('inventory.delete'),
  requireConfirmation('CONFIRM_CLEAR_INVENTORY'),
  auditLog('inventory_clear_all', 'inventory'),
  api.inventory.clearAll,
);

// ─── Stocktake & Reconciliation ───────────────────────────────────────────────
router.get(
  '/stocktakes',
  authenticate,
  authorize('inventory.view'),
  enforceWarehouseAccess,
  api.stocktake.list,
);
router.post(
  '/stocktakes',
  authenticate,
  authorize('inventory.add'),
  enforceWarehouseAccess,
  requireIdempotency,
  validateBody(stocktakeCreateSchema),
  auditLog('stocktake_create', 'inventory'),
  api.stocktake.create,
);
router.get(
  '/stocktakes/:id',
  authenticate,
  authorize('inventory.view'),
  enforceWarehouseAccess,
  api.stocktake.get,
);
router.put(
  '/stocktakes/:id/items',
  authenticate,
  authorize('inventory.edit'),
  enforceWarehouseAccess,
  requireIdempotency,
  validateBody(stocktakeUpdateSchema),
  api.stocktake.updateItems,
);
router.post(
  '/stocktakes/:id/complete',
  authenticate,
  authorize('inventory.add'),
  enforceWarehouseAccess,
  requireIdempotency,
  auditLog('stocktake_complete', 'inventory'),
  api.stocktake.complete,
);
router.delete(
  '/stocktakes/:id',
  authenticate,
  authorize('inventory.delete'),
  enforceWarehouseAccess,
  auditLog('stocktake_delete', 'inventory'),
  api.stocktake.delete,
);

// ─── Invoices ─────────────────────────────────────────────────────────────────
router.get(
  '/invoices',
  authenticate,
  authorize('pos.view'),
  validateQuery(commonQuerySchema),
  api.invoices.list,
);
router.post(
  '/invoices',
  authenticate,
  authorize('invoices.add'),
  requireIdempotency,
  validateBody(invoiceSchema),
  api.invoices.create,
);
router.get('/invoices/:id/pdf', authenticate, authorize('pos.view'), api.invoices.pdf);
router.get('/invoices/:id', authenticate, authorize('pos.view'), api.invoices.get);
router.put(
  '/invoices/:id',
  authenticate,
  authorize('invoices.edit'),
  requireIdempotency,
  validateBody(invoiceSchema),
  api.invoices.update,
);
router.delete('/invoices/:id', authenticate, authorize('invoices.delete'), api.invoices.delete);

// ─── Quotes ───────────────────────────────────────────────────────────────────
router.get('/quotes/template', authenticate, authorize('pos.view'), api.quotes.template);
router.put(
  '/quotes/template',
  authenticate,
  authorize('pos.edit'),
  validateBody(quoteTemplateSchema),
  api.quotes.template,
);
router.post(
  '/quotes/pdf',
  authenticate,
  authorize('pos.add'),
  validateBody(quotePdfSchema),
  api.quotes.pdf,
);

/**
 * موجّه المخزون والفواتير وعروض الأسعار.
 */
export default router;
