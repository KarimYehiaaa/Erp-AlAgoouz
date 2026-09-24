import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('consolidates legacy channel balances, preferring current and otherwise latest values', async () => {
  const sql = await readFile(
    new URL('../migrations/077_normalize_opening_balance_keys.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO settings (key, value, description, updated_at) VALUES
       ('sales-opening-balance:branch:2026-02-01:2026-02-28', '{"amount":12}'::jsonb, 'older', '2026-02-01'),
       ('sales-opening-balance:wholesale:2026-02-01:2026-02-28', '{"amount":25}'::jsonb, 'latest', '2026-02-02'),
       ('sales-opening-balance:branch:2026-03-01:2026-03-31', '{"amount":30}'::jsonb, 'legacy', '2026-03-01'),
       ('sales_opening_balance:2026-03', '{"amount":90}'::jsonb, 'canonical', '2026-03-02')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
         description = EXCLUDED.description, updated_at = EXCLUDED.updated_at`,
    );

    await client.query(sql);
    await client.query(sql);

    const balances = await client.query(
      `SELECT key, value->>'amount' AS amount FROM settings
       WHERE key IN ('sales_opening_balance:2026-02', 'sales_opening_balance:2026-03')
       ORDER BY key`,
    );
    expect(balances.rows).toEqual([
      { key: 'sales_opening_balance:2026-02', amount: '25' },
      { key: 'sales_opening_balance:2026-03', amount: '90' },
    ]);

    const remainingLegacy = await client.query(
      `SELECT key FROM settings
       WHERE key LIKE 'sales-opening-balance:branch:%'
          OR key LIKE 'sales-opening-balance:wholesale:%'`,
    );
    expect(remainingLegacy.rows).toEqual([]);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
