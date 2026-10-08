-- An UPDATE must not move an existing closed-period record into an open date.
-- JSON access also avoids referring to optional columns that a table lacks.
CREATE OR REPLACE FUNCTION prevent_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
  candidate JSONB;
  candidates JSONB[];
  record_date DATE;
  protected_period RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    candidates := ARRAY[to_jsonb(NEW)];
  ELSIF TG_OP = 'DELETE' THEN
    candidates := ARRAY[to_jsonb(OLD)];
  ELSE
    candidates := ARRAY[to_jsonb(OLD), to_jsonb(NEW)];
  END IF;

  FOREACH candidate IN ARRAY candidates LOOP
    record_date := NULL;
    IF TG_TABLE_NAME = 'sales' THEN
      record_date := (candidate->>'sale_date')::date;
    ELSIF TG_TABLE_NAME = 'expenses' THEN
      record_date := (candidate->>'expense_date')::date;
    ELSIF TG_TABLE_NAME = 'invoices' THEN
      record_date := (candidate->>'issued_at')::timestamptz::date;
    ELSIF TG_TABLE_NAME = 'purchase_invoices' THEN
      record_date := (candidate->>'invoice_date')::date;
    ELSIF TG_TABLE_NAME = 'purchase_returns' THEN
      record_date := (candidate->>'return_date')::date;
    ELSIF TG_TABLE_NAME = 'pos_shifts' THEN
      record_date := ((candidate->>'opened_at')::timestamptz AT TIME ZONE 'Africa/Cairo')::date;
    ELSIF TG_TABLE_NAME = 'bank_reconciliations' THEN
      record_date := (candidate->>'statement_date')::date;
    ELSIF TG_TABLE_NAME = 'journal_entries' THEN
      record_date := (candidate->>'entry_date')::date;
    ELSIF TG_TABLE_NAME = 'journal_entry_lines' THEN
      SELECT entry_date INTO record_date FROM journal_entries
      WHERE id = (candidate->>'journal_entry_id')::integer;
    END IF;
    record_date := COALESCE(record_date, (candidate->>'created_at')::timestamptz::date, CURRENT_DATE);

    -- Lock matching open rows as well, so closing an existing period waits
    -- for financial transactions that already use it to finish.
    FOR protected_period IN
      SELECT period_start, period_end, status FROM financial_periods
      WHERE record_date BETWEEN period_start AND period_end
      ORDER BY id FOR SHARE
    LOOP
      IF protected_period.status IN ('closed', 'locked') THEN
        RAISE EXCEPTION 'لا يمكن تسجيل أو تعديل أو حذف سجل في فترة محاسبية مغلقة (% إلى %)',
          protected_period.period_start, protected_period.period_end;
      END IF;
    END LOOP;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp;

-- These rows participate in the close checklist and must not change while
-- the period row is held exclusively by the closing transaction.
DROP TRIGGER IF EXISTS trg_prevent_closed_period_pos_shifts ON pos_shifts;
CREATE TRIGGER trg_prevent_closed_period_pos_shifts
  BEFORE INSERT OR UPDATE OR DELETE ON pos_shifts
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();
DROP TRIGGER IF EXISTS trg_prevent_closed_period_bank_reconciliations ON bank_reconciliations;
CREATE TRIGGER trg_prevent_closed_period_bank_reconciliations
  BEFORE INSERT OR UPDATE OR DELETE ON bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION prevent_closed_period_modification();
