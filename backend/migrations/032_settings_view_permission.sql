-- =====================================================
-- Migration 032: إضافة صلاحية عرض الإعدادات (settings.view)
-- =====================================================

-- 1. إضافة كود الصلاحية بجدول الصلاحيات
INSERT INTO permissions (code, name_ar, module) 
VALUES ('settings.view', 'عرض الإعدادات', 'settings')
ON CONFLICT (code) DO NOTHING;

-- 2. منح الصلاحية لمدير النظام (role_id = 1)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code = 'settings.view'
ON CONFLICT DO NOTHING;

-- 3. منح الصلاحية لمدير الفرع (role_id = 2)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code = 'settings.view'
ON CONFLICT DO NOTHING;
