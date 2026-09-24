-- Some databases recorded migration 071 before the manager override token
-- table was introduced in the repository. Reconcile schema without replacing
-- or clearing existing one-time token records.
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

CREATE INDEX IF NOT EXISTS idx_mgr_override_cashier ON manager_override_tokens(cashier_user_id);
CREATE INDEX IF NOT EXISTS idx_mgr_override_expires ON manager_override_tokens(expires_at);
