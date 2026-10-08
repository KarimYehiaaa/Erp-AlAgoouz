import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { createProduct, updateProduct } from '../src/services/productService.ts';

let userId: number;
let warehouseId: number;
const skus: string[] = [];
const fields = () => {
  const sku = `WRITE-${randomUUID()}`;
  skus.push(sku);
  return { sku, name_ar: 'Stock write fixture', sale_price: 20, purchase_price: 10 };
};
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.is_active = TRUE ORDER BY u.id LIMIT 1",
    )
  ).rows[0].id;
  warehouseId = (
    await query("SELECT id FROM warehouses WHERE code = 'MAIN' AND deleted_at IS NULL")
  ).rows[0].id;
});
afterEach(async () => {
  for (const sku of skus.splice(0)) {
    const product = await query('SELECT id FROM products WHERE sku = $1', [sku]);
    if (!product.rows[0]) continue;
    const id = product.rows[0].id;
    await query('DELETE FROM inventory_cost_layers WHERE product_id = $1', [id]);
    await query('DELETE FROM stock_movements WHERE product_id = $1', [id]);
    await query('DELETE FROM inventory WHERE product_id = $1', [id]);
    await query('DELETE FROM products WHERE id = $1', [id]);
  }
});

it('creates a product balance with a movement and matching cost layer', async () => {
  const product = await createProduct(
    { ...fields(), warehouse_stocks: { [warehouseId]: 5 } },
    undefined,
    userId,
  );
  expect(
    Number(
      (
        await query(
          'SELECT SUM(remaining_quantity) AS quantity FROM inventory_cost_layers WHERE product_id = $1',
          [product.id],
        )
      ).rows[0].quantity,
    ),
  ).toBe(5);
  expect(
    (
      await query(
        'SELECT quantity::float8 AS quantity, user_id FROM stock_movements WHERE product_id = $1',
        [product.id],
      )
    ).rows,
  ).toEqual([{ quantity: 5, user_id: userId }]);
});

it('does not allow stock writes without an authenticated actor', async () => {
  const data = { ...fields(), warehouse_stocks: { [warehouseId]: 5 } };
  await expect(createProduct(data)).rejects.toThrow();
  expect((await query('SELECT id FROM products WHERE sku = $1', [data.sku])).rows).toHaveLength(0);
});

it('rolls back product metadata when a stock target is below reserved quantity', async () => {
  const product = await createProduct(fields());
  await query(
    'INSERT INTO inventory (product_id, warehouse_id, quantity, reserved_quantity) VALUES ($1,$2,10,8)',
    [product.id, warehouseId],
  );
  await expect(
    updateProduct(
      product.id,
      { name_ar: 'Must roll back', warehouse_stocks: { [warehouseId]: 3 } },
      undefined,
      userId,
    ),
  ).rejects.toThrow();
  expect(
    (await query('SELECT name_ar FROM products WHERE id = $1', [product.id])).rows[0].name_ar,
  ).toBe('Stock write fixture');
  expect(
    Number(
      (
        await query('SELECT SUM(quantity) AS quantity FROM inventory WHERE product_id = $1', [
          product.id,
        ])
      ).rows[0].quantity,
    ),
  ).toBe(10);
});

it('updates total balance across batches and consumes the matching cost layers', async () => {
  const product = await createProduct(fields());
  await query(
    "INSERT INTO inventory (product_id, warehouse_id, batch_number, quantity) VALUES ($1,$2,'A',4),($1,$2,'B',6)",
    [product.id, warehouseId],
  );
  await query(
    "INSERT INTO inventory_cost_layers (product_id, warehouse_id, source_type, quantity, remaining_quantity, unit_cost, total_cost) VALUES ($1,$2,'adjustment_estimated',10,10,10,100)",
    [product.id, warehouseId],
  );
  await updateProduct(product.id, { warehouse_stocks: { [warehouseId]: 5 } }, undefined, userId);
  expect(
    Number(
      (
        await query('SELECT SUM(quantity) AS quantity FROM inventory WHERE product_id = $1', [
          product.id,
        ])
      ).rows[0].quantity,
    ),
  ).toBe(5);
  expect(
    Number(
      (
        await query(
          'SELECT SUM(remaining_quantity) AS quantity FROM inventory_cost_layers WHERE product_id = $1',
          [product.id],
        )
      ).rows[0].quantity,
    ),
  ).toBe(5);
});

it('allows metadata changes for an inactive product when its balance is unchanged', async () => {
  const product = await createProduct({ ...fields(), is_active: false });
  await query('INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,7)', [
    product.id,
    warehouseId,
  ]);
  await updateProduct(
    product.id,
    { name_ar: 'Inactive renamed', warehouse_stocks: { [warehouseId]: 7 } },
    undefined,
    userId,
  );
  expect(
    (await query('SELECT name_ar FROM products WHERE id = $1', [product.id])).rows[0].name_ar,
  ).toBe('Inactive renamed');
  expect(
    (await query('SELECT id FROM stock_movements WHERE product_id = $1', [product.id])).rows,
  ).toHaveLength(0);
});

it('keeps legacy initial_stock creation supported with a cost layer', async () => {
  const product = await createProduct(
    { ...fields(), initial_stock: { [warehouseId]: 2 } },
    undefined,
    userId,
  );
  expect(
    Number(
      (
        await query(
          'SELECT SUM(remaining_quantity) AS quantity FROM inventory_cost_layers WHERE product_id = $1',
          [product.id],
        )
      ).rows[0].quantity,
    ),
  ).toBe(2);
});

it('keeps an explicit zero minimum stock rather than replacing it with the default', async () => {
  const product = await createProduct({ ...fields(), min_stock: 0 });
  expect(
    Number(
      (await query('SELECT min_stock FROM products WHERE id = $1', [product.id])).rows[0].min_stock,
    ),
  ).toBe(0);
});
