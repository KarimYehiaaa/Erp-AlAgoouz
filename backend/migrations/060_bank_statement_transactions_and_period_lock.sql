-- ==============================================================================
-- 060_bank_statement_transactions_and_period_lock.sql
-- بن العجوز ERP — تفاصيل كشوف الحسابات البنكية ومفتاح عدم تكرار القيود وقفل الفترات
-- ==============================================================================

-- 1. إضافة مفتاح عدم التكرار لقيد اليومية (Idempotency Key) وتحديث أنواع القيود المرجعية
ALTER TABLE journal_entries 
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(150) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_je_idempotency_key 
  ON journal_entries(idempotency_key);

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_reference_type_check 
  CHECK (reference_type IN ('sale', 'purchase', 'payment', 'expense', 'payroll', 'stocktake', 'purchase_return', 'manual', 'opening', 'transfer', 'reversal'));

-- 2. جدول حركات كشف الحساب البنكي التفصيلية (Bank Statement Transactions)
CREATE TABLE IF NOT EXISTS bank_statement_transactions (
  id SERIAL PRIMARY KEY,
  reconciliation_id INT NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT,
  reference VARCHAR(100),
  debit NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  amount NUMERIC(15, 2) NOT NULL,
  status VARCHAR(25) NOT NULL DEFAULT 'unmatched' 
    CHECK (status IN ('unmatched', 'matched', 'partial', 'excluded', 'duplicate')),
  matched_journal_entry_id INT REFERENCES journal_entries(id) ON DELETE SET NULL,
  matched_payment_id INT REFERENCES payments(id) ON DELETE SET NULL,
  matched_amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (matched_amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bst_rec_id 
  ON bank_statement_transactions(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_bst_status 
  ON bank_statement_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bst_date 
  ON bank_statement_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bst_matched_je 
  ON bank_statement_transactions(matched_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_bst_matched_pay 
  ON bank_statement_transactions(matched_payment_id);

-- 3. تحديث دالة قفل الفترات المحاسبية لدعم قيود اليومية (Journal Entries)
CREATE OR REPLACE FUNCTION prevent_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
  record_date DATE;
  locked_period RECORD;
BEGIN
  -- تحديد تاريخ السجل بناءً على نوع الجدول
  IF TG_TABLE_NAME = 'sales' THEN
    record_date := COALESCE(NEW.sale_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    record_date := COALESCE(NEW.expense_date, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    record_date := COALESCE(NEW.issued_at::DATE, NEW.created_at::DATE);
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    record_date := COALESCE(NEW.entry_date, NEW.created_at::DATE);
  ELSE
    -- payments وجميع الجداول الأخرى: لا يوجد عمود تاريخ مخصص
    record_date := NEW.created_at::DATE;
  END IF;

  -- البحث عن فترة مغلقة أو مقفلة تشمل هذا التاريخ
  SELECT * INTO locked_period
  FROM financial_periods
  WHERE status IN ('closed', 'locked')
    AND record_date BETWEEN period_start AND period_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'لا يمكن تعديل أو تسجيل عملية في فترة محاسبية مغلقة (% إلى %)',
      locked_period.period_start, locked_period.period_end;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تفعيل الـ Trigger على جدول قيود اليومية
DROP TRIGGER IF EXISTS trg_prevent_closed_period_journal_entries ON journal_entries;
CREATE TRIGGER trg_prevent_closed_period_journal_entries
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();

-- 4. صلاحيات إقفال وإعادة فتح الفترات المحاسبية
INSERT INTO permissions (code, name_ar, module)
VALUES
  ('accounting.period_close', 'إقفال الفترات المحاسبية الشهرية والسنوية', 'accounting'),
  ('accounting.period_reopen', 'إعادة فتح فترة محاسبية مغلقة للمراجعة', 'accounting')
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  module = EXCLUDED.module;

-- ربط الصلاحيات بالأدوار القيادية
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('owner', 'admin', 'sys_admin')
  AND p.code IN ('accounting.period_close', 'accounting.period_reopen')
ON CONFLICT DO NOTHING;
