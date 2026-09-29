import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import ProjectGuardianService, {
  type GuardianStatus,
  type GuardianSeverity,
} from '../services/projectGuardianService.ts';
import { wrap } from './helper.ts';

const safeSecretMatch = (received: string, expected: string) => {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const ingestGuardianEvent = wrap(async (req: Request, res: Response) => {
  const expected = String(process.env.PROJECT_GUARDIAN_SECRET || '').trim();
  const received = String(req.get('x-project-guardian-secret') || '').trim();

  if (!safeSecretMatch(received, expected)) {
    return res.status(401).json({ success: false, message: 'Unauthorized Project Guardian event' });
  }

  const body = req.body || {};
  const source = String(body.source || '').trim();
  const eventType = String(body.event_type || body.eventType || '').trim();
  if (!source || !eventType) {
    return res.status(400).json({ success: false, message: 'source and event_type are required' });
  }

  const severity = String(body.severity || 'info') as GuardianSeverity;
  const data = await ProjectGuardianService.recordEvent({
    kind: body.kind === 'incident' ? 'incident' : 'observation',
    source,
    eventType,
    title: body.title,
    summary: body.summary,
    severity,
    component: body.component,
    environment: body.environment,
    sourceRef: body.source_ref || body.sourceRef,
    commitSha: body.commit_sha || body.commitSha,
    branch: body.branch,
    dedupeKey: body.dedupe_key || body.dedupeKey,
    metadata: body.metadata,
  });

  res.status(202).json({ success: true, data });
});

export const getGuardianSummary = wrap(async (_req: Request, res: Response) => {
  const data = await ProjectGuardianService.getSummary();
  res.json({ success: true, data });
});

export const getGuardianIncidents = wrap(async (req: Request, res: Response) => {
  const data = await ProjectGuardianService.listIncidents({
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    limit: Number(req.query.limit) || 50,
    offset: Number(req.query.offset) || 0,
  });
  res.json({ success: true, data });
});

export const updateGuardianIncidentStatus = wrap(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid incident id' });
  }

  const status = String(req.body?.status || '') as GuardianStatus;
  const updated = await ProjectGuardianService.updateIncidentStatus(id, status, {
    rootCause: req.body?.root_cause,
    proposedFix: req.body?.proposed_fix,
    fixBranch: req.body?.fix_branch,
    fixPrUrl: req.body?.fix_pr_url,
  });
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  res.json({ success: true, data: updated });
});
