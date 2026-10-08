import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { bankReconciliationService as bank } from '../src/services/bankReconciliationService.ts';

const prefix = `BL-${randomUUID()}`;
const accountIds: number[] = [];
const journalIds: number[] = [];
const reconciliationIds: number[] = [];
let reconciliationId: number;
let transactionId: number;
let journalId: number;
let userId: number;
beforeEach(async () => {
  userId = (await query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0].id;
  const asset = await accountingService.createAccount({
    code: `11-${randomUUID()}`,
    name_ar: prefix,
    account_type: 'asset',
  });
  const revenue = await accountingService.createAccount({
    code: `41-${randomUUID()}`,
    name_ar: prefix,
    account_type: 'revenue',
  });
  accountIds.push(asset.id, revenue.id);
  const journal = await accountingService.createJournalEntry({
    entry_date: '1882-02-10',
    description: prefix,
    lines: [
      { account_id: asset.id, debit: 100, credit: 0 },
      { account_id: revenue.id, debit: 0, credit: 100 },
    ],
  });
  journalId = journal.id;
  journalIds.push(journalId);
  const rec = await bank.createReconciliation(userId, {
    account_id: asset.id,
    statement_date: '1882-02-28',
    statement_balance: 100,
    status: 'draft',
  });
  reconciliationId = rec.id;
  reconciliationIds.push(rec.id);
  transactionId = (
    await query(
      `INSERT INTO bank_statement_transactions
      (reconciliation_id,transaction_date,description,credit,amount)
      VALUES($1,'1882-02-10',$2,100,100) RETURNING id`,
      [rec.id, prefix],
    )
  ).rows[0].id;
});
afterEach(async () => {
  await query('DELETE FROM bank_reconciliations WHERE id=ANY($1::int[])', [reconciliationIds]);
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [
    journalIds,
  ]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [journalIds]);
  await query('DELETE FROM accounts WHERE id=ANY($1::int[])', [accountIds]);
  reconciliationIds.length = journalIds.length = accountIds.length = 0;
});
const mutations: Array<[string, () => Promise<unknown>]> = [
  ['exclude', () => bank.excludeTransaction(transactionId, 'reviewed fixture')],
  ['unmatch', () => bank.unmatchTransaction(transactionId)],
  ['match', () => bank.matchTransaction(transactionId, { journal_entry_id: journalId })],
  ['auto match', () => bank.autoMatchTransactions(reconciliationId)],
  [
    'import',
    () =>
      bank.importBankStatement(
        reconciliationId,
        Buffer.from('Date,Description,Debit,Credit\n1882-02-10,fixture,0,100'),
        'fixture.csv',
      ),
  ],
];
it.each(
  mutations.flatMap(([name, run]) =>
    ['completed', 'cancelled'].map((status) => ({ name, run, status })),
  ),
)('prevents $name from changing a $status session', async ({ run, status }) => {
  await query('UPDATE bank_reconciliations SET status=$1 WHERE id=$2', [status, reconciliationId]);
  const before = (
    await query(
      'SELECT * FROM bank_statement_transactions WHERE reconciliation_id=$1 ORDER BY id',
      [reconciliationId],
    )
  ).rows;
  await expect(run()).rejects.toMatchObject({ statusCode: 400 });
  expect(
    (
      await query(
        'SELECT * FROM bank_statement_transactions WHERE reconciliation_id=$1 ORDER BY id',
        [reconciliationId],
      )
    ).rows,
  ).toEqual(before);
});
it.each(mutations)('serializes %s with a concurrent session closure', async (_name, run) => {
  const closer = await getClient();
  let attempt: Promise<{ error?: unknown; value?: unknown }> | undefined;
  let settled = false;
  try {
    await closer.query('BEGIN');
    await closer.query("UPDATE bank_reconciliations SET status='completed' WHERE id=$1", [
      reconciliationId,
    ]);
    attempt = run().then(
      (value) => {
        settled = true;
        return { value };
      },
      (error) => {
        settled = true;
        return { error };
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(settled).toBe(false);
    await closer.query('COMMIT');
    expect((await attempt).error).toMatchObject({ statusCode: 400 });
  } finally {
    await closer.query('ROLLBACK');
    closer.release();
    if (attempt) await attempt;
  }
});
it('does not finalize a partially matched movement even when the balance agrees', async () => {
  await query(
    "UPDATE bank_statement_transactions SET status='partial',matched_amount=50 WHERE id=$1",
    [transactionId],
  );
  await expect(bank.finalizeReconciliation(reconciliationId, userId)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect((await bank.getReconciliationById(reconciliationId)).status).toBe('draft');
});
it('allows only one concurrent finalization', async () => {
  await bank.excludeTransaction(transactionId, 'reviewed fixture');
  const blocker = await getClient();
  let attempts: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM bank_reconciliations WHERE id=$1 FOR UPDATE', [
      reconciliationId,
    ]);
    attempts = Promise.allSettled([
      bank.finalizeReconciliation(reconciliationId, userId),
      bank.finalizeReconciliation(reconciliationId, userId),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await blocker.query('COMMIT');
    const result = await attempts;
    expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((value) => value.status === 'rejected')).toHaveLength(1);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (attempts) await attempts;
  }
});
it('still permits exclusion and finalization in an open session', async () => {
  expect((await bank.excludeTransaction(transactionId, 'reviewed fixture')).status).toBe(
    'excluded',
  );
  expect((await bank.finalizeReconciliation(reconciliationId, userId)).status).toBe('completed');
});
it('does not finalize a cancelled session', async () => {
  await bank.excludeTransaction(transactionId, 'reviewed fixture');
  await query("UPDATE bank_reconciliations SET status='cancelled' WHERE id=$1", [reconciliationId]);
  await expect(bank.finalizeReconciliation(reconciliationId, userId)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect((await bank.getReconciliationById(reconciliationId)).status).toBe('cancelled');
});

it.each(['amount', 'direction', 'account', 'draft', 'future'])(
  'rejects a manual journal match with invalid %s',
  async (kind) => {
    if (kind === 'amount')
      await query('UPDATE bank_statement_transactions SET credit=101,amount=101 WHERE id=$1', [
        transactionId,
      ]);
    if (kind === 'direction')
      await query(
        'UPDATE bank_statement_transactions SET credit=0,debit=100,amount=-100 WHERE id=$1',
        [transactionId],
      );
    if (kind === 'account')
      await query('UPDATE bank_reconciliations SET account_id=$1 WHERE id=$2', [
        accountIds[1],
        reconciliationId,
      ]);
    if (kind === 'draft')
      await query("UPDATE journal_entries SET status='draft' WHERE id=$1", [journalId]);
    if (kind === 'future')
      await query("UPDATE journal_entries SET entry_date='1882-03-01' WHERE id=$1", [journalId]);
    await expect(
      bank.matchTransaction(transactionId, { journal_entry_id: journalId }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect((await bank.getStatementTransactions(reconciliationId))[0].status).toBe('unmatched');
  },
);
it('rejects ambiguous match payloads', async () => {
  await expect(
    bank.matchTransaction(transactionId, { journal_entry_id: journalId, payment_id: 1 }),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    bank.matchTransaction(transactionId, { journal_entry_line_id: journalId }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it('allows valid manual matching and rejects reusing its journal in the same account', async () => {
  expect((await bank.matchTransaction(transactionId, { journal_entry_id: journalId })).status).toBe(
    'matched',
  );
  const other = (
    await query(
      `INSERT INTO bank_statement_transactions
    (reconciliation_id,transaction_date,credit,amount) VALUES($1,'1882-02-10',100,100) RETURNING id`,
      [reconciliationId],
    )
  ).rows[0].id;
  await expect(bank.matchTransaction(other, { journal_entry_id: journalId })).rejects.toMatchObject(
    { statusCode: 409 },
  );
  expect((await bank.autoMatchTransactions(reconciliationId)).matched_count).toBe(0);
});
it('allows the other account side of the same journal to be matched automatically', async () => {
  await bank.matchTransaction(transactionId, { journal_entry_id: journalId });
  const rec = await bank.createReconciliation(userId, {
    account_id: accountIds[1],
    statement_date: '1882-02-28',
    statement_balance: 100,
    status: 'draft',
  });
  reconciliationIds.push(rec.id);
  await query(
    `INSERT INTO bank_statement_transactions
    (reconciliation_id,transaction_date,debit,amount) VALUES($1,'1882-02-10',100,-100)`,
    [rec.id],
  );
  expect((await bank.autoMatchTransactions(rec.id)).matched_count).toBe(1);
});
it('leaves future journal movements unmatched automatically', async () => {
  await query("UPDATE journal_entries SET entry_date='1882-03-01' WHERE id=$1", [journalId]);
  await query("UPDATE bank_statement_transactions SET transaction_date='1882-02-28' WHERE id=$1", [
    transactionId,
  ]);
  expect((await bank.autoMatchTransactions(reconciliationId)).matched_count).toBe(0);
});
it('does not automatically match an unposted payment just because its amount and date agree', async () => {
  await query("UPDATE journal_entries SET status='draft' WHERE id=$1", [journalId]);
  const payment = (
    await query(
      `INSERT INTO payments
    (payment_number,reference_type,reference_id,amount,payment_method,created_at)
    VALUES($1,'sale',1,100,'cash','1882-02-10') RETURNING id`,
      [`BL-${randomUUID()}`],
    )
  ).rows[0];
  try {
    expect((await bank.autoMatchTransactions(reconciliationId)).matched_count).toBe(0);
    expect((await bank.getStatementTransactions(reconciliationId))[0].status).toBe('unmatched');
  } finally {
    await query('DELETE FROM payments WHERE id=$1', [payment.id]);
  }
});
it('serializes concurrent manual matches in different sessions for the same account', async () => {
  const rec = await bank.createReconciliation(userId, {
    account_id: accountIds[0],
    statement_date: '1882-02-28',
    statement_balance: 100,
    status: 'draft',
  });
  reconciliationIds.push(rec.id);
  const other = (
    await query(
      `INSERT INTO bank_statement_transactions
    (reconciliation_id,transaction_date,credit,amount) VALUES($1,'1882-02-10',100,100) RETURNING id`,
      [rec.id],
    )
  ).rows[0].id;
  const results = await Promise.allSettled(
    [transactionId, other].map((id) => bank.matchTransaction(id, { journal_entry_id: journalId })),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
});
it('aggregates multiple lines of one journal before automatic matching', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE journal_entry_lines SET debit=40 WHERE journal_entry_id=$1 AND account_id=$2',
      [journalId, accountIds[0]],
    );
    await client.query(
      'INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit,credit) VALUES($1,$2,60,0)',
      [journalId, accountIds[0]],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  expect((await bank.autoMatchTransactions(reconciliationId)).matched_count).toBe(1);
  expect((await bank.getStatementTransactions(reconciliationId))[0].matched_journal_entry_id).toBe(
    journalId,
  );
});
