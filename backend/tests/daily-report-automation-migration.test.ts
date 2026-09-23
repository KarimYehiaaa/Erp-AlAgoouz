import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('merges the duplicate daily summary task while retaining its execution history', async () => {
  const sql = await readFile(
    new URL('../migrations/072_merge_duplicate_daily_report.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    const canonical = await client.query(
      `INSERT INTO automations (key, name_ar, trigger_type, cron_expression, is_enabled)
       VALUES ('daily_sales_report', 'تقرير المبيعات', 'cron', '30 23 * * *', TRUE)
       ON CONFLICT (key) DO UPDATE SET is_enabled = TRUE, cron_expression = '30 23 * * *'
       RETURNING id`,
    );
    const duplicate = await client.query(
      `INSERT INTO automations (key, name_ar, trigger_type, cron_expression, is_enabled)
       VALUES ('daily_summary_report', 'ملخص قديم', 'cron', '30 23 * * *', TRUE)
       ON CONFLICT (key) DO UPDATE SET is_enabled = TRUE, cron_expression = '30 23 * * *'
       RETURNING id`,
    );
    const log = await client.query(
      `INSERT INTO automation_logs (automation_id, event_name, status, title, message)
       VALUES ($1, 'daily_summary_report', 'success', 'test', 'test') RETURNING id`,
      [duplicate.rows[0].id],
    );

    await client.query(sql);

    const oldTask = await client.query(
      `SELECT id FROM automations WHERE key = 'daily_summary_report'`,
    );
    const savedLog = await client.query(
      `SELECT automation_id, status FROM automation_logs WHERE id = $1`,
      [log.rows[0].id],
    );
    expect(oldTask.rows).toHaveLength(0);
    expect(savedLog.rows[0]).toEqual({ automation_id: canonical.rows[0].id, status: 'success' });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
