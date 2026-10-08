/** Older reversals marked the original voided. Its posting remains part of
 * history when a real counterentry exists, including reversal chains.
 * Plain voided entries and drafts continue to have no ledger effect.
 */
export const effectivePostedJournalSql = (alias: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new TypeError('Invalid journal SQL alias');
  return `(${alias}.status = 'posted' OR (${alias}.status = 'voided' AND EXISTS (
    SELECT 1 FROM journal_entries ledger_reversal
    WHERE ledger_reversal.reference_type = 'reversal'
      AND ledger_reversal.reference_id::text = ${alias}.id::text
      AND ledger_reversal.status IN ('posted', 'voided')
  )))`;
};

/** NUMERIC(15,2) storage limit for each journal line. */
export const MAX_JOURNAL_LINE_AMOUNT = 9_999_999_999_999.99;
