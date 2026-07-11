-- Track real inventory cost layers for more accurate COGS/profit.

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  warehouse_id INT NOT NULL REFERENCES warehouses(id),
  source_movement_id INT REFERENCES stock_movements(id),
  source_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  remaining_quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_product_wh
  ON inventory_cost_layers(product_id, warehouse_id, remaining_quantity, created_at);

CREATE TABLE IF NOT EXISTS inventory_cost_layer_consumptions (
  id SERIAL PRIMARY KEY,
  layer_id INT NOT NULL REFERENCES inventory_cost_layers(id),
  stock_movement_id INT REFERENCES stock_movements(id),
  reference_type VARCHAR(50),
  reference_id INT,
  quantity DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_consumptions_reference
  ON inventory_cost_layer_consumptions(reference_type, reference_id);

-- Backfill rough cost values on historical production/purchase movements.
UPDATE stock_movements sm
SET unit_cost = COALESCE(NULLIF(sm.unit_cost, 0), COALESCE(p.purchase_price, 0)),
    total_cost = COALESCE(NULLIF(sm.total_cost, 0), ROUND((sm.quantity * COALESCE(p.purchase_price, 0))::numeric, 2))
FROM products p
WHERE p.id = sm.product_id
  AND sm.movement_type IN ('purchase', 'production', 'opening_production', 'return')
  AND COALESCE(sm.quantity, 0) > 0;

-- Seed layers for remaining current stock where no layer exists yet.
INSERT INTO inventory_cost_layers (
  product_id, warehouse_id, source_movement_id, source_type,
  quantity, remaining_quantity, unit_cost, total_cost, created_at
)
SELECT
  i.product_id,
  i.warehouse_id,
  NULL,
  'opening_backfill',
  i.quantity,
  i.quantity,
  COALESCE(NULLIF(p.purchase_price, 0), 0),
  ROUND((i.quantity * COALESCE(NULLIF(p.purchase_price, 0), 0))::numeric, 2),
  NOW()
FROM inventory i
JOIN products p ON p.id = i.product_id
WHERE i.quantity > 0
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_cost_layers l
    WHERE l.product_id = i.product_id
      AND l.warehouse_id = i.warehouse_id
  );
