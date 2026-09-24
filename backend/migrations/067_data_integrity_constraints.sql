-- Data-integrity guardrails for the ERP's financial and stock ledgers.
-- Existing production data was audited before applying these constraints.

DO $$
BEGIN
  ALTER TABLE inventory
    ADD CONSTRAINT inventory_quantity_non_negative
    CHECK (quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE inventory
    ADD CONSTRAINT inventory_reserved_non_negative
    CHECK (reserved_quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE inventory
    ADD CONSTRAINT inventory_reserved_not_above_quantity
    CHECK (reserved_quantity <= quantity);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE products
    ADD CONSTRAINT products_prices_non_negative
    CHECK (COALESCE(purchase_price, 0) >= 0 AND COALESCE(sale_price, 0) >= 0 AND COALESCE(wholesale_price, 0) >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE sale_items
    ADD CONSTRAINT sale_items_values_valid
    CHECK (quantity > 0 AND unit_price >= 0 AND cost_price >= 0 AND total_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE sales
    ADD CONSTRAINT sales_amounts_non_negative
    CHECK (
      COALESCE(subtotal, 0) >= 0
      AND COALESCE(discount_amount, 0) >= 0
      AND COALESCE(tax_amount, 0) >= 0
      AND COALESCE(total_amount, 0) >= 0
      AND COALESCE(cost_amount, 0) >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE payments
    ADD CONSTRAINT payments_amount_non_negative
    CHECK (amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_active_sku_unique
  ON products (sku)
  WHERE deleted_at IS NULL AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);
