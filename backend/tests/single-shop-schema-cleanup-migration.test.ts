import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('removes redundant branch scope while preserving warehouse records and inventory type', async () => {
  const sql = await readFile(
    new URL('../migrations/075_remove_legacy_branch_scope.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INT');
    await client.query('ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS branch_id INT');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id)');
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_warehouses_branch_active ON warehouses(branch_id, id)',
    );

    const user = await client.query(
      'SELECT id FROM users WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
    );
    const warehouse = await client.query(
      'SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
    );
    expect(user.rows).toHaveLength(1);
    expect(warehouse.rows).toHaveLength(1);

    await client.query('UPDATE users SET branch_id = 7001 WHERE id = $1', [user.rows[0].id]);
    await client.query('UPDATE warehouses SET branch_id = 7002, type = \'branch\' WHERE id = $1', [warehouse.rows[0].id]);
    await client.query(sql);
    await client.query(sql);

    const remainingColumns = await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'branch_id'
         AND table_name IN ('users', 'warehouses')`,
    );
    expect(remainingColumns.rows).toEqual([]);

    const warehouseType = await client.query('SELECT type FROM warehouses WHERE id = $1', [warehouse.rows[0].id]);
    expect(warehouseType.rows[0].type).toBe('secondary');
    const warehouseStillExists = await client.query('SELECT id FROM warehouses WHERE id = $1', [warehouse.rows[0].id]);
    expect(warehouseStillExists.rows).toHaveLength(1);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
