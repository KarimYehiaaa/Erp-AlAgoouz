-- Validate final effective ledger balances after status changes and after a line leaves
-- one journal for another. Deferred checks preserve atomic multi-line posting.
CREATE OR REPLACE FUNCTION public.check_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_ids INTEGER[];
  v_entry_id INTEGER;
  v_status VARCHAR(20);
  v_debit NUMERIC;
  v_credit NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_entry_ids := ARRAY[NEW.id];
    IF NEW.reference_type = 'reversal' AND NEW.reference_id IS NOT NULL THEN
      v_entry_ids := v_entry_ids || ARRAY(
        SELECT id FROM public.journal_entries WHERE id::text = NEW.reference_id::text
      );
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF OLD.reference_type = 'reversal' AND OLD.reference_id IS NOT NULL THEN
        v_entry_ids := v_entry_ids || ARRAY(
          SELECT id FROM public.journal_entries WHERE id::text = OLD.reference_id::text
        );
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_entry_ids := ARRAY[OLD.journal_entry_id];
  ELSIF TG_OP = 'UPDATE' THEN
    v_entry_ids := ARRAY[OLD.journal_entry_id, NEW.journal_entry_id];
  ELSE
    v_entry_ids := ARRAY[NEW.journal_entry_id];
  END IF;

  FOR v_entry_id IN
    SELECT DISTINCT candidate.entry_id
    FROM pg_catalog.unnest(v_entry_ids) AS candidate(entry_id)
    ORDER BY candidate.entry_id
  LOOP
    -- Serialize with draft promotion and other final-balance validators.
    -- NO KEY UPDATE permits the FK's KEY SHARE lock without a lock upgrade deadlock.
    SELECT status INTO v_status
    FROM public.journal_entries WHERE id = v_entry_id
    FOR NO KEY UPDATE;

    -- Match effectivePostedJournalSql: historical originals with real
    -- counterentries remain part of the ledger, including reversal chains.
    IF v_status = 'posted' OR (v_status = 'voided' AND EXISTS (
      SELECT 1 FROM public.journal_entries ledger_reversal
      WHERE ledger_reversal.reference_type = 'reversal'
        AND ledger_reversal.reference_id::text = v_entry_id::text
        AND ledger_reversal.status IN ('posted', 'voided')
    )) THEN
      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO v_debit, v_credit
      FROM public.journal_entry_lines WHERE journal_entry_id = v_entry_id;

      IF ABS(v_debit - v_credit) > 0.001 THEN
        RAISE EXCEPTION 'قيد اليومية رقم % غير متوازن محاسبياً: إجمالي المدين (%) لا يساوي إجمالي الدائن (%)',
          v_entry_id, v_debit, v_credit;
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_journal_header_balance ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_check_journal_header_balance
AFTER INSERT OR UPDATE ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_journal_entry_balance();
