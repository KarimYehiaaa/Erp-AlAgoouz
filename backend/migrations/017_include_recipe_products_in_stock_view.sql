-- Recipe products can now carry produced stock.
-- The view must include them so dashboards and stock alerts show the real balance.
CREATE OR REPLACE VIEW v_product_stock AS
SELECT
    p.id AS product_id,
    p.sku,
    p.name_ar,
    p.min_stock,
    p.sale_price,
    p.purchase_price,
    pc.name_ar AS category_name,
    COALESCE(SUM(i.quantity), 0) AS total_quantity,
    CASE WHEN COALESCE(SUM(i.quantity), 0) <= p.min_stock THEN TRUE ELSE FALSE END AS is_low_stock
FROM products p
LEFT JOIN product_categories pc ON p.category_id = pc.id
LEFT JOIN inventory i ON p.id = i.product_id
WHERE p.deleted_at IS NULL
  AND p.is_active = TRUE
GROUP BY p.id, pc.name_ar;
