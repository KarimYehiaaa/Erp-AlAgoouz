-- Create sequences for serial numbers
CREATE SEQUENCE IF NOT EXISTS seq_sales_number START WITH 10000;
CREATE SEQUENCE IF NOT EXISTS seq_invoices_number START WITH 10000;
CREATE SEQUENCE IF NOT EXISTS seq_purchase_invoices_number START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_expenses_number START WITH 1000;
CREATE SEQUENCE IF NOT EXISTS seq_payments_number START WITH 1000;

-- Optional: Initialize sequences with max current values if they exist
SELECT setval('seq_sales_number', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(sale_number, '\D', '', 'g') AS BIGINT)) FROM sales WHERE sale_number ~ '\d'), 10000));
SELECT setval('seq_purchase_invoices_number', COALESCE((SELECT MAX(CAST(REGEXP_REPLACE(invoice_number, '\D', '', 'g') AS BIGINT)) FROM purchase_invoices WHERE invoice_number ~ '\d'), 1000));
-- Skip setval for expenses and payments since they used Date.now() which are too large and not sequential. Starting from 1000 is cleaner.
