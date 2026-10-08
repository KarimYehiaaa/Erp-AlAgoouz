import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { getClient } from '../src/database/pool.ts';

it('blocks migration 093 when duplicate open shifts require cash reconciliation', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE pos_shifts (
      cashier_user_id integer NOT NULL,
      status text NOT NULL
    ) ON COMMIT DROP`);
    await client.query(`INSERT INTO pos_shifts (cashier_user_id, status) VALUES
      (42, 'open'), (42, 'open')`);

    const migration = await readFile(
      new URL('../migrations/093_single_open_shift_per_cashier.sql', import.meta.url),
      'utf8',
    );

    await expect(client.query(migration)).rejects.toMatchObject({
      code: '23505',
      message: expect.stringContaining('Migration 093 blocked'),
    });
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
});
