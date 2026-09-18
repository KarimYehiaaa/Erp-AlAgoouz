-- ============================================================================
-- Migration 063: Add branch_id and warehouse_id to users for strict branch isolation
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS warehouse_id INT REFERENCES warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_warehouse ON users(warehouse_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id) WHERE deleted_at IS NULL;
