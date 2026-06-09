-- Extend stock movement policy to include production output movements.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_stock_movements_movement_type'
  ) THEN
    ALTER TABLE stock_movements
      DROP CONSTRAINT chk_stock_movements_movement_type;
  END IF;

  ALTER TABLE stock_movements
    ADD CONSTRAINT chk_stock_movements_movement_type
    CHECK (movement_type IN (
      'purchase',
      'purchase_reversal',
      'sale',
      'consumption',
      'production',
      'return',
      'transfer',
      'adjustment'
    ));
END $$;
