import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

const migration = await readFile(
  new URL('../migrations/092_database_function_security.sql', import.meta.url),
  'utf8',
);
const stockViewMigration = await readFile(
  new URL('../migrations/087_restrict_stock_view_access.sql', import.meta.url),
  'utf8',
);
const latePeriodLockMigration = await readFile(
  new URL('../migrations/089_period_lock_old_and_new_dates.sql', import.meta.url),
  'utf8',
);
const lateIdempotencyMigration = await readFile(
  new URL('../migrations/090_preserve_unconfirmed_idempotency.sql', import.meta.url),
  'utf8',
);
const signatures = [
  'public.update_updated_at()',
  'public.enforce_production_output_warehouse()',
  'public.enforce_stocked_recipe_primary_warehouse()',
  'public.prevent_clearing_stocked_product_primary_warehouse()',
  'public.protect_db_row_audits()',
  'public.audit_row_changes()',
  'public.protect_default_roles_func()',
  'public.prevent_closed_period_modification()',
  'public.cleanup_expired_idempotency_records()',
  'public.purge_db_row_audits(integer)',
  'public.check_journal_entry_balance()',
];

const inRollback = async (
  run: (client: Awaited<ReturnType<typeof getClient>>) => Promise<void>,
) => {
  const client = await getClient();
  await client.query('BEGIN');
  try {
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
};

it('removes public API access to the stock and purchase-cost view', async () => {
  await inRollback(async (client) => {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await client.query('GRANT ALL PRIVILEGES ON public.v_product_stock TO anon, authenticated');
    await client.query(stockViewMigration);
    expect(
      (
        await client.query(`
          SELECT has_table_privilege('anon','public.v_product_stock','SELECT') AS anon_select,
            has_table_privilege('authenticated','public.v_product_stock','SELECT') AS authenticated_select,
            'security_invoker=true'=ANY(COALESCE(c.reloptions,ARRAY[]::text[])) AS security_invoker
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='v_product_stock'
        `)
      ).rows[0],
    ).toEqual({ anon_select: false, authenticated_select: false, security_invoker: true });
    await client.query(stockViewMigration);
  });
});

it('anchors the exact ERP functions and removes public API execution while preserving invoker behavior', async () => {
  await inRollback(async (client) => {
    await client.query(migration);
    const rows = (
      await client.query(
        `
      SELECT p.oid::regprocedure::text AS signature, p.prosecdef, p.proconfig,
        EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute,
        has_function_privilege(p.proowner, p.oid, 'EXECUTE') AS owner_execute
      FROM pg_proc p WHERE p.oid = ANY($1::regprocedure[])
    `,
        [signatures],
      )
    ).rows;
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(row.proconfig).toContain('search_path=pg_catalog, public, pg_temp');
      expect(row.prosecdef).toBe(false);
      expect(row.public_execute).toBe(false);
      expect(row.owner_execute).toBe(true);
    }
    // Re-running the migration is harmless and does not re-grant privileges.
    await client.query(migration);
  });
});

it('keeps hardened function settings when earlier migrations are applied after migration 092', async () => {
  await inRollback(async (client) => {
    await client.query(latePeriodLockMigration);
    await client.query(lateIdempotencyMigration);
    const rows = (
      await client.query(`
        SELECT p.oid::regprocedure::text AS signature, p.proconfig,
          EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
                  WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute
        FROM pg_proc p
        WHERE p.oid = ANY(ARRAY[
          'public.prevent_closed_period_modification()'::regprocedure,
          'public.cleanup_expired_idempotency_records()'::regprocedure
        ])
      `)
    ).rows;

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.proconfig).toContain('search_path=pg_catalog, public, pg_temp');
      expect(row.public_execute).toBe(false);
    }
  });
});

it('cannot bypass a real closed financial period by shadowing its table in pg_temp', async () => {
  await inRollback(async (client) => {
    await client.query('SET LOCAL search_path = pg_temp, public');
    await client.query(
      'CREATE TEMP TABLE financial_periods (LIKE public.financial_periods) ON COMMIT DROP',
    );
    await client.query(
      "INSERT INTO public.financial_periods (period_start,period_end,status) VALUES ('2047-01-01','2047-01-31','closed')",
    );
    await client.query('SAVEPOINT locked_write');
    await expect(
      client.query(
        "INSERT INTO public.expenses (title,amount,expense_date) VALUES ('Search path fixture',1,'2047-01-15')",
      ),
    ).rejects.toThrow(/فترة.*مغلقة/);
    await client.query('ROLLBACK TO SAVEPOINT locked_write');
    expect(
      (await client.query('SELECT count(*)::int AS count FROM pg_temp.financial_periods')).rows[0]
        .count,
    ).toBe(0);
  });
});

it('writes a real product audit despite a caller-owned shadow audit table', async () => {
  await inRollback(async (client) => {
    await client.query('SET LOCAL search_path = pg_temp, public');
    await client.query(`CREATE TEMP TABLE db_row_audits
      (table_name text, action text, row_id int, old_data jsonb, new_data jsonb, changed_by text)
      ON COMMIT DROP`);
    const id = (
      await client.query(
        "INSERT INTO public.products (sku,name_ar) VALUES ($1,'Search path fixture') RETURNING id",
        [`fn-${randomUUID()}`],
      )
    ).rows[0].id;
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS count FROM public.db_row_audits WHERE table_name='products' AND row_id=$1 AND action='INSERT'",
          [id],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (await client.query('SELECT count(*)::int AS count FROM pg_temp.db_row_audits')).rows[0]
        .count,
    ).toBe(0);
  });
});

it('leaves unrelated overloads, extension functions and explicit backend grants unchanged', async () => {
  await inRollback(async (client) => {
    const role = `fn_backend_${randomUUID().replace(/-/g, '')}`;
    // Role creation is inside this rolled-back transaction, never a live/global committed change.
    await client.query(`CREATE ROLE "${role}" NOLOGIN`);
    await client.query(
      `GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_records() TO "${role}"`,
    );
    await client.query(
      "CREATE FUNCTION public.cleanup_expired_idempotency_records(integer) RETURNS integer LANGUAGE sql AS 'SELECT $1'",
    );
    const extensionBefore = (
      await client.query(
        "SELECT proacl,proconfig FROM pg_proc WHERE oid=to_regprocedure('public.uuid_generate_v4()')",
      )
    ).rows;
    await client.query(migration);
    expect(
      (
        await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [
          role,
          'public.cleanup_expired_idempotency_records()',
        ])
      ).rows[0].allowed,
    ).toBe(true);
    expect(
      (
        await client.query(
          "SELECT proacl,proconfig FROM pg_proc WHERE oid=to_regprocedure('public.uuid_generate_v4()')",
        )
      ).rows,
    ).toEqual(extensionBefore);
    const overload = (
      await client.query(
        "SELECT proconfig,has_function_privilege($1,oid,'EXECUTE') AS allowed FROM pg_proc WHERE oid=to_regprocedure('public.cleanup_expired_idempotency_records(integer)')",
        [role],
      )
    ).rows[0];
    expect(overload).toEqual({ proconfig: null, allowed: true });
  });
});

it('keeps the optional RLS event trigger firing after its public execution grant is revoked', async () => {
  await inRollback(async (client) => {
    const suffix = randomUUID().replace(/-/g, '');
    const role = `fn_ddl_${suffix}`,
      table = `fn_rls_${suffix}`,
      event = `fn_event_${suffix}`;
    await client.query(`CREATE ROLE "${role}" NOLOGIN`);
    await client.query(`GRANT CREATE ON SCHEMA public TO "${role}"`);
    await client.query(`CREATE OR REPLACE FUNCTION public.rls_auto_enable()
      RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE command record;
      BEGIN
        FOR command IN SELECT * FROM pg_event_trigger_ddl_commands()
          WHERE schema_name='public' AND object_type IN ('table','partitioned table')
        LOOP
          EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',command.object_identity);
        END LOOP;
      END; $$`);
    await client.query(`CREATE EVENT TRIGGER "${event}" ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.rls_auto_enable()`);
    const definition = (
      await client.query(
        "SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.rls_auto_enable()')",
      )
    ).rows[0].prosrc;
    await client.query(migration);
    expect(
      (
        await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [
          role,
          'public.rls_auto_enable()',
        ])
      ).rows[0].allowed,
    ).toBe(false);
    await client.query(`SET LOCAL ROLE "${role}"`);
    await client.query(`CREATE TABLE public."${table}" (id integer)`);
    await client.query('RESET ROLE');
    expect(
      (
        await client.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [
          `public.${table}`,
        ])
      ).rows[0].relrowsecurity,
    ).toBe(true);
    const after = (
      await client.query(
        "SELECT prosrc,prosecdef,proconfig FROM pg_proc WHERE oid=to_regprocedure('public.rls_auto_enable()')",
      )
    ).rows[0];
    expect(after).toEqual({
      prosrc: definition,
      prosecdef: true,
      proconfig: ['search_path=pg_catalog, pg_temp'],
    });
    expect(
      (await client.query('SELECT evtenabled FROM pg_event_trigger WHERE evtname=$1', [event]))
        .rows[0].evtenabled,
    ).toBe('O');
  });
});
