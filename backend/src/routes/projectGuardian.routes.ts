/**
 * Project Guardian API.
 * Read/manage endpoints reuse automation permissions.
 * Ingestion is machine-to-machine and protected by PROJECT_GUARDIAN_SECRET.
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.ts';
import {
  ingestGuardianEvent,
  getGuardianSummary,
  getGuardianIncidents,
  updateGuardianIncidentStatus,
} from '../controllers/projectGuardianController.ts';

const router = Router();
const viewGuard = [authenticate, authorize('automation.view')];
const manageGuard = [authenticate, authorize('automation.manage')];

router.post('/guardian/events', ingestGuardianEvent);
router.get('/guardian/summary', ...viewGuard, getGuardianSummary);
router.get('/guardian/incidents', ...viewGuard, getGuardianIncidents);
router.patch('/guardian/incidents/:id/status', ...manageGuard, updateGuardianIncidentStatus);

export default router;
