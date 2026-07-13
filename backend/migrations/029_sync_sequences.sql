-- =====================================================
-- Migration 029: مزامنة قيم المتسلسلات (Sequences) لتجنب أخطاء تكرار المفاتيح
-- =====================================================

-- 1. مزامنة متسلسلة الفواتير (seq_invoices_number) بناءً على أكبر قيمة موجودة بجدول invoices
SELECT setval('seq_invoices_number', COALESCE((
  SELECT MAX(CAST(REGEXP_REPLACE(invoice_number, '\D', '', 'g') AS BIGINT)) 
  FROM invoices 
  WHERE invoice_number ~ '\d'
), 10000));

-- 2. مزامنة متسلسلة المبيعات (seq_sales_number)
SELECT setval('seq_sales_number', COALESCE((
  SELECT MAX(CAST(REGEXP_REPLACE(sale_number, '\D', '', 'g') AS BIGINT)) 
  FROM sales 
  WHERE sale_number ~ '\d'
), 10000));

-- 3. مزامنة متسلسلة المشتريات (seq_purchase_invoices_number)
SELECT setval('seq_purchase_invoices_number', COALESCE((
  SELECT MAX(CAST(REGEXP_REPLACE(invoice_number, '\D', '', 'g') AS BIGINT)) 
  FROM purchase_invoices 
  WHERE invoice_number ~ '\d'
), 1000));

-- 4. مزامنة متسلسلة المصروفات (seq_expenses_number)
SELECT setval('seq_expenses_number', COALESCE((
  SELECT MAX(CAST(REGEXP_REPLACE(expense_number, '\D', '', 'g') AS BIGINT)) 
  FROM expenses 
  WHERE expense_number ~ '\d'
), 1000));

-- 5. مزامنة متسلسلة المدفوعات (seq_payments_number)
SELECT setval('seq_payments_number', COALESCE((
  SELECT MAX(CAST(REGEXP_REPLACE(payment_number, '\D', '', 'g') AS BIGINT)) 
  FROM payments 
  WHERE payment_number ~ '\d'
), 1000));
