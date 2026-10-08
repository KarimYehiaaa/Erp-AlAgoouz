import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';

const prefix = `IA-${randomUUID().slice(0, 8)}`;
const accounts: number[] = [];
const entries: number[] = [];
let asset: number;
let revenue: number;
const period = { from_date: '1886-02-01', to_date: '1886-02-28' };
beforeEach(async () => {
  asset = (
    await accountingService.createAccount({
      code: `11-${prefix}`,
      name_ar: prefix,
      account_type: 'asset',
    })
  ).id;
  accounts.push(asset);
  revenue = (
    await accountingService.createAccount({
      code: `41-${prefix}`,
      name_ar: prefix,
      account_type: 'revenue',
    })
  ).id;
  accounts.push(revenue);
});
afterEach(async () => {
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [entries]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [entries]);
  await query('DELETE FROM accounts WHERE id=ANY($1::int[])', [accounts]);
  entries.length = 0;
  accounts.length = 0;
});
const post = async (
  amount: number,
  date: string,
  reverse = false,
  status: 'posted' | 'draft' = 'posted',
) => {
  const entry = await accountingService.createJournalEntry({
    entry_date: date,
    description: prefix,
    status,
    lines: [
      { account_id: asset, debit: reverse ? 0 : amount, credit: reverse ? amount : 0 },
      { account_id: revenue, debit: reverse ? amount : 0, credit: reverse ? 0 : amount },
    ],
  });
  entries.push(entry.id);
};
it('retains opening and period balances after deactivating an account', async () => {
  await post(40, '1886-01-31');
  await post(60, '1886-02-10');
  const before = await accountingService.getTrialBalance(period);
  await accountingService.updateAccount(asset, { is_active: false });
  const after = await accountingService.getTrialBalance(period);
  expect(after.accounts.find((row) => row.id === asset)).toEqual(
    before.accounts.find((row) => row.id === asset),
  );
  expect(after.totals).toEqual(before.totals);
  const ledger = await accountingService.getGeneralLedger({ ...period, account_id: asset });
  expect(ledger.closing_balance).toBe(100);
  expect(after.accounts.find((row) => row.id === asset)?.closing_debit).toBe(
    ledger.closing_balance,
  );
});
it('preserves assets and balance sheet equality after account deactivation', async () => {
  await post(100, '1886-02-10');
  const before = await accountingService.getBalanceSheet(period.to_date);
  await accountingService.updateAccount(asset, { is_active: false });
  const after = await accountingService.getBalanceSheet(period.to_date);
  expect(after.assets.total).toBe(before.assets.total);
  expect(after.assets.items.find((row) => row.id === asset)?.balance).toBe(100);
  expect(after.variance).toBe(before.variance);
  expect(after.is_balanced).toBe(before.is_balanced);
});
it('retains inactive accounts with historical turnover even when their closing balance is zero', async () => {
  await post(100, '1886-01-31');
  await post(100, '1886-02-10', true);
  await accountingService.updateAccount(asset, { is_active: false });
  const row = (await accountingService.getTrialBalance(period)).accounts.find(
    (row) => row.id === asset,
  );
  expect(row).toMatchObject({
    opening_debit: 100,
    period_credit: 100,
    closing_debit: 0,
    closing_credit: 0,
  });
});
it('does not invent history from drafts or future postings on an inactive account', async () => {
  await post(100, '1886-02-10', false, 'draft');
  await post(100, '1886-03-01');
  await accountingService.updateAccount(asset, { is_active: false });
  expect(
    (await accountingService.getTrialBalance(period)).accounts.find((row) => row.id === asset),
  ).toBeUndefined();
});
it('retains revenue history consistently with the income statement', async () => {
  await post(100, '1886-02-10');
  const before = await accountingService.getBalanceSheet(period.to_date);
  await accountingService.updateAccount(revenue, { is_active: false });
  const tb = await accountingService.getTrialBalance(period);
  expect(tb.accounts.find((row) => row.id === revenue)?.period_credit).toBe(100);
  const after = await accountingService.getBalanceSheet(period.to_date);
  expect(after.equity.current_period_net_income).toBe(before.equity.current_period_net_income);
  const income = await accountingService.getIncomeStatement(period.from_date, period.to_date);
  expect(income.operating_revenue.items.find((row) => row.code === `41-${prefix}`)?.amount).toBe(
    100,
  );
});

it('excludes postings after a historical balance sheet date', async () => {
  await post(100, '1886-02-10');
  await post(200, '1886-03-01');
  const sheet = await accountingService.getBalanceSheet(period.to_date);
  expect(sheet.assets.items.find((row) => row.id === asset)?.balance).toBe(100);
});
it('excludes future-only inactive accounts from a historical balance sheet', async () => {
  await post(100, '1886-03-01');
  await accountingService.updateAccount(asset, { is_active: false });
  const sheet = await accountingService.getBalanceSheet(period.to_date);
  expect(sheet.assets.items.find((row) => row.id === asset)).toBeUndefined();
});
