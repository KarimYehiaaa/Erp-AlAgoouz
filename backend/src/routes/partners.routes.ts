/**
 * routes/partners.routes.ts — مسارات جاري ومسحوبات الشركاء وتسوية الأرباح
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { partnersController } from '../controllers/partnersController.ts';

const router = Router();

// ─── مسحوبات الشركاء ──────────────────────────────────────────────────────────
router.get(
  '/partners/drawings',
  authenticate,
  authorize('reports.view', 'expenses.view', 'settings.view', 'dashboard.view'),
  partnersController.listDrawings,
);

router.post(
  '/partners/drawings',
  authenticate,
  authorize(
    'reports.view',
    'expenses.add',
    'expenses.view',
    'settings.edit',
    'settings.view',
    'pos.view',
  ),
  partnersController.createDrawing,
);

router.delete(
  '/partners/drawings/:id',
  authenticate,
  authorize('reports.view', 'expenses.delete', 'settings.delete', 'settings.edit'),
  partnersController.deleteDrawing,
);

// ─── تسوية وتوزيع الأرباح ────────────────────────────────────────────────────
router.get(
  '/partners/settlement',
  authenticate,
  authorize('reports.view', 'expenses.view', 'settings.view', 'dashboard.view'),
  partnersController.settlement,
);

// ─── إدارة الشركاء والحصص ───────────────────────────────────────────────────
router.get(
  '/partners',
  authenticate,
  authorize('reports.view', 'expenses.view', 'settings.view', 'dashboard.view'),
  partnersController.listPartners,
);

router.get(
  '/partners/:id',
  authenticate,
  authorize('reports.view', 'expenses.view', 'settings.view', 'dashboard.view'),
  partnersController.getPartner,
);

router.post(
  '/partners',
  authenticate,
  authorize('reports.view', 'expenses.add', 'settings.edit', 'settings.add', 'settings.view'),
  partnersController.createPartner,
);

router.put(
  '/partners/:id',
  authenticate,
  authorize('reports.view', 'expenses.edit', 'settings.edit', 'settings.view'),
  partnersController.updatePartner,
);

router.delete(
  '/partners/:id',
  authenticate,
  authorize('reports.view', 'expenses.delete', 'settings.delete', 'settings.edit'),
  partnersController.deletePartner,
);

// مسارات بديلة مطابقة (Fallback Aliases)
router.get(
  '/',
  authenticate,
  authorize('reports.view', 'expenses.view', 'settings.view', 'dashboard.view'),
  partnersController.listPartners,
);

router.post(
  '/',
  authenticate,
  authorize('reports.view', 'expenses.add', 'settings.edit', 'settings.add', 'settings.view'),
  partnersController.createPartner,
);

export default router;
