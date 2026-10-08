import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import config from '../src/config/index.ts';
import { resolvePoolMode } from '../src/database/poolMode.ts';
import { installTransactionTimezone } from '../src/database/transactionTimezone.ts';

const localTimezoneSql = "SET LOCAL timezone = 'Africa/Cairo'";

const fixture = (failures: Record<string, number> = {}) => {
  const calls: Array<{ text: string; input: any; values: any }> = [];
  let timezone = 'UTC';
  const client = {
    query: async (
      input: any,
      values?: any,
      _callback?: (error: Error | null, result?: unknown) => void,
    ) => {
      const text = typeof input === 'string' ? input : input.text;
      calls.push({ text, input, values });
      if (failures[text]) {
        failures[text]--;
        throw new Error(`Injected failure: ${text}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (text === localTimezoneSql) timezone = 'Africa/Cairo';
      if (/^(?:COMMIT|ROLLBACK)$/i.test(text)) timezone = 'UTC';
      return {
        rows: [{ timezone, value: (values ?? input.values)?.[0] }],
        rowCount: 1,
        command: text,
      };
    },
  };
  installTransactionTimezone(client);
  return { client, calls, sql: () => calls.map((call) => call.text) };
};

describe('configured pooler endpoint', () => {
  it('preserves persistent Supabase 5432 and detects transaction 6543 in either configuration form', () => {
    for (const hostname of ['aws-0-eu-west-1.pooler.supabase.com', 'db.example.supabase.co']) {
      for (const port of [5432, 6543]) {
        const expected = port === 6543 ? 'transaction' : 'session';
        const uri = `postgresql://fixture:fixture@${hostname}:${port}/postgres`;
        expect(
          resolvePoolMode('auto', { connectionString: uri, host: 'ignored', port: 5432 }),
        ).toBe(expected);
        expect(resolvePoolMode('auto', { host: hostname, port })).toBe(expected);
      }
    }
    expect(
      resolvePoolMode('auto', { host: 'pooler.supabase.com.attacker.invalid', port: 6543 }),
    ).toBe('session');
  });

  it('supports explicit pooler modes without changing endpoints and rejects invalid configuration', () => {
    expect(resolvePoolMode('transaction', { host: 'localhost', port: 5432 })).toBe('transaction');
    expect(resolvePoolMode('session', { host: 'aws-0-eu.pooler.supabase.com', port: 6543 })).toBe(
      'session',
    );
    expect(() => resolvePoolMode('unexpected', {})).toThrow('DB_POOL_MODE');
    for (const uri of ['base', 'https://example.invalid/postgres']) {
      for (const mode of ['auto', 'session', 'transaction']) {
        expect(() => resolvePoolMode(mode, { connectionString: uri })).toThrow(
          'PostgreSQL connection URI',
        );
      }
    }
  });
});

describe('transaction pool query ordering', () => {
  it('executes standalone statements with Cairo locally and restores the backend at commit', async () => {
    const { client, sql } = fixture();
    const rows = await Promise.all([client.query('SELECT one'), client.query('SELECT two')]);
    expect(rows.map((result) => result.rows[0].timezone)).toEqual(['Africa/Cairo', 'Africa/Cairo']);
    expect(sql()).toEqual([
      'BEGIN',
      localTimezoneSql,
      'SELECT one',
      'COMMIT',
      'BEGIN',
      localTimezoneSql,
      'SELECT two',
      'COMMIT',
    ]);
  });

  it('preserves pg callback forms, query values, rowMode and input objects', async () => {
    const { client, calls } = fixture();
    const callbackQuery = (invoke: (callback: any) => void) =>
      new Promise<any>((resolve, reject) => {
        invoke((error: Error | null, result: any) => (error ? reject(error) : resolve(result)));
      });
    expect(
      (await callbackQuery((callback) => client.query('SELECT callback_two', callback))).rows[0]
        .timezone,
    ).toBe('Africa/Cairo');
    expect(
      (await callbackQuery((callback) => client.query('SELECT callback_three', [7], callback)))
        .rows[0].value,
    ).toBe(7);
    const queryInput = { text: 'SELECT config', values: [9], rowMode: 'array' };
    expect((await client.query(queryInput)).rows[0].value).toBe(9);
    expect(calls.find((call) => call.text === 'SELECT config')?.input).toMatchObject(queryInput);
    expect(queryInput).not.toHaveProperty('callback');
    expect(
      (await callbackQuery((callback) => client.query({ text: 'SELECT embedded', callback })))
        .rows[0].timezone,
    ).toBe('Africa/Cairo');
  });

  it('sets Cairo before queued explicit transaction queries and keeps savepoint rollbacks inside the transaction', async () => {
    const { client, sql } = fixture();
    const operations = [
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'SELECT first',
      'SAVEPOINT fixture',
      'ROLLBACK TO SAVEPOINT fixture',
      'SELECT second',
      'COMMIT',
    ];
    const results = await Promise.all(operations.map((operation) => client.query(operation)));
    expect(results[1].rows[0].timezone).toBe('Africa/Cairo');
    expect(results[4].rows[0].timezone).toBe('Africa/Cairo');
    expect(sql()).toEqual([operations[0], localTimezoneSql, ...operations.slice(1)]);
  });

  it('reapplies local settings for chained transactions', async () => {
    const { client, sql } = fixture();
    await client.query('START TRANSACTION');
    await client.query('COMMIT AND CHAIN');
    await client.query('SELECT chained');
    await client.query('ROLLBACK');
    expect(sql()).toEqual([
      'START TRANSACTION',
      localTimezoneSql,
      'COMMIT AND CHAIN',
      localTimezoneSql,
      'SELECT chained',
      'ROLLBACK',
    ]);
  });

  it('recovers after failed BEGIN and rolls back a failed standalone statement', async () => {
    const { client, sql } = fixture({ BEGIN: 1, 'SELECT failure': 1 });
    await expect(client.query('BEGIN')).rejects.toThrow('Injected failure: BEGIN');
    await expect(client.query('SELECT failure')).rejects.toThrow(
      'Injected failure: SELECT failure',
    );
    expect((await client.query('SELECT recovered')).rows[0].timezone).toBe('Africa/Cairo');
    expect(sql()).toEqual([
      'BEGIN',
      'BEGIN',
      localTimezoneSql,
      'SELECT failure',
      'ROLLBACK',
      'BEGIN',
      localTimezoneSql,
      'SELECT recovered',
      'COMMIT',
    ]);
  });

  it('lets explicit transactions roll back if SET LOCAL fails', async () => {
    const { client, sql } = fixture({ [localTimezoneSql]: 1 });
    await expect(client.query('BEGIN')).rejects.toThrow('Injected failure');
    await client.query('ROLLBACK');
    expect((await client.query('SELECT recovered')).rows[0].timezone).toBe('Africa/Cairo');
    expect(sql().slice(0, 3)).toEqual(['BEGIN', localTimezoneSql, 'ROLLBACK']);
  });

  it('closes and never reuses a connection if automatic rollback fails', async () => {
    const { client, sql } = fixture({ 'SELECT failure': 1, ROLLBACK: 1 });
    let closed = 0;
    Object.assign(client, {
      end: async () => {
        closed++;
      },
    });
    await expect(client.query('SELECT failure')).rejects.toThrow(
      'Injected failure: SELECT failure',
    );
    await expect(client.query('SELECT must_not_run')).rejects.toThrow('new connection is required');
    expect(closed).toBe(1);
    expect(sql()).toEqual(['BEGIN', localTimezoneSql, 'SELECT failure', 'ROLLBACK']);
  });

  it('keeps commands requiring autocommit outside automatically added transactions', async () => {
    for (const sql of [
      'VACUUM ANALYZE',
      'CREATE DATABASE fixture',
      'DROP DATABASE fixture',
      'CREATE UNIQUE INDEX CONCURRENTLY fixture ON products(id)',
      'REINDEX TABLE CONCURRENTLY products',
      "ALTER SYSTEM SET work_mem = '1MB'",
    ]) {
      const candidate = fixture();
      await candidate.client.query(sql);
      expect(candidate.sql()).toEqual([sql]);
    }
  });

  it('recognizes transaction commands through comments without treating SQL literals as commands', async () => {
    const { client, sql } = fixture();
    const begin = '-- BEGIN; a comment\n/* outer /* nested ; */ comment */ BEGIN /* trailing ; */;';
    await client.query(begin);
    await client.query("SELECT 'pg_advisory_lock(1)' AS label");
    await client.query('COMMIT -- finished');
    await client.query('REINDEX TABLE "concurrently"');
    expect(sql().slice(0, 4)).toEqual([
      begin,
      localTimezoneSql,
      "SELECT 'pg_advisory_lock(1)' AS label",
      'COMMIT -- finished',
    ]);
    expect(sql().slice(4)).toEqual([
      'BEGIN',
      localTimezoneSql,
      'REINDEX TABLE "concurrently"',
      'COMMIT',
    ]);
  });

  it('rejects unsupported session state and compound transaction control clearly', async () => {
    const { client, sql } = fixture();
    await expect(client.query("SET timezone = 'UTC'")).rejects.toThrow('SET LOCAL');
    await expect(client.query('BEGIN; SELECT CURRENT_DATE')).rejects.toThrow('separate query');
    await expect(client.query({ text: 'SELECT 1', name: 'fixture' })).rejects.toThrow(
      'Named prepared',
    );
    await expect(client.query({ submit: () => {} })).rejects.toThrow('SQL string');
    await expect(client.query('SELECT pg_advisory_lock(1)')).rejects.toThrow('Session state');
    await client.query('BEGIN');
    await expect(client.query("SET timezone = 'UTC'")).rejects.toThrow('SET LOCAL');
    await client.query('ROLLBACK');
    expect(sql()).toEqual(['BEGIN', localTimezoneSql, 'ROLLBACK']);
  });
});

describe('maintenance transaction completion', () => {
  it('rolls back a standalone write if its maintenance lease is lost before commit', async () => {
    const calls: string[] = [];
    let usable = true;
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql === 'SELECT 1') usable = false;
        return { rows: [], rowCount: 0 };
      },
    };
    installTransactionTimezone(client, {
      transactionPooling: false,
      beforeTransaction: async (raw) => {
        await raw('SELECT fixture_lock');
      },
      assertUsable: () => {
        if (!usable) throw new Error('Lease revoked');
      },
    });
    await expect(client.query('SELECT 1')).rejects.toThrow('Lease revoked');
    expect(calls).toEqual(['BEGIN', 'SELECT fixture_lock', 'SELECT 1', 'ROLLBACK']);
  });
});

describe('Cairo timezone on an isolated PostgreSQL connection', () => {
  let client: pg.Client;
  let rawQuery: pg.Client['query'];
  beforeAll(async () => {
    // setup-env already enforces localhost plus a disposable *_test database.
    client = new pg.Client({ ...config.db });
    await client.connect();
    rawQuery = client.query.bind(client);
    await rawQuery("SET timezone = 'UTC'");
    installTransactionTimezone(client);
  });
  afterAll(async () => {
    await client?.end();
  });

  it('evaluates date casts in Cairo while leaving the reusable backend in UTC', async () => {
    const result = await client.query(
      "SELECT current_setting('timezone') AS timezone, '2026-01-01T22:30:00Z'::timestamptz::date::text AS business_date",
    );
    expect(result.rows[0]).toEqual({ timezone: 'Africa/Cairo', business_date: '2026-01-02' });
    expect((await rawQuery('SHOW timezone')).rows[0].TimeZone).toBe('UTC');
  });

  it('keeps read-only transactions and rollback semantics intact', async () => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await client.query(
      "SELECT current_setting('timezone') AS timezone, current_setting('transaction_read_only') AS read_only",
    );
    expect(result.rows[0]).toEqual({ timezone: 'Africa/Cairo', read_only: 'on' });
    await client.query('ROLLBACK');
    expect((await rawQuery('SHOW timezone')).rows[0].TimeZone).toBe('UTC');
  });

  it('rolls back errors and preserves real pg callback results', async () => {
    await expect(client.query('SELECT 1 / 0')).rejects.toThrow('division by zero');
    const result = await new Promise<any>((resolve, reject) => {
      client.query(
        "SELECT current_setting('timezone') AS timezone, $1::int AS value",
        [42],
        (error, rows) => (error ? reject(error) : resolve(rows)),
      );
    });
    expect(result.rows[0]).toEqual({ timezone: 'Africa/Cairo', value: 42 });
    expect((await rawQuery('SHOW timezone')).rows[0].TimeZone).toBe('UTC');
  });
});
