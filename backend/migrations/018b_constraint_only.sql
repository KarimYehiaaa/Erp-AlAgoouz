DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_movements_quantity_positive'
  ) THEN
    ALTER TABLE stock_movements
      ADD CONSTRAINT chk_stock_movements_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;
