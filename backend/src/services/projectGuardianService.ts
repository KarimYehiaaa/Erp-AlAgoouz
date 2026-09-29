/**
 * Project Guardian — durable observer for repository/CI/deployment/runtime signals.
 *
 * V1 responsibilities:
 * - persist raw project events
 * - deduplicate incidents by deterministic fingerprint
 * - detect regressions by reopening previously resolved incidents
 * - expose summary/history for a future Guardian dashboard
 *
 * It deliberately does NOT modify code, merge PRs, or perform production writes.
 */

import crypto from 'node:crypto';
import { query, withTransaction } from '../database/pool.ts';
import logger from './loggerService.ts';

export type GuardianSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type GuardianKind = 'observation' | 'incident';
export type GuardianStatus = 'open' | 'investigating' | 'fix_ready' | 'resolved' | 'ignored';

export interface GuardianEventInput {
  kind?: GuardianKind;
  source: string;
  eventType: string;
  title?: string;
  summary?: string;
  severity?: GuardianSeverity;
  component?: string;
  environment?: string;
  sourceRef?: string;
  commitSha?: string;
  branch?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
}

const allowedSeverities = new Set<GuardianSeverity>([
  'info',
  'low',
  'medium',
  'high',
  'critical',
]);

const cleanToken = (value: unknown, fallback: string, max = 64) => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:/-]+/g, '_')
    .slice(0, max);
  return normalized || fallback;
};

const cleanText = (value: unknown, max: number) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

export const buildGuardianFingerprint = (input: GuardianEventInput): string => {
  const stableKey =
    input.dedupeKey ||
    [
      cleanToken(input.source, 'unknown'),
      cleanToken(input.eventType, 'unknown'),
      cleanToken(input.component, 'unknown'),
      cleanToken(input.environment, 'unknown'),
      String(input.title || input.summary || 'untitled').trim().toLowerCase(),
    ].join('|');

  return crypto.createHash('sha256').update(stableKey).digest('hex');
};

export class ProjectGuardianService {
  static async recordEvent(input: GuardianEventInput) {
    const kind: GuardianKind = input.kind === 'incident' ? 'incident' : 'observation';
    const source = cleanToken(input.source, 'unknown', 32);
    const eventType = cleanToken(input.eventType, 'unknown', 64);
    const component = cleanToken(input.component, 'unknown', 64);
    const environment = cleanToken(input.environment, 'unknown', 32);
    const requestedSeverity = input.severity || (kind === 'incident' ? 'medium' : 'info');
    const severity: GuardianSeverity = allowedSeverities.has(requestedSeverity)
      ? requestedSeverity
      : kind === 'incident'
        ? 'medium'
        : 'info';
    const sourceRef = cleanText(input.sourceRef, 255);
    const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

    return withTransaction(async (client: any) => {
      let incident: any = null;

      if (kind === 'incident') {
        const title = cleanText(input.title || input.summary, 255);
        if (!title) throw new Error('Project Guardian incident requires title or summary');

        const fingerprint = buildGuardianFingerprint(input);
        const incidentRes = await client.query(
          `INSERT INTO project_guardian_incidents (
             fingerprint, source, event_type, title, summary, severity, status,
             component, environment, source_ref, commit_sha, branch, metadata
           )
           VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,$12::jsonb)
           ON CONFLICT (fingerprint) DO UPDATE SET
             source = EXCLUDED.source,
             event_type = EXCLUDED.event_type,
             title = EXCLUDED.title,
             summary = COALESCE(EXCLUDED.summary, project_guardian_incidents.summary),
             severity = EXCLUDED.severity,
             component = EXCLUDED.component,
             environment = EXCLUDED.environment,
             source_ref = COALESCE(EXCLUDED.source_ref, project_guardian_incidents.source_ref),
             commit_sha = COALESCE(EXCLUDED.commit_sha, project_guardian_incidents.commit_sha),
             branch = COALESCE(EXCLUDED.branch, project_guardian_incidents.branch),
             metadata = project_guardian_incidents.metadata || EXCLUDED.metadata,
             occurrences = project_guardian_incidents.occurrences + 1,
             reopened_count = project_guardian_incidents.reopened_count +
               CASE WHEN project_guardian_incidents.status = 'resolved' THEN 1 ELSE 0 END,
             status = CASE
               WHEN project_guardian_incidents.status = 'ignored' THEN 'ignored'
               ELSE 'open'
             END,
             resolved_at = CASE
               WHEN project_guardian_incidents.status = 'ignored' THEN project_guardian_incidents.resolved_at
               ELSE NULL
             END,
             last_seen_at = NOW(),
             updated_at = NOW()
           RETURNING *`,
          [
            fingerprint,
            source,
            eventType,
            title,
            cleanText(input.summary, 8000),
            severity,
            component,
            environment,
            sourceRef,
            cleanText(input.commitSha, 64),
            cleanText(input.branch, 160),
            JSON.stringify(metadata),
          ],
        );
        incident = incidentRes.rows[0];
      }

      const eventRes = await client.query(
        `INSERT INTO project_guardian_events (
           incident_id, kind, source, event_type, severity, component, environment, source_ref, payload
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         RETURNING *`,
        [
          incident?.id || null,
          kind,
          source,
          eventType,
          severity,
          component,
          environment,
          sourceRef,
          JSON.stringify({
            title: cleanText(input.title, 255),
            summary: cleanText(input.summary, 8000),
            commit_sha: cleanText(input.commitSha, 64),
            branch: cleanText(input.branch, 160),
            metadata,
          }),
        ],
      );

      return { incident, event: eventRes.rows[0] };
    });
  }

  static async listIncidents(options: { status?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const status = options.status?.trim();

    const params: any[] = [];
    const where = status ? 'WHERE status = $1' : '';
    if (status) params.push(status);
    params.push(limit, offset);

    const result = await query(
      `SELECT *
       FROM project_guardian_incidents
       ${where}
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 5
           WHEN 'high' THEN 4
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 2
           ELSE 1
         END DESC,
         last_seen_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return result.rows;
  }

  static async getSummary() {
    const [counts, recentEvents, recentIncidents] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('open','investigating','fix_ready'))::int AS active,
           COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
           COUNT(*) FILTER (WHERE severity = 'critical' AND status <> 'resolved')::int AS critical,
           COUNT(*) FILTER (WHERE severity = 'high' AND status <> 'resolved')::int AS high,
           COALESCE(SUM(reopened_count), 0)::int AS regressions
         FROM project_guardian_incidents`,
      ),
      query(
        `SELECT id, incident_id, kind, source, event_type, severity, component, environment,
                source_ref, payload, created_at
         FROM project_guardian_events
         ORDER BY created_at DESC
         LIMIT 20`,
      ),
      query(
        `SELECT id, title, severity, status, component, environment, occurrences,
                reopened_count, last_seen_at, source_ref, commit_sha, branch
         FROM project_guardian_incidents
         WHERE status <> 'ignored'
         ORDER BY last_seen_at DESC
         LIMIT 10`,
      ),
    ]);

    return {
      counters: counts.rows[0] || { active: 0, resolved: 0, critical: 0, high: 0, regressions: 0 },
      recentEvents: recentEvents.rows,
      recentIncidents: recentIncidents.rows,
    };
  }

  static async updateIncidentStatus(id: number, status: GuardianStatus, notes?: {
    rootCause?: string;
    proposedFix?: string;
    fixBranch?: string;
    fixPrUrl?: string;
  }) {
    const allowedStatuses = new Set<GuardianStatus>([
      'open',
      'investigating',
      'fix_ready',
      'resolved',
      'ignored',
    ]);
    if (!allowedStatuses.has(status)) throw new Error('Invalid Project Guardian status');

    const result = await query(
      `UPDATE project_guardian_incidents
       SET status = $2,
           root_cause = COALESCE($3, root_cause),
           proposed_fix = COALESCE($4, proposed_fix),
           fix_branch = COALESCE($5, fix_branch),
           fix_pr_url = COALESCE($6, fix_pr_url),
           resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        status,
        cleanText(notes?.rootCause, 12000),
        cleanText(notes?.proposedFix, 12000),
        cleanText(notes?.fixBranch, 255),
        cleanText(notes?.fixPrUrl, 2000),
      ],
    );
    return result.rows[0] || null;
  }
}

export function reportProjectGuardianIncidentSafely(input: GuardianEventInput): void {
  try {
    void ProjectGuardianService.recordEvent({ ...input, kind: 'incident' }).catch((err: any) => {
      logger.error(`[ProjectGuardian] failed to persist incident: ${err?.message || err}`);
    });
  } catch (err: any) {
    logger.error(`[ProjectGuardian] unexpected reporter error: ${err?.message || err}`);
  }
}

export default ProjectGuardianService;
