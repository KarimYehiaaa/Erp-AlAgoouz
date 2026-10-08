import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import app from '../src/app.ts';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';

const prefix = `MJ-${randomUUID()}`;
const owned: number[] = [];
const legacyKeys: string[] = [];
let actorId: number;
let secondUserId: number;
let secondToken: string;
let server: http.Server;
let url: string;
let token: string;
const payload = (extra: Record<string, unknown> = {}) => ({
  entry_date: '1887-02-10',
  description: prefix,
  lines: [
    { account_code: '110101', debit: 100, credit: 0 },
    { account_code: '4101', debit: 0, credit: 100 },
  ],
  ...extra,
});
beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/accounting/journal-entries`;
  const admin = (
    await query(
      "SELECT u.id,u.token_version,u.session_generation FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active AND u.deleted_at IS NULL LIMIT 1",
    )
  ).rows[0];
  actorId = admin.id;
  const second = (
    await query(
      "INSERT INTO users(username,password_hash,full_name,role_id,is_active) SELECT $1,'unused-test-fixture-hash',$1,role_id,true FROM users WHERE id=$2 RETURNING id,token_version,session_generation",
      [prefix, actorId],
    )
  ).rows[0];
  secondUserId = second.id;
  secondToken = jwt.sign(
    { userId: second.id, ver: Number(second.token_version), gen: second.session_generation },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
  token = jwt.sign(
    { userId: admin.id, ver: Number(admin.token_version), gen: admin.session_generation },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: '10m' },
  );
});
afterEach(async () => {
  await query('DELETE FROM idempotency_records WHERE key=ANY($1::text[])', [legacyKeys.splice(0)]);
  const ids = (
    await query('SELECT id FROM journal_entries WHERE description=$1 OR id=ANY($2::int[])', [
      prefix,
      owned,
    ])
  ).rows.map((row) => row.id);
  await query('DELETE FROM journal_entry_lines WHERE journal_entry_id=ANY($1::int[])', [ids]);
  await query('DELETE FROM journal_entries WHERE id=ANY($1::int[])', [ids]);
  owned.length = 0;
});
afterAll(async () => {
  await query('DELETE FROM users WHERE id=$1', [secondUserId]);
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});
const post = async (body: unknown, key?: string, authToken = token) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
it.each([
  'sale',
  'purchase',
  'payment',
  'expense',
  'payroll',
  'stocktake',
  'purchase_return',
  'reversal',
  'partner_drawing',
])('rejects impersonating an automatic %s journal', async (reference_type) => {
  const result = await post(payload({ reference_type, reference_id: 1 }));
  expect(result.status).toBe(400);
  expect(
    (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
      .rows[0].n,
  ).toBe(0);
});
it.each(['manual', 'opening', 'transfer'])(
  'preserves authorized %s journals',
  async (reference_type) => {
    const result = await post(payload({ reference_type }));
    expect(result.status).toBe(200);
    expect(result.body.data.reference_type).toBe(reference_type);
  },
);
it('isolates client keys from keys reserved for automatic operations', async () => {
  const key = `payment:${randomUUID()}`;
  const automatic = await accountingService.createJournalEntry({
    ...payload(),
    reference_type: 'payment',
    idempotency_key: key,
  });
  owned.push(automatic.id);
  const manual = await post(payload({ idempotency_key: key }));
  expect(manual.status).toBe(200);
  expect(manual.body.data.id).not.toBe(automatic.id);
  expect(manual.body.data.reference_type).toBe('manual');
  expect(
    (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
      .rows[0].n,
  ).toBe(2);
});
it('rejects changing the payload of the same header key without creating another journal', async () => {
  const key = randomUUID();
  expect((await post(payload(), key)).status).toBe(200);
  const changed = await post(
    payload({
      lines: [
        { account_code: '110101', debit: 200, credit: 0 },
        { account_code: '4101', debit: 0, credit: 200 },
      ],
    }),
    key,
  );
  expect(changed.status).toBe(409);
  expect(
    (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
      .rows[0].n,
  ).toBe(1);
});
it('deduplicates concurrent identical financial requests by their header key', async () => {
  const key = randomUUID();
  const results = await Promise.all([post(payload(), key), post(payload(), key)]);
  expect(results.map((row) => row.status)).toEqual([200, 200]);
  expect(results[0].body.data.id).toBe(results[1].body.data.id);
  expect(
    (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
      .rows[0].n,
  ).toBe(1);
});
it('deduplicates a client body key across requests with different header keys', async () => {
  const body = payload({ idempotency_key: randomUUID() });
  const first = await post(body, randomUUID());
  const second = await post(body, randomUUID());
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(second.body.data.id).toBe(first.body.data.id);
});
it.each([
  { entry_date: '1887-02-30' },
  { entry_date: '0000-01-01' },
  { reference_id: 2147483648 },
  { idempotency_key: '' },
])('rejects malformed manual journal input: %j', async (extra) => {
  expect((await post(payload(extra))).status).toBe(400);
});

it('does not treat underscores in the stored scope as SQL wildcards', async () => {
  const body = payload({ idempotency_key: randomUUID() });
  const first = await post(body);
  const other = await accountingService.createJournalEntry({
    ...payload(),
    idempotency_key: first.body.data.idempotency_key.replace('public_journal', 'publicXjournal'),
  });
  owned.push(other.id);
  const replay = await post(body);
  expect(replay.status).toBe(200);
  expect(replay.body.data.id).toBe(first.body.data.id);
});
it('permits a corrected retry after a rolled-back invalid journal', async () => {
  const key = randomUUID();
  const bad = payload({
    lines: [
      { account_code: '110101', debit: 100, credit: 0 },
      { account_code: '4101', debit: 0, credit: 90 },
    ],
  });
  expect((await post(bad, key)).status).toBe(400);
  expect((await post(payload(), key)).status).toBe(200);
  expect(
    (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
      .rows[0].n,
  ).toBe(1);
});
it('rejects values outside the journal line storage range', async () => {
  expect(
    (
      await post(
        payload({
          lines: [
            { account_code: '110101', debit: 1e20, credit: 0 },
            { account_code: '4101', debit: 0, credit: 1e20 },
          ],
        }),
      )
    ).status,
  ).toBe(400);
});
it('rejects account and warehouse identifiers outside the integer storage range', async () => {
  expect(
    (
      await post(
        payload({
          lines: [
            { account_id: 2147483648, debit: 100, credit: 0 },
            { account_code: '4101', debit: 0, credit: 100 },
          ],
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await post(
        payload({
          lines: [
            { account_code: '110101', debit: 100, credit: 0, warehouse_id: 2147483648 },
            { account_code: '4101', debit: 0, credit: 100 },
          ],
        }),
      )
    ).status,
  ).toBe(400);
});

it.each(['PROCESSING', 'COMPLETED'])(
  'does not repost a legacy request recorded as %s',
  async (status) => {
    const rawKey = randomUUID();
    const key = `user:${actorId}:POST:/api/v1/accounting/journal-entries:${rawKey}`;
    legacyKeys.push(key);
    await query(
      'INSERT INTO idempotency_records(key,user_id,request_path,status,status_code,response_body) VALUES($1,$2,$3,$4,200,$5)',
      [
        key,
        actorId,
        '/api/v1/accounting/journal-entries',
        status,
        JSON.stringify({ success: true, data: { id: 1 } }),
      ],
    );
    const response = await post(payload(), rawKey);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LEGACY_JOURNAL_REQUEST');
    expect(
      (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
        .rows[0].n,
    ).toBe(0);
  },
);
it('isolates the same client key between two authorized users', async () => {
  const key = randomUUID();
  const first = await post(payload(), key);
  const second = await post(payload(), key, secondToken);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(second.body.data.id).not.toBe(first.body.data.id);
  expect(first.body.data.created_by).toBe(actorId);
  expect(second.body.data.created_by).toBe(secondUserId);
});
it.each([Infinity, 1e20])('rejects out-of-range internal journal amounts: %s', async (amount) => {
  await expect(
    accountingService.createJournalEntry({
      ...payload(),
      lines: [
        { account_code: '110101', debit: amount, credit: 0 },
        { account_code: '4101', debit: 0, credit: amount },
      ],
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it('uses the authenticated creator even when the client supplies another identity', async () => {
  const result = await post(payload({ created_by: secondUserId }));
  expect(result.status).toBe(200);
  expect(result.body.data.created_by).toBe(actorId);
});

it('does not repost a legacy body key belonging to this user', async () => {
  const key = randomUUID();
  const legacy = await accountingService.createJournalEntry({
    ...payload(),
    created_by: actorId,
    idempotency_key: key,
  });
  owned.push(legacy.id);
  const response = await post(payload({ idempotency_key: key }));
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('LEGACY_JOURNAL_REQUEST');
  expect(
    (await query('SELECT COUNT(*)::int AS n FROM journal_entries WHERE description=$1', [prefix]))
      .rows[0].n,
  ).toBe(1);
});
it('retains trimming of valid manual reference types', async () => {
  const response = await post(payload({ reference_type: ' manual ' }));
  expect(response.status).toBe(200);
  expect(response.body.data.reference_type).toBe('manual');
});
