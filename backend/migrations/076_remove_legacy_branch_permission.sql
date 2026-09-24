-- Existing roles may still carry the old retail-specific permission.
-- Preserve its effective POS visibility before deleting the obsolete code.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, pos.id
FROM role_permissions rp
JOIN permissions old_permission ON old_permission.id = rp.permission_id
JOIN permissions pos ON pos.code = 'pos.view'
WHERE old_permission.code = 'sales.branch'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'sales.branch');

DELETE FROM permissions WHERE code = 'sales.branch';
