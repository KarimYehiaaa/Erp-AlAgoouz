-- 055_manager_approval_requests.sql
-- بن العجوز ERP: جدول طلبات الموافقات الإدارية عن بعد للكاشير والموبايل

CREATE TABLE IF NOT EXISTS manager_approval_requests (
  id SERIAL PRIMARY KEY,
  request_type VARCHAR(50) NOT NULL DEFAULT 'discount',
  requester_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  pos_shift_id INT REFERENCES pos_shifts(id) ON DELETE SET NULL,
  terminal_id INT REFERENCES pos_terminals(id) ON DELETE SET NULL,
  action_label VARCHAR(255) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  override_token VARCHAR(255),
  decided_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_req_status_created ON manager_approval_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_req_shift ON manager_approval_requests(pos_shift_id);
