import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.ts';
import config from '../src/config/index.ts';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';

const prefix = `GL-${randomUUID().slice(0, 8)}`;
const warehouses: number[] = [];
const entries: number[] = [];
let cashId: number;
let server: http.Server;
let baseUrl: string;
let token: string;
const period = { account_code: '110101', from_date: '1888-02-01', to_date: '1888-02-29' };
beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl =
    'http://127.0.0.1:' +
    (server.address() as AddressInfo).port +
    '/api/v1/accounting/general-ledger';
  const admin = (
    await query(
      "SELECT u.id,u.token_version,u.session_generation FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active AND u.deleted_at IS NULL LIMIT 1",
    )
  ).rows[0];
  token = jwt.sign(
    { userId: admin.id, ver: Number(admin.token_version), gen: admin.session_generation },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
  cashId = (await query("SELECT id FROM accounts WHERE code='110101'")).rows[0].id;
  for (let i = 0; i < 2; i++) {
    warehouses.push(
      (
        await query('INSERT INTO warehouses(code,name_ar) VALUES($1,$2) RETURNING id', [
          `${prefix}-${i}`,
          prefix,
        ])
      ).rows[0].id,
    );
  }
});
afterEach(async () => {
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [entries]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [entries]);
  entries.length = 0;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await query('DELETE FROM warehouses WHERE id=ANY($1::int[])', [warehouses]);
});
const post = async (
  amount: number,
  date: string,
  warehouse?: number,
  status: 'posted' | 'draft' = 'posted',
) => {
  const entry = await accountingService.createJournalEntry({
    entry_date: date,
    description: prefix,
    status,
    lines: [
      { account_code: '110101', debit: amount, credit: 0, warehouse_id: warehouse },
      { account_code: '4101', debit: 0, credit: amount, warehouse_id: warehouse },
    ],
  });
  entries.push(entry.id);
  return entry.id;
};
it('applies the selected warehouse to opening balances and period movements', async () => {
  const before = await accountingService.getGeneralLedger({
    ...period,
    warehouse_id: warehouses[0],
  });
  await post(40, '1888-01-31', warehouses[0]);
  await post(70, '1888-01-31', warehouses[1]);
  const selected = await post(15, '1888-02-29', warehouses[0]);
  await post(25, '1888-02-12', warehouses[1]);
  await post(30, '1888-02-12');
  await post(50, '1888-02-12', warehouses[0], 'draft');
  await post(60, '1888-03-01', warehouses[0]);
  const ledger = await accountingService.getGeneralLedger({
    ...period,
    warehouse_id: warehouses[0],
  });
  expect(ledger.opening_balance).toBe(before.opening_balance + 40);
  expect(ledger.period_debit).toBe(before.period_debit + 15);
  expect(ledger.closing_balance).toBe(before.closing_balance + 55);
  expect(ledger.entries.map((row) => row.entry_id)).toEqual([selected]);
  expect(ledger.entries[0].running_balance).toBe(before.opening_balance + 55);
});
it('keeps the all-warehouse report inclusive of unassigned lines', async () => {
  const before = await accountingService.getGeneralLedger(period);
  await post(12, '1888-02-01', warehouses[0]);
  await post(23, '1888-02-02', warehouses[1]);
  await post(34, '1888-02-03');
  const ledger = await accountingService.getGeneralLedger({ ...period, account_id: cashId });
  expect(ledger.period_debit).toBe(before.period_debit + 69);
  expect(ledger.closing_balance).toBe(before.closing_balance + 69);
});
it('rejects a nonexistent warehouse instead of returning a misleading empty report', async () => {
  await expect(
    accountingService.getGeneralLedger({ ...period, warehouse_id: 2147483647 }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it.each([
  { warehouse_id: 0 },
  { warehouse_id: -1 },
  { warehouse_id: 1.5 },
  { warehouse_id: 2147483648 },
  { account_id: 0 },
  { account_id: -1 },
  { account_id: 1.5 },
  { account_id: 2147483648 },
  { from_date: '1888-02-30' },
  { from_date: '0000-01-01' },
  { from_date: 'bad-date' },
  { to_date: '1888-01-31' },
  { account_code: '' },
  { account_code: 'x'.repeat(51) },
])('rejects invalid ledger filters with a clear client error: %j', async (filter) => {
  await expect(accountingService.getGeneralLedger({ ...period, ...filter })).rejects.toMatchObject({
    statusCode: 400,
  });
});

const requestLedger = (suffix: string) =>
  fetch(`${baseUrl}?${suffix}`, { headers: { Authorization: `Bearer ${token}` } });
it.each([
  'account_code=110101&warehouse_id=0',
  'account_code=110101&warehouse_id=2147483648',
  'account_code=110101&warehouse_id=1&warehouse_id=2',
  'account_id=1&account_id=2',
  'account_code=110101&from_date=1888-02-30',
  'account_code=110101&from_date=1888-02-01&to_date=1888-01-31',
  'account_code=110101&from_date=1888-02-01&from_date=1888-02-02',
  'account_code=110101&account_code=4101',
  'account_code=110101&account_id=0',
])('returns HTTP 400 for malformed query filters: %s', async (suffix) => {
  const response = await requestLedger(suffix);
  await response.json();
  expect(response.status).toBe(400);
});
it('preserves the selected warehouse when reading the report through HTTP', async () => {
  const own = await post(10, '1888-02-02', warehouses[0]);
  await post(20, '1888-02-02', warehouses[1]);
  const response = await requestLedger(
    `account_code=110101&from_date=1888-02-01&to_date=1888-02-29&warehouse_id=${warehouses[0]}`,
  );
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.entries.map((row: { entry_id: number }) => row.entry_id)).toEqual([own]);
  expect(body.data.closing_balance).toBe(10);
});
it('returns the same warehouse history after archival', async () => {
  await post(10, '1888-02-02', warehouses[0]);
  await query('UPDATE warehouses SET is_active=false, deleted_at=NOW() WHERE id=$1', [
    warehouses[0],
  ]);
  try {
    const ledger = await accountingService.getGeneralLedger({
      ...period,
      warehouse_id: warehouses[0],
    });
    expect(ledger.period_debit).toBe(10);
  } finally {
    await query('UPDATE warehouses SET is_active=true, deleted_at=NULL WHERE id=$1', [
      warehouses[0],
    ]);
  }
});
