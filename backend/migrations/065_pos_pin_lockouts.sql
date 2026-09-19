-- Persistent POS manager-PIN lockout state.
-- Keeps brute-force protection effective across restarts and instances.
CREATE TABLE IF NOT EXISTS pos_pin_lockouts (
  lock_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_pin_lockouts_locked_until
  ON pos_pin_lockouts (locked_until);
