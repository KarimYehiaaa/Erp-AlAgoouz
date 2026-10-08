import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { getAllowedWarehouses } from '../src/middleware/warehouseAccess.ts';
import {
  completeStocktake,
  createStocktake,
  deleteStocktake,
  getStocktakeDetails,
  getStocktakeList,
  updateStocktakeItems,
} from '../src/services/stocktakeService.ts';

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
let warehouseIds: number[] = [];
let cashierId: number;
let stocktakeId: string;
let productId: number;

beforeAll(async () => {
  warehouseIds = (
    await query(
      `INSERT INTO warehouses (name_ar, code, type, is_active)
       VALUES ('جرد مسموح', $1, 'store', TRUE), ('جرد ممنوع', $2, 'store', TRUE)
       RETURNING id`,
      [`ST-A-${suffix}`, `ST-B-${suffix}`],
    )
  ).rows.map((row) => Number(row.id));
  const role = await query(`SELECT id FROM roles WHERE name = 'cashier'`);
  expect(role.rows).toHaveLength(1);
  cashierId = Number(
    (
      await query(
        `INSERT INTO users (username, password_hash, full_name, role_id, warehouse_id)
         VALUES ($1, 'test-only', 'Stocktake access fixture', $2, $3) RETURNING id`,
        [`stocktake-${suffix}`, role.rows[0].id, warehouseIds[0]],
      )
    ).rows[0].id,
  );
  // Seed the inaccessible draft directly so setup does not depend on an admin identity.
  stocktakeId = String(
    (
      await query(
        `INSERT INTO stocktakes (warehouse_id, status, notes, created_by)
         VALUES ($1, 'draft', 'unchanged private draft', $2) RETURNING id`,
        [warehouseIds[1], cashierId],
      )
    ).rows[0].id,
  );
  productId = Number(
    (
      await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, is_active)
         VALUES ($1, 'Stocktake access product', 5, 10, TRUE) RETURNING id`,
        [`ST-${suffix}`],
      )
    ).rows[0].id,
  );
  await query(`INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 10)`, [
    productId,
    warehouseIds[1],
  ]);
  await query(
    `INSERT INTO stocktake_items
       (stocktake_id, product_id, system_quantity, actual_quantity, difference, unit_cost)
     VALUES ($1, $2, 10, 8, -2, 5)`,
    [stocktakeId, productId],
  );
});

afterAll(async () => {
  if (warehouseIds.length) {
    await query(`DELETE FROM stocktakes WHERE warehouse_id = ANY($1::int[])`, [warehouseIds]);
  }
  if (cashierId) await query(`DELETE FROM users WHERE id = $1`, [cashierId]);
  if (productId) {
    await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
    await query(`DELETE FROM products WHERE id = $1`, [productId]);
  }
  if (warehouseIds.length) {
    await query(`DELETE FROM warehouses WHERE id = ANY($1::int[])`, [warehouseIds]);
  }
});

const snapshot = async () => {
  const draft = await query(`SELECT * FROM stocktakes WHERE id = $1`, [stocktakeId]);
  const items = await query(`SELECT * FROM stocktake_items WHERE stocktake_id = $1 ORDER BY id`, [
    stocktakeId,
  ]);
  const inventory = await query(
    `SELECT * FROM inventory WHERE warehouse_id = ANY($1::int[]) ORDER BY id`,
    [warehouseIds],
  );
  const journals = await query(`SELECT COUNT(*)::int AS count FROM journal_entries`);
  return {
    draft: draft.rows,
    items: items.rows,
    inventory: inventory.rows,
    journals: journals.rows,
  };
};

it('hides another warehouse draft from lists and rejects direct detail access', async () => {
  const allowed = await getAllowedWarehouses(cashierId);
  expect(allowed).toEqual([warehouseIds[0]]);
  expect((await getStocktakeList(allowed)).some((row) => row.id === stocktakeId)).toBe(false);
  await expect(getStocktakeDetails(stocktakeId, allowed)).rejects.toMatchObject({
    statusCode: 403,
  });
  await expect(getStocktakeDetails(stocktakeId, [])).rejects.toMatchObject({ statusCode: 403 });
});

it('rejects foreign draft edits and deletion without changing persisted data', async () => {
  const before = await snapshot();
  const allowed = await getAllowedWarehouses(cashierId);
  await expect(
    updateStocktakeItems(
      stocktakeId,
      { notes: 'unauthorized change', items: [{ product_id: productId, actual_quantity: 0 }] },
      allowed,
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(deleteStocktake(stocktakeId, allowed)).rejects.toMatchObject({ statusCode: 403 });
  expect(await snapshot()).toEqual(before);
});

it('checks current identity on approval even when passed a forged warehouse scope', async () => {
  const before = await snapshot();
  await expect(completeStocktake(stocktakeId, cashierId)).rejects.toMatchObject({
    statusCode: 403,
  });
  await expect(completeStocktake(stocktakeId, cashierId, warehouseIds)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(await snapshot()).toEqual(before);
});

it('rejects creation in a foreign warehouse before creating any additional draft', async () => {
  const before = await snapshot();
  await expect(createStocktake(warehouseIds[1], cashierId)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(await snapshot()).toEqual(before);
  const drafts = await query(`SELECT id FROM stocktakes WHERE warehouse_id = $1`, [
    warehouseIds[1],
  ]);
  expect(drafts.rows.map((row) => row.id)).toEqual([stocktakeId]);
});

it('allows creating, reading, editing and deleting a draft in the assigned warehouse', async () => {
  const allowed = await getAllowedWarehouses(cashierId);
  const draft = await createStocktake(warehouseIds[0], cashierId);
  expect(Number((await getStocktakeDetails(draft.id, allowed)).warehouse_id)).toBe(warehouseIds[0]);
  await updateStocktakeItems(draft.id, { notes: 'authorized change', items: [] }, allowed);
  expect((await getStocktakeDetails(draft.id, allowed)).notes).toBe('authorized change');
  await deleteStocktake(draft.id, allowed);
  await expect(getStocktakeDetails(draft.id, allowed)).rejects.toMatchObject({ statusCode: 404 });
});

it('rejects approval after user deactivation despite a previously valid scope', async () => {
  const draft = await createStocktake(warehouseIds[0], cashierId);
  const allowed = await getAllowedWarehouses(cashierId);
  await query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [cashierId]);
  try {
    await expect(completeStocktake(draft.id, cashierId, allowed)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect((await getStocktakeDetails(draft.id)).status).toBe('draft');
  } finally {
    await query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [cashierId]);
    await deleteStocktake(draft.id, allowed);
  }
});
