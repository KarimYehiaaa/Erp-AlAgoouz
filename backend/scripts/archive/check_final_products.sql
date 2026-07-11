-- كل حركات المنتجات النهائية التي لها وصفات
SELECT 
  sm.id,
  sm.movement_type,
  sm.product_id,
  ROUND(sm.quantity::numeric, 3) AS qty,
  sm.from_warehouse_id,
  sm.to_warehouse_id,
  sm.reference_type,
  sm.reference_id,
  sm.created_at::date AS date
FROM stock_movements sm
WHERE sm.product_id IN (74, 75, 76, 103, 121)
ORDER BY sm.product_id, sm.created_at, sm.id;

-- المخزون الحالي للمنتجات النهائية
SELECT 
  i.product_id,
  i.warehouse_id,
  ROUND(i.quantity::numeric, 3) AS quantity
FROM inventory i
WHERE i.product_id IN (74, 75, 76, 103, 121)
ORDER BY i.product_id, i.warehouse_id;
