-- ==============================================================================
-- 071_manager_override_tokens.sql
-- بن العجوز ERP — جدول توكنات تجاوز المدير الموثقة والمحمية من التكرار
-- ==============================================================================

CREATE TABLE IF NOT EXISTS manager_override_tokens (
  id BIGSERIAL PRIMARY KEY,
  jti VARCHAR(64) NOT NULL UNIQUE,
  token_hash VARCHAR(128) NOT NULL,
  manager_user_id INT NOT NULL,
  cashier_user_id INT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop FK constraints if they were created
ALTER TABLE manager_override_tokens DROP CONSTRAINT IF EXISTS manager_override_tokens_manager_user_id_fkey;
ALTER TABLE manager_override_tokens DROP CONSTRAINT IF EXISTS manager_override_tokens_cashier_user_id_fkey;

CREATE INDEX IF NOT EXISTS idx_mgr_override_jti ON manager_override_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_mgr_override_cashier ON manager_override_tokens(cashier_user_id);
CREATE INDEX IF NOT EXISTS idx_mgr_override_expires ON manager_override_tokens(expires_at);
