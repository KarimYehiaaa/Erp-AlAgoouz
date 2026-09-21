-- Migration: 053_automation_execution_audit.sql
-- Purpose: سجل تشغيل موحد وآمن لمحرك الأتمتة.

ALTER TABLE automation_logs
  ADD COLUMN IF NOT EXISTS execution_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS trigger_source VARCHAR(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attempt INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_ms INT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_logs_execution_id
  ON automation_logs(execution_id)
  WHERE execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_logs_status_created
  ON automation_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_logs_source_created
  ON automation_logs(trigger_source, created_at DESC);

-- الأسرار التشغيلية لا تُخزّن داخل قاعدة البيانات؛ تُقرأ من متغيرات البيئة.
UPDATE automations
SET config = config - 'bot_token' - 'chat_id' - 'secret_token'
WHERE config ?| ARRAY['bot_token', 'chat_id', 'secret_token'];
