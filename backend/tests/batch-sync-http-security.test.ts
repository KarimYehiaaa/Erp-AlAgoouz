import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.ts';
import config from '../src/config/index.ts';
import { query } from '../src/database/pool.ts';
import { createDailySale } from '../src/services/salesService.ts';

// The local runner owns and drops the disposable database containing these fixtures.
let server: http.Server;
let base: string;
let token: string;
let cashier: number;
let ownWarehouse: number;
let foreignWarehouse: number;
let ownProduct: number;
let foreignProduct: number;

beforeAll(async () => {
  const marker = randomUUID().slice(0, 12);
  const warehouses = await query(
    `INSERT INTO warehouses(code,name_ar,type,is_active)
     VALUES($1,'Batch own warehouse','store',TRUE),($2,'Batch foreign warehouse','main',TRUE)
     RETURNING id`,
    [`BO-${marker}`, `BF-${marker}`],
  );
  [ownWarehouse, foreignWarehouse] = warehouses.rows.map((row) => Number(row.id));
  const user = (
    await query(
      `INSERT INTO users(username,password_hash,full_name,role_id,warehouse_id,is_active)
       VALUES($1,'unused-test-hash','Batch cashier',(SELECT id FROM roles WHERE name='cashier'),$2,TRUE)
       RETURNING id,token_version,session_generation`,
      [`batch-${marker}`, ownWarehouse],
    )
  ).rows[0];
  cashier = Number(user.id);
  token = jwt.sign(
    { userId: cashier, ver: user.token_version, gen: user.session_generation, jti: randomUUID() },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
  const products = await query(
    `INSERT INTO products(sku,name_ar,unit,purchase_price,sale_price,primary_warehouse_id,is_active)
     VALUES($1,'Batch own product','count',10,20,$3,TRUE),
           ($2,'Batch foreign product','count',10,20,$4,TRUE) RETURNING id`,
    [`BP-${marker}`, `FP-${marker}`, ownWarehouse, foreignWarehouse],
  );
  [ownProduct, foreignProduct] = products.rows.map((row) => Number(row.id));
  await query(
    `INSERT INTO inventory(product_id,warehouse_id,quantity,reserved_quantity)
     VALUES($1,$3,100,0),($2,$4,100,0)`,
    [ownProduct, foreignProduct, ownWarehouse, foreignWarehouse],
  );
  await query(
    `INSERT INTO inventory_cost_layers(product_id,warehouse_id,source_type,quantity,remaining_quantity,unit_cost,total_cost)
     VALUES($1,$3,'test',100,100,10,1000),($2,$4,'test',100,100,10,1000)`,
    [ownProduct, foreignProduct, ownWarehouse, foreignWarehouse],
  );
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
afterAll(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const sale = (overrides: Record<string, unknown> = {}) => ({
  sync_id: randomUUID(),
  sale_type: 'pos',
  warehouse_id: ownWarehouse,
  items: [{ product_id: ownProduct, quantity: 1, unit_price: 20 }],
  paid_amount: 20,
  payment_method: 'cash',
  ...overrides,
});
const request = async (body?: unknown) => {
  const response = await fetch(`${base}/sales/batch-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
};
const snapshot = async () => ({
  stock: (
    await query(
      'SELECT product_id,warehouse_id,quantity,reserved_quantity FROM inventory WHERE product_id=ANY($1::int[]) ORDER BY product_id,warehouse_id,id',
      [[ownProduct, foreignProduct]],
    )
  ).rows,
  layers: (
    await query(
      'SELECT id,remaining_quantity FROM inventory_cost_layers WHERE product_id=ANY($1::int[]) ORDER BY id',
      [[ownProduct, foreignProduct]],
    )
  ).rows,
  counts: (
    await query(
      `SELECT (SELECT COUNT(*)::int FROM sales WHERE user_id=$1) AS sales,
       (SELECT COUNT(*)::int FROM payments WHERE user_id=$1) AS payments,
       (SELECT COUNT(*)::int FROM stock_movements WHERE user_id=$1) AS movements,
       (SELECT COUNT(*)::int FROM journal_entries WHERE created_by=$1) AS journals`,
      [cashier],
    )
  ).rows[0],
});

describe('actual authenticated batch sync, warehouse boundaries and atomic writes', () => {
  it('rejects a missing request body with 400 rather than an internal error', async () => {
    const before = await snapshot();
    expect((await request()).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['51 invoices', () => Array.from({ length: 51 }, () => sale())],
    [
      '101 items in one invoice',
      () => [
        sale({
          items: Array.from({ length: 101 }, () => ({
            product_id: ownProduct,
            quantity: 1,
            unit_price: 20,
          })),
        }),
      ],
    ],
    [
      '540 items across six invoices',
      () =>
        Array.from({ length: 6 }, () =>
          sale({
            items: Array.from({ length: 90 }, () => ({
              product_id: ownProduct,
              quantity: 1,
              unit_price: 20,
            })),
          }),
        ),
    ],
  ] as const)('rejects %s before any business write', async (_label, payload) => {
    const before = await snapshot();
    expect((await request({ sales: payload() })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['invalid-warehouse', 0, -1, 1.5, [], true])(
    'does not derive a warehouse from malformed ID %j',
    async (warehouseId) => {
      const before = await snapshot();
      const result = await request({ sales: [sale({ warehouse_id: warehouseId })] });
      expect(result.status).toBe(200);
      expect(result.body.results).toEqual([
        expect.objectContaining({ status: 'FAILED', error: expect.any(String) }),
      ]);
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each([undefined, null, ''])(
    'cannot evade warehouse access with warehouse_id=%s',
    async (warehouseId) => {
      const before = await snapshot();
      const result = await request({
        sales: [
          sale({
            warehouse_id: warehouseId,
            items: [{ product_id: foreignProduct, quantity: 1, unit_price: 20 }],
          }),
        ],
      });
      expect(result.status).toBe(200);
      expect(result.body.results[0]).toMatchObject({ status: 'FAILED' });
      expect(result.body.results[0].error).toContain('غير مصرح');
      expect(await snapshot()).toEqual(before);
    },
  );

  it('rejects unusable sync IDs instead of storing unrepeatable offline sales', async () => {
    const before = await snapshot();
    const result = await request({
      sales: [sale({ sync_id: 'not-a-uuid' }), sale({ sync_id: undefined })],
    });
    expect(result.status).toBe(200);
    expect(result.body.results.map((row: { status: string }) => row.status)).toEqual([
      'FAILED',
      'FAILED',
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it('replays an acknowledged invoice without duplicating stock, payment or journal writes', async () => {
    const payload = sale({ warehouse_id: undefined });
    const first = await request({ sales: [payload] });
    expect(first.status).toBe(200);
    expect(first.body.results[0]).toMatchObject({ sync_id: payload.sync_id, status: 'SYNCED' });
    const acknowledged = await snapshot();
    const replay = await request({ sales: [payload] });
    expect(replay.status).toBe(200);
    expect(replay.body.results[0]).toEqual(first.body.results[0]);
    expect(await snapshot()).toEqual(acknowledged);
    expect(
      (await query('SELECT id FROM sales WHERE sync_id=$1::uuid', [payload.sync_id])).rows,
    ).toHaveLength(1);
  });

  it.each(['not-a-uuid', true, 123, {}])(
    'rejects a supplied invalid sync ID %j in the sales service too',
    async (syncId) => {
      const before = await snapshot();
      await expect(createDailySale(sale({ sync_id: syncId }), cashier)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_SYNC_ID',
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it('commits the valid invoice while foreign and insufficient-stock invoices leave no partial rows', async () => {
    const before = await snapshot();
    const foreign = sale({
      warehouse_id: foreignWarehouse,
      items: [{ product_id: foreignProduct, quantity: 1, unit_price: 20 }],
    });
    const shortage = sale({
      items: [{ product_id: ownProduct, quantity: 1000, unit_price: 20 }],
      paid_amount: 20000,
    });
    const valid = sale();
    const result = await request({ sales: [foreign, shortage, valid] });
    expect(result.status).toBe(200);
    expect(result.body.results.map((row: { status: string }) => row.status)).toEqual([
      'FAILED',
      'FAILED',
      'SYNCED',
    ]);
    expect(
      (
        await query('SELECT sync_id FROM sales WHERE sync_id=ANY($1::uuid[])', [
          [foreign.sync_id, shortage.sync_id, valid.sync_id],
        ])
      ).rows,
    ).toEqual([{ sync_id: valid.sync_id }]);
    const after = await snapshot();
    expect(after.counts.sales).toBe(before.counts.sales + 1);
    expect(after.stock.find((row) => Number(row.product_id) === foreignProduct)).toEqual(
      before.stock.find((row) => Number(row.product_id) === foreignProduct),
    );
    expect(Number(after.stock.find((row) => Number(row.product_id) === ownProduct).quantity)).toBe(
      Number(before.stock.find((row) => Number(row.product_id) === ownProduct).quantity) - 1,
    );
    const journalBalances = await query(
      `SELECT je.id,SUM(jel.debit)::numeric AS debit,SUM(jel.credit)::numeric AS credit
       FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
       WHERE je.created_by=$1 GROUP BY je.id`,
      [cashier],
    );
    expect(journalBalances.rows.length).toBeGreaterThan(0);
    for (const journal of journalBalances.rows)
      expect(Number(journal.debit)).toBe(Number(journal.credit));
  });
});
