import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

const migration = await readFile(
  new URL('../migrations/094_restrict_direct_api_role_privileges.sql', import.meta.url),
  'utf8',
);

it('removes public API table and sequence grants while preserving backend access and future defaults', async () => {
  const client = await getClient();
  const suffix = randomUUID().replace(/-/g, '');
  const table = `api_privilege_fixture_${suffix}`;
  const sequence = `api_privilege_fixture_${suffix}_seq`;
  await client.query('BEGIN');
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await client.query(
      'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated',
    );
    await client.query(
      'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated',
    );
    await client.query(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated',
    );

    await client.query(migration);
    const existingPrivileges = (
      await client.query(`
        SELECT has_table_privilege('anon','public.products','SELECT') AS anon_table_select,
          has_table_privilege('authenticated','public.products','TRUNCATE') AS authenticated_truncate,
          has_sequence_privilege('anon', pg_get_serial_sequence('public.products','id'), 'USAGE') AS anon_sequence_usage,
          has_sequence_privilege('authenticated', pg_get_serial_sequence('public.products','id'), 'UPDATE') AS authenticated_sequence_update,
          has_table_privilege(current_user,'public.products','SELECT') AS backend_select
      `)
    ).rows[0];
    expect(existingPrivileges).toEqual({
      anon_table_select: false,
      authenticated_truncate: false,
      anon_sequence_usage: false,
      authenticated_sequence_update: false,
      backend_select: true,
    });

    await client.query(`CREATE TABLE public."${table}" (id integer)`);
    await client.query(`CREATE SEQUENCE public."${sequence}"`);
    const futurePrivileges = (
      await client.query(`
        SELECT has_table_privilege('anon','public.${table}','SELECT') AS anon_table_select,
          has_table_privilege('authenticated','public.${table}','INSERT') AS authenticated_table_insert,
          has_sequence_privilege('anon','public.${sequence}','USAGE') AS anon_sequence_usage,
          has_sequence_privilege('authenticated','public.${sequence}','UPDATE') AS authenticated_sequence_update,
          has_table_privilege(current_user,'public.${table}','SELECT') AS backend_select
      `)
    ).rows[0];
    expect(futurePrivileges).toEqual({
      anon_table_select: false,
      authenticated_table_insert: false,
      anon_sequence_usage: false,
      authenticated_sequence_update: false,
      backend_select: true,
    });
    await client.query(migration);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
