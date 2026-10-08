import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import { validateBankSource } from '../src/services/bankMatchingSources.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { bankReconciliationService as bank } from '../src/services/bankReconciliationService.ts';

let userId: number, bankId: number, revenueId: number, journalId: number, recId: number;
let paymentIds: number[] = [];
const recIds: number[] = [],
  journalIds: number[] = [];
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active LIMIT 1",
    )
  ).rows[0].id;
  bankId = (await query("SELECT id FROM accounts WHERE code='110103'")).rows[0].id;
  revenueId = (
    await accountingService.createAccount({
      code: `BC-${randomUUID()}`,
      name_ar: 'bank capacity fixture',
      account_type: 'revenue',
    })
  ).id;
  const je = await accountingService.createJournalEntry({
    entry_date: '1884-03-10',
    reference_type: 'payment',
    reference_id: revenueId,
    description: 'bank capacity fixture',
    lines: [
      { account_id: bankId, debit: 100, credit: 0 },
      { account_id: revenueId, debit: 0, credit: 100 },
    ],
  });
  journalId = je.id;
  journalIds.push(je.id);
  for (const amount of [40, 60]) {
    paymentIds.push(
      (
        await query(
          `INSERT INTO payments(payment_number,reference_type,reference_id,amount,payment_method,journal_entry_id)
      VALUES($1,'sale',1,$2,'bank',$3) RETURNING id`,
          [`BC-${randomUUID()}`, amount, journalId],
        )
      ).rows[0].id,
    );
  }
  const rec = await session();
  recId = rec.id;
});
async function session() {
  const rec = await bank.createReconciliation(userId, {
    account_id: bankId,
    statement_date: '1884-03-31',
    statement_balance: await bank.getLedgerBalanceAsOfDate(bankId, '1884-03-31'),
    status: 'draft',
  });
  recIds.push(rec.id);
  return rec;
}
async function movement(amount: number, parent = recId, reference?: string): Promise<number> {
  return (
    await query(
      `INSERT INTO bank_statement_transactions(reconciliation_id,transaction_date,debit,credit,amount,reference)
    VALUES($1,'1884-03-10',$2,$3,$4,$5) RETURNING id`,
      [parent, amount < 0 ? -amount : 0, amount > 0 ? amount : 0, amount, reference ?? null],
    )
  ).rows[0].id;
}
afterEach(async () => {
  await query('DELETE FROM bank_reconciliations WHERE id=ANY($1::int[])', [recIds]);
  await query('DELETE FROM payments WHERE id=ANY($1::int[])', [paymentIds]);
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [
    journalIds,
  ]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [journalIds]);
  await query('DELETE FROM accounts WHERE id=$1', [revenueId]);
  paymentIds = [];
  recIds.length = journalIds.length = 0;
});
it('matches both receipt allocations and closes the session', async () => {
  for (let i = 0; i < 2; i++) {
    const tx = await movement(i === 0 ? 40 : 60);
    const result = await bank.matchTransaction(tx, { payment_id: paymentIds[i] });
    expect(result).toMatchObject({
      matched_journal_entry_id: journalId,
      matched_payment_id: paymentIds[i],
      matched_amount: i === 0 ? 40 : 60,
    });
    expect(result.amount).toBeTypeOf('number');
  }
  expect((await bank.finalizeReconciliation(recId, userId)).status).toBe('completed');
});
it.each(['draft', 'completed'])(
  'preserves the source of a %s bank reconciliation',
  async (status) => {
    await bank.matchTransaction(await movement(100), { journal_entry_id: journalId });
    if (status === 'completed') await bank.finalizeReconciliation(recId, userId);
    await expect(
      accountingService.deleteJournalEntryByReference('payment', revenueId),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect((await query('SELECT id FROM journal_entries WHERE id=$1', [journalId])).rowCount).toBe(
      1,
    );
    expect(
      (await query('SELECT id FROM journal_entry_lines WHERE journal_entry_id=$1', [journalId]))
        .rowCount,
    ).toBe(2);
  },
);
it('protects a legacy partial claim resolved through the payment source', async () => {
  const tx = await movement(40);
  await query(
    `UPDATE bank_statement_transactions SET status='partial',matched_amount=15,
    matched_payment_id=$2 WHERE id=$1`,
    [tx, paymentIds[0]],
  );
  await expect(
    accountingService.deleteJournalEntryByReference('payment', revenueId),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('allows operational deletion after unmatching releases all bank claims', async () => {
  const tx = await movement(40);
  await bank.matchTransaction(tx, { payment_id: paymentIds[0] });
  await bank.unmatchTransaction(tx);
  await accountingService.deleteJournalEntryByReference('payment', revenueId);
  expect((await query('SELECT id FROM journal_entries WHERE id=$1', [journalId])).rowCount).toBe(0);
  expect(
    (await query('SELECT journal_entry_id FROM payments WHERE id=$1', [paymentIds[0]])).rows[0]
      .journal_entry_id,
  ).toBeNull();
});
it('coordinates source deletion with a matching transaction before either commits', async () => {
  const tx = await movement(40);
  const matcher = await getClient(),
    deleter = await getClient();
  let deleting: Promise<unknown> | undefined;
  try {
    await matcher.query('BEGIN');
    const source = await validateBankSource(
      matcher,
      { id: tx, debit: 0, credit: 40, amount: 40, transaction_date: '1884-03-10' },
      { account_id: bankId, statement_date: '1884-03-31' },
      { paymentId: paymentIds[0] },
    );
    await deleter.query('BEGIN');
    const pid = (await deleter.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    deleting = accountingService.deleteJournalEntryByReference(deleter, 'payment', revenueId);
    // Attach the rejection handler immediately while the deletion waits for the matcher.
    const outcome = deleting.then(
      () => null,
      (error: unknown) => error,
    );
    let blocked = false;
    for (let i = 0; i < 100; i++) {
      const state = await matcher.query('SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked', [
        pid,
      ]);
      if (state.rows[0].blocked) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
    await matcher.query(
      `UPDATE bank_statement_transactions SET status='matched',matched_amount=40,
      matched_journal_entry_id=$2,matched_payment_id=$3 WHERE id=$1`,
      [tx, source.journalId, paymentIds[0]],
    );
    await matcher.query('COMMIT');
    expect(await outcome).toMatchObject({ statusCode: 409 });
  } finally {
    await matcher.query('ROLLBACK');
    if (deleting) await deleting.catch(() => undefined);
    await deleter.query('ROLLBACK');
    matcher.release();
    deleter.release();
  }
});
it('supports multiple partial movements of one payment without exceeding its amount', async () => {
  for (const value of [15, 25])
    await bank.matchTransaction(await movement(value), { payment_id: paymentIds[0] });
  await expect(
    bank.matchTransaction(await movement(1), { payment_id: paymentIds[0] }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await bank.matchTransaction(await movement(60), { payment_id: paymentIds[1] });
});
it('supports journal-only partial matching and idempotent rematching of the same row', async () => {
  const first = await movement(40);
  await bank.matchTransaction(first, { journal_entry_id: journalId });
  await bank.matchTransaction(first, { journal_entry_id: journalId });
  await bank.matchTransaction(await movement(60), { journal_entry_id: journalId });
  await expect(
    bank.matchTransaction(await movement(1), { journal_entry_id: journalId }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it.each(['unlinked', 'draft', 'method', 'direction', 'amount'])(
  'rejects an invalid %s payment source',
  async (kind) => {
    if (kind === 'unlinked')
      await query('UPDATE payments SET journal_entry_id=NULL WHERE id=$1', [paymentIds[0]]);
    if (kind === 'draft')
      await query("UPDATE journal_entries SET status='draft' WHERE id=$1", [journalId]);
    if (kind === 'method')
      await query("UPDATE payments SET payment_method='cash' WHERE id=$1", [paymentIds[0]]);
    const tx = await movement(kind === 'direction' ? -40 : kind === 'amount' ? 101 : 40);
    await expect(bank.matchTransaction(tx, { payment_id: paymentIds[0] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect((await bank.getStatementTransactions(recId))[0].status).toBe('unmatched');
  },
);
it('serializes competing reservations for one payment across sessions', async () => {
  const other = await session();
  const ids = [await movement(30), await movement(30, other.id)];
  const result = await Promise.allSettled(
    ids.map((id) => bank.matchTransaction(id, { payment_id: paymentIds[0] })),
  );
  expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  expect(result.filter((value) => value.status === 'rejected')).toHaveLength(1);
});
it('automatically matches allocated receipts and respects consumed capacity', async () => {
  await movement(40);
  await movement(60);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(2);
  expect((await bank.getStatementTransactions(recId)).map((tx) => tx.matched_payment_id)).toEqual(
    paymentIds,
  );
  const other = await session();
  await movement(40, other.id);
  expect((await bank.autoMatchTransactions(other.id)).matched_count).toBe(0);
});
it('automatically matches the remaining part after a manual partial reservation', async () => {
  await bank.matchTransaction(await movement(15), { payment_id: paymentIds[0] });
  await movement(25);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(1);
  expect((await bank.getStatementTransactions(recId))[1].matched_payment_id).toBe(paymentIds[0]);
});
it('matches an explicitly referenced partial payment automatically', async () => {
  const number = (await query('SELECT payment_number FROM payments WHERE id=$1', [paymentIds[0]]))
    .rows[0].payment_number;
  await movement(15, recId, number);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(1);
});
it('does not close a session containing a stale or corrupt match', async () => {
  const id = await movement(100);
  await query(
    "UPDATE bank_statement_transactions SET status='matched',matched_amount=100 WHERE id=$1",
    [id],
  );
  await expect(bank.finalizeReconciliation(recId, userId)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect((await bank.getReconciliationById(recId)).status).toBe('draft');
});
it('normalizes numeric fields when unmatching or excluding a movement', async () => {
  const id = await movement(40);
  await bank.matchTransaction(id, { payment_id: paymentIds[0] });
  const unmatched = await bank.unmatchTransaction(id);
  expect(unmatched.credit).toBe(40);
  expect(unmatched.matched_amount).toBe(0);
  expect((await bank.excludeTransaction(id, 'reviewed fixture')).amount).toBe(40);
});
it('keeps ambiguous different journals unmatched until a reference identifies one', async () => {
  const other = await accountingService.createJournalEntry({
    entry_date: '1884-03-10',
    description: 'other bank fixture',
    lines: [
      { account_id: bankId, debit: 100, credit: 0 },
      { account_id: revenueId, debit: 0, credit: 100 },
    ],
  });
  journalIds.push(other.id);
  const id = await movement(100);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(0);
  const number = (await query('SELECT entry_number FROM journal_entries WHERE id=$1', [journalId]))
    .rows[0].entry_number;
  await query('UPDATE bank_statement_transactions SET reference=$1 WHERE id=$2', [number, id]);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(1);
  expect((await bank.getStatementTransactions(recId))[0].matched_journal_entry_id).toBe(journalId);
});
it('supports equal allocations within one receipt without inventing a payment identity', async () => {
  await query('UPDATE payments SET amount=40 WHERE id=$1', [paymentIds[1]]);
  paymentIds.push(
    (
      await query(
        `INSERT INTO payments(payment_number,reference_type,reference_id,amount,payment_method,journal_entry_id)
    VALUES($1,'sale',1,20,'bank',$2) RETURNING id`,
        [`BC-${randomUUID()}`, journalId],
      )
    ).rows[0].id,
  );
  await movement(40);
  await movement(40);
  await movement(20);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(3);
  const rows = await bank.getStatementTransactions(recId);
  expect(rows.map((row) => row.matched_journal_entry_id)).toEqual([
    journalId,
    journalId,
    journalId,
  ]);
  expect(rows[0].matched_payment_id).toBeNull();
  expect(rows[1].matched_payment_id).toBeNull();
});
it('rejects an amount exceeding the payment while the journal still has capacity', async () => {
  await expect(
    bank.matchTransaction(await movement(41), { payment_id: paymentIds[0] }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('reserves capacity already claimed by legacy payment-only matches', async () => {
  const old = await movement(25);
  await query(
    "UPDATE bank_statement_transactions SET status='matched',matched_payment_id=$1,matched_amount=25 WHERE id=$2",
    [paymentIds[0], old],
  );
  await expect(
    bank.matchTransaction(await movement(20), { payment_id: paymentIds[0] }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('releases capacity after unmatching and can match it again', async () => {
  const id = await movement(40);
  await bank.matchTransaction(id, { payment_id: paymentIds[0] });
  await bank.unmatchTransaction(id);
  expect((await bank.autoMatchTransactions(recId)).matched_count).toBe(1);
  expect((await bank.getStatementTransactions(recId))[0].matched_payment_id).toBe(paymentIds[0]);
});
