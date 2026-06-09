SELECT sm.id, sm.movement_type, sm.product_id,
       ROUND(sm.quantity::numeric,3) qty,
       sm.to_warehouse_id, sm.from_warehouse_id,
       sm.reference_type, sm.reference_id
FROM stock_movements sm
WHERE sm.movement_type IN ('opening_production','adjustment','return')
  AND sm.created_at >= '2026-06-07'
ORDER BY sm.created_at, sm.id;
