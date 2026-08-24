-- 047: Voidable stock movements
-- يضيف عمود voided_at لتعليم حركات المخزون الملغاة بدلاً من حذفها،
-- لمنع الاحتساب المزدوج عند تعديل فاتورة بيع أو مرتجع بعدها.
-- الفهارس الجزئية تحافظ على أداء الاستعلامات التي تقرأ الحركات النشطة فقط.

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref_active
  ON stock_movements (reference_type, reference_id)
  WHERE voided_at IS NULL;

COMMENT ON COLUMN stock_movements.voided_at IS
  'وقت إلغاء الحركة — الحركات الملغاة لا تُحتسب في أي استرجاع أو تسوية';
