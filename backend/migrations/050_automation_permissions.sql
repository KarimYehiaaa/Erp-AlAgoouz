-- =====================================================
-- Migration 050: صلاحيات مركز الأتمتة وتحديث فواتير المشتريات
-- =====================================================

-- 1. إضافة صلاحيات الأتمتة إلى جدول permissions
INSERT INTO permissions (code, name_ar, module) VALUES
  ('automation.view', 'عرض مركز الأتمتة وسجلات التشغيل', 'automation'),
  ('automation.manage', 'إدارة وتعديل وتشغيل مسارات الأتمتة', 'automation')
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  module = EXCLUDED.module;

-- 2. منح الصلاحيات للأدوار الإدارية (المالك، مدير النظام، مدير الفرع)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('owner', 'admin', 'sys_admin', 'manager')
  AND p.module = 'automation'
ON CONFLICT DO NOTHING;

-- منح المالك (id = 1) كافة الصلاحيات دائماً
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, p.id
FROM permissions p
WHERE p.module = 'automation'
ON CONFLICT DO NOTHING;

-- 3. التأكد من وجود أعمدة الاستحقاق وحالة الدفع في فواتير المشتريات
ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid';

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_due_date
  ON purchase_invoices(due_date)
  WHERE deleted_at IS NULL;