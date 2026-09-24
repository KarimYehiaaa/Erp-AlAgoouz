import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('replaces the retired retail-specific role permission with POS visibility', async () => {
  const sql = await readFile(
    new URL('../migrations/076_remove_legacy_branch_permission.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    const role = await client.query("SELECT id FROM roles WHERE name = 'cashier' LIMIT 1");
    const legacyPermission = await client.query(
      `INSERT INTO permissions (code, name_ar, module)
       VALUES ('sales.branch', 'obsolete test permission', 'sales')
       ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar
       RETURNING id`,
    );
    expect(role.rows).toHaveLength(1);
    await client.query(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [role.rows[0].id, legacyPermission.rows[0].id],
    );

    await client.query(sql);

    const retired = await client.query("SELECT id FROM permissions WHERE code = 'sales.branch'");
    const posView = await client.query(
      `SELECT 1 FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1 AND p.code = 'pos.view'`,
      [role.rows[0].id],
    );
    expect(retired.rows).toEqual([]);
    expect(posView.rows).toHaveLength(1);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
