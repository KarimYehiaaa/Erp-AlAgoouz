-- Migration: 008_unique_product_name.sql
-- Purpose: Prevent duplicate active products by enforcing a unique index
-- on a normalized form of `name_ar` (trimmed, collapsed spaces, lowercased).

-- Safety check: abort if duplicates exist so maintainer can resolve them first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT lower(regexp_replace(trim(name_ar), '\\s+', ' ', 'g')) AS norm_name, COUNT(*)
      FROM products
      WHERE deleted_at IS NULL
      GROUP BY norm_name
      HAVING COUNT(*) > 1
    ) t
  ) THEN
    RAISE EXCEPTION 'Duplicate active product names detected. Run scripts/merge-duplicate-products.js to resolve duplicates before applying this migration.';
  END IF;
END$$;

-- Create unique index on normalized name for active (non-deleted) products.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_ar_normalized_unique
  ON products (lower(regexp_replace(trim(name_ar), '\\s+', ' ', 'g')))
  WHERE deleted_at IS NULL;
