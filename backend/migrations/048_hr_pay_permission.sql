-- 048: صلاحية مستقلة لصرف الرواتب (hr.pay)
-- كانت عملية الصرف محمية بـ hr.add فقط — نفس صلاحية تسجيل الحضور،
-- ما يسمح لأي موظف تسجيل حضور بصرف مسير رواتب كامل.

INSERT INTO permissions (code, name_ar, module)
VALUES ('hr.pay', 'صرف الرواتب', 'hr')
ON CONFLICT (code) DO NOTHING;

-- منحها للأدوار الإدارية تلقائياً
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('admin', 'sys_admin', 'owner')
  AND p.code = 'hr.pay'
ON CONFLICT DO NOTHING;
