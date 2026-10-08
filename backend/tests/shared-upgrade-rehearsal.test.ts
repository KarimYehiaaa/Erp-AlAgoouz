import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import config from '../src/config/index.ts';
import { databaseConnectionOptions } from '../src/database/connectionOptions.ts';
import {
  assertSafeTestDatabase,
  createIsolatedTestDatabaseName,
} from '../scripts/testDatabaseSafety.ts';
import { BACKUP_TABLES } from '../src/services/backupService.ts';
import { decrypt } from '../src/utils/crypto.ts';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
type BackupData = Record<string, Record<string, unknown>[]>;

const upgradeProfiles = [
  { name: 'canonical', preappliedVersions: [] as number[], evidenceSuffix: '' },
  {
    name: 'previously observed partial Supabase schema',
    preappliedVersions: [87, 92, 94],
    evidenceSuffix: '-partial',
  },
];

// Restore-to-latest and upgrade-in-place are different operations. Exercise both
// canonical order and the observed security patches applied ahead of pending migrations.
it.skipIf(process.env.ERP_UPGRADE_DRILL !== '1').each(upgradeProfiles)(
  'upgrades the historical shared dataset from $name without changing original business fields',
  async ({ preappliedVersions, evidenceSuffix }) => {
    assertSafeTestDatabase(config.db);
    const connection = databaseConnectionOptions();
    if ('connectionString' in connection && connection.connectionString)
      throw new Error('Use the isolated local runner for this drill');
    const database = createIsolatedTestDatabaseName(`upgrade${randomUUID().replace(/-/g, '')}`);
    assertSafeTestDatabase({ host: config.db.host, database });
    const file = process.env.ERP_SHARED_BACKUP_FILE || '';
    const expectedSha = process.env.ERP_SHARED_BACKUP_SHA256 || '';
    expect(file).toMatch(/^backup-[a-zA-Z0-9T.-]+\.json$/);
    expect(expectedSha).toMatch(/^[a-fA-F0-9]{64}$/);
    const bytes = await fs.readFile(path.resolve(repositoryRoot, 'backups', file));
    const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
    expect(digest(bytes)).toBe(expectedSha.toLowerCase());
    const envelope = JSON.parse(bytes.toString());
    expect(envelope.encrypted).toBe(true);
    const data = JSON.parse(decrypt(envelope.payload)).data as BackupData;
    expect(Object.keys(data).sort()).toEqual([...BACKUP_TABLES].sort());
    const options = {
      ...connection,
      connectionTimeoutMillis: 10000,
      query_timeout: 30000,
      statement_timeout: 30000,
    };
    const admin = new pg.Client({ ...options, database: 'postgres' });
    const client = new pg.Client({ ...options, database });
    admin.on('error', () => {});
    client.on('error', () => {});
    let created = false;
    let phase = 'create isolated database';
    const migrations = (await fs.readdir('migrations'))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
    try {
      await admin.connect();
      expect(
        (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount,
      ).toBe(0);
      await admin.query(`CREATE DATABASE "${database}"`);
      created = true;
      await client.connect();
      await client.query(
        'CREATE TABLE schema_migrations(version VARCHAR(255) PRIMARY KEY,applied_at TIMESTAMPTZ DEFAULT NOW())',
      );
      const apply = async (name: string) => {
        phase = `migration ${name}`;
        await client.query(
          await fs.readFile(path.resolve(repositoryRoot, 'backend', 'migrations', name), 'utf8'),
        );
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [name]);
      };
      for (const name of migrations.filter((name) => parseInt(name, 10) <= 86)) await apply(name);
      expect(
        (
          await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='users' AND column_name='session_generation'`)
        ).rowCount,
      ).toBe(0);
      phase = 'load encrypted historical snapshot';
      await client.query('BEGIN');
      await client.query("SET LOCAL session_replication_role='replica'");
      await client.query(`TRUNCATE TABLE ${BACKUP_TABLES.join(',')} RESTART IDENTITY RESTRICT`);
      for (const table of BACKUP_TABLES) {
        const jsonColumns = new Set(
          (
            await client.query(
              `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND data_type IN ('json','jsonb')`,
              [table],
            )
          ).rows.map((row) => row.column_name),
        );
        for (const row of data[table]!) {
          const columns = Object.keys(row);
          if (columns.some((column) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)))
            throw new Error('Invalid snapshot column');
          const values = columns.map((column) =>
            jsonColumns.has(column) && row[column] !== null
              ? JSON.stringify(row[column])
              : row[column],
          );
          await client.query(
            `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(',')})
            VALUES(${values.map((_, index) => `$${index + 1}`).join(',')})`,
            values,
          );
        }
      }
      await client.query('COMMIT');
      const canonical = (value: unknown): unknown => {
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.map(canonical);
        if (value !== null && typeof value === 'object') {
          const record = value as Record<string, unknown>;
          return Object.fromEntries(
            Object.keys(record)
              .sort()
              .map((key) => [key, canonical(record[key])]),
          );
        }
        return value;
      };
      const businessHashes = async () => {
        const result: Record<string, { rowCount: number; sha256: string }> = {};
        for (const table of BACKUP_TABLES) {
          const columns = Object.keys(data[table]![0] || {});
          const rows = (await client.query(`SELECT * FROM ${table}`)).rows;
          const serialized = rows
            .map((row) =>
              JSON.stringify(
                canonical(Object.fromEntries(columns.map((column) => [column, row[column]]))),
              ),
            )
            .sort();
          result[table] = { rowCount: rows.length, sha256: digest(JSON.stringify(serialized)) };
        }
        return result;
      };
      phase = 'capture original business fields';
      const before = await businessHashes();
      const upgradeMigrations = migrations.filter((name) => parseInt(name, 10) >= 87);
      expect(upgradeMigrations).toContain('097_allow_inventory_wastage_movements.sql');
      expect(upgradeMigrations).toContain('101_journal_balance_header_and_line_ownership.sql');
      expect(upgradeMigrations.length).toBeGreaterThanOrEqual(12);

      // Keep API roles present through the complete upgrade, including migrations
      // that create tables after 094 or replace functions after 092. All role DDL,
      // grants and upgraded schema are rolled back in finally before dropping this
      // owned database; no new cluster role becomes visible to other sessions.
      phase = 'model API role privileges in an uncommitted transaction';
      await client.query('BEGIN');
      const existingRoles = new Set(
        (
          await client.query(
            "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')",
          )
        ).rows.map((row) => row.rolname as string),
      );
      for (const role of ['anon', 'authenticated']) {
        if (!existingRoles.has(role)) await client.query(`CREATE ROLE ${role} NOLOGIN`);
      }
      await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated');
      await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated');
      await client.query('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated');
      await client.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated',
      );
      await client.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated',
      );
      const preapplied = upgradeMigrations.filter((name) =>
        preappliedVersions.includes(parseInt(name, 10)),
      );
      expect(preapplied.map((name) => parseInt(name, 10))).toEqual(preappliedVersions);
      for (const name of preapplied) await apply(name);
      expect(await businessHashes()).toEqual(before);
      const applied = new Set(
        (await client.query('SELECT version FROM schema_migrations')).rows.map(
          (row) => row.version,
        ),
      );
      const pending = upgradeMigrations.filter((name) => !applied.has(name));
      if (preappliedVersions.length) {
        expect(pending.map((name) => parseInt(name, 10))).toEqual([
          88, 89, 90, 91, 93, 95, 96, 97, 98, 99, 100, 101,
        ]);
      }
      for (const name of pending) await apply(name);
      phase = 'verify final existing and future API privileges without replaying security patches';
      const exposedObjects = await client.query(`
        SELECT c.relname, r.role
        FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) r(role)
        WHERE c.relnamespace = 'public'::regnamespace AND (
          (c.relkind IN ('r','p','v','m','f') AND
            has_table_privilege(r.role, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) OR
          (c.relkind = 'S' AND has_sequence_privilege(r.role, c.oid, 'USAGE,SELECT,UPDATE'))
        )
      `);
      expect(exposedObjects.rows).toEqual([]);
      expect(
        (
          await client.query(
            "SELECT has_table_privilege(current_user,'public.products','SELECT') AS allowed",
          )
        ).rows[0].allowed,
      ).toBe(true);
      const suffix = randomUUID().replace(/-/g, '');
      const fixtureTable = `upgrade_api_role_${suffix}`;
      const fixtureSequence = `${fixtureTable}_seq`;
      await client.query(`CREATE TABLE public."${fixtureTable}" (id integer)`);
      await client.query(`CREATE SEQUENCE public."${fixtureSequence}"`);
      expect(
        (
          await client.query(`
            SELECT has_table_privilege('anon','public.${fixtureTable}','SELECT') AS anon_select,
              has_table_privilege('authenticated','public.${fixtureTable}','INSERT') AS authenticated_insert,
              has_sequence_privilege('anon','public.${fixtureSequence}','USAGE') AS anon_sequence_usage,
              has_sequence_privilege('authenticated','public.${fixtureSequence}','UPDATE') AS authenticated_sequence_update,
              has_table_privilege(current_user,'public.${fixtureTable}','SELECT') AS backend_select
          `)
        ).rows[0],
      ).toEqual({
        anon_select: false,
        authenticated_insert: false,
        anon_sequence_usage: false,
        authenticated_sequence_update: false,
        backend_select: true,
      });
      const apiRolePrivilegesRevoked = true;
      phase = 'verify preserved business fields and new constraints';
      expect(await businessHashes()).toEqual(before);
      expect(
        (
          await client.query(
            'SELECT COUNT(*)::int AS n FROM users WHERE session_generation IS NULL',
          )
        ).rows[0].n,
      ).toBe(0);
      expect(
        (
          await client.query(`SELECT indisvalid AND indisunique AS valid FROM pg_index
        WHERE indexrelid=to_regclass('public.uq_pos_shifts_one_open_per_cashier')`)
        ).rows[0]?.valid,
      ).toBe(true);
      expect(
        (
          await client.query(`SELECT reloptions @> ARRAY['security_invoker=true'] AS protected
        FROM pg_class WHERE oid='public.v_product_stock'::regclass`)
        ).rows[0].protected,
      ).toBe(true);
      const protectedFunctions = [
        'update_updated_at()',
        'enforce_production_output_warehouse()',
        'enforce_stocked_recipe_primary_warehouse()',
        'prevent_clearing_stocked_product_primary_warehouse()',
        'protect_db_row_audits()',
        'audit_row_changes()',
        'protect_default_roles_func()',
        'prevent_closed_period_modification()',
        'cleanup_expired_idempotency_records()',
        'purge_db_row_audits(integer)',
        'check_journal_entry_balance()',
      ];
      for (const signature of protectedFunctions) {
        expect(
          (
            await client.query(
              `SELECT proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'] AS pinned,
                has_function_privilege('anon', oid, 'EXECUTE') AS anon_execute,
                has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_execute,
                has_function_privilege(current_user, oid, 'EXECUTE') AS backend_execute
              FROM pg_proc WHERE oid=to_regprocedure($1)`,
              [`public.${signature}`],
            )
          ).rows,
          signature,
        ).toEqual([
          {
            pinned: true,
            anon_execute: false,
            authenticated_execute: false,
            backend_execute: true,
          },
        ]);
      }
      const evidenceName =
        process.env.ERP_UPGRADE_EVIDENCE_FILE ||
        `shared-upgrade-rehearsal-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
      if (!/^[a-zA-Z0-9_.-]+\.json$/.test(evidenceName)) {
        throw new Error('ERP_UPGRADE_EVIDENCE_FILE must be a simple JSON filename.');
      }
      const evidenceDirectory = path.resolve(repositoryRoot, 'docs/audits/evidence');
      await fs.writeFile(
        path.resolve(evidenceDirectory, evidenceName.replace(/\.json$/, `${evidenceSuffix}.json`)),
        `${JSON.stringify(
          {
            verifiedAt: new Date().toISOString(),
            sourceFile: file,
            sourceSha256: digest(bytes),
            target: 'new disposable loopback PostgreSQL database ending _test',
            productionWrites: false,
            schemaBefore: 86,
            preappliedMigrations: preapplied,
            migrationsApplied: pending,
            apiRolePrivilegesRevoked,
            originalBusinessFieldsPreserved: true,
            tables: before,
            singleOpenShiftIndexValid: true,
            fixedSearchPathFunctionsVerified: true,
            protectedFunctionExecutePrivilegesVerified: true,
          },
          null,
          2,
        )}\n`,
        { flag: 'wx' },
      );
    } catch (error) {
      // PostgreSQL details can contain restored business values. Keep only the phase/code.
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'not-a-database-error';
      throw new Error(`Upgrade rehearsal failed during ${phase}; SQLSTATE=${code}`, {
        cause: error,
      });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end().catch(() => undefined);
      try {
        if (created) {
          assertSafeTestDatabase({ host: config.db.host, database });
          await admin.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',
            [database],
          );
          await admin.query(`DROP DATABASE "${database}"`);
        }
      } finally {
        await admin.end().catch(() => undefined);
      }
    }
  },
  240000,
);
