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
  authorize('reports.view', 'expenses.view'),
  partnersController.listDrawings,
);

router.post(
  '/partners/drawings',
  authenticate,
  authorize('reports.view', 'expenses.add', 'pos.view'),
  partnersController.createDrawing,
);

router.delete(
  '/partners/drawings/:id',
  authenticate,
  authorize('reports.view', 'expenses.delete'),
  partnersController.deleteDrawing,
);

// ─── تسوية وتوزيع الأرباح ────────────────────────────────────────────────────
router.get(
  '/partners/settlement',
  authenticate,
  authorize('reports.view'),
  partnersController.settlement,
);

// ─── إدارة الشركاء والحصص ───────────────────────────────────────────────────
router.get(
  '/partners',
  authenticate,
  authorize('reports.view', 'expenses.view'),
  partnersController.listPartners,
);

router.get('/partners/:id', authenticate, authorize('reports.view'), partnersController.getPartner);

router.post('/partners', authenticate, authorize('reports.view'), partnersController.createPartner);

router.put(
  '/partners/:id',
  authenticate,
  authorize('reports.view'),
  partnersController.updatePartner,
);

router.delete(
  '/partners/:id',
  authenticate,
  authorize('reports.view'),
  partnersController.deletePartner,
);

export default router;
