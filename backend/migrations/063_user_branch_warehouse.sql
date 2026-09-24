-- ============================================================================
-- Migration 063: Add warehouse assignment to users for operational access scope
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_warehouse ON users(warehouse_id) WHERE deleted_at IS NULL;
