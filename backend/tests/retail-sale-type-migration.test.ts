import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('renames historical branch sales without changing other sale channels', async () => {
  const sql = await readFile(
    new URL('../migrations/074_retail_sale_type.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    const [warehouse, user] = await Promise.all([
      client.query('SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY id LIMIT 1'),
      client.query('SELECT id FROM users WHERE deleted_at IS NULL ORDER BY id LIMIT 1'),
    ]);
    expect(warehouse.rows).toHaveLength(1);
    expect(user.rows).toHaveLength(1);

    const inserted = await client.query(
      `INSERT INTO sales (sale_number, sale_type, warehouse_id, user_id)
       VALUES ($1, 'branch', $2, $3), ($4, 'wholesale', $2, $3), ($5, 'pos', $2, $3)
       RETURNING id, sale_type`,
      [`MIG-RETAIL-${Date.now()}-A`, warehouse.rows[0].id, user.rows[0].id,
       `MIG-RETAIL-${Date.now()}-B`, `MIG-RETAIL-${Date.now()}-C`],
    );
    const ids = inserted.rows.map((row) => row.id);

    await client.query(sql);
    await client.query(sql);

    const migrated = await client.query(
      'SELECT sale_type FROM sales WHERE id = ANY($1::int[]) ORDER BY id',
      [ids],
    );
    expect(migrated.rows.map((row) => row.sale_type)).toEqual(['retail', 'wholesale', 'pos']);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
