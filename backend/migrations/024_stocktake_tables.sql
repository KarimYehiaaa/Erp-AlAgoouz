-- Migration to create stocktake tables for stocktake and reconciliation department
CREATE TABLE IF NOT EXISTS stocktakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id INT NOT NULL REFERENCES warehouses(id),
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft' or 'completed'
    notes TEXT,
    created_by INT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    total_deficit_value DECIMAL(12, 3) DEFAULT 0.000,
    total_surplus_value DECIMAL(12, 3) DEFAULT 0.000
);

CREATE TABLE IF NOT EXISTS stocktake_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    system_quantity DECIMAL(12, 3) NOT NULL,
    actual_quantity DECIMAL(12, 3),
    difference DECIMAL(12, 3),
    unit_cost DECIMAL(12, 3) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stocktakes_warehouse ON stocktakes(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_stocktake ON stocktake_items(stocktake_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_product ON stocktake_items(product_id);
