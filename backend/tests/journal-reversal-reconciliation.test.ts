import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const hook = vi.hoisted(() => ({
  afterLedgerRead: undefined as (() => Promise<void>) | undefined,
  afterOpeningRead: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('../src/database/pool.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/database/pool.ts')>();
  const intercept = async (sql: string, run: () => ReturnType<typeof actual.query>) => {
    const result = await run();
    if (hook.afterLedgerRead && sql.includes('AS gl_revenue')) {
      const work = hook.afterLedgerRead;
      hook.afterLedgerRead = undefined;
      await work();
    }
    if (hook.afterOpeningRead && sql.includes('AS total_debit')) {
      const work = hook.afterOpeningRead;
      hook.afterOpeningRead = undefined;
      await work();
    }
    return result;
  };
  return {
    ...actual,
    query: (sql: string, params?: unknown[]) => intercept(sql, () => actual.query(sql, params)),
    withReadOnlySnapshot: <T>(work: (client: import('pg').PoolClient) => Promise<T>) =>
      actual.withReadOnlySnapshot((client) =>
        work(
          new Proxy(client, {
            get(target, key) {
              if (key === 'query')
                return (sql: string, params?: unknown[]) =>
                  intercept(sql, () => target.query(sql, params));
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        ),
      ),
  };
});
import { query, getClient } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { getTreasuryMovementTotals } from '../src/services/treasuryMovementService.ts';
import { businessToday } from '../src/utils/localDate.ts';
const prefix = `JR-${randomUUID().slice(0, 8)}`;
const journalIds: number[] = [];
const periodIds: number[] = [];
const saleIds: number[] = [];
const expenseIds: number[] = [];
let userId: number;
let cashAccountId: number;
let warehouseId: number;
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1",
    )
  ).rows[0].id;
  cashAccountId = (await query("SELECT id FROM accounts WHERE code='110101'")).rows[0].id;
  warehouseId = (await query("SELECT id FROM warehouses WHERE code='MAIN'")).rows[0].id;
});
afterEach(async () => {
  hook.afterLedgerRead = undefined;
  hook.afterOpeningRead = undefined;
  await query('DELETE FROM financial_periods WHERE id=ANY($1::int[])', [periodIds.splice(0)]);
  const owned = (
    await query(
      `WITH RECURSIVE owned(id) AS (
    SELECT id FROM journal_entries WHERE id=ANY($1::int[])
    UNION SELECT j.id FROM journal_entries j JOIN owned o ON j.reference_id::text=o.id::text WHERE j.reference_type='reversal'
  ) SELECT id FROM owned`,
      [journalIds],
    )
  ).rows.map((row) => row.id);
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [owned]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [owned]);
  journalIds.length = 0;
  await query('DELETE FROM sales WHERE id=ANY($1::int[])', [saleIds.splice(0)]);
  await query('DELETE FROM expenses WHERE id=ANY($1::int[])', [expenseIds.splice(0)]);
});
const journal = async (
  status: 'posted' | 'draft' = 'posted',
  date = '1889-11-15',
  expense = false,
) => {
  const entry = await accountingService.createJournalEntry({
    entry_date: date,
    status,
    description: prefix,
    created_by: userId,
    lines: expense
      ? [
          { account_code: '5205', debit: 100, credit: 0 },
          { account_code: '110101', debit: 0, credit: 100 },
        ]
      : [
          { account_code: '110101', debit: 100, credit: 0 },
          { account_code: '4101', debit: 0, credit: 100 },
        ],
  });
  journalIds.push(entry.id);
  return entry.id;
};
const reverse = async (id: number) => {
  const result = await accountingService.reverseJournalEntry(id, userId, prefix);
  journalIds.push(result.id);
  return result.id;
};
it('preserves the original historical balance and cancels it only on the reversal date', async () => {
  const before = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15');
  const current = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday());
  const movements = await getTreasuryMovementTotals('1889-11-15', businessToday(), query);
  const original = await journal();
  const reversed = await reverse(original);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15')).toBe(
    before + 100,
  );
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday())).toBe(
    current,
  );
  expect((await getTreasuryMovementTotals('1889-11-15', businessToday(), query)).net).toBe(
    movements.net,
  );
  const ledger = await accountingService.getGeneralLedger({
    account_id: cashAccountId,
    from_date: '1889-11-15',
    to_date: businessToday(),
  });
  expect(ledger.entries.map((row) => row.entry_id)).toEqual(
    expect.arrayContaining([original, reversed]),
  );
});
it('rejects reversing an unposted draft and retains its state', async () => {
  const original = await journal('draft');
  await expect(reverse(original)).rejects.toMatchObject({ statusCode: 400 });
  expect(
    (await query('SELECT status FROM journal_entries WHERE id=$1', [original])).rows[0].status,
  ).toBe('draft');
});
it('includes the original and both counterentries when reversing a reversal', async () => {
  const baseline = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday());
  const original = await journal();
  const reversed = await reverse(original);
  const restored = await reverse(reversed);
  const ledger = await accountingService.getGeneralLedger({
    account_id: cashAccountId,
    from_date: '1889-11-15',
    to_date: businessToday(),
  });
  expect(ledger.entries.map((row) => row.entry_id)).toEqual(
    expect.arrayContaining([original, reversed, restored]),
  );
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday())).toBe(
    baseline + 100,
  );
});
it('creates only one counterentry for simultaneous reversal attempts', async () => {
  const baseline = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday());
  const original = await journal();
  const results = await Promise.allSettled([reverse(original), reverse(original)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday())).toBe(
    baseline,
  );
});
it('continues excluding voided entries that have no counterentry', async () => {
  const baseline = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15');
  const original = await journal();
  await query("UPDATE journal_entries SET status='voided' WHERE id=$1", [original]);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15')).toBe(
    baseline,
  );
});
const operations = async () => {
  const sale = (
    await query(
      `INSERT INTO sales(sale_number,sale_date,warehouse_id,user_id,total_amount,status,payment_status)
    VALUES($1,'1889-12-10',$2,$3,100,'completed','unpaid') RETURNING id`,
      [`${prefix}-${randomUUID().slice(0, 8)}`, warehouseId, userId],
    )
  ).rows[0].id;
  saleIds.push(sale);
  const expense = (
    await query(
      `INSERT INTO expenses(expense_number,title,amount,expense_date)
    VALUES($1,$2,100,'1889-12-10') RETURNING id`,
      [`${prefix}-${randomUUID().slice(0, 8)}`, prefix],
    )
  ).rows[0].id;
  expenseIds.push(expense);
  return sale;
};
it('does not report full reconciliation when revenue and expense differences cancel in net profit', async () => {
  await operations();
  const result = await accountingService.getLedgerReconciliationSummary('1889-12-01', '1889-12-31');
  expect(result.variances).toMatchObject({
    revenue: 100,
    cogs: 0,
    expenses: 100,
    net_profit: 0,
    is_fully_reconciled: false,
  });
});
it('reads operational and ledger reconciliation figures in one snapshot during a concurrent commit', async () => {
  const sale = await operations();
  await journal('posted', '1889-12-10');
  await journal('posted', '1889-12-10', true);
  hook.afterLedgerRead = async () => {
    const client = await getClient();
    try {
      await client.query('UPDATE sales SET total_amount=150 WHERE id=$1', [sale]);
    } finally {
      client.release();
    }
  };
  const result = await accountingService.getLedgerReconciliationSummary('1889-12-01', '1889-12-31');
  expect(result.operational.revenue).toBe(100);
  expect(result.variances.is_fully_reconciled).toBe(true);
  expect(
    (await query('SELECT total_amount FROM sales WHERE id=$1', [sale])).rows[0].total_amount,
  ).toBe(150);
});

it('reads legacy voided originals with their actual posted counterentries', async () => {
  const historical = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15');
  const current = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday());
  const original = await journal();
  await reverse(original);
  await query("UPDATE journal_entries SET status='voided' WHERE id=$1", [original]);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15')).toBe(
    historical + 100,
  );
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday())).toBe(
    current,
  );
});
it('can reverse a historical posting in a closed period without modifying its original state', async () => {
  const original = await journal();
  periodIds.push(
    (
      await query(
        `INSERT INTO financial_periods(period_start,period_end,status,notes)
    VALUES('1889-11-01','1889-11-30','closed',$1) RETURNING id`,
        [prefix],
      )
    ).rows[0].id,
  );
  await reverse(original);
  expect(
    (await query('SELECT status FROM journal_entries WHERE id=$1', [original])).rows[0].status,
  ).toBe('posted');
});
it('keeps ledger opening and period movements in one snapshot during a concurrent commit', async () => {
  const before = await accountingService.getGeneralLedger({
    account_id: cashAccountId,
    from_date: '1889-12-01',
    to_date: '1889-12-31',
  });
  hook.afterOpeningRead = async () => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      for (const date of ['1889-11-16', '1889-12-10']) {
        const entry = await accountingService.createJournalEntry(
          {
            entry_date: date,
            description: prefix,
            lines: [
              { account_code: '110101', debit: 100, credit: 0 },
              { account_code: '4101', debit: 0, credit: 100 },
            ],
          },
          client,
        );
        journalIds.push(entry.id);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const snapshot = await accountingService.getGeneralLedger({
    account_id: cashAccountId,
    from_date: '1889-12-01',
    to_date: '1889-12-31',
  });
  expect(snapshot.closing_balance).toBe(before.closing_balance);
  expect(snapshot.period_debit).toBe(before.period_debit);
  const after = await accountingService.getGeneralLedger({
    account_id: cashAccountId,
    from_date: '1889-12-01',
    to_date: '1889-12-31',
  });
  expect(after.closing_balance).toBe(before.closing_balance + 200);
});

it('preserves the complete ledger trail for legacy reversal chains', async () => {
  const historical = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15');
  const current = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday());
  const original = await journal();
  const reversed = await reverse(original);
  const restored = await reverse(reversed);
  await query("UPDATE journal_entries SET status='voided' WHERE id=ANY($1::int[])", [
    [original, reversed],
  ]);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, '1889-11-15')).toBe(
    historical + 100,
  );
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, businessToday())).toBe(
    current + 100,
  );
  const ledger = await accountingService.getGeneralLedger({
    account_id: cashAccountId,
    from_date: '1889-11-15',
    to_date: businessToday(),
  });
  expect(ledger.entries.map((row) => row.entry_id)).toEqual(
    expect.arrayContaining([original, reversed, restored]),
  );
});
it('does not move a future posting into the current cash balance when reversed', async () => {
  const today = businessToday();
  const futureDate = '3000-01-15';
  const current = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, today);
  const future = await accountingService.getLedgerBalanceAsOfDate(cashAccountId, futureDate);
  const original = await journal('posted', futureDate);
  const reversed = await reverse(original);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, today)).toBe(current);
  expect(await accountingService.getLedgerBalanceAsOfDate(cashAccountId, futureDate)).toBe(future);
  expect(
    (
      await query('SELECT entry_date::text AS entry_date FROM journal_entries WHERE id=$1', [
        reversed,
      ])
    ).rows[0].entry_date,
  ).toBe(futureDate);
});
