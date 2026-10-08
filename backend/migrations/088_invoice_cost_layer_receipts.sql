-- Track only cost layers actually consumed by new invoice stock movements.
-- Defaults preserve old movements without inventing historical consumption.
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS invoice_layer_quantity NUMERIC(18,6) NOT NULL DEFAULT 0
    CHECK (invoice_layer_quantity >= 0),
  ADD COLUMN IF NOT EXISTS invoice_layer_cost NUMERIC(18,2) NOT NULL DEFAULT 0
    CHECK (invoice_layer_cost >= 0);

-- Weighted unit costs need more precision than the displayed money amount.
ALTER TABLE sale_items ALTER COLUMN cost_price TYPE NUMERIC(18,6);
ALTER TABLE inventory_cost_layers ALTER COLUMN unit_cost TYPE NUMERIC(18,6);
