import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth.ts';
import { posShiftController } from '../controllers/posShiftController.ts';
import { requireIdempotency } from '../middleware/idempotency.ts';
import { validateBody } from '../middleware/validate.ts';
import { verifyPinSchema } from './schemas.ts';

const router = Router();

const posAuth = authorize('pos.view', 'pos.add', 'sales.view', 'sales.add');

// تحديد معدل التحقق من PIN لمنع التخمين: 5 محاولات لكل مستخدم في الدقيقة
const pinRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `pin:${req.user?.id || req.ip}`,
  message: { success: false, message: 'محاولات كثيرة جدًا — انتظر دقيقة ثم أعد المحاولة' },
});

// تحديد معدل مزامنة الدفعات دون اتصال لمنع الإغراق: 20 دفعة في الدقيقة لكل مستخدم
const batchSyncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `batch-sync:${req.user?.id || req.ip}`,
  message: { success: false, message: 'معدل مزامنة مرتفع — انتظر دقيقة ثم أعد المحاولة' },
});

// ─── Shift Lifecycle ─────────────────────────────────────────────────────────
router.post(
  '/pos/shifts/open',
  authenticate,
  posAuth,
  requireIdempotency,
  posShiftController.openShift,
);
router.get('/pos/shifts/current', authenticate, posAuth, posShiftController.getCurrentShift);
router.post(
  '/pos/shifts/:id/close',
  authenticate,
  posAuth,
  requireIdempotency,
  posShiftController.closeShift,
);
router.post(
  '/pos/shifts/cash-movement',
  authenticate,
  posAuth,
  requireIdempotency,
  posShiftController.recordCashMovement,
);
router.get(
  '/pos/shifts',
  authenticate,
  authorize('reports.view', 'sales.view'),
  posShiftController.listShifts,
);

// ─── Terminal & Offline Sync ────────────────────────────────────────────────
router.post('/pos/terminals/verify', authenticate, posAuth, posShiftController.verifyTerminal);
router.post(
  '/sales/batch-sync',
  authenticate,
  posAuth,
  batchSyncLimiter,
  requireIdempotency,
  posShiftController.batchSyncSales,
);

// ─── Manager PIN Override ───────────────────────────────────────────────────
router.post(
  '/pos/verify-pin',
  authenticate,
  pinRateLimiter,
  validateBody(verifyPinSchema),
  posShiftController.verifyPin,
);

export default router;
