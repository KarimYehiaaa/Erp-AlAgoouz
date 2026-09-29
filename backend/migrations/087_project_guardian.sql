-- Migration: 087_project_guardian.sql
-- Purpose: Project Guardian incident/event history for CI, deployments, runtime and repository activity.

CREATE TABLE IF NOT EXISTS project_guardian_incidents (
  id BIGSERIAL PRIMARY KEY,
  fingerprint VARCHAR(64) NOT NULL UNIQUE,
  source VARCHAR(32) NOT NULL DEFAULT 'runtime',
  event_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  severity VARCHAR(16) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'fix_ready', 'resolved', 'ignored')),
  component VARCHAR(64) NOT NULL DEFAULT 'unknown',
  environment VARCHAR(32) NOT NULL DEFAULT 'unknown',
  source_ref VARCHAR(255),
  commit_sha VARCHAR(64),
  branch VARCHAR(160),
  root_cause TEXT,
  proposed_fix TEXT,
  fix_branch VARCHAR(255),
  fix_pr_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrences INT NOT NULL DEFAULT 1 CHECK (occurrences >= 1),
  reopened_count INT NOT NULL DEFAULT 0 CHECK (reopened_count >= 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_guardian_events (
  id BIGSERIAL PRIMARY KEY,
  incident_id BIGINT REFERENCES project_guardian_incidents(id) ON DELETE SET NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'observation'
    CHECK (kind IN ('observation', 'incident')),
  source VARCHAR(32) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  component VARCHAR(64) NOT NULL DEFAULT 'unknown',
  environment VARCHAR(32) NOT NULL DEFAULT 'unknown',
  source_ref VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardian_incidents_status_seen
  ON project_guardian_incidents(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_incidents_severity_seen
  ON project_guardian_incidents(severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_incidents_component_seen
  ON project_guardian_incidents(component, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_events_created
  ON project_guardian_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardian_events_type_created
  ON project_guardian_events(event_type, created_at DESC);
