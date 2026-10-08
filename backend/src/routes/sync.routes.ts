/**
 * routes/sync.routes.ts — مسارات فحص ومراقبة التزامن والاتصال
 */
import { Router } from 'express';
import { syncMonitorController } from '../controllers/syncMonitorController.ts';
import { authenticate } from '../middleware/auth.ts';
import { requireAdmin } from './helpers.ts';

const router = Router();

// مسارات مراقبة التزامن والنبض
router.get('/sync/status', syncMonitorController.getStatus);
router.get('/sync/health', syncMonitorController.getStatus);
router.get('/sync/details', authenticate, requireAdmin, syncMonitorController.getDetails);

export default router;
