import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import { managerMobileController } from '../controllers/managerMobileController.ts';
import { WAREHOUSE_GLOBAL_ROLES } from '../../../shared/permissions.js';
import { AppError } from '../types/errors.ts';
import type { RequestHandler } from 'express';

const router = Router();

// مسارات التقارير الإدارية الخاصة بالموبايل (Admins & Managers)
const managerAuth = authorize('reports.view', 'sales.view', 'dashboard.view');
export const requireGlobalReportAccess: RequestHandler = (req, _res, next) => {
  const role = req.user?.role_name || req.user?.role;
  return (WAREHOUSE_GLOBAL_ROLES as readonly string[]).includes(role ?? '')
    ? next()
    : next(new AppError('هذا التقرير يتطلب صلاحية إدارية على مستوى المحل', 403));
};
// Keep approval authority identical to the server-side override validation.
export const requireApprovalAuthority: RequestHandler = (req, _res, next) => {
  const role = req.user?.role_name || req.user?.role;
  return (WAREHOUSE_GLOBAL_ROLES as readonly string[]).includes(role ?? '')
    ? next()
    : next(new AppError('ليس لديك صلاحية إصدار موافقة تجاوز المدير', 403));
};

router.get(
  '/manager-mobile/summary',
  authenticate,
  requireGlobalReportAccess,
  managerAuth,
  managerMobileController.getSummary,
);
router.get(
  '/manager-mobile/inventory',
  authenticate,
  requireGlobalReportAccess,
  authorize('reports.view'),
  managerMobileController.getInventoryValuation,
);
router.get(
  '/manager-mobile/approvals',
  authenticate,
  requireApprovalAuthority,
  managerMobileController.listApprovals,
);
router.post(
  '/manager-mobile/approvals/:id/decide',
  authenticate,
  requireApprovalAuthority,
  managerMobileController.decideApproval,
);

// مسارات الكاشير لإنشاء وفحص طلبات الموافقة عن بعد
router.post('/pos/approvals/request', authenticate, managerMobileController.createApprovalRequest);
router.get('/pos/approvals/:id/status', authenticate, managerMobileController.checkApprovalStatus);

export default router;
