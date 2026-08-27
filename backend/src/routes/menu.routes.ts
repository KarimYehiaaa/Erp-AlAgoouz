/**
 * routes/menu.routes.ts — مسارات موديول إدارة وتصميم المنيو
 */
import { Router } from 'express';
import { authenticate, authorize, auditLog } from '../middleware/auth.ts';
import { menuController } from '../controllers/menuController.ts';

const router = Router();

// مسار عام للجمهور والزبائن (بدون مصادقة) لمسح الـ QR Code وعرض المنيو
router.get('/menus/public/active', menuController.getActive);
router.get('/menus/public/:id', menuController.get);

// مسارات المنيو المحمية للإدارة
router.get('/menus', authenticate, authorize('products.view'), menuController.list);
router.get('/menus/active', authenticate, menuController.getActive);
router.get(
  '/menus/products',
  authenticate,
  authorize('products.view'),
  menuController.getAvailableProducts,
);
router.get('/menus/:id', authenticate, authorize('products.view'), menuController.get);
router.post(
  '/menus',
  authenticate,
  authorize('products.manage'),
  auditLog('create', 'menus'),
  menuController.create,
);
router.put(
  '/menus/:id',
  authenticate,
  authorize('products.manage'),
  auditLog('update', 'menus'),
  menuController.update,
);
router.delete(
  '/menus/:id',
  authenticate,
  authorize('products.manage'),
  auditLog('delete', 'menus'),
  menuController.delete,
);

export default router;
