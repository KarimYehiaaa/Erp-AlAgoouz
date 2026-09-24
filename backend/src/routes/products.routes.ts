/**
 * routes/products.routes.ts — المنتجات والمشتريات والموردون
 *  - المنتجات (فئات/وحدات/أسعار/استيراد/تصدير/مرتجعات)
 *  - فواتير المشتريات والموردون (فواتير/مدفوعات)
 */
import { Router } from 'express';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { requireConfirmation } from '../middleware/confirmAction.ts';
import { validateBody, validateQuery } from '../middleware/validate.ts';
import { requireIdempotency } from '../middleware/idempotency.ts';
import { upload } from './helpers.ts';
import {
  commonQuerySchema,
  productCreateSchema,
  productUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  unitCreateSchema,
  unitUpdateSchema,
  bulkPriceAdjustSchema,
  productWarehouseSchema,
  productReturnSchema,
  purchaseInvoiceSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
  paymentSchema,
} from './schemas.ts';
import * as api from '../controllers/apiController.ts';

const router = Router();

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products/shop', authenticate, authorize('pos.view'), api.products.shopProducts);
router.get(
  '/products/costs-report',
  authenticate,
  authorize('products.view'),
  api.products.costsReport,
);
router.get('/products/categories', authenticate, api.products.categories);
router.post(
  '/products/categories',
  authenticate,
  authorize('products.add'),
  validateBody(categoryCreateSchema),
  auditLog('category_create', 'products'),
  api.products.createCategory,
);
router.put(
  '/products/categories/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(categoryUpdateSchema),
  auditLog('category_update', 'products'),
  api.products.updateCategory,
);
router.delete(
  '/products/categories/:id',
  authenticate,
  authorize('products.delete'),
  auditLog('category_delete', 'products'),
  api.products.deleteCategory,
);
router.get('/products/units', authenticate, api.products.units);
router.post(
  '/products/units',
  authenticate,
  authorize('products.add'),
  validateBody(unitCreateSchema),
  auditLog('unit_create', 'products'),
  api.products.createUnit,
);
router.put(
  '/products/units/:id',
  authenticate,
  authorize('products.edit'),
  validateBody(unitUpdateSchema),
  auditLog('unit_update', 'products'),
  api.products.updateUnit,
);
router.delete(
  '/products/units/:id',
  authenticate,
  authorize('products.delete'),
  auditLog('unit_delete', 'products'),
  api.products.deleteUnit,
);
router.get('/products/template', authenticate, authorize('products.view'), api.products.template);
router.get('/products/export', authenticate, authorize('products.view'), api.products.export);
router.post(
  '/products/import',
  authenticate,
  authorize('products.add'),
  upload.single('file'),
  api.products.importExcel,
);
router.post(
  '/products/return',
  authenticate,
  authorize('pos.add'),
  validateBody(productReturnSchema),
  api.products.returnStock,
);
router.get(
  '/products/returns/list',
  authenticate,
  authorize('products.view'),
  api.products.returns,
);
router.post(
  '/products/delete-all',
  authenticate,
  authorize('products.add'),
  requireConfirmation('CONFIRM_DELETE_ALL_PRODUCTS'),
  auditLog('products_delete_all', 'products'),
  api.products.deleteAll,
);
router.get(
  '/products',
  authenticate,
  authorize('pos.view'),
  validateQuery(commonQuerySchema),
  api.products.list,
);
router.get('/products/next-sku', authenticate, authorize('products.view'), api.products.nextSku);
router.post(
  '/products',
  authenticate,
  authorize('products.add'),
  requireIdempotency,
  validateBody(productCreateSchema),
  api.products.create,
);
// BUG-14 FIX: حذف DELETE /products المكررة — الحذف الكلي متاح عبر POST /products/delete-all
router.put(
  '/products/bulk-price',
  authenticate,
  authorize('products.edit'),
  validateBody(bulkPriceAdjustSchema),
  api.products.bulkPriceAdjust,
);
router.get('/products/:id', authenticate, authorize('pos.view'), api.products.get);
router.put(
  '/products/:id/warehouse',
  authenticate,
  authorize('products.edit'),
  validateBody(productWarehouseSchema),
  api.products.setWarehouse,
);
router.put(
  '/products/:id',
  authenticate,
  authorize('products.edit'),
  requireIdempotency,
  validateBody(productUpdateSchema),
  api.products.update,
);
router.delete('/products/:id', authenticate, authorize('products.delete'), api.products.delete);

// ─── Purchases ────────────────────────────────────────────────────────────────
router.get(
  '/purchases',
  authenticate,
  authorize('products.view'),
  validateQuery(commonQuerySchema),
  api.purchases.list,
);
router.post(
  '/purchases',
  authenticate,
  authorize('products.add'),
  requireIdempotency,
  validateBody(purchaseInvoiceSchema),
  auditLog('purchase_create', 'purchases'),
  api.purchases.create,
);
router.put(
  '/purchases/:id',
  authenticate,
  authorize('products.edit'),
  requireIdempotency,
  validateBody(purchaseInvoiceSchema),
  auditLog('purchase_update', 'purchases'),
  api.purchases.update,
);
router.delete('/purchases/:id', authenticate, authorize('products.delete'), api.purchases.delete);

// ─── Suppliers ────────────────────────────────────────────────────────────────
router.get(
  '/suppliers',
  authenticate,
  authorize('suppliers.view'),
  validateQuery(commonQuerySchema),
  api.suppliers.list,
);
router.get('/suppliers/:id', authenticate, authorize('suppliers.view'), api.suppliers.get);
router.post(
  '/suppliers',
  authenticate,
  authorize('suppliers.add'),
  requireIdempotency,
  validateBody(supplierCreateSchema),
  api.suppliers.create,
);
router.put(
  '/suppliers/:id',
  authenticate,
  authorize('suppliers.edit'),
  requireIdempotency,
  validateBody(supplierUpdateSchema),
  api.suppliers.update,
);
router.delete('/suppliers/:id', authenticate, authorize('suppliers.delete'), api.suppliers.delete);
router.get(
  '/suppliers/:id/invoices',
  authenticate,
  authorize('suppliers.view'),
  api.suppliers.invoices,
);
router.get(
  '/suppliers/:id/payments',
  authenticate,
  authorize('suppliers.view'),
  api.suppliers.payments,
);
router.post(
  '/suppliers/:id/payments',
  authenticate,
  authorize('suppliers.add'),
  requireIdempotency,
  validateBody(paymentSchema),
  api.suppliers.recordPayment,
);

/**
 * موجّه المنتجات والمشتريات والموردين.
 */
export default router;
