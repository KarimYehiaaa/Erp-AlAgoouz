import type { PoolClient } from 'pg';
import { AppError } from '../types/errors.ts';
import { effectivePostedJournalSql } from '../utils/journalPosting.ts';
import { receiptAccountCode } from '../utils/receiptAccount.ts';

export interface MatchingContext {
  account_id: number;
  statement_date: string;
}
export interface MatchingMovement {
  id: number;
  debit: number | string;
  credit: number | string;
  amount: number | string;
  transaction_date: string;
}
export interface JournalSource {
  id: number;
  entry_number: string;
  entry_date: string;
  account_code: string;
  movement: number;
  remaining: number;
}
export interface PaymentSource {
  id: number;
  journalId: number;
  payment_number: string;
  remaining: number;
}
function cents(value: unknown) {
  const numeric = Number(value);
  const result = Math.round(numeric * 100);
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(result))
    throw new AppError('توجد قيمة مالية غير صالحة في مصدر المطابقة', 409);
  return result;
}
export function movementCents(tx: MatchingMovement, context: MatchingContext) {
  const debit = cents(tx.debit),
    credit = cents(tx.credit),
    amount = cents(tx.amount);
  if (
    debit < 0 ||
    credit < 0 ||
    (debit > 0 && credit > 0) ||
    amount === 0 ||
    credit - debit !== amount ||
    tx.transaction_date > context.statement_date
  )
    throw new AppError('اتجاه حركة الكشف أو مبلغها أو تاريخها غير صالح', 400);
  return amount;
}
export async function lockMatchingAccount(client: PoolClient, id: number) {
  await client.query('SELECT pg_advisory_xact_lock(718061,$1::int)', [id]);
}
// Matched rows claim their entire statement movement; partial rows claim the recorded portion.
const claimed = `CASE WHEN bst.status='matched'
  THEN GREATEST(bst.matched_amount,ABS(bst.amount)) ELSE bst.matched_amount END`;
export async function journalSources(
  client: PoolClient,
  context: MatchingContext,
  excludeId = 0,
  journalId?: number,
) {
  // Keep source identity stable until the match commits. Operational deletion takes
  // FOR UPDATE on the same rows before checking existing bank claims.
  await client.query(
    `SELECT je.id FROM journal_entries je
     WHERE je.entry_date <= $2::date AND ($3::int IS NULL OR je.id=$3)
       AND EXISTS (SELECT 1 FROM journal_entry_lines jel
         WHERE jel.journal_entry_id=je.id AND jel.account_id=$1)
     ORDER BY je.id FOR SHARE OF je`,
    [context.account_id, context.statement_date, journalId ?? null],
  );
  const result = await client.query<{
    id: number;
    entry_number: string;
    entry_date: string;
    account_code: string;
    movement: string;
    claimed: string;
  }>(
    `WITH ledger AS (
      SELECT je.id,je.entry_number,je.entry_date,a.code AS account_code,
        SUM(jel.debit-jel.credit) AS movement
      FROM journal_entry_lines jel JOIN journal_entries je ON je.id=jel.journal_entry_id
      JOIN accounts a ON a.id=jel.account_id
      WHERE jel.account_id=$1 AND ${effectivePostedJournalSql('je')}
        AND je.entry_date <= $2::date AND ($4::int IS NULL OR je.id=$4)
      GROUP BY je.id,a.code
    ), claims AS (
      SELECT COALESCE(bst.matched_journal_entry_id,p.journal_entry_id) AS journal_id,
        SUM(${claimed}) AS amount
      FROM bank_statement_transactions bst
      JOIN bank_reconciliations br ON br.id=bst.reconciliation_id
      LEFT JOIN payments p ON p.id=bst.matched_payment_id
      WHERE br.account_id=$1 AND br.status <> 'cancelled'
        AND bst.status IN ('matched','partial') AND bst.id<>$3
      GROUP BY COALESCE(bst.matched_journal_entry_id,p.journal_entry_id)
    ) SELECT ledger.*,COALESCE(claims.amount,0) AS claimed
      FROM ledger LEFT JOIN claims ON claims.journal_id=ledger.id
      ORDER BY ledger.entry_date,ledger.id`,
    [context.account_id, context.statement_date, excludeId, journalId ?? null],
  );
  return result.rows.map((row): JournalSource => ({
    id: row.id,
    entry_number: row.entry_number,
    entry_date: row.entry_date,
    account_code: row.account_code,
    movement: cents(row.movement),
    remaining: Math.abs(cents(row.movement)) - cents(row.claimed),
  }));
}
export async function paymentSources(
  client: PoolClient,
  sources: JournalSource[],
  excludeId = 0,
  paymentId?: number,
) {
  const ids = sources.map((source) => source.id);
  if (!ids.length) return [];
  const result = await client.query<{
    id: number;
    journal_entry_id: number;
    payment_number: string;
    payment_method: string;
    amount: string;
    claimed: string;
    source_type: string;
    sale_type: string | null;
  }>(
    `SELECT p.id,p.journal_entry_id,p.payment_number,p.payment_method,p.amount,
    je.reference_type AS source_type,s.sale_type,
    COALESCE((SELECT SUM(${claimed}) FROM bank_statement_transactions bst
      JOIN bank_reconciliations br ON br.id=bst.reconciliation_id
      WHERE bst.matched_payment_id=p.id AND br.status <> 'cancelled'
        AND bst.status IN ('matched','partial') AND bst.id<>$2),0) AS claimed
    FROM payments p JOIN journal_entries je ON je.id=p.journal_entry_id
    LEFT JOIN sales s ON je.reference_type='sale' AND je.reference_id::text=s.id::text
    WHERE p.journal_entry_id=ANY($1::int[]) AND ($3::int IS NULL OR p.id=$3)
    ORDER BY p.id`,
    [ids, excludeId, paymentId ?? null],
  );
  const byJournal = new Map(sources.map((source) => [source.id, source]));
  return result.rows.flatMap((row): PaymentSource[] => {
    const source = byJournal.get(row.journal_entry_id);
    const method = (row.payment_method || 'cash').trim().toLowerCase();
    if (
      !source ||
      !['sale', 'payment'].includes(row.source_type) ||
      method === 'credit' ||
      receiptAccountCode(method, row.source_type === 'sale' ? (row.sale_type ?? '') : 'receipt') !==
        source.account_code
    )
      return [];
    const remaining = cents(row.amount) - cents(row.claimed);
    if (cents(row.amount) <= 0) return [];
    return [
      {
        id: row.id,
        journalId: row.journal_entry_id,
        payment_number: row.payment_number,
        remaining,
      },
    ];
  });
}
export async function validateBankSource(
  client: PoolClient,
  tx: MatchingMovement,
  context: MatchingContext,
  input: { journalId?: number; paymentId?: number },
) {
  await lockMatchingAccount(client, context.account_id);
  const amount = movementCents(tx, context);
  let journalId = input.journalId;
  if (input.paymentId) {
    journalId =
      (
        await client.query<{ journal_entry_id: number | null }>(
          'SELECT journal_entry_id FROM payments WHERE id=$1',
          [input.paymentId],
        )
      ).rows[0]?.journal_entry_id ?? undefined;
    if (!journalId) throw new AppError('الدفعة غير مرتبطة بقيد تحصيل صالح', 400);
  }
  const sources = await journalSources(client, context, tx.id, journalId);
  let source = input.journalId
    ? sources.find((candidate) => candidate.id === input.journalId)
    : undefined;
  let payment: PaymentSource | undefined;
  if (input.paymentId) {
    payment = (await paymentSources(client, sources, tx.id, input.paymentId))[0];
    source = sources.find((candidate) => candidate.id === payment?.journalId);
  }
  if (
    !source ||
    Math.sign(source.movement) !== Math.sign(amount) ||
    Math.abs(source.movement) < Math.abs(amount)
  )
    throw new AppError('المصدر لا يطابق الحساب أو اتجاه الحركة أو تاريخ الإقفال أو مبلغها', 400);
  if (input.paymentId && !payment)
    throw new AppError('الدفعة غير مرتبطة بقيد تحصيل صالح لهذا الحساب', 400);
  if (source.remaining < Math.abs(amount) || (payment && payment.remaining < Math.abs(amount)))
    throw new AppError('المبلغ يتجاوز الجزء المتاح للمطابقة في القيد أو الدفعة', 409);
  return { journalId: source.id, paymentId: payment?.id, amount: Math.abs(amount) / 100 };
}
