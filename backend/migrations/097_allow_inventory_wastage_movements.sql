-- Inventory write-off is a distinct stock movement, not a generic adjustment.
-- Preserve the established movement types while allowing the wastage flow.
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS chk_stock_movements_movement_type;

ALTER TABLE stock_movements
  ADD CONSTRAINT chk_stock_movements_movement_type
  CHECK (movement_type IN (
    'purchase',
    'purchase_reversal',
    'sale',
    'consumption',
    'production',
    'opening_production',
    'return',
    'transfer',
    'adjustment',
    'wastage'
  ));
