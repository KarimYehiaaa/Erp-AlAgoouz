-- Single-shop domain normalization.
-- branch_id remains only as compatibility data; operational access is warehouse-based.

UPDATE users
SET branch_id = 1
WHERE deleted_at IS NULL;

UPDATE users u
SET warehouse_id = (
  SELECT id
  FROM warehouses
  WHERE deleted_at IS NULL
  ORDER BY id ASC
  LIMIT 1
)
FROM roles r
WHERE u.role_id = r.id
  AND u.deleted_at IS NULL
  AND r.name IN ('cashier', 'warehouse')
  AND u.warehouse_id IS NULL;
