import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, expect, it } from 'vitest';
import app from '../src/app.ts';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import { accountingService as accounting } from '../src/services/accountingService.ts';

const prefix = `RD-${randomUUID()}`;
const entries: number[] = [];
const accounts: number[] = [];
let assetId: number;
let server: http.Server;
let base: string;
let token: string;
beforeAll(async () => {
  const admin = (
    await query(`SELECT u.id,u.token_version,u.session_generation FROM users u
      JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active
      AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1`)
  ).rows[0];
  token = jwt.sign(
    { userId: admin.id, ver: Number(admin.token_version), gen: admin.session_generation },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
  assetId = (
    await accounting.createAccount({ code: `11-${prefix}`, name_ar: prefix, account_type: 'asset' })
  ).id;
  const revenueId = (
    await accounting.createAccount({
      code: `41-${prefix}`,
      name_ar: prefix,
      account_type: 'revenue',
    })
  ).id;
  accounts.push(assetId, revenueId);
  for (const [date, amount] of [
    ['1850-02-10', 100],
    ['1851-02-10', 75],
  ] as const) {
    const entry = await accounting.createJournalEntry({
      entry_date: date,
      description: prefix,
      lines: [
        { account_id: assetId, debit: amount, credit: 0 },
        { account_id: revenueId, debit: 0, credit: amount },
      ],
    });
    entries.push(entry.id);
  }
  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/accounting`;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [entries]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [entries]);
  await query('DELETE FROM accounts WHERE id=ANY($1::int[])', [accounts]);
});

const reports = [
  ['general-ledger', 'from_date'],
  ['trial-balance', 'from_date'],
  ['income-statement', 'from_date'],
  ['ledger-reconciliation', 'from_date'],
  ['balance-sheet', 'as_of_date'],
  ['aging/customers', 'as_of_date'],
  ['aging/suppliers', 'as_of_date'],
  ['aging/reconciliation', 'as_of_date'],
] as const;
const invalid = ['', '1850-02-30', '0000-01-01', '10000-01-01'];
const invalidCases = reports.flatMap(([route, field]) => [
  ...invalid.map((date) => ({ route, filter: `${field}=${date}` })),
  { route, filter: `${field}=1850-02-01&${field}=1850-02-02` },
  { route, filter: `${field}[year]=1850` },
]);
it.each(invalidCases)('rejects invalid dates on $route: $filter', async ({ route, filter }) => {
  const accountFilter = route === 'general-ledger' ? `&account_id=${assetId}` : '';
  const response = await fetch(`${base}/${route}?${filter}${accountFilter}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
});
it.each(reports.filter(([, field]) => field === 'from_date'))(
  'rejects reversed periods on %s',
  async (route) => {
    const accountFilter = route === 'general-ledger' ? `&account_id=${assetId}` : '';
    const response = await fetch(
      `${base}/${route}?from_date=1850-03-01&to_date=1850-02-28${accountFilter}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(response.status).toBe(400);
  },
);
it.each([
  ['trial balance', () => accounting.getTrialBalance({ from_date: '1850-02-30' })],
  ['balance sheet', () => accounting.getBalanceSheet('1850-02-30')],
  ['customer aging', () => accounting.getCustomerAging('1850-02-30')],
  ['supplier aging', () => accounting.getSupplierAging('1850-02-30')],
  ['aging reconciliation', () => accounting.reconcileAgingWithLedger('1850-02-30')],
  ['income statement', () => accounting.getIncomeStatement('1850-02-30')],
  ['ledger reconciliation', () => accounting.getLedgerReconciliationSummary('1850-02-30')],
  ['ledger balance', () => accounting.getLedgerBalanceAsOfDate(assetId, '1850-02-30')],
] satisfies Array<[string, () => Promise<unknown>]>)(
  'validates dates inside %s',
  async (_name, read) => {
    await expect(read()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  },
);
it('does not include future entries in a trial balance with only a historical end date', async () => {
  const report = await accounting.getTrialBalance({ to_date: '1850-02-28' });
  expect(report.accounts.find((account) => account.id === assetId)?.closing_debit).toBe(100);
  expect(report.period.from_date <= report.period.to_date).toBe(true);
});
it('supports a historical end-only general ledger without future entries', async () => {
  const report = await accounting.getGeneralLedger({ account_id: assetId, to_date: '1850-02-28' });
  expect(report.closing_balance).toBe(100);
  expect(report.period.from_date <= report.period.to_date).toBe(true);
});
it('anchors an omitted income start to the month of the requested end date', async () => {
  const report = await accounting.getIncomeStatement(undefined, '1850-02-28');
  expect(report.period).toEqual({ from_date: '1850-02-01', to_date: '1850-02-28' });
  expect(report.operating_revenue.total).toBe(100);
});
it('anchors an omitted reconciliation start to the requested historical month', async () => {
  const report = await accounting.getLedgerReconciliationSummary(undefined, '1850-02-28');
  expect(report.period).toEqual({ from_date: '1850-02-01', to_date: '1850-02-28' });
  expect(report.general_ledger.revenue).toBe(100);
});
