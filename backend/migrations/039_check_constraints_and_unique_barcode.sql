-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 039: قيود CHECK وقيد UNIQUE على الباركود
-- ═════════════════════════════════════════════════════════════════════════════
-- حماية سلامة البيانات على مستوى قاعدة البيانات

DO $$
BEGIN
  -- ──── قيود الأسعار والكميات ────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_sale_price') THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_sale_price CHECK (sale_price IS NULL OR sale_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_purchase_price') THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_purchase_price CHECK (purchase_price IS NULL OR purchase_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_quantity') THEN
    ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_quantity CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_unit_price') THEN
    ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_unit_price CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_discount') THEN
    ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_discount CHECK (discount_amount >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_purchase_items_quantity') THEN
    ALTER TABLE purchase_invoice_items ADD CONSTRAINT chk_purchase_items_quantity CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_purchase_items_unit_price') THEN
    ALTER TABLE purchase_invoice_items ADD CONSTRAINT chk_purchase_items_unit_price CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_quantity') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT chk_invoice_items_quantity CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoice_items_unit_price') THEN
    ALTER TABLE invoice_items ADD CONSTRAINT chk_invoice_items_unit_price CHECK (unit_price >= 0);
  END IF;

  -- ──── قيود المخزون ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_quantity') THEN
    ALTER TABLE inventory ADD CONSTRAINT chk_inventory_quantity CHECK (quantity >= 0);
  END IF;

  -- ──── قيود الرواتب والمصروفات ───────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_expenses_amount') THEN
    ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount CHECK (amount >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payroll_base_salary') THEN
    ALTER TABLE payroll_items ADD CONSTRAINT chk_payroll_base_salary CHECK (base_salary >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payroll_net_salary') THEN
    ALTER TABLE payroll_items ADD CONSTRAINT chk_payroll_net_salary CHECK (net_salary >= 0);
  END IF;
END $$;

-- ──── قيد UNIQUE على الباركود ────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_products_barcode;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode
  ON products(barcode) WHERE barcode IS NOT NULL AND barcode != '';
