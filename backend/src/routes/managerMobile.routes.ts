import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { managerMobileController } from '../controllers/managerMobileController.ts';

const router = Router();

// مسارات التقارير الإدارية الخاصة بالموبايل (Admins & Managers)
const managerAuth = authorize('reports.view', 'sales.view', 'dashboard.view');

router.get(
  '/manager-mobile/summary',
  authenticate,
  managerAuth,
  managerMobileController.getSummary,
);
router.get(
  '/manager-mobile/inventory',
  authenticate,
  managerAuth,
  managerMobileController.getInventoryValuation,
);
router.get(
  '/manager-mobile/approvals',
  authenticate,
  managerAuth,
  managerMobileController.listApprovals,
);
router.post(
  '/manager-mobile/approvals/:id/decide',
  authenticate,
  managerAuth,
  managerMobileController.decideApproval,
);

// مسارات الكاشير لإنشاء وفحص طلبات الموافقة عن بعد
router.post('/pos/approvals/request', authenticate, managerMobileController.createApprovalRequest);
router.get('/pos/approvals/:id/status', authenticate, managerMobileController.checkApprovalStatus);

export default router;
