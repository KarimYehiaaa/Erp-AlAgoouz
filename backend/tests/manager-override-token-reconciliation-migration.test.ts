import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('recreates the missing manager override table when migration 071 was historically marked applied', async () => {
  const dropFkSql = await readFile(
    new URL('../migrations/078_drop_manager_override_fkeys.sql', import.meta.url),
    'utf8',
  );
  const reconcileSql = await readFile(
    new URL('../migrations/079_reconcile_manager_override_tokens.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    await client.query('DROP TABLE IF EXISTS manager_override_tokens');
    await client.query(dropFkSql);
    await client.query(reconcileSql);

    const table = await client.query(
      `SELECT to_regclass('public.manager_override_tokens') IS NOT NULL AS exists`,
    );
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'manager_override_tokens'`,
    );
    expect(table.rows[0].exists).toBe(true);
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining(['idx_mgr_override_cashier', 'idx_mgr_override_expires']),
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
