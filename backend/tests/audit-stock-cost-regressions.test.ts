import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { getClient } from '../src/database/pool.ts';
import { consumeRecipeForSale } from '../src/services/recipesService.ts';
import { applySaleItems } from '../src/services/saleInventoryOps.ts';
import { listPurchaseInvoices } from '../src/services/purchaseService.ts';

// Every fixture and movement is rolled back on the same isolated test connection.
describe('real stock batches, cost layers and recipe access regressions', () => {
  let client: PoolClient;
  let warehouse: number;
  let otherWarehouse: number;
  let ingredient: number;
  let product: number;
  let recipe: number;
  let admin: number;
  let cashier: number;
  let sale: number;

  beforeEach(async () => {
    client = await getClient();
    await client.query('BEGIN');
    const suffix = randomUUID().slice(0, 12);
    const warehouses = await client.query(
      `INSERT INTO warehouses (code, name_ar, type, is_active)
      VALUES ($1, 'Audit stock', 'store', TRUE), ($2, 'Audit forbidden stock', 'main', TRUE) RETURNING id`,
      [`AUD-${suffix}`, `OTHER-${suffix}`],
    );
    [warehouse, otherWarehouse] = warehouses.rows.map((row) => row.id);
    const users = await client.query(
      `INSERT INTO users (username, password_hash, full_name, role_id, warehouse_id, is_active)
      VALUES ($1, 'test-only', 'Audit admin', (SELECT id FROM roles WHERE name='admin'), $3, TRUE),
             ($2, 'test-only', 'Audit cashier', (SELECT id FROM roles WHERE name='cashier'), $3, TRUE) RETURNING id`,
      [`admin-${suffix}`, `cashier-${suffix}`, warehouse],
    );
    [admin, cashier] = users.rows.map((row) => row.id);
    const products = await client.query(
      `INSERT INTO products (sku, name_ar, unit, purchase_price, sale_price, is_active)
      VALUES ($1, 'Audit ingredient', 'kg', 99, 150, TRUE), ($2, 'Audit recipe', 'count', 0, 200, TRUE) RETURNING id`,
      [`ING-${suffix}`, `RECIPE-${suffix}`],
    );
    [ingredient, product] = products.rows.map((row) => row.id);
    recipe = (
      await client.query(
        `INSERT INTO product_recipes (product_id, name_ar, created_by)
      VALUES ($1, 'Audit recipe', $2) RETURNING id`,
        [product, admin],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code)
      VALUES ($1, $2, 1, 'kg')`,
      [recipe, ingredient],
    );
    await client.query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity, reserved_quantity, batch_number)
      VALUES ($1, $2, 5, 1, 'A'), ($1, $2, 7, 0, 'B'), ($1, $3, 100, 0, 'FOREIGN')`,
      [ingredient, warehouse, otherWarehouse],
    );
    await client.query(
      `INSERT INTO inventory_cost_layers
      (product_id, warehouse_id, source_type, quantity, remaining_quantity, unit_cost, total_cost, created_at)
      VALUES ($1,$2,'test',5,5,10,50,NOW()-INTERVAL '1 minute'), ($1,$2,'test',7,7,20,140,NOW())`,
      [ingredient, warehouse],
    );
    sale = (
      await client.query(
        `INSERT INTO sales (sale_number, sale_type, entry_mode, sale_date,
      warehouse_id, status, total_amount, user_id)
      VALUES ($1,'retail','pos',CURRENT_DATE,$2,'completed',1600,$3) RETURNING id`,
        [`AUD-${suffix}`, warehouse, admin],
      )
    ).rows[0].id;
  });

  afterEach(async () => {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
  });

  const consume = (userId: number, soldQty = 8) =>
    consumeRecipeForSale(client, {
      productId: product,
      soldQty,
      warehouseId: warehouse,
      userId,
      referenceType: 'sale',
      referenceId: sale,
    });
  const stock = async () =>
    (
      await client.query(
        `SELECT batch_number, quantity, reserved_quantity FROM inventory
    WHERE product_id=$1 AND warehouse_id=$2 AND batch_number IS NOT NULL ORDER BY batch_number`,
        [ingredient, warehouse],
      )
    ).rows;

  it('consumes each batch once, preserves reserved stock and records actual FIFO cost', async () => {
    expect(await consume(cashier)).toEqual({ cost: 110 });
    expect((await stock()).map((row) => Number(row.quantity))).toEqual([1, 3]);
    const movements = (
      await client.query(
        `SELECT quantity, total_cost, from_warehouse_id FROM stock_movements
      WHERE reference_type='sale' AND reference_id=$1`,
        [sale],
      )
    ).rows;
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      quantity: 8,
      total_cost: 110,
      from_warehouse_id: warehouse,
    });
    const layers = (
      await client.query(
        `SELECT remaining_quantity FROM inventory_cost_layers
      WHERE product_id=$1 ORDER BY created_at, id`,
        [ingredient],
      )
    ).rows;
    expect(layers.map((row) => Number(row.remaining_quantity))).toEqual([0, 4]);
  });

  it('passes recipe FIFO cost to the sale item instead of the current ingredient price', async () => {
    const cost = await applySaleItems(client, {
      saleId: sale,
      warehouseId: warehouse,
      userId: cashier,
      items: [{ product_id: product, quantity: 8, unit_price: 200, total_amount: 1600 }],
    });
    expect(cost).toBe(110);
    const item = (await client.query('SELECT cost_price FROM sale_items WHERE sale_id=$1', [sale]))
      .rows[0];
    expect(Number(item.cost_price) * 8).toBeCloseTo(110, 4);
  });

  it('combines repeated recipe ingredients and carries their actual FIFO cost to the sale line', async () => {
    await client.query(
      `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code)
      VALUES ($1, $2, 2, 'kg')`,
      [recipe, ingredient],
    );
    const cost = await applySaleItems(client, {
      saleId: sale,
      warehouseId: warehouse,
      userId: cashier,
      items: [{ product_id: product, quantity: 2, unit_price: 200, total_amount: 400 }],
    });
    expect(cost).toBe(70);
    expect((await stock()).map((row) => Number(row.quantity))).toEqual([1, 5]);
    const saleCost = (
      await client.query('SELECT cost_price FROM sale_items WHERE sale_id=$1', [sale])
    ).rows[0];
    expect(Number(saleCost.cost_price) * 2).toBeCloseTo(70, 4);
    const movements = (
      await client.query(
        `SELECT quantity::float8 AS quantity, total_cost::float8 AS total_cost FROM stock_movements
        WHERE reference_type='sale' AND reference_id=$1 AND movement_type='consumption'`,
        [sale],
      )
    ).rows;
    expect(movements).toEqual([{ quantity: 6, total_cost: 70 }]);
  });

  it('uses the same FIFO and batch totals for a direct product sale', async () => {
    const cost = await applySaleItems(client, {
      saleId: sale,
      warehouseId: warehouse,
      userId: cashier,
      items: [{ product_id: ingredient, quantity: 8, unit_price: 150, total_amount: 1200 }],
    });
    expect(cost).toBe(110);
    expect((await stock()).map((row) => Number(row.quantity))).toEqual([1, 3]);
  });

  it('cannot fill a cashier shortage using another warehouse and rolls back all tentative depletion', async () => {
    await client.query(
      `UPDATE inventory SET quantity=1, reserved_quantity=0 WHERE product_id=$1 AND warehouse_id=$2 AND batch_number='A'`,
      [ingredient, warehouse],
    );
    await client.query(
      `UPDATE inventory SET quantity=0 WHERE product_id=$1 AND warehouse_id=$2 AND batch_number='B'`,
      [ingredient, warehouse],
    );
    await client.query('SAVEPOINT rejected_sale');
    await expect(consume(cashier, 2)).rejects.toMatchObject({ statusCode: 409 });
    await client.query('ROLLBACK TO SAVEPOINT rejected_sale');
    expect((await stock()).map((row) => Number(row.quantity))).toEqual([1, 0]);
    expect(
      Number(
        (
          await client.query(
            'SELECT quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2',
            [ingredient, otherWarehouse],
          )
        ).rows[0].quantity,
      ),
    ).toBe(100);
    expect(
      (await client.query('SELECT id FROM stock_movements WHERE reference_id=$1', [sale])).rows,
    ).toHaveLength(0);
  });

  it('rejects an administrator sale shortage instead of silently consuming another warehouse', async () => {
    const before = await stock();
    await client.query('SAVEPOINT rejected_admin_sale');
    await expect(
      applySaleItems(client, {
        saleId: sale,
        warehouseId: warehouse,
        userId: admin,
        items: [{ product_id: product, quantity: 12, unit_price: 200, total_amount: 2400 }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await client.query('ROLLBACK TO SAVEPOINT rejected_admin_sale');
    expect(await stock()).toEqual(before);
    expect(
      Number(
        (
          await client.query(
            'SELECT quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2 AND batch_number=$3',
            [ingredient, otherWarehouse, 'FOREIGN'],
          )
        ).rows[0].quantity,
      ),
    ).toBe(100);
    const movements = (
      await client.query(
        `SELECT from_warehouse_id, quantity::float8 AS quantity, total_cost::float8 AS total_cost FROM stock_movements
        WHERE reference_type='sale' AND reference_id=$1 AND movement_type='consumption'
        ORDER BY id`,
        [sale],
      )
    ).rows;
    expect(movements).toEqual([]);
  });

  it('rolls back an earlier component when a later recipe component is short', async () => {
    const suffix = randomUUID().slice(0, 12);
    const secondIngredient = (
      await client.query(
        `INSERT INTO products (sku, name_ar, unit, purchase_price, sale_price, is_active)
        VALUES ($1, 'Audit second ingredient', 'kg', 12, 20, TRUE) RETURNING id`,
        [`ING2-${suffix}`],
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code)
      VALUES ($1, $2, 1, 'kg')`,
      [recipe, secondIngredient],
    );
    await client.query('SAVEPOINT later_recipe_component_short');
    await expect(consume(cashier, 2)).rejects.toMatchObject({ statusCode: 409 });
    await client.query('ROLLBACK TO SAVEPOINT later_recipe_component_short');
    expect((await stock()).map((row) => Number(row.quantity))).toEqual([5, 7]);
    expect(
      (
        await client.query(
          `SELECT id FROM stock_movements WHERE reference_type='sale' AND reference_id=$1`,
          [sale],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      Number(
        (
          await client.query(
            'SELECT SUM(remaining_quantity) AS quantity FROM inventory_cost_layers WHERE product_id=$1',
            [ingredient],
          )
        ).rows[0].quantity,
      ),
    ).toBe(12);
  });

  it.each(['empty', 'inactive', 'disabled-ingredient'])(
    'rejects a %s recipe before stock changes',
    async (kind) => {
      if (kind === 'empty')
        await client.query('DELETE FROM product_recipe_items WHERE recipe_id=$1', [recipe]);
      if (kind === 'inactive')
        await client.query('UPDATE product_recipes SET is_active=FALSE WHERE id=$1', [recipe]);
      if (kind === 'disabled-ingredient')
        await client.query('UPDATE products SET is_active=FALSE WHERE id=$1', [ingredient]);
      await expect(consume(cashier, 1)).rejects.toMatchObject({ statusCode: 409 });
      expect((await stock()).map((row) => Number(row.quantity))).toEqual([5, 7]);
    },
  );

  it('rejects a unit conversion below inventory precision instead of rounding the consumption away', async () => {
    await client.query('UPDATE product_recipe_items SET quantity=0.0004 WHERE recipe_id=$1', [
      recipe,
    ]);
    await expect(consume(cashier, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect((await stock()).map((row) => Number(row.quantity))).toEqual([5, 7]);
  });

  it('rejects missing or invalid warehouse identity before executing malformed SQL', async () => {
    await expect(listPurchaseInvoices({})).rejects.toMatchObject({ statusCode: 403 });
    await expect(listPurchaseInvoices({}, Number.NaN)).rejects.toMatchObject({ statusCode: 403 });
  });
});
