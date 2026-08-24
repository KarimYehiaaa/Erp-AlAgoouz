-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 046: Integrity & Performance Hardening
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) فهارس مسارات لوحة التحكم الساخنة (payments.created_at كان بدون فهرس)
-- 2) إصلاح تضارب أسماء الفهارس الذي منع تطبيق الفهرس الجزئي للمبيعات
-- 3) فهارس مراجع حركات المخزون
-- 4) حذف الفهارس المكررة (تكلفة كتابة زائدة)
-- 5) قيود CHECK على أعمدة المال غير المغطاة بـ 039
-- 6) سياسة احتفاظ لجدول التدقيق db_row_audits المتضخم بلا قارئ
-- 7) حذف v_daily_sales (مُعاد تعريفها 3 مرات، مستهلكة 0 مرة)
-- 8) عمود users.token_version لإبطال توكنات الوصول فوراً عند إلغاء الجلسات
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) فهرس مدفوعات لوحة التحكم ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_created_at
  ON payments (created_at);

CREATE INDEX IF NOT EXISTS idx_payments_created_method
  ON payments (created_at) INCLUDE (payment_method, amount, reference_type);

-- ── 2) فهارس المبيعات المركبة (أسماء جديدة لتجاوز تعارض الاسم مع 004) ────────
DROP INDEX IF EXISTS idx_sales_sale_date;
CREATE INDEX IF NOT EXISTS idx_sales_sale_date_active
  ON sales (sale_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_date_status
  ON sales (sale_date, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_date_created
  ON sales (sale_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL;

-- ── 3) فهارس مراجع حركات المخزون ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON stock_movements (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_date
  ON stock_movements (movement_type, created_at DESC);

-- ── 4) حذف الفهارس المكررة ──────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_stock_movements_created_at;  -- مكرر مع idx_stock_movements_date
DROP INDEX IF EXISTS idx_stock_movements_product_id;  -- مكرر مع idx_stock_movements_product
DROP INDEX IF EXISTS idx_sale_items_product_id;       -- مكرر مع idx_sale_items_product

-- ── 5) قيود CHECK على أعمدة المال ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_amount_nonnegative') THEN
    ALTER TABLE payments ADD CONSTRAINT chk_payments_amount_nonnegative CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_totals_nonnegative') THEN
    ALTER TABLE sales ADD CONSTRAINT chk_sales_totals_nonnegative
      CHECK (total_amount >= 0 AND subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND profit_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_totals_nonnegative') THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoices_totals_nonnegative
      CHECK (total_amount >= 0 AND subtotal >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_suppliers_balance_nonnegative') THEN
    ALTER TABLE suppliers ADD CONSTRAINT chk_suppliers_balance_nonnegative CHECK (balance >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_credit_limit_nonnegative') THEN
    ALTER TABLE customers ADD CONSTRAINT chk_customers_credit_limit_nonnegative CHECK (credit_limit >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_employees_salary_nonnegative') THEN
    ALTER TABLE employees ADD CONSTRAINT chk_employees_salary_nonnegative
      CHECK (base_salary >= 0 AND COALESCE(hourly_rate, 0) >= 0);
  END IF;
END $$;

-- ── 6) سياسة احتفاظ سجل التدقيق ─────────────────────────────────────────────
-- الجدول محمي بمشغل يمنع الحذف؛ هذه الدالة الوحيدة المصرح لها بالتطهير الدوري.
CREATE OR REPLACE FUNCTION purge_db_row_audits(p_retain_days INT DEFAULT 180)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  ALTER TABLE db_row_audits DISABLE TRIGGER trg_protect_db_row_audits;
  BEGIN
    DELETE FROM db_row_audits
    WHERE changed_at < NOW() - (p_retain_days || ' days')::interval;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE db_row_audits ENABLE TRIGGER trg_protect_db_row_audits;
    RAISE;
  END;
  ALTER TABLE db_row_audits ENABLE TRIGGER trg_protect_db_row_audits;
  RETURN deleted_count;
END; $$ LANGUAGE plpgsql;

-- إسقاط مشغل تدقيق جدول المخزون: ضجيج خالص (كل tick كمية يولّد JSONB كاملاً)
DROP TRIGGER IF EXISTS trg_audit_inventory ON inventory;

-- ── 7) حذف العرض الميت ──────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_daily_sales;

-- ── 8) إصدار التوكن ─────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
