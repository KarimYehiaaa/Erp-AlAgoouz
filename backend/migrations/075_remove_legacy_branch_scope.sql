-- A single shop has warehouse access scopes, not organizational branch IDs.
-- Current authorization and inventory flows use warehouse_id; branch_id is
-- redundant metadata and is not used to compute access or financial balances.

UPDATE warehouses SET type = 'secondary' WHERE type = 'branch';

DROP INDEX IF EXISTS idx_users_branch;
DROP INDEX IF EXISTS idx_warehouses_branch_active;

ALTER TABLE users DROP COLUMN IF EXISTS branch_id;
ALTER TABLE warehouses DROP COLUMN IF EXISTS branch_id;
