-- The cashier may use the POS, but the combined dashboard exposes shop-wide
-- costs, profits, partner balances, and stock valuations.
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.name = 'cashier'
  AND p.code = 'dashboard.view';
