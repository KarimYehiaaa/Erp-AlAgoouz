-- Migration 025: إضافة trigger لتحديث updated_at تلقائياً على جدول suppliers
-- الجدول يحتوي على عمود updated_at لكن لم يُضف له trigger كما في users, products, customers, sales

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_suppliers_updated'
  ) THEN
    CREATE TRIGGER tr_suppliers_updated
      BEFORE UPDATE ON suppliers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
