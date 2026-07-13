-- =====================================================
-- Migration 028: تحسين أداء المشتريات بإضافة الفهارس (Indexes)
-- =====================================================

-- 1. فهرس لمعرف فاتورة المشتريات في جدول العناصر (هام جداً للـ nested queries والـ json_agg)
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice 
  ON purchase_invoice_items(purchase_invoice_id);

-- 2. فهرس لمعرف المنتج في جدول العناصر لتسريع فحص المنتجات وسعر الشراء
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_product 
  ON purchase_invoice_items(product_id);

-- 3. فهرس لتاريخ الفاتورة لتسريع التصفية بالتواريخ (Date Filter)
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date 
  ON purchase_invoices(invoice_date);

-- 4. فهرس لتسريع التصفية حسب حالة الحذف
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_deleted 
  ON purchase_invoices(deleted_at) 
  WHERE deleted_at IS NULL;
