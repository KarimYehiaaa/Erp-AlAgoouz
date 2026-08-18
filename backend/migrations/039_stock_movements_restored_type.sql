-- 039_stock_movements_restored_type.sql
-- إضافة نوع 'restored' لحركات المخزون: يُستخدم لتعليم الحركات التي أُعيدت
-- كمياتها بالفعل (عند التعديل/الإرجاع) حتى لا تُستعاد مرة أخرى بالخطأ.
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
      'opening_production',
      'return',
      'transfer',
      'adjustment',
      'restored'
    ));
END $$;
