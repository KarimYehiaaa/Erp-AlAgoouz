/**
 * routes/sync.routes.ts — مسارات فحص ومراقبة التزامن والاتصال
 * ════════════════════════════════════════════════════════════
 */
import { Router } from 'express';
import { syncMonitorController } from '../controllers/syncMonitorController.ts';

const router = Router();

// مسارات مراقبة التزامن والنبض
router.get('/sync/status', syncMonitorController.getStatus);
router.get('/sync/health', syncMonitorController.getStatus);

export default router;
