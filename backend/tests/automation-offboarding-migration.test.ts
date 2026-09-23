import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('turns off unhandled automations while preserving their configuration and logs', async () => {
  const sql = await readFile(
    new URL('../migrations/073_disable_unhandled_automations.sql', import.meta.url),
    'utf8',
  );
  const client = await getClient();
  await client.query('BEGIN');
  try {
    const supported = await client.query(
      `INSERT INTO automations (key,name_ar,category,trigger_type,cron_expression,is_enabled)
       VALUES ('supplier_payment_due_alert','supplier alert','sales','cron','0 11 * * *',TRUE)
       ON CONFLICT (key) DO UPDATE SET is_enabled=TRUE,trigger_type='cron',cron_expression='0 11 * * *'
       RETURNING id`,
    );
    const unsupported = await client.query(
      `INSERT INTO automations (key,name_ar,category,trigger_type,cron_expression,is_enabled,config)
       VALUES ('cashflow_risk_shield','cashflow','sales','cron','0 10 * * 1',TRUE,'{"warning_threshold_days":14}')
       ON CONFLICT (key) DO UPDATE SET is_enabled=TRUE,trigger_type='cron',cron_expression='0 10 * * 1',config='{"warning_threshold_days":14}'
       RETURNING id`,
    );
    const log = await client.query(
      `INSERT INTO automation_logs (automation_id,event_name,status,title,message)
       VALUES ($1,'cashflow_risk_shield','success','history','keep') RETURNING id`,
      [unsupported.rows[0].id],
    );

    await client.query(sql);

    const rows = await client.query(
      `SELECT key,is_enabled,last_status,config,description_ar FROM automations
       WHERE id = ANY($1::int[]) ORDER BY key`,
      [[supported.rows[0].id, unsupported.rows[0].id]],
    );
    const logs = await client.query('SELECT id,automation_id FROM automation_logs WHERE id=$1', [
      log.rows[0].id,
    ]);
    expect(rows.rows.find((row: any) => row.key === 'supplier_payment_due_alert').is_enabled).toBe(
      true,
    );
    expect(rows.rows.find((row: any) => row.key === 'cashflow_risk_shield')).toMatchObject({
      is_enabled: false,
      last_status: 'warning',
      config: { warning_threshold_days: 14 },
    });
    expect(
      rows.rows.find((row: any) => row.key === 'cashflow_risk_shield').description_ar,
    ).toContain('موقوف');
    expect(logs.rows[0].automation_id).toBe(unsupported.rows[0].id);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
