import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';

describe('cashier dashboard financial access migration', () => {
  it('removes the dashboard grant from cashiers without changing manager access', async () => {
    const permission = await query(`SELECT id FROM permissions WHERE code = 'dashboard.view'`);
    const cashier = await query(`SELECT id FROM roles WHERE name = 'cashier'`);
    const manager = await query(`SELECT id FROM roles WHERE name = 'manager'`);
    expect(permission.rows[0]?.id).toBeTruthy();
    expect(cashier.rows[0]?.id).toBeTruthy();
    expect(manager.rows[0]?.id).toBeTruthy();

    await query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [cashier.rows[0].id, permission.rows[0].id],
    );
    const migration = await readFile(
      new URL('../migrations/098_restrict_cashier_dashboard_access.sql', import.meta.url),
      'utf8',
    );
    await query(migration);

    const remainingCashierGrant = await query(
      `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
      [cashier.rows[0].id, permission.rows[0].id],
    );
    const managerGrant = await query(
      `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
      [manager.rows[0].id, permission.rows[0].id],
    );
    expect(remainingCashierGrant.rowCount).toBe(0);
    expect(managerGrant.rowCount).toBeGreaterThan(0);
  });
});
