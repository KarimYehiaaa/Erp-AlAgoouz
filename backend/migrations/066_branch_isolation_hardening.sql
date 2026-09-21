-- 066: Complete the branch-to-warehouse relationship used by branch isolation.
-- The application already reads warehouses.branch_id for assigned users, but
-- older schemas never created the column.

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS branch_id INT;

CREATE INDEX IF NOT EXISTS idx_warehouses_branch_active
  ON warehouses (branch_id, id)
  WHERE deleted_at IS NULL;
