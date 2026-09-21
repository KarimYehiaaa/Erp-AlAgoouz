-- This deployment operates one commercial branch with multiple warehouses.
-- Keep all active warehouses under the single canonical branch identifier.
UPDATE warehouses
SET branch_id = 1
WHERE deleted_at IS NULL;
