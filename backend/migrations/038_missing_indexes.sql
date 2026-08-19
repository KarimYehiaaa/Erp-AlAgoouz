-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 038: إضافة فهارس Foreign Keys الناقصة
-- ═════════════════════════════════════════════════════════════════════════════
-- حل مشكلة الأداء: Foreign Keys بدون Indexes تبطئ الـ JOINs والحذف المتتالي

-- فهارس user_id على الجداول الرئيسية
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);

-- فهارس الربط الأخرى
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_product_id ON purchase_invoice_items(product_id);

-- فهارس مركبة لتحسين أداء الاستعلامات المتكررة
CREATE INDEX IF NOT EXISTS idx_sales_warehouse_created ON sales(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer_status ON sales(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_wh ON stock_movements(product_id, from_warehouse_id, to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_created ON expenses(user_id, created_at);
