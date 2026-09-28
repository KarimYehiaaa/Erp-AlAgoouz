-- 080_expand_journal_entries_reference_type.sql
-- Allow 'partner_drawing' as a valid reference_type in journal_entries

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_reference_type_check 
  CHECK (reference_type IN ('sale', 'purchase', 'payment', 'expense', 'payroll', 'stocktake', 'purchase_return', 'manual', 'opening', 'transfer', 'reversal', 'partner_drawing'));
