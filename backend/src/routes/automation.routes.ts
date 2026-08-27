/**
 * routes/automation.routes.ts — مسارات إدارة مركز الأتمتة والتنبيهات
 * ══════════════════════════════════════════════════════════════════
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import AutomationController from '../controllers/automationController.ts';

const router = Router();

// تتطلب صلاحيات المصادقة
router.use('/automations', authenticate);

router.get('/automations', AutomationController.list);
router.get('/automations/graph', AutomationController.getGraph);
router.get('/automations/logs', AutomationController.getLogs);
router.post('/automations/test-telegram', AutomationController.testTelegram);
router.get('/automations/:id', AutomationController.getOne);
router.put('/automations/:id', AutomationController.update);
router.post('/automations/:id/trigger', AutomationController.triggerManual);

export default router;
