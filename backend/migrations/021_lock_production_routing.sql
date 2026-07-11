-- Lock stocked-production routing at the database layer.
--
-- Production mode rules:
-- 1) Actual production movements must add the finished product to the product primary warehouse.
-- 2) Stocked-production recipes require a product primary warehouse.
-- 3) A product primary warehouse cannot be cleared while it has an active stocked-production recipe.
--
-- Opening production balances stay flexible intentionally; they are used for historical stock entry.

CREATE OR REPLACE FUNCTION enforce_production_output_warehouse()
RETURNS trigger AS $$
DECLARE
  product_primary_warehouse_id INT;
  recipe_mode VARCHAR(30);
BEGIN
  IF NEW.movement_type <> 'production' THEN
    RETURN NEW;
  END IF;

  SELECT p.primary_warehouse_id, r.production_mode
    INTO product_primary_warehouse_id, recipe_mode
  FROM products p
  LEFT JOIN product_recipes r
    ON r.product_id = p.id
   AND r.deleted_at IS NULL
   AND r.is_active = TRUE
  WHERE p.id = NEW.product_id
  ORDER BY r.id
  LIMIT 1;

  IF recipe_mode = 'stocked_production' THEN
    IF product_primary_warehouse_id IS NULL THEN
      RAISE EXCEPTION 'Stocked production product % must have a primary warehouse', NEW.product_id
        USING ERRCODE = '23514';
    END IF;

    IF NEW.to_warehouse_id IS DISTINCT FROM product_primary_warehouse_id THEN
      RAISE EXCEPTION 'Production output for product % must go to primary warehouse %, got %',
        NEW.product_id, product_primary_warehouse_id, NEW.to_warehouse_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_production_output_warehouse ON stock_movements;
CREATE TRIGGER trg_enforce_production_output_warehouse
BEFORE INSERT OR UPDATE OF product_id, to_warehouse_id, movement_type
ON stock_movements
FOR EACH ROW
EXECUTE FUNCTION enforce_production_output_warehouse();

CREATE OR REPLACE FUNCTION enforce_stocked_recipe_primary_warehouse()
RETURNS trigger AS $$
DECLARE
  product_primary_warehouse_id INT;
BEGIN
  IF NEW.production_mode <> 'stocked_production' THEN
    RETURN NEW;
  END IF;

  SELECT primary_warehouse_id
    INTO product_primary_warehouse_id
  FROM products
  WHERE id = NEW.product_id;

  IF product_primary_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Stocked production recipe product % must have a primary warehouse', NEW.product_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_stocked_recipe_primary_warehouse ON product_recipes;
CREATE TRIGGER trg_enforce_stocked_recipe_primary_warehouse
BEFORE INSERT OR UPDATE OF product_id, production_mode, deleted_at, is_active
ON product_recipes
FOR EACH ROW
WHEN (NEW.deleted_at IS NULL AND NEW.is_active = TRUE)
EXECUTE FUNCTION enforce_stocked_recipe_primary_warehouse();

CREATE OR REPLACE FUNCTION prevent_clearing_stocked_product_primary_warehouse()
RETURNS trigger AS $$
BEGIN
  IF NEW.primary_warehouse_id IS NULL
     AND OLD.primary_warehouse_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM product_recipes r
       WHERE r.product_id = NEW.id
         AND r.deleted_at IS NULL
         AND r.is_active = TRUE
         AND r.production_mode = 'stocked_production'
     ) THEN
    RAISE EXCEPTION 'Cannot clear primary warehouse for stocked production product %', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_clearing_stocked_product_primary_warehouse ON products;
CREATE TRIGGER trg_prevent_clearing_stocked_product_primary_warehouse
BEFORE UPDATE OF primary_warehouse_id
ON products
FOR EACH ROW
EXECUTE FUNCTION prevent_clearing_stocked_product_primary_warehouse();

-- Report historical violations without blocking installation. Old movements may have
-- been corrected later by inventory adjustments; the trigger below locks all future writes.
DO $$
DECLARE
  bad_count INT;
BEGIN
  SELECT COUNT(*)
    INTO bad_count
  FROM stock_movements sm
  JOIN product_recipes r
    ON r.id = sm.reference_id
   AND r.product_id = sm.product_id
   AND r.deleted_at IS NULL
   AND r.is_active = TRUE
   AND r.production_mode = 'stocked_production'
  JOIN products p ON p.id = sm.product_id
  WHERE sm.movement_type = 'production'
    AND sm.to_warehouse_id IS DISTINCT FROM p.primary_warehouse_id;

  IF bad_count > 0 THEN
    RAISE NOTICE 'Production routing lock installed with % historical production movement(s) that target a non-primary warehouse', bad_count;
  END IF;
END $$;
