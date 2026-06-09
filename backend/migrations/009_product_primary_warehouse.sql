-- Migration: 009_product_primary_warehouse.sql
-- Add a nullable reference from products to warehouses indicating the product's primary/default warehouse

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS primary_warehouse_id INT NULL REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS idx_products_primary_warehouse ON products(primary_warehouse_id) WHERE deleted_at IS NULL;
