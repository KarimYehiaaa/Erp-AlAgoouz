/**
 * routes/sync.routes.ts — مسارات فحص ومراقبة التزامن والاتصال
 */
import { Router } from 'express';
import { syncMonitorController } from '../controllers/syncMonitorController.ts';
import { authenticate } from '../middleware/auth.ts';

const router = Router();

// [AUDIT FIX H4] مسارات مراقبة التزامن والنبض — محمية بالمصادقة
router.get('/sync/status', authenticate, syncMonitorController.getStatus);
router.get('/sync/health', authenticate, syncMonitorController.getStatus);

export default router;
