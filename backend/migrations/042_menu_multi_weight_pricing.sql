-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 042: دعم تسعير أوزان البن (ثمن، ربع، نصف، كيلو) وتسعير الأحجام المتعددة
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- إضافة نوع التسعير (single: عادي، weights: أوزان بن، dual: سنجل/دبل)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'pricing_type') THEN
    ALTER TABLE menu_items ADD COLUMN pricing_type VARCHAR(30) NOT NULL DEFAULT 'single';
  END IF;

  -- إضافة أسعار الأوزان الأربعة
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'price_eighth') THEN
    ALTER TABLE menu_items ADD COLUMN price_eighth DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'price_quarter') THEN
    ALTER TABLE menu_items ADD COLUMN price_quarter DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'price_half') THEN
    ALTER TABLE menu_items ADD COLUMN price_half DECIMAL(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'menu_items' AND column_name = 'price_kilo') THEN
    ALTER TABLE menu_items ADD COLUMN price_kilo DECIMAL(10,2);
  END IF;
END $$;

-- تحديث البيانات الأولية لتوليفات وأصناف البن لتدعم الأوزان الأربعة تلقائياً
UPDATE menu_items 
SET 
  pricing_type = 'weights',
  price_eighth = ROUND(price * 0.5, 2), -- ثمن كيلو
  price_quarter = ROUND(price, 2),      -- ربع كيلو
  price_half = ROUND(price * 1.95, 2),  -- نصف كيلو
  price_kilo = ROUND(price * 3.8, 2)    -- كيلو كامل
WHERE menu_category_id IN (
  SELECT id FROM menu_categories WHERE name_ar LIKE '%توليف%' OR name_ar LIKE '%بن%'
);
