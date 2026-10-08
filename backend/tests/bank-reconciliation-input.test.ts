import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { bankReconciliationService as bank } from '../src/services/bankReconciliationService.ts';

let accountId: number;
let userId: number;
beforeAll(async () => {
  userId = (await query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0].id;
  accountId = (
    await query(
      `INSERT INTO accounts(code,name_ar,account_type,normal_balance)
     VALUES($1,'bank input fixture','asset','debit') RETURNING id`,
      [`BI-${randomUUID()}`],
    )
  ).rows[0].id;
});
afterEach(async () => {
  await query('DELETE FROM bank_reconciliations WHERE account_id=$1', [accountId]);
});
afterAll(async () => {
  await query('DELETE FROM accounts WHERE id=$1', [accountId]);
});

it.each([
  ['missing balance', { statement_balance: undefined }],
  ['null balance', { statement_balance: null }],
  ['empty balance', { statement_balance: '' }],
  ['invalid balance', { statement_balance: 'invalid' }],
  ['NaN balance', { statement_balance: NaN }],
  ['infinite balance', { statement_balance: Infinity }],
  ['overflow balance', { statement_balance: 10 ** 13 }],
  ['negative overflow balance', { statement_balance: -(10 ** 13) }],
  ['invalid date', { statement_date: '1883-02-30' }],
  ['zero year', { statement_date: '0000-01-01' }],
  ['array date', { statement_date: ['1883-02-28'] }],
  ['fractional account', { account_id: 1.5 }],
  ['overflow account', { account_id: 2147483648 }],
  ['invalid status', { status: 'unknown' }],
  ['invalid notes', { notes: { text: 'fixture' } }],
])('rejects %s with a validation error and persists no session', async (_name, overrides) => {
  await expect(
    bank.createReconciliation(userId, {
      account_id: accountId,
      statement_date: '1883-02-28',
      statement_balance: 0,
      ...overrides,
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(
    (await query('SELECT id FROM bank_reconciliations WHERE account_id=$1', [accountId])).rows,
  ).toHaveLength(0);
});

it('rejects explicit completion with an outstanding difference', async () => {
  await expect(
    bank.createReconciliation(userId, {
      account_id: accountId,
      statement_date: '1883-02-28',
      statement_balance: 100,
      status: 'completed',
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(
    (await query('SELECT id FROM bank_reconciliations WHERE account_id=$1', [accountId])).rows,
  ).toHaveLength(0);
});
it('accepts zero balance completion', async () => {
  const rec = await bank.createReconciliation(userId, {
    account_id: accountId,
    statement_date: '1883-02-28',
    statement_balance: 0,
    status: 'completed',
  });
  expect(rec).toMatchObject({ status: 'completed', difference: 0 });
});
it('preserves signed balances for draft statements', async () => {
  const rec = await bank.createReconciliation(userId, {
    account_id: accountId,
    statement_date: '1883-02-28',
    statement_balance: -100.25,
    status: 'draft',
  });
  expect(rec).toMatchObject({ status: 'draft', statement_balance: -100.25, difference: -100.25 });
});
