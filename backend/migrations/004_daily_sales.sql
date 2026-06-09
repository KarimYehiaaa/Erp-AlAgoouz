-- مبيعات يومية: فرع + جملة (بدون POS)

ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS entry_mode VARCHAR(20) DEFAULT 'daily';

UPDATE sales SET sale_date = DATE(created_at) WHERE sale_date IS NULL;
UPDATE sales SET sale_type = 'branch' WHERE sale_type = 'pos';

CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_type_date ON sales(sale_type, sale_date);

-- صلاحيات جديدة
INSERT INTO permissions (code, name_ar, module) VALUES
('sales.branch', 'مبيعات الفرع', 'sales')
ON CONFLICT (code) DO NOTHING;

UPDATE permissions SET name_ar = 'مبيعات الجملة' WHERE code = 'sales.wholesale';

-- ربط صلاحية الفرع للأدوار
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE p.code = 'sales.branch' AND r.name IN ('admin', 'manager', 'cashier')
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN sales.sale_date IS 'تاريخ البيع الفعلي (يوم المبيعات)';
COMMENT ON COLUMN sales.entry_mode IS 'daily = إدخال مبلغ يومي | items = تفصيلي';
