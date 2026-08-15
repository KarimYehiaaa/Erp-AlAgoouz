-- 025: فهارس أداء للاستعلامات المالية المتكررة (تدقيق معمارية)
-- استعلامات التقارير المالية (P&L / لوحة التحكم / ملخص المبيعات) تصفّي بـ sale_date
-- بينما كان الفهرس الوحيد على created_at — هذا هو المسار الأبطأ في النظام.

CREATE INDEX IF NOT EXISTS idx_sales_sale_date
  ON sales(sale_date) WHERE deleted_at IS NULL;

-- حسابات تكلفة المبيعات وأكثر المنتجات مبيعاً تستعلم sale_items.product_id
CREATE INDEX IF NOT EXISTS idx_sale_items_product
  ON sale_items(product_id);

-- إعادة حساب أرصدة العملاء وقوائم فواتير العميل (حيث sale_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_invoices_customer
  ON invoices(customer_id) WHERE deleted_at IS NULL;

-- أرصدة العملاء: تصفية الدفعات حسب مرجع البيع/الفاتورة
CREATE INDEX IF NOT EXISTS idx_payments_ref_sale
  ON payments(reference_id) WHERE reference_type = 'sale';

CREATE INDEX IF NOT EXISTS idx_payments_ref_invoice
  ON payments(reference_id) WHERE reference_type = 'invoice';
