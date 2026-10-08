import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const hook = vi.hoisted(() => ({
  afterFirstRead: undefined as (() => Promise<void>) | undefined,
  gate: undefined as Promise<void> | undefined,
  release: undefined as (() => void) | undefined,
}));
vi.mock('../src/database/pool.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/database/pool.ts')>();
  const intercept = async (sql: string, run: () => ReturnType<typeof original.query>) => {
    if (hook.afterFirstRead && sql.includes('sales_count')) {
      const callback = hook.afterFirstRead;
      hook.afterFirstRead = undefined;
      const result = await run();
      try {
        await callback();
      } finally {
        hook.release?.();
      }
      return result;
    }
    if (/^\s*(SELECT|WITH)/i.test(sql) && hook.gate) await hook.gate;
    return run();
  };
  return {
    ...original,
    withReadOnlySnapshot: <T>(work: (client: import('pg').PoolClient) => Promise<T>) =>
      original.withReadOnlySnapshot((client) =>
        work(
          new Proxy(client, {
            get(target, key) {
              if (key === 'query')
                return (sql: string, params?: unknown[]) =>
                  intercept(sql, () => target.query(sql, params));
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        ),
      ),
    query: (sql: string, params?: unknown[]) => intercept(sql, () => original.query(sql, params)),
    getClient: async () => {
      const client = await original.getClient();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return (sql: string, params?: unknown[]) =>
              intercept(sql, () => target.query(sql, params));
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});
import { query, getClient, withReadOnlySnapshot } from '../src/database/pool.ts';
import { getProfitAndLoss } from '../src/services/plService.ts';
import {
  recordMaintenancePrincipal,
  runSharedMaintenanceTask,
} from '../src/database/maintenanceBarrier.ts';
let saleId: number;
let userId: number;
let settingWritten = false;
const date = '2097-08-19';
const openingKey = 'sales_opening_balance:2097-08';
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.is_active = TRUE AND u.deleted_at IS NULL LIMIT 1",
    )
  ).rows[0].id;
  expect((await query('SELECT key FROM settings WHERE key = $1', [openingKey])).rowCount).toBe(0);
  saleId = (
    await query(
      "INSERT INTO sales (sale_number,sale_type,entry_mode,sale_date,user_id,warehouse_id,status,payment_status,total_amount,cost_amount,profit_amount) VALUES ($1,'retail','daily',$2,$3,(SELECT id FROM warehouses WHERE code = 'MAIN' LIMIT 1),'completed','paid',100,40,60) RETURNING id",
      [`PL-${randomUUID()}`, date, userId],
    )
  ).rows[0].id;
});
afterEach(async () => {
  hook.release?.();
  hook.gate = undefined;
  hook.release = undefined;
  hook.afterFirstRead = undefined;
  await query('DELETE FROM sales WHERE id = $1', [saleId]);
  if (settingWritten) await query('DELETE FROM settings WHERE key = $1', [openingKey]);
  settingWritten = false;
});
const authenticated = (work: () => Promise<void>) =>
  runSharedMaintenanceTask(async () => {
    const actor = (
      await query('SELECT session_generation,token_version FROM users WHERE id = $1', [userId])
    ).rows[0];
    recordMaintenancePrincipal(userId, actor.session_generation, Number(actor.token_version));
    await work();
  });
const writeElsewhere = async (opening = false) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE sales SET total_amount=150,cost_amount=60,profit_amount=90 WHERE id=$1',
      [saleId],
    );
    if (opening) {
      await client.query('INSERT INTO settings (key,value) VALUES ($1,$2::jsonb)', [
        openingKey,
        JSON.stringify({ amount: 500 }),
      ]);
      settingWritten = true;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
it.each(['sale', 'supplier'])(
  'excludes next-day midnight %s payments from the selected cash period',
  (referenceType) =>
    authenticated(async () => {
      const paymentId = (
        await query(
          `INSERT INTO payments(payment_number,reference_type,reference_id,amount,payment_method,created_at)
       VALUES($1,$2,$3,50,'cash',($4::date + INTERVAL '1 day')::timestamptz) RETURNING id`,
          [`PL-BOUNDARY-${randomUUID()}`, referenceType, saleId, date],
        )
      ).rows[0].id;
      try {
        const report = await getProfitAndLoss(date, date);
        expect(
          referenceType === 'sale' ? report.cash_flow.cash_in : report.cash_flow.supplier_payments,
        ).toBe(0);
        const following = await getProfitAndLoss('2097-08-20', '2097-08-20');
        expect(
          referenceType === 'sale'
            ? following.cash_flow.cash_in
            : following.cash_flow.supplier_payments,
        ).toBe(50);
        await query(
          "UPDATE payments SET created_at=created_at - INTERVAL '1 millisecond' WHERE id=$1",
          [paymentId],
        );
        const beforeMidnight = await getProfitAndLoss(date, date);
        expect(
          referenceType === 'sale'
            ? beforeMidnight.cash_flow.cash_in
            : beforeMidnight.cash_flow.supplier_payments,
        ).toBe(50);
      } finally {
        await query('DELETE FROM payments WHERE id=$1', [paymentId]);
      }
    }),
);
it('rejects writes in a report snapshot and releases its failed transaction', async () =>
  authenticated(async () => {
    await expect(
      withReadOnlySnapshot((client) =>
        client.query('UPDATE sales SET total_amount = 0 WHERE id = $1', [saleId]),
      ),
    ).rejects.toMatchObject({ code: '25006' });
    expect(
      (await query('SELECT total_amount FROM sales WHERE id = $1', [saleId])).rows[0].total_amount,
    ).toBe(100);
    expect(
      await withReadOnlySnapshot(
        async (client) => (await client.query('SELECT 1 AS value')).rows[0].value,
      ),
    ).toBe(1);
  }));
it('refreshes an authenticated report after another connection commits a sale change', async () =>
  authenticated(async () => {
    expect((await getProfitAndLoss(date, date)).revenue.net).toBe(100);
    await writeElsewhere();
    const report = await getProfitAndLoss(date, date);
    expect(report.revenue.net).toBe(150);
    expect(report.cogs.total).toBe(60);
    expect(report.net_profit.amount).toBe(90);
  }));
it('keeps revenue, breakdown, cash, opening and reconciliation in one snapshot during a concurrent commit', async () =>
  authenticated(async () => {
    hook.gate = new Promise<void>((resolve) => {
      hook.release = resolve;
    });
    hook.afterFirstRead = () => writeElsewhere(true);
    const report = await getProfitAndLoss(date, date);
    hook.gate = undefined;
    expect(report.revenue.net).toBe(100);
    expect(report.revenue.by_type.retail.revenue).toBe(100);
    expect(report.cash_flow.cash_in).toBe(100);
    expect(report.opening_balance).toBe(0);
    const reconciliation = (
      report as typeof report & { ledger_reconciliation: { operational: { revenue: number } } }
    ).ledger_reconciliation;
    expect(reconciliation.operational.revenue).toBe(100);
    const next = await getProfitAndLoss(date, date);
    expect(next.revenue.net).toBe(150);
    expect(next.opening_balance).toBe(500);
  }));
