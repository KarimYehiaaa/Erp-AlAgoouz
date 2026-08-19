-- ═════════════════════════════════════════════════════════════════════════════
-- Migration 040: نظام الفترات المحاسبية (Financial Period Locking)
-- ═════════════════════════════════════════════════════════════════════════════
-- يمنع تعديل السجلات المالية بعد إغلاق الفترة المحاسبية

-- ──── جدول الفترات المحاسبية ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_periods (
  id SERIAL PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'locked')),
  closed_by INTEGER REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_period_dates CHECK (period_end >= period_start),
  CONSTRAINT uq_period_range UNIQUE (period_start, period_end)
);

-- ──── فهرس على الحالة ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_financial_periods_status ON financial_periods(status);
CREATE INDEX IF NOT EXISTS idx_financial_periods_dates ON financial_periods(period_start, period_end);

-- ──── Trigger لمنع تعديل الفترات المغلقة ────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
  record_date DATE;
  locked_period RECORD;
BEGIN
  -- تحديد تاريخ السجل
  IF TG_TABLE_NAME = 'sales' THEN
    record_date := COALESCE(NEW.sale_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    record_date := COALESCE(NEW.expense_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    record_date := COALESCE(NEW.invoice_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'payments' THEN
    record_date := COALESCE(NEW.payment_date, NEW.created_at::DATE);
  ELSE
    record_date := NEW.created_at::DATE;
  END IF;

  -- البحث عن فترة مغلقة تشمل هذا التاريخ
  SELECT * INTO locked_period
  FROM financial_periods
  WHERE status IN ('closed', 'locked')
    AND record_date BETWEEN period_start AND period_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'لا يمكن تعديل سجل في فترة محاسبية مغلقة (% إلى %)',
      locked_period.period_start, locked_period.period_end;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق الـ Trigger على الجداول المالية
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['sales', 'expenses', 'invoices', 'payments']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_prevent_closed_period_%I ON %I; ' ||
      'CREATE TRIGGER trg_prevent_closed_period_%I ' ||
      'BEFORE INSERT OR UPDATE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

-- ──── Trigger تحديث updated_at ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_financial_periods ON financial_periods;
CREATE TRIGGER set_updated_at_financial_periods
  BEFORE UPDATE ON financial_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
