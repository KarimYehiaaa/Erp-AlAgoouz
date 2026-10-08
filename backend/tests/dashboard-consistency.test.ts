import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const hook = vi.hoisted(() => ({
  failRisk: false,
  afterFirstRead: undefined as (() => Promise<void>) | undefined,
  gate: undefined as Promise<void> | undefined,
  release: undefined as (() => void) | undefined,
}));
vi.mock('../src/database/pool.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/database/pool.ts')>();
  const intercept = async (
    sql: string,
    run: (statement?: string) => ReturnType<typeof original.query>,
  ) => {
    if (hook.failRisk && sql.includes('s.discount_percent >= $1')) {
      hook.failRisk = false;
      return run(sql.replace('s.sale_number', 's.dashboard_test_missing_column'));
    }
    if (hook.afterFirstRead && sql.includes('AS gross_profit')) {
      const callback = hook.afterFirstRead;
      hook.afterFirstRead = undefined;
      hook.failRisk = false;
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
                  intercept(sql, (statement = sql) => target.query(statement, params));
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        ),
      ),
    query: (sql: string, params?: unknown[]) =>
      intercept(sql, (statement = sql) => original.query(statement, params)),
    getClient: async () => {
      const client = await original.getClient();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return (sql: string, params?: unknown[]) =>
              intercept(sql, (statement = sql) => target.query(statement, params));
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});
import { query, getClient } from '../src/database/pool.ts';
import { getDashboardStats, getDashboardPeriod } from '../src/services/dashboardService.ts';
import { getOpeningBalanceForDate } from '../src/services/openingBalanceService.ts';
import * as businessDate from '../../shared/businessDate.ts';
import { scanRiskAlerts } from '../src/services/riskEngineService.ts';
import { getProfitAndLoss } from '../src/services/plService.ts';
import {
  recordMaintenancePrincipal,
  runSharedMaintenanceTask,
} from '../src/database/maintenanceBarrier.ts';
const date = '2097-08-19';
const filters = { range: 'custom', from_date: date, to_date: date };
const saleIds: number[] = [];
const productIds: number[] = [];
const purchaseIds: number[] = [];
const settingKeys: string[] = [];
let saleId: number;
let userId: number;
let warehouseId: number;
let parentId: number;
let ingredientId: number;
let ingredient2Id: number;
let recipeId: number;
const product = async (unit: string, price: number) => {
  const row = (
    await query(
      'INSERT INTO products (sku,name_ar,unit,purchase_price,sale_price,min_stock) VALUES ($1,$2,$3,$4,100,0) RETURNING id',
      [`DASH-${randomUUID()}`, `Dashboard fixture ${randomUUID()}`, unit, price],
    )
  ).rows[0];
  productIds.push(row.id);
  return Number(row.id);
};
const sale = async (day = date, status = 'completed', amount = 100) => {
  const row = (
    await query(
      "INSERT INTO sales (sale_number,sale_type,entry_mode,sale_date,user_id,warehouse_id,status,payment_status,total_amount,cost_amount,profit_amount,created_at) VALUES ($1,'retail','daily',$2,$3,$4,$5,'paid',$6::numeric,40,$6::numeric-40,$7) RETURNING id",
      [`DASH-${randomUUID()}`, day, userId, warehouseId, status, amount, `${day}T00:00:00Z`],
    )
  ).rows[0];
  saleIds.push(row.id);
  return Number(row.id);
};
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' AND u.is_active AND u.deleted_at IS NULL LIMIT 1",
    )
  ).rows[0].id;
  warehouseId = (await query("SELECT id FROM warehouses WHERE code='MAIN'")).rows[0].id;
  saleId = await sale();
  parentId = await product('count', 0);
  ingredientId = await product('kg', 20);
  ingredient2Id = await product('g', 0.1);
  recipeId = (
    await query(
      "INSERT INTO product_recipes (product_id,name_ar,is_active) VALUES ($1,'Dashboard recipe',TRUE) RETURNING id",
      [parentId],
    )
  ).rows[0].id;
});
afterEach(async () => {
  hook.release?.();
  hook.gate = undefined;
  hook.release = undefined;
  hook.afterFirstRead = undefined;
  hook.failRisk = false;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await query('DELETE FROM sale_items WHERE sale_id=ANY($1::int[])', [saleIds]);
  await query('DELETE FROM sales WHERE id=ANY($1::int[])', [saleIds.splice(0)]);
  await query('DELETE FROM purchase_invoices WHERE id=ANY($1::int[])', [purchaseIds.splice(0)]);
  await query('DELETE FROM product_recipe_items WHERE recipe_id=$1', [recipeId]);
  await query('DELETE FROM product_recipes WHERE id=$1', [recipeId]);
  await query('DELETE FROM products WHERE id=ANY($1::int[])', [productIds.splice(0)]);
  await query('DELETE FROM settings WHERE key=ANY($1::text[])', [settingKeys.splice(0)]);
});
const authenticated = (work: () => Promise<void>) =>
  runSharedMaintenanceTask(async () => {
    const actor = (
      await query('SELECT session_generation,token_version FROM users WHERE id=$1', [userId])
    ).rows[0];
    recordMaintenancePrincipal(userId, actor.session_generation, Number(actor.token_version));
    await work();
  });
const writeElsewhere = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE sales SET total_amount=150,cost_amount=60,profit_amount=90,discount_percent=50 WHERE id=$1',
      [saleId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
it('refreshes the dashboard after another connection commits without local invalidation', () =>
  authenticated(async () => {
    expect((await getDashboardStats(filters)).month.sales).toBe(100);
    await writeElsewhere();
    expect((await getDashboardStats(filters)).month.sales).toBe(150);
  }));
it('keeps financial totals, type breakdown, trends and risk alerts in one snapshot', () =>
  authenticated(async () => {
    hook.gate = new Promise<void>((resolve) => {
      hook.release = resolve;
    });
    hook.afterFirstRead = writeElsewhere;
    const stats = await getDashboardStats(filters);
    hook.gate = undefined;
    expect(stats.month.sales).toBe(100);
    expect(stats.salesByType.find((row) => row.sale_type === 'retail')?.total).toBe(100);
    expect(stats.salesTrend.reduce((sum, row) => sum + Number(row.sales), 0)).toBe(100);
    expect(stats.actionCenter.alerts.some((row) => row.reference?.id === saleId)).toBe(false);
  }));
it('does not charge unsold purchases as sales cost and agrees with the profit report', () =>
  authenticated(async () => {
    await query('UPDATE sales SET cost_amount=0,profit_amount=100 WHERE id=$1', [saleId]);
    const invoice = (
      await query(
        'INSERT INTO purchase_invoices (invoice_number,invoice_date,warehouse_id,subtotal,total_amount) VALUES ($1,$2,$3,300,300) RETURNING id',
        [`DASH-${randomUUID()}`, date, warehouseId],
      )
    ).rows[0].id;
    purchaseIds.push(invoice);
    const stats = await getDashboardStats(filters);
    const report = await getProfitAndLoss(date, date);
    expect(stats.month.cost).toBe(report.cogs.total);
    expect(stats.month.grossProfit).toBe(report.gross_profit.amount);
    expect(stats.month.cogsBasis).toBe('untracked');
  }));
it('counts recipe ingredients and eligible sales once and converts ingredient units', () =>
  authenticated(async () => {
    await query(
      "INSERT INTO product_recipe_items (recipe_id,ingredient_product_id,quantity,unit_code) VALUES ($1,$2,500,'g'),($1,$3,10,'g')",
      [recipeId, ingredientId, ingredient2Id],
    );
    await query('UPDATE sales SET total_amount=150,profit_amount=110 WHERE id=$1', [saleId]);
    const cancelledId = await sale(date, 'cancelled', 777);
    const oldId = await sale('2097-08-18', 'completed', 888);
    await query(
      'INSERT INTO sale_items (sale_id,product_id,quantity,unit_price,cost_price,total_amount) VALUES ($1,$2,1,50,11,50),($1,$2,2,50,11,100),($3,$2,1,777,11,777),($4,$2,1,888,11,888)',
      [saleId, parentId, cancelledId, oldId],
    );
    const row = (await getDashboardStats(filters)).recipeCostChart.find(
      (row) => Number(row.id) === recipeId,
    );
    expect(row).toMatchObject({
      ingredients_count: 2,
      sold_qty: 3,
      revenue: 150,
      estimated_cost: 11,
    });
  }));
it('includes risk events throughout the selected Cairo day', () =>
  authenticated(async () => {
    await query(
      "UPDATE sales SET discount_percent=50,created_at=$2::date + INTERVAL '20 hours' WHERE id=$1",
      [saleId, date],
    );
    const stats = await getDashboardStats(filters);
    expect(stats.actionCenter.alerts.some((row) => row.reference?.id === saleId)).toBe(true);
  }));
it('uses the Cairo business date when the server timezone is UTC', () => {
  vi.stubEnv('TZ', 'UTC');
  expect(getDashboardPeriod({ range: 'today' }, new Date('2026-09-30T22:30:00Z')).today).toBe(
    '2026-10-01',
  );
});

it('uses the same normalized period for risk alerts and sales when custom dates are reversed', () =>
  authenticated(async () => {
    await query(
      "UPDATE sales SET discount_percent=50,created_at=$2::date + INTERVAL '20 hours' WHERE id=$1",
      [saleId, date],
    );
    const stats = await getDashboardStats({
      range: 'custom',
      from_date: '2097-08-20',
      to_date: date,
    });
    expect(stats.month.sales).toBe(100);
    expect(stats.actionCenter.alerts.some((row) => row.reference?.id === saleId)).toBe(true);
  }));

const setting = async (key: string, amount: number) => {
  await query('INSERT INTO settings (key,value) VALUES ($1,$2::jsonb)', [
    key,
    JSON.stringify({ amount }),
  ]);
  settingKeys.push(key);
};
it('uses the selected month opening balance while current-month cards retain their own balance', () =>
  authenticated(async () => {
    await setting('sales_opening_balance:2097-08', 500);
    await setting('sales_opening_balance:2101-01', 321);
    const currentOpening = await getOpeningBalanceForDate('2101-01-01');
    vi.spyOn(businessDate, 'businessCalendarDate').mockReturnValueOnce('2101-01-15');
    const stats = await getDashboardStats(filters);
    expect(stats.cashDetails.openingBalance).toBe(500);
    expect(stats.monthCards.period).toEqual({ start: '2101-01-01', end: '2101-01-31' });
    expect(stats.monthCards.openingBalance).toBe(currentOpening.amount);
    expect(stats.monthCards.cashNet).toBe(currentOpening.amount);
  }));
it('keeps a recorded zero opening balance even when a legacy suffix contains another amount', () =>
  authenticated(async () => {
    await setting('sales_opening_balance:2097-08', 0);
    await setting('sales_opening_balance:2097-08-legacy', 999);
    expect((await getProfitAndLoss(date, date)).opening_balance).toBe(0);
  }));
it('uses calendar opening-balance keys independently of a negative-offset host timezone', () =>
  authenticated(async () => {
    await setting('sales_opening_balance:2097-08', 500);
    vi.stubEnv('TZ', 'America/Los_Angeles');
    expect((await getOpeningBalanceForDate('2097-08-01')).amount).toBe(500);
  }));
it.each(["- INTERVAL '1 hour'", "+ INTERVAL '1 day'"])(
  'excludes a risk event outside the selected Cairo day: %s',
  (offset) =>
    authenticated(async () => {
      await query(
        `UPDATE sales SET discount_percent=50,created_at=$2::date ${offset} WHERE id=$1`,
        [saleId, date],
      );
      const stats = await getDashboardStats(filters);
      expect(stats.actionCenter.alerts.some((row) => row.reference?.id === saleId)).toBe(false);
    }),
);
it('preserves the report and other detectors after one real SQL risk-detector failure', () =>
  authenticated(async () => {
    hook.failRisk = true;
    const stats = await getDashboardStats(filters);
    expect(stats.month.sales).toBe(100);
    expect(stats.actionCenter.scanStatus).toBe('degraded');
    expect(stats.actionCenter.failedChecks).toBe(1);
    expect((await query('SELECT 1 AS value')).rows[0].value).toBe(1);
  }));
it('rejects invalid calendar dates instead of silently rolling them into the next month', async () => {
  expect(() =>
    getDashboardPeriod({ range: 'custom', from_date: '2026-02-30', to_date: '2026-03-15' }),
  ).toThrow('تاريخ الفترة غير صالح');
  await expect(scanRiskAlerts({ startDate: '2026-02-30' })).rejects.toMatchObject({
    statusCode: 400,
  });
});
