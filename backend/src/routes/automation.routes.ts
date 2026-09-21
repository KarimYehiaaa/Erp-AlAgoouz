/**
 * routes/automation.routes.ts — مسارات محرك الأتمتة والرسم البياني التفاعلي
 * كل المسارات محمية بـ authenticate + requireAdmin (مدير فقط).
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import {
  getGraph,
  getNodes,
  createNode,
  updateNode,
  deleteNode,
  updateNodePositions,
  createEdge,
  deleteEdge,
  getPhysics,
  updatePhysics,
  getTelegramLogs,
  toggleTelegramBot,
  getTelegramBotStatus,
  sendTelegramTestMessage,
  resetGraphDefaults,
  testAiPrompt,
  getAutomationsList,
  toggleAutomationTask,
  runAutomationTaskNow,
  getAutomationExecutionLogs,
  runAutomationSchedulerTick,
} from '../controllers/workflowGraphController.ts';

const router = Router();

// حماية مسارات العرض
const viewGuard = [authenticate, authorize('automation.view')];
// حماية مسارات الإدارة والتعديل
const manageGuard = [authenticate, authorize('automation.manage')];

// ─── الرسم البياني ──────────────────────────────────
router.get('/automation/graph', ...viewGuard, getGraph);

// ─── العقد ──────────────────────────────────────────
router.get('/automation/nodes', ...viewGuard, getNodes);
router.post('/automation/nodes', ...manageGuard, createNode);
router.put('/automation/nodes/positions', ...manageGuard, updateNodePositions);
router.put('/automation/nodes/:id', ...manageGuard, updateNode);
router.delete('/automation/nodes/:id', ...manageGuard, deleteNode);

// ─── الروابط ────────────────────────────────────────
router.post('/automation/edges', ...manageGuard, createEdge);
router.delete('/automation/edges/:id', ...manageGuard, deleteEdge);

// ─── الفيزياء ───────────────────────────────────────
router.get('/automation/physics', ...viewGuard, getPhysics);
router.put('/automation/physics', ...manageGuard, updatePhysics);

// ─── تليجرام ────────────────────────────────────────
router.get('/automation/telegram-logs', ...viewGuard, getTelegramLogs);
router.post('/automation/telegram/test-send', ...manageGuard, sendTelegramTestMessage);
router.post('/automation/telegram/toggle', ...manageGuard, toggleTelegramBot);
router.get('/automation/telegram/status', ...viewGuard, getTelegramBotStatus);
router.post('/automation/graph/reset-defaults', ...manageGuard, resetGraphDefaults);
router.post('/automation/ai/test', ...viewGuard, testAiPrompt);

// ─── مهام الأتمتة الحية والمجدولة ───────────────────
router.get('/automation/tasks', ...viewGuard, getAutomationsList);
router.get('/automation/execution-logs', ...viewGuard, getAutomationExecutionLogs);
router.post('/automation/tasks/:key/toggle', ...manageGuard, toggleAutomationTask);
router.post('/automation/tasks/:key/run', ...manageGuard, runAutomationTaskNow);

// هذا المسار لا يعتمد على جلسة مستخدم؛ يحميه سر مستقل يرسله Cron الخارجي.
router.post('/automation/scheduler/tick', runAutomationSchedulerTick);

export default router;
