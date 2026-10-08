-- These btree indexes cover the same single-column keys. Keep the names
-- established by the earlier performance migrations and remove the duplicate
-- aliases that were reintroduced by migrations 038 and 056.
DROP INDEX IF EXISTS public.idx_purchase_invoice_items_product_id;
DROP INDEX IF EXISTS public.idx_sale_items_product_id;
