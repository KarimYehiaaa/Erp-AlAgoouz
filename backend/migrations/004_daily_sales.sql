-- مبيعات يومية: المحل + جملة (بدون POS)

ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS entry_mode VARCHAR(20) DEFAULT 'daily';

UPDATE sales SET sale_date = DATE(created_at) WHERE sale_date IS NULL;
UPDATE sales SET sale_type = 'retail' WHERE sale_type = 'pos';

CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_type_date ON sales(sale_type, sale_date);

UPDATE permissions SET name_ar = 'مبيعات الجملة' WHERE code = 'sales.wholesale';

COMMENT ON COLUMN sales.sale_date IS 'تاريخ البيع الفعلي (يوم المبيعات)';
COMMENT ON COLUMN sales.entry_mode IS 'daily = إدخال مبلغ يومي | items = تفصيلي';
