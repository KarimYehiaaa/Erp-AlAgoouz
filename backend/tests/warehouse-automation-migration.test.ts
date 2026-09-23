import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('renames the saved balancing task without replacing its settings or logs', async () => {
  const sql = await readFile(new URL('../migrations/071_normalize_saved_warehouse_automation.sql', import.meta.url), 'utf8');
  const client = await getClient();
  await client.query('BEGIN');
  try {
    const before = await client.query(
      `SELECT id, is_enabled, cron_expression, channels, config, last_run_at, last_status
       FROM automations WHERE key = 'warehouse_balancing' LIMIT 1`,
    );
    expect(before.rows).toHaveLength(1);
    const id = before.rows[0].id;
    await client.query(`UPDATE automations SET key = 'branch_stock_balancing' WHERE id = $1`, [id]);
    const log = await client.query(
      `INSERT INTO automation_logs (automation_id, event_name, status, title, message)
       VALUES ($1, 'branch_stock_balancing', 'success', 'test', 'test') RETURNING id`,
      [id],
    );
    await client.query(sql);
    const after = await client.query(
      `SELECT id, is_enabled, cron_expression, channels, config, last_run_at, last_status
       FROM automations WHERE key = 'warehouse_balancing' LIMIT 1`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect((await client.query('SELECT automation_id FROM automation_logs WHERE id = $1', [log.rows[0].id])).rows[0].automation_id).toBe(id);
    expect((await client.query(`SELECT COUNT(*)::int AS count FROM automations WHERE key = 'branch_stock_balancing'`)).rows[0].count).toBe(0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
