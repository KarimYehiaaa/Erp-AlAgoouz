import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

const fixtures = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: fixtures.query }));
vi.mock('../src/services/loggerService.ts', () => ({ logger: { warn: vi.fn() } }));
import { getDemandForecast } from '../src/services/forecastingService.ts';

const product = (id: number, stock = 5) => ({
  id,
  sku: `fixture-${id}`,
  name_ar: 'منتج اختبار',
  unit: 'kg',
  sale_price: 100,
  purchase_price: 50,
  category_id: 1,
  stock_available: stock,
  has_recipe: false,
  recipe_id: null,
});

function arrange(products: unknown[], history: unknown[], recipe: unknown[] = []) {
  fixtures.query
    .mockResolvedValueOnce({ rows: products })
    .mockResolvedValueOnce({ rows: recipe })
    .mockResolvedValueOnce({ rows: history });
}

beforeEach(() => {
  fixtures.query.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T22:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it.each(['UTC', 'America/Los_Angeles', 'Africa/Cairo'])(
  'includes the current Cairo business day on a host in %s',
  async (timezone) => {
    vi.stubEnv('TZ', timezone);
    arrange([product(1)], [{ product_id: 1, date: '2026-10-05', qty_sold: 100 }]);
    const result = await getDemandForecast({ warehouse_id: 2 });
    expect(result.business_date).toBe('2026-10-05');
    expect(result.salesForecast).toHaveLength(1);
    expect(result.salesForecast[0].forecast_30d).toBeGreaterThan(0);
    expect(fixtures.query.mock.calls[2][1]).toEqual([2, '2026-07-08', '2026-10-05']);
  },
);

it('uses one captured Cairo day even if midnight passes during database reads', async () => {
  vi.stubEnv('TZ', 'UTC');
  vi.setSystemTime(new Date('2026-10-04T20:59:59Z'));
  fixtures.query
    .mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2026-10-04T21:00:01Z'));
      return { rows: [product(1)] };
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  const result = await getDemandForecast({ warehouse_id: 2 });
  expect(result.business_date).toBe('2026-10-04');
  expect(fixtures.query.mock.calls[2][1]).toEqual([2, '2026-07-07', '2026-10-04']);
});

it('returns identical forecast and depletion dates across host timezones and Cairo DST changes', async () => {
  const outputs: Awaited<ReturnType<typeof getDemandForecast>>[] = [];
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Africa/Cairo']) {
    vi.stubEnv('TZ', timezone);
    vi.setSystemTime(new Date('2026-10-25T22:30:00Z'));
    arrange(
      [product(1, 20)],
      [
        { product_id: 1, date: '2026-10-26', qty_sold: 100 },
        { product_id: 1, date: '2026-10-19', qty_sold: 50 },
      ],
    );
    outputs.push(await getDemandForecast({ warehouse_id: 2 }));
  }
  expect(outputs[0].salesForecast).toHaveLength(1);
  expect(outputs[1]).toEqual(outputs[0]);
  expect(outputs[2]).toEqual(outputs[0]);
});

it('adds direct ingredient sales to recipe consumption when forecasting inventory runway', async () => {
  vi.stubEnv('TZ', 'Africa/Cairo');
  const history: { product_id: number; date: string; qty_sold: number }[] = [];
  for (let offset = 0; offset < 90; offset++) {
    const day = new Date('2026-10-05T00:00:00Z');
    day.setUTCDate(day.getUTCDate() - offset);
    history.push({ product_id: 1, date: day.toISOString().slice(0, 10), qty_sold: 10 });
    history.push({ product_id: 2, date: day.toISOString().slice(0, 10), qty_sold: 5 });
  }
  arrange([{ ...product(1), has_recipe: true, recipe_id: 7 }, product(2, 60)], history, [
    {
      recipe_id: 7,
      ingredient_product_id: 2,
      quantity: 100,
      unit_code: 'g',
      ingredient_unit: 'kg',
    },
  ]);
  const result = await getDemandForecast({ warehouse_id: 2 });
  const runway = result.inventoryRunway.find((row) => row.product_id === 2);
  expect(runway?.avg_daily_demand).toBe(6);
  expect(runway?.runway_days).toBe(10);
  expect(runway?.out_of_stock_date).toBe('2026-10-15');
});

it('filters the 90-day Cairo window and warehouse in real PostgreSQL on a rolled-back connection', async () => {
  const actual = await vi.importActual<{ getClient: () => Promise<PoolClient> }>(
    '../src/database/pool.ts',
  );
  const client = await actual.getClient();
  try {
    await client.query('BEGIN');
    const marker = randomUUID().slice(0, 12);
    const warehouses = await client.query(
      `INSERT INTO warehouses (code, name_ar, type)
       VALUES ($1, 'Forecast fixture', 'store'), ($2, 'Foreign fixture', 'main') RETURNING id`,
      [`F-${marker}`, `OTHER-${marker}`],
    );
    const warehouse = Number(warehouses.rows[0].id);
    const otherWarehouse = Number(warehouses.rows[1].id);
    const products = await client.query(
      `INSERT INTO products (sku, name_ar, unit, purchase_price, sale_price)
       VALUES ($1, 'Forecast fixture', 'kg', 50, 100) RETURNING id`,
      [`F-${marker}`],
    );
    const productId = Number(products.rows[0].id);
    const users = await client.query('SELECT id FROM users ORDER BY id LIMIT 1');
    expect(users.rows).toHaveLength(1);
    for (const [index, day, wh, status, quantity] of [
      [0, '2026-07-07', warehouse, 'completed', 1000],
      [1, '2026-07-08', warehouse, 'completed', 3],
      [2, '2026-10-05', warehouse, 'completed', 10],
      [3, '2026-10-06', warehouse, 'completed', 1000],
      [4, '2026-10-05', otherWarehouse, 'completed', 1000],
      [5, '2026-10-05', warehouse, 'cancelled', 1000],
    ] as const) {
      const sale = await client.query(
        `INSERT INTO sales (sale_number, sale_type, entry_mode, sale_date, warehouse_id,
          status, total_amount, user_id) VALUES ($1,'retail','pos',$2,$3,$4,$5,$6) RETURNING id`,
        [`F-${marker}-${index}`, day, wh, status, quantity * 100, users.rows[0].id],
      );
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, total_amount)
         VALUES ($1,$2,$3,100,50,$4)`,
        [sale.rows[0].id, productId, quantity, quantity * 100],
      );
    }
    fixtures.query.mockImplementation(async (sql: string, parameters: unknown[]) =>
      client.query(sql, parameters),
    );
    const result = await getDemandForecast({ warehouse_id: warehouse });
    const actualSales = fixtures.query.mock.results[2].value;
    const rows = (await actualSales).rows.filter(
      (row: { product_id: number }) => row.product_id === productId,
    );
    expect(
      rows.map((row: { date: string; qty_sold: string }) => [row.date, Number(row.qty_sold)]),
    ).toEqual([
      ['2026-07-08', 3],
      ['2026-10-05', 10],
    ]);
    expect(result.salesForecast.some((row) => row.product_id === productId)).toBe(true);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
