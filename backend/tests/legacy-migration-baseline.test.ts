import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import config from '../src/config/index.ts';
import {
  assertSafeTestDatabase,
  createIsolatedTestDatabaseName,
} from '../scripts/testDatabaseSafety.ts';

const target = vi.hoisted((): { client?: pg.PoolClient } => ({}));
vi.mock('../src/database/pool.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/database/pool.ts')>()),
  getClient: async () => {
    if (!target.client) throw new Error('Dedicated migration fixture client is required');
    return target.client;
  },
}));
const { runMigrations } = await import('../scripts/migrate.ts');
let admin: pg.Client;
let client: pg.Client;
let database: string;
let created: boolean;
beforeEach(async () => {
  assertSafeTestDatabase(config.db);
  expect(config.db.connectionString).toBeFalsy();
  database = createIsolatedTestDatabaseName(`legacy_${randomUUID().replaceAll('-', '')}`);
  assertSafeTestDatabase({ host: config.db.host, database });
  const options = {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
  };
  admin = new pg.Client({ ...options, database: 'postgres' });
  client = new pg.Client({ ...options, database });
  created = false;
  await admin.connect();
  expect(
    (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount,
  ).toBe(0);
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  await client.connect();
  for (const file of ['001_schema.sql', '002_seed.sql']) {
    await client.query(fs.readFileSync(`migrations/${file}`, 'utf8'));
  }
  target.client = Object.assign(client, { release: () => {} });
});
afterEach(async () => {
  target.client = undefined;
  await client?.end().catch(() => {});
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin?.end();
});
const trackingAbsent = async () =>
  expect(
    (await client.query("SELECT to_regclass('public.schema_migrations') AS tracking")).rows[0]
      .tracking,
  ).toBeNull();

it('upgrades the actual 001/002 baseline without falsely skipping 004 or replacing catalog prices and settings', async () => {
  await client.query(
    "UPDATE products SET name_ar='منتج محفوظ',sale_price=137.25,purchase_price=64.88 WHERE id=1",
  );
  await client.query(
    'UPDATE settings SET value=value || \'{"phone":"CUSTOM","name_ar":"محل محفوظ"}\'::jsonb WHERE key=\'company\'',
  );
  await client.query(
    'UPDATE settings SET value=\'{"enabled":false,"rate":7}\'::jsonb WHERE key=\'tax\'',
  );
  const catalog = (
    await client.query(
      'SELECT id,name_ar,category_id,sale_price,purchase_price FROM products ORDER BY id',
    )
  ).rows;
  const settings = (
    await client.query("SELECT key,value FROM settings WHERE key IN('company','tax') ORDER BY key")
  ).rows;
  await runMigrations();
  expect(
    (
      await client.query(
        'SELECT id,name_ar,category_id,sale_price,purchase_price FROM products ORDER BY id',
      )
    ).rows,
  ).toEqual(catalog);
  expect(
    (
      await client.query(
        "SELECT key,value FROM settings WHERE key IN('company','tax') ORDER BY key",
      )
    ).rows,
  ).toEqual(settings);
  expect(
    (
      await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='sale_date'",
      )
    ).rowCount,
  ).toBe(1);
  const ledger = (await client.query('SELECT version FROM schema_migrations')).rows.map(
    (row) => row.version,
  );
  expect(
    fs.readdirSync('migrations').filter((file) => file.endsWith('.sql') && !ledger.includes(file)),
  ).toEqual([]);
}, 60_000);

it('refuses to infer a range from later tables while preserving recipes, prices and settings', async () => {
  await client.query(fs.readFileSync('migrations/005_costs_recipes.sql', 'utf8'));
  await client.query("INSERT INTO product_recipes(product_id,name_ar) VALUES(1,'وصفة محفوظة')");
  await client.query('CREATE TABLE stocktake_items(id INT PRIMARY KEY)');
  const recipes = (await client.query('SELECT * FROM product_recipes')).rows;
  const catalog = (await client.query('SELECT * FROM products ORDER BY id')).rows;
  const settings = (await client.query('SELECT * FROM settings ORDER BY key')).rows;
  await expect(runMigrations()).rejects.toThrow(/refusing to guess/);
  await trackingAbsent();
  expect((await client.query('SELECT * FROM product_recipes')).rows).toEqual(recipes);
  expect((await client.query('SELECT * FROM products ORDER BY id')).rows).toEqual(catalog);
  expect((await client.query('SELECT * FROM settings ORDER BY key')).rows).toEqual(settings);
});

it('continues an explicit 001/002 migration ledger without depending on legacy inference', async () => {
  await client.query(
    'CREATE TABLE schema_migrations(version VARCHAR(255) PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT NOW())',
  );
  await client.query(
    "INSERT INTO schema_migrations(version) VALUES('001_schema.sql'),('002_seed.sql')",
  );
  await runMigrations();
  expect(
    (
      await client.query(
        "SELECT version FROM schema_migrations WHERE version='004_daily_sales.sql'",
      )
    ).rowCount,
  ).toBe(1);
}, 60_000);

it('refuses a missing seed role before writing migration tracking', async () => {
  await client.query("UPDATE roles SET name='custom-admin' WHERE name='admin'");
  await expect(runMigrations()).rejects.toThrow(/bootstrap role/);
  await trackingAbsent();
});

it('refuses a changed base column instead of treating table names as complete schema evidence', async () => {
  await client.query('ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(31)');
  await expect(runMigrations()).rejects.toThrow(/refusing to guess/);
  await trackingAbsent();
});

it('adopts only 001/002 when an existing migration tracking table is empty', async () => {
  await client.query(
    'CREATE TABLE schema_migrations(version VARCHAR(255) PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT NOW())',
  );
  await runMigrations();
  expect(
    (
      await client.query(
        "SELECT version FROM schema_migrations WHERE version='004_daily_sales.sql'",
      )
    ).rowCount,
  ).toBe(1);
}, 60_000);
