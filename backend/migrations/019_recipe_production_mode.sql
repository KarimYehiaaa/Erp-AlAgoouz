-- Split recipe behavior into two operational modes:
-- direct_consumption: sale consumes recipe ingredients immediately.
-- stocked_production: production creates finished-product stock; sale consumes finished product stock.

ALTER TABLE product_recipes
  ADD COLUMN IF NOT EXISTS production_mode VARCHAR(30) NOT NULL DEFAULT 'direct_consumption';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_product_recipes_production_mode'
  ) THEN
    ALTER TABLE product_recipes
      ADD CONSTRAINT chk_product_recipes_production_mode
      CHECK (production_mode IN ('direct_consumption', 'stocked_production'));
  END IF;
END $$;

-- Preserve existing behavior by default, but recipes that already have production
-- batches should become stocked-production recipes automatically.
UPDATE product_recipes r
SET production_mode = 'stocked_production',
    updated_at = NOW()
WHERE r.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM stock_movements sm
    WHERE sm.reference_type IN ('production', 'opening_production', 'recipes')
      AND sm.reference_id = r.id
      AND sm.movement_type IN ('production', 'opening_production')
  );

-- Americano is intentionally prepared by direct recipe consumption at sale time,
-- even if old data contains production-like movements for it.
UPDATE product_recipes r
SET production_mode = 'direct_consumption',
    updated_at = NOW()
FROM products p
WHERE p.id = r.product_id
  AND r.deleted_at IS NULL
  AND (r.product_id = 103 OR p.name_ar = 'امريكان');
