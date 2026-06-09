-- =====================================================
-- Migration 018: ربط purchase_invoices بجدول suppliers
-- =====================================================
-- المشكلة: purchase_invoices (migration 011) ليس لها supplier_id،
-- مما يجعل تقارير الموردين تعتمد على supplier_invoices القديمة
-- التي لا ترتبط بالمخزون الفعلي.

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS supplier_id INT REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier
  ON purchase_invoices(supplier_id)
  WHERE deleted_at IS NULL AND supplier_id IS NOT NULL;

-- تحديث v_daily_sales للتأكد من استخدام sale_date (وليس created_at)
-- (كان مُصلَحاً في migration 010 لكن نُثبّته هنا للتوثيق)
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
    sale_date,
    COUNT(*) FILTER (WHERE status = 'completed') AS sales_count,
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'completed'), 0) AS total_sales,
    COALESCE(SUM(profit_amount) FILTER (WHERE status = 'completed'), 0) AS total_profit,
    COALESCE(SUM(cost_amount) FILTER (WHERE status = 'completed'), 0) AS total_cost
FROM sales
WHERE deleted_at IS NULL
GROUP BY sale_date
ORDER BY sale_date DESC;

-- إضافة CHECK constraint لـ stock_movements.quantity
-- يضمن أن الكمية المخزنة في الحركات دائماً موجبة (التعديلات السالبة تُعبَّر عن طريق movement_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_movements_quantity_positive'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT chk_stock_movements_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;
