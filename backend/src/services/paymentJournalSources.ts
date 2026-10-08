import type { PoolClient } from 'pg';
import { AppError } from '../types/errors.ts';
import { effectivePostedJournalSql } from '../utils/journalPosting.ts';

export function standalonePaymentSourceSql(alias: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new TypeError('Invalid payment SQL alias');
  return `EXISTS (SELECT 1 FROM journal_entries payment_source
    WHERE payment_source.id=${alias}.journal_entry_id AND payment_source.reference_type='payment'
      AND ${effectivePostedJournalSql('payment_source')})`;
}

/** Link the exact receipt allocations inside their posting transaction. */
export async function linkPaymentJournalSources(
  client: Pick<PoolClient, 'query'>,
  paymentNumbers: string[],
  journalId: number,
) {
  const numbers = [...new Set(paymentNumbers)];
  if (!numbers.length) return;
  const result = await client.query(
    `UPDATE payments SET journal_entry_id=$2
     WHERE payment_number=ANY($1::text[])
       AND (journal_entry_id IS NULL OR journal_entry_id=$2) RETURNING id`,
    [numbers, journalId],
  );
  if (result.rowCount !== numbers.length) {
    throw new AppError('تعذر ربط جميع أجزاء التحصيل بقيدها المحاسبي', 409);
  }
}
