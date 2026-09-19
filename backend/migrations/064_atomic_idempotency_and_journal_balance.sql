-- ==============================================================================
-- 064_atomic_idempotency_and_journal_balance.sql
-- بن العجوز ERP — حماية قفل المفاتيح المتزامن وتأكيد توازن القيود على مستوى المحرك
-- ==============================================================================

-- 1. ترقية جدول مفاتيح العمليات لدعم القفل الذري المتزامن (Atomic Idempotency Claim)
DO $$
BEGIN
  -- إضافة عمود حالة معالجة المفتاح
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'idempotency_records' AND column_name = 'status'
  ) THEN
    ALTER TABLE idempotency_records ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED';
  END IF;

  -- إضافة عمود توقيت القفل لمنع حجز المفاتيح العالقة
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'idempotency_records' AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE idempotency_records ADD COLUMN locked_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- جعل status_code و response_body اختيارية أثناء المعالجة (PROCESSING)
  ALTER TABLE idempotency_records ALTER COLUMN status_code DROP NOT NULL;
  ALTER TABLE idempotency_records ALTER COLUMN response_body DROP NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_idempotency_status_locked 
ON idempotency_records(status, locked_at);

-- 2. دالة وتريجر فحص توازن قيود اليومية المؤجل (Deferred Constraint Trigger)
-- يضمن رياضياً أن كل قيد يومية مسجل في قاعدة البيانات يملك: SUM(debit) = SUM(credit)
CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_debit NUMERIC(15, 2);
  v_credit NUMERIC(15, 2);
  v_entry_id INT;
  v_status VARCHAR(20);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.journal_entry_id;
  ELSE
    v_entry_id := NEW.journal_entry_id;
  END IF;

  SELECT status INTO v_status FROM journal_entries WHERE id = v_entry_id;

  -- يتم فحص التوازن للقيود المرحلة (posted)
  IF v_status = 'posted' THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit, v_credit
    FROM journal_entry_lines
    WHERE journal_entry_id = v_entry_id;

    -- الفحص فقط في حال وجود سطور للقيد
    IF (v_debit > 0 OR v_credit > 0) AND ABS(v_debit - v_credit) > 0.001 THEN
      RAISE EXCEPTION 'قيد اليومية رقم % غير متوازن محاسبياً: إجمالي المدين (%) لا يساوي إجمالي الدائن (%)',
        v_entry_id, v_debit, v_credit;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_journal_entry_balance ON journal_entry_lines;
CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();
