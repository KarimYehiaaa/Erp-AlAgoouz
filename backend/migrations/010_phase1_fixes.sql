-- =====================================================
-- Migration 010: إصلاحات المرحلة الأولى
-- =====================================================

-- 1. إصلاح v_daily_sales — كان يستخدم created_at بدلاً من sale_date
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
    sale_date,
    COUNT(*) AS sales_count,
    SUM(total_amount) AS total_sales,
    SUM(profit_amount) AS total_profit,
    SUM(cost_amount) AS total_cost
FROM sales
WHERE deleted_at IS NULL AND status = 'completed'
GROUP BY sale_date
ORDER BY sale_date DESC;

-- 2. إضافة must_change_password للمستخدمين القدامى (كلمة مرور غير bcrypt)
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

UPDATE users
SET must_change_password = TRUE
WHERE password_hash NOT LIKE '$2%'
  AND deleted_at IS NULL;

-- 3. إضافة default_warehouse في الإعدادات (لو مش موجود)
INSERT INTO settings (key, value, description)
VALUES (
  'default_warehouse',
  '{"id": 1, "name": "المخزن الرئيسي"}',
  'المخزن الافتراضي للمبيعات والعمليات'
)
ON CONFLICT (key) DO NOTHING;

-- 4. إصلاح tax_percent الافتراضي في sales (الكود يُرغمه على 0)
ALTER TABLE sales ALTER COLUMN tax_percent SET DEFAULT 0;
