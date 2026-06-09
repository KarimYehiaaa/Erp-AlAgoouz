-- Enforce a controlled set of stock movement types to protect reporting integrity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_stock_movements_movement_type'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT chk_stock_movements_movement_type
      CHECK (movement_type IN (
        'purchase',
        'purchase_reversal',
        'sale',
        'return',
        'transfer',
        'adjustment'
      ));
  END IF;
END $$;

