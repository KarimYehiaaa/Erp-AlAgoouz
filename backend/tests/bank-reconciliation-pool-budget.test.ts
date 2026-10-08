import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
const originalPoolMax = vi.hoisted(() => {
  const original = process.env.DB_POOL_MAX;
  process.env.DB_POOL_MAX = '1';
  return original;
});
import pool, { query, closePool } from '../src/database/pool.ts';
import { bankReconciliationService as bank } from '../src/services/bankReconciliationService.ts';

const accounts: number[] = [];
const journals: number[] = [];
const sessions: number[] = [];
let sessionId: number;
let journalId: number;
let userId: number;
beforeEach(async () => {
  expect(pool.options.max).toBe(1);
  userId = (await query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0].id;
  const prefix = `PB-${randomUUID()}`;
  for (const [type, balance, code] of [
    ['asset', 'debit', '11'],
    ['revenue', 'credit', '41'],
  ] as const) {
    const account = await query(
      `INSERT INTO accounts(code,name_ar,account_type,normal_balance)
      VALUES($1,$2,$3,$4) RETURNING id`,
      [`${code}-${prefix}`, prefix, type, balance],
    );
    accounts.push(account.rows[0].id);
  }
  journalId = (
    await query(
      `INSERT INTO journal_entries(entry_number,entry_date,status,description,created_by)
    VALUES($1,'1881-02-10','posted',$3,$2) RETURNING id`,
      [prefix, userId, prefix],
    )
  ).rows[0].id;
  journals.push(journalId);
  await query(
    `INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit,credit)
    VALUES($1,$2,100,0),($1,$3,0,100)`,
    [journalId, accounts[0], accounts[1]],
  );
  const rec = await bank.createReconciliation(userId, {
    account_id: accounts[0],
    statement_date: '1881-02-28',
    statement_balance: 100,
    status: 'draft',
  });
  sessionId = rec.id;
  sessions.push(sessionId);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await query('DELETE FROM bank_reconciliations WHERE id=ANY($1::int[])', [sessions]);
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [journals]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [journals]);
  await query('DELETE FROM accounts WHERE id=ANY($1::int[])', [accounts]);
  sessions.length = journals.length = accounts.length = 0;
});
afterAll(async () => {
  if (originalPoolMax === undefined) delete process.env.DB_POOL_MAX;
  else process.env.DB_POOL_MAX = originalPoolMax;
  await closePool();
});
it('imports and returns its committed movement with a single business connection', async () => {
  const result = await bank.importBankStatement(
    sessionId,
    Buffer.from('Date,Description,Debit,Credit\n1881-02-10,fixture,0,100'),
    'fixture.csv',
  );
  expect(result.imported_count).toBe(1);
  expect(result.transactions).toHaveLength(1);
  expect(result.transactions[0]).toMatchObject({ amount: 100, status: 'unmatched' });
  expect(await bank.getStatementTransactions(sessionId)).toHaveLength(1);
});
it('rejects a bad later row without saving an earlier valid movement', async () => {
  await expect(
    bank.importBankStatement(
      sessionId,
      Buffer.from('Date,Credit\n1881-02-10,100\nbad,200'),
      'invalid.csv',
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(await bank.getStatementTransactions(sessionId)).toHaveLength(0);
});
it('imports day-first CSV and decimal commas as exact values on a single connection', async () => {
  const result = await bank.importBankStatement(
    sessionId,
    Buffer.from('Date,Credit,Reference\n10/02/1881,"12,50",000012'),
    'localized.csv',
  );
  expect(result.transactions[0]).toMatchObject({
    transaction_date: '1881-02-10',
    credit: 12.5,
    amount: 12.5,
    reference: '000012',
  });
});
it('matches, returns its committed movement and finalizes with a single business connection', async () => {
  await query(
    `INSERT INTO bank_statement_transactions
    (reconciliation_id,transaction_date,credit,amount)
    VALUES($1,'1881-02-10',100,100)`,
    [sessionId],
  );
  const result = await bank.autoMatchTransactions(sessionId);
  expect(result.matched_count).toBe(1);
  expect(result.transactions?.[0]).toMatchObject({
    status: 'matched',
    matched_journal_entry_id: journalId,
  });
  expect((await bank.finalizeReconciliation(sessionId, userId)).status).toBe('completed');
});
it('rolls back imported rows if preparing the response fails', async () => {
  vi.spyOn(bank, 'getStatementTransactions').mockRejectedValueOnce(
    new Error('Injected result failure'),
  );
  await expect(
    bank.importBankStatement(
      sessionId,
      Buffer.from('Date,Description,Debit,Credit\n1881-02-10,fixture,0,100'),
      'fixture.csv',
    ),
  ).rejects.toThrow('Injected result failure');
  expect(await bank.getStatementTransactions(sessionId)).toHaveLength(0);
});
it('rolls back matching if preparing the response fails', async () => {
  await query(
    `INSERT INTO bank_statement_transactions
    (reconciliation_id,transaction_date,credit,amount)
    VALUES($1,'1881-02-10',100,100)`,
    [sessionId],
  );
  vi.spyOn(bank, 'getStatementTransactions').mockRejectedValueOnce(
    new Error('Injected result failure'),
  );
  await expect(bank.autoMatchTransactions(sessionId)).rejects.toThrow('Injected result failure');
  expect((await bank.getStatementTransactions(sessionId))[0]).toMatchObject({
    status: 'unmatched',
    matched_journal_entry_id: null,
    matched_payment_id: null,
    matched_amount: 0,
  });
});
