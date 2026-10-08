import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ failAudit: false }));
vi.mock('../src/database/pool.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/database/pool.ts')>();
  return {
    ...original,
    getClient: async () => {
      const client = await original.getClient();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return (sql: string, params?: unknown[]) => {
              if (state.failAudit && sql.includes('INSERT INTO activity_logs'))
                throw new Error('fixture audit unavailable');
              return target.query(sql, params);
            };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});
import { query } from '../src/database/pool.ts';
import { bulkAdjustPrices, getBulkPriceAdjustmentStatus } from '../src/services/productService.ts';
import { getProductEffectiveCost } from '../src/services/productCostService.ts';
import { bulkPriceAdjustSchema } from '../src/routes/schemas.ts';
import productsRouter from '../src/routes/products.routes.ts';
import config from '../src/config/index.ts';

let categoryId: number;
let productId: number;
let otherProductId: number;
let userId: number;
let restorePrices: { id: number; sale_price: string; updated_at: Date }[] = [];
let auditBaseline: number | undefined;
const requestKeys: string[] = [];
beforeEach(async () => {
  state.failAudit = false;
  const suffix = randomUUID();
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.is_active = TRUE ORDER BY u.id LIMIT 1",
    )
  ).rows[0].id;
  categoryId = (
    await query('INSERT INTO product_categories (name_ar, slug) VALUES ($1,$2) RETURNING id', [
      `Bulk fixture ${suffix}`,
      `bulk-${suffix}`,
    ])
  ).rows[0].id;
  productId = (
    await query(
      "INSERT INTO products (sku, name_ar, category_id, purchase_price, sale_price) VALUES ($1,'Bulk fixture',$2,10,100) RETURNING id",
      [`BULK-${suffix}`, categoryId],
    )
  ).rows[0].id;
  otherProductId = (
    await query(
      "INSERT INTO products (sku, name_ar, purchase_price, sale_price) VALUES ($1,'Other bulk fixture',10,100) RETURNING id",
      [`OTHER-${suffix}`],
    )
  ).rows[0].id;
});
afterEach(async () => {
  state.failAudit = false;
  for (const key of requestKeys.splice(0))
    await query('DELETE FROM idempotency_records WHERE key = $1', [key]);
  for (const row of restorePrices.splice(0))
    await query('UPDATE products SET sale_price = $1, updated_at = $2 WHERE id = $3', [
      row.sale_price,
      row.updated_at,
      row.id,
    ]);
  if (auditBaseline != null) {
    await query(
      "DELETE FROM activity_logs WHERE id > $1 AND module = 'products' AND details::jsonb ->> 'all_products' = 'true'",
      [auditBaseline],
    );
    auditBaseline = undefined;
  }
  await query(
    "DELETE FROM activity_logs WHERE module = 'products' AND details::jsonb ->> 'category_id' = $1",
    [String(categoryId)],
  );
  await query('DELETE FROM products WHERE id = ANY($1::int[])', [[productId, otherProductId]]);
  await query('DELETE FROM product_categories WHERE id = $1', [categoryId]);
});

it('replays the same authenticated HTTP adjustment without applying the percentage twice', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', productsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const account = (
      await query('SELECT token_version, session_generation FROM users WHERE id = $1', [userId])
    ).rows[0];
    const token = jwt.sign(
      { userId, ver: Number(account.token_version), gen: account.session_generation },
      config.jwt.secret,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    const key = randomUUID();
    requestKeys.push(`user:${userId}:PUT:/api/v1/products/bulk-price:${key}`);
    const send = () =>
      fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/products/bulk-price`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': key,
          },
          body: JSON.stringify({
            category_id: categoryId,
            type: 'sale',
            adjust_type: 'percent',
            value: 10,
          }),
        },
      );
    const first = await send();
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    await query(
      "UPDATE idempotency_records SET expires_at = NOW() - INTERVAL '1 hour' WHERE key = $1",
      [requestKeys[0]],
    );
    const reviewUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/products/bulk-price/status/${key}`;
    expect((await fetch(reviewUrl)).status).toBe(401);
    const review = await fetch(reviewUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(review.status).toBe(200);
    expect(review.headers.get('cache-control')).toBe('no-store');
    expect(await review.json()).toMatchObject({ data: { state: 'completed', updatedCount: 1 } });
    expect(
      Number(
        (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
          .sale_price,
      ),
    ).toBe(110);
    await query(
      "UPDATE idempotency_records SET expires_at = NOW() + INTERVAL '24 hours' WHERE key = $1",
      [requestKeys[0]],
    );
    const retry = await send();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ...firstBody, _idempotentReplay: true });
    expect(
      Number(
        (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
          .sale_price,
      ),
    ).toBe(110);
    expect(
      Number(
        (
          await query(
            "SELECT COUNT(*) FROM activity_logs WHERE module = 'products' AND details::jsonb ->> 'category_id' = $1",
            [String(categoryId)],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('preserves explicit all-products scope during request validation', () => {
  expect(
    bulkPriceAdjustSchema.parse({
      all_products: true,
      type: 'sale',
      adjust_type: 'percent',
      value: 5,
    }).all_products,
  ).toBe(true);
});

it.each([
  ['PROCESSING', 200, { secretFixture: 'never expose' }, 'processing'],
  ['COMPLETED', 500, { secretFixture: 'never expose' }, 'unconfirmed'],
  ['COMPLETED', 200, { success: true, data: { updatedCount: -1 } }, 'unconfirmed'],
] as const)(
  'keeps %s/%s results unresolved without exposing response contents',
  async (status, code, body, expected) => {
    const key = randomUUID();
    const scopedKey = `user:${userId}:PUT:/api/v1/products/bulk-price:${key}`;
    requestKeys.push(scopedKey);
    await query(
      "INSERT INTO idempotency_records (key,user_id,request_path,status,status_code,response_body,expires_at) VALUES ($1,$2,$3,$4,$5,$6,NOW() - INTERVAL '1 hour')",
      [scopedKey, userId, '/api/v1/products/bulk-price', status, code, JSON.stringify(body)],
    );
    expect(await getBulkPriceAdjustmentStatus(key, userId)).toEqual({ state: expected });
    expect(
      Number(
        (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
          .sale_price,
      ),
    ).toBe(100);
  },
);

it('does not reveal another user operation or claim a missing operation succeeded', async () => {
  const key = randomUUID();
  const scopedKey = `user:${userId}:PUT:/api/v1/products/bulk-price:${key}`;
  requestKeys.push(scopedKey);
  await query(
    "INSERT INTO idempotency_records (key,user_id,request_path,status,status_code,response_body) VALUES ($1,$2,$3,'COMPLETED',200,$4)",
    [
      scopedKey,
      userId,
      '/api/v1/products/bulk-price',
      JSON.stringify({ success: true, data: { updatedCount: 1 } }),
    ],
  );
  expect(await getBulkPriceAdjustmentStatus(key, userId + 1)).toEqual({ state: 'absent' });
  expect(await getBulkPriceAdjustmentStatus(randomUUID(), userId)).toEqual({ state: 'absent' });
  await query('UPDATE idempotency_records SET user_id = NULL WHERE key = $1', [scopedKey]);
  expect(await getBulkPriceAdjustmentStatus(key, userId)).toEqual({ state: 'absent' });
});

it('rejects a request without a category or explicit all-products confirmation', () => {
  expect(
    bulkPriceAdjustSchema.safeParse({ type: 'sale', adjust_type: 'percent', value: 5 }).success,
  ).toBe(false);
});

it('applies validated all-products scope to every undeleted product in the isolated database', async () => {
  restorePrices = (
    await query('SELECT id, sale_price, updated_at FROM products WHERE deleted_at IS NULL')
  ).rows;
  auditBaseline = Number(
    (await query('SELECT COALESCE(MAX(id), 0) AS id FROM activity_logs')).rows[0].id,
  );
  const data = bulkPriceAdjustSchema.parse({
    all_products: true,
    type: 'sale',
    adjust_type: 'fixed',
    value: 5,
  });
  expect(await bulkAdjustPrices(data, userId)).toMatchObject({
    updatedCount: restorePrices.length,
  });
  for (const row of restorePrices) {
    expect(
      Number(
        (await query('SELECT sale_price FROM products WHERE id = $1', [row.id])).rows[0].sale_price,
      ),
    ).toBe(Number(row.sale_price) + 5);
  }
});

it('rejects a deleted category without repricing its products', async () => {
  await query('UPDATE product_categories SET deleted_at = NOW() WHERE id = $1', [categoryId]);
  await expect(
    bulkAdjustPrices(
      { category_id: categoryId, type: 'sale', adjust_type: 'fixed', value: 5 },
      userId,
    ),
  ).rejects.toThrow('التصنيف');
  expect(
    Number(
      (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
        .sale_price,
    ),
  ).toBe(100);
});

it('updates only its category and records the actor and adjustment', async () => {
  expect(
    await bulkAdjustPrices(
      { category_id: categoryId, type: 'sale', adjust_type: 'percent', value: 10 },
      userId,
    ),
  ).toMatchObject({ updatedCount: 1 });
  expect(
    Number(
      (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
        .sale_price,
    ),
  ).toBe(110);
  expect(
    Number(
      (await query('SELECT sale_price FROM products WHERE id = $1', [otherProductId])).rows[0]
        .sale_price,
    ),
  ).toBe(100);
  const audit = await query(
    "SELECT user_id, details FROM activity_logs WHERE module = 'products' AND details::jsonb ->> 'category_id' = $1",
    [String(categoryId)],
  );
  expect(audit.rows).toHaveLength(1);
  expect(audit.rows[0].user_id).toBe(userId);
  const details =
    typeof audit.rows[0].details === 'string'
      ? JSON.parse(audit.rows[0].details)
      : audit.rows[0].details;
  expect(details).toMatchObject({
    category_id: categoryId,
    type: 'sale',
    adjust_type: 'percent',
    value: 10,
    updated_count: 1,
  });
});

it('refreshes a previously cached effective product cost after a purchase price adjustment', async () => {
  expect(await getProductEffectiveCost({ query }, productId)).toMatchObject({ cost: 10 });
  await bulkAdjustPrices(
    { category_id: categoryId, type: 'purchase', adjust_type: 'fixed', value: 5 },
    userId,
  );
  expect(await getProductEffectiveCost({ query }, productId)).toMatchObject({ cost: 15 });
});

it('rolls back the price adjustment if writing the audit fails', async () => {
  state.failAudit = true;
  await expect(
    bulkAdjustPrices(
      { category_id: categoryId, type: 'sale', adjust_type: 'fixed', value: 10 },
      userId,
    ),
  ).rejects.toThrow('fixture audit unavailable');
  expect(
    Number(
      (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
        .sale_price,
    ),
  ).toBe(100);
});

it.each([{ adjust_type: 'unknown' }, { category_id: '1junk' }, { value: '' }, { value: null }])(
  'rejects malformed adjustment data before changing prices: %j',
  async (extra) => {
    await expect(
      bulkAdjustPrices(
        { category_id: categoryId, type: 'sale', adjust_type: 'fixed', value: 10, ...extra },
        userId,
      ),
    ).rejects.toThrow();
    expect(
      Number(
        (await query('SELECT sale_price FROM products WHERE id = $1', [productId])).rows[0]
          .sale_price,
      ),
    ).toBe(100);
  },
);
