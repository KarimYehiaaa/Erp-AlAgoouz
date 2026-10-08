import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import XLSX from 'xlsx';
import { query } from '../src/database/pool.ts';
import { importProductsFromExcel } from '../src/services/productsExcelService.ts';

let userId: number;
let mainId: number;
let storeId: number;
const ownedSkus: string[] = [];
const ownedCategories: string[] = [];
const file = (fields: Record<string, unknown>, additionalRows: Record<string, unknown>[] = []) => {
  const values = {
    name_ar: 'Updated import fixture',
    category: 'عام',
    unit: 'كجم',
    purchase_price: 10,
    sale_price: 20,
    ...fields,
  };
  const book = XLSX.utils.book_new();
  const headers = Object.keys(values);
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      headers,
      Object.values(values),
      ...additionalRows.map((extra) => headers.map((header) => ({ ...values, ...extra })[header])),
    ]),
    'products',
  );
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};
beforeEach(async () => {
  userId = (
    await query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' AND u.is_active = TRUE ORDER BY u.id LIMIT 1",
    )
  ).rows[0].id;
  mainId = (await query("SELECT id FROM warehouses WHERE code = 'MAIN' AND deleted_at IS NULL"))
    .rows[0].id;
  storeId = (await query("SELECT id FROM warehouses WHERE code = 'STORE' AND deleted_at IS NULL"))
    .rows[0].id;
});
afterEach(async () => {
  for (const sku of ownedSkus.splice(0)) {
    const product = await query('SELECT id FROM products WHERE sku = $1', [sku]);
    if (!product.rows[0]) continue;
    const id = product.rows[0].id;
    await query('DELETE FROM inventory_cost_layers WHERE product_id = $1', [id]);
    await query('DELETE FROM stock_movements WHERE product_id = $1', [id]);
    await query('DELETE FROM inventory WHERE product_id = $1', [id]);
    await query('DELETE FROM products WHERE id = $1', [id]);
  }
  for (const name of ownedCategories.splice(0))
    await query('DELETE FROM product_categories WHERE name_ar = $1', [name]);
});
const skuForTest = () => {
  const sku = `EXCEL-${randomUUID()}`;
  ownedSkus.push(sku);
  return sku;
};
const existing = async () => {
  const sku = skuForTest();
  const id = (
    await query(
      "INSERT INTO products (sku, name_ar, purchase_price, sale_price, is_active) VALUES ($1, 'Original fixture', 10, 20, TRUE) RETURNING id",
      [sku],
    )
  ).rows[0].id;
  return { sku, id };
};

it('creates opening balances with matching movements and cost layers in both warehouses', async () => {
  const sku = skuForTest();
  expect(
    await importProductsFromExcel(file({ sku, main_stock: '١٬٠٠٠', store_stock: 2 }), userId),
  ).toMatchObject({ created: 1, success: 1, failed: [] });
  const id = (await query('SELECT id FROM products WHERE sku = $1', [sku])).rows[0].id;
  const stock = await query(
    'SELECT warehouse_id, SUM(quantity)::float8 AS quantity FROM inventory WHERE product_id = $1 GROUP BY warehouse_id ORDER BY warehouse_id',
    [id],
  );
  expect(stock.rows).toEqual(
    [
      { warehouse_id: mainId, quantity: 1000 },
      { warehouse_id: storeId, quantity: 2 },
    ].sort((a, b) => a.warehouse_id - b.warehouse_id),
  );
  const layers = await query(
    'SELECT SUM(remaining_quantity)::float8 AS quantity, SUM(total_cost)::float8 AS cost FROM inventory_cost_layers WHERE product_id = $1',
    [id],
  );
  expect(layers.rows[0]).toEqual({ quantity: 1002, cost: 10020 });
  expect(
    (
      await query('SELECT id FROM stock_movements WHERE product_id = $1 AND user_id = $2', [
        id,
        userId,
      ])
    ).rows,
  ).toHaveLength(2);
});

it('adjusts total stock across batches instead of inserting an extra balance', async () => {
  const { sku, id } = await existing();
  await query(
    "INSERT INTO inventory (product_id, warehouse_id, batch_number, quantity, reserved_quantity) VALUES ($1,$2,'A',4,2),($1,$2,'B',6,0)",
    [id, mainId],
  );
  await query(
    "INSERT INTO inventory_cost_layers (product_id, warehouse_id, source_type, quantity, remaining_quantity, unit_cost, total_cost) VALUES ($1,$2,'adjustment_estimated',10,10,10,100)",
    [id, mainId],
  );
  expect(await importProductsFromExcel(file({ sku, main_stock: 5 }), userId)).toMatchObject({
    updated: 1,
    success: 1,
    failed: [],
  });
  expect(
    Number(
      (await query('SELECT SUM(quantity) AS quantity FROM inventory WHERE product_id = $1', [id]))
        .rows[0].quantity,
    ),
  ).toBe(5);
  expect(
    Number(
      (
        await query(
          'SELECT SUM(remaining_quantity) AS quantity FROM inventory_cost_layers WHERE product_id = $1',
          [id],
        )
      ).rows[0].quantity,
    ),
  ).toBe(5);
});

it('rolls back product fields and the first warehouse if the second target is below reservations', async () => {
  const { sku, id } = await existing();
  await query(
    'INSERT INTO inventory (product_id, warehouse_id, quantity, reserved_quantity) VALUES ($1,$2,10,0),($1,$3,10,8)',
    [id, mainId, storeId],
  );
  const result = await importProductsFromExcel(
    file({ sku, main_stock: 5, store_stock: 3 }),
    userId,
  );
  expect(result).toMatchObject({ success: 0, updated: 0 });
  expect(result.failed).toHaveLength(1);
  expect((await query('SELECT name_ar FROM products WHERE id = $1', [id])).rows[0].name_ar).toBe(
    'Original fixture',
  );
  expect(
    (
      await query('SELECT quantity::float8 AS quantity FROM inventory WHERE product_id = $1', [id])
    ).rows.map((row) => row.quantity),
  ).toEqual([10, 10]);
  expect(
    (await query('SELECT id FROM stock_movements WHERE product_id = $1', [id])).rows,
  ).toHaveLength(0);
});

it('applies an explicit zero balance and leaves a blank balance untouched', async () => {
  const { sku, id } = await existing();
  await query(
    'INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,10),($1,$3,7)',
    [id, mainId, storeId],
  );
  await query(
    "INSERT INTO inventory_cost_layers (product_id, warehouse_id, source_type, quantity, remaining_quantity, unit_cost, total_cost) VALUES ($1,$2,'adjustment_estimated',10,10,10,100)",
    [id, mainId],
  );
  expect(
    await importProductsFromExcel(file({ sku, main_stock: 0, store_stock: '' }), userId),
  ).toMatchObject({ success: 1, updated: 1 });
  expect(
    Number(
      (
        await query(
          'SELECT SUM(quantity) AS quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
          [id, mainId],
        )
      ).rows[0].quantity,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await query(
          'SELECT SUM(quantity) AS quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
          [id, storeId],
        )
      ).rows[0].quantity,
    ),
  ).toBe(7);
  expect(
    Number(
      (
        await query(
          'SELECT SUM(remaining_quantity) AS quantity FROM inventory_cost_layers WHERE product_id = $1',
          [id],
        )
      ).rows[0].quantity,
    ),
  ).toBe(0);
});

it('rolls back a new product and category on failure without poisoning the next row category lookup', async () => {
  const firstSku = skuForTest();
  const secondSku = skuForTest();
  const category = `Excel category ${randomUUID()}`;
  ownedCategories.push(category);
  const result = await importProductsFromExcel(
    file({ sku: firstSku, category, main_stock: 1, is_active: 0 }, [
      { sku: secondSku, is_active: 1 },
    ]),
    userId,
  );
  expect(result).toMatchObject({ created: 1, success: 1 });
  expect(result.failed).toHaveLength(1);
  expect((await query('SELECT id FROM products WHERE sku = $1', [firstSku])).rows).toHaveLength(0);
  expect((await query('SELECT id FROM products WHERE sku = $1', [secondSku])).rows).toHaveLength(1);
  expect(
    (await query('SELECT id FROM product_categories WHERE name_ar = $1', [category])).rows,
  ).toHaveLength(1);
});
