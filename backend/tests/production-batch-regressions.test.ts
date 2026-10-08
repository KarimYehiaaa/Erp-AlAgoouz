import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '../src/database/pool.ts';
import {
  listProductionBatches,
  produceRecipeBatch,
  reverseProductionBatch,
} from '../src/services/recipesService.ts';

describe('production batches on real PostgreSQL', () => {
  let warehouse: number,
    foreign: number,
    ingredient: number,
    product: number,
    recipe: number,
    cashier: number;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 12);
    [warehouse, foreign] = (
      await query(
        `INSERT INTO warehouses (code,name_ar,type) VALUES ($1,'Production audit','store'),($2,'Foreign audit','main') RETURNING id`,
        [`PR-${suffix}`, `FR-${suffix}`],
      )
    ).rows.map((row) => row.id);
    cashier = (
      await query(
        `INSERT INTO users (username,password_hash,full_name,role_id,warehouse_id) VALUES ($1,'test','Production cashier',(SELECT id FROM roles WHERE name='cashier'),$2) RETURNING id`,
        [`prod-${suffix}`, warehouse],
      )
    ).rows[0].id;
    [ingredient, product] = (
      await query(
        `INSERT INTO products (sku,name_ar,unit,purchase_price,sale_price) VALUES ($1,'Production ingredient','kg',99,150),($2,'Production output','count',30,200) RETURNING id`,
        [`ING-${suffix}`, `OUT-${suffix}`],
      )
    ).rows.map((row) => row.id);
    recipe = (
      await query(
        `INSERT INTO product_recipes (product_id,name_ar,created_by) VALUES ($1,'Production recipe',$2) RETURNING id`,
        [product, cashier],
      )
    ).rows[0].id;
    await query(
      `INSERT INTO product_recipe_items (recipe_id,ingredient_product_id,quantity,unit_code) VALUES ($1,$2,1,'kg')`,
      [recipe, ingredient],
    );
    await query(
      `INSERT INTO inventory (product_id,warehouse_id,quantity,reserved_quantity,batch_number) VALUES ($1,$2,5,1,'A'),($1,$2,7,0,'B'),($1,$3,100,0,'FOREIGN'),($4,$2,5,0,'UNRELATED')`,
      [ingredient, warehouse, foreign, product],
    );
    await query(
      `INSERT INTO inventory_cost_layers (product_id,warehouse_id,source_type,quantity,remaining_quantity,unit_cost,total_cost,created_at) VALUES ($1,$2,'test',5,5,10,50,NOW()-INTERVAL '1 minute'),($1,$2,'test',7,7,20,140,NOW())`,
      [ingredient, warehouse],
    );
  });

  afterEach(async () => {
    await query('DELETE FROM inventory_cost_layers WHERE product_id=ANY($1::int[])', [
      [ingredient, product],
    ]);
    await query('DELETE FROM stock_movements WHERE product_id=ANY($1::int[])', [
      [ingredient, product],
    ]);
    await query('DELETE FROM inventory WHERE product_id=ANY($1::int[])', [[ingredient, product]]);
    await query('DELETE FROM product_recipe_items WHERE recipe_id=$1', [recipe]);
    await query('DELETE FROM product_recipes WHERE id=$1', [recipe]);
    await query('DELETE FROM activity_logs WHERE user_id=$1', [cashier]);
    await query('DELETE FROM products WHERE id=ANY($1::int[])', [[ingredient, product]]);
    await query('DELETE FROM users WHERE id=$1', [cashier]);
    await query('DELETE FROM warehouses WHERE id=ANY($1::int[])', [[warehouse, foreign]]);
  });

  const produce = (quantity = 8, warehouseId = warehouse, mode = 'production') =>
    produceRecipeBatch({ recipeId: recipe, quantity, warehouseId, mode }, cashier);
  const total = async (id: number, wh = warehouse) =>
    Number(
      (
        await query(
          'SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory WHERE product_id=$1 AND warehouse_id=$2',
          [id, wh],
        )
      ).rows[0].quantity,
    );
  const movement = async () =>
    (
      await query(
        "SELECT * FROM stock_movements WHERE product_id=$1 AND movement_type IN ('production','opening_production') ORDER BY id DESC LIMIT 1",
        [product],
      )
    ).rows[0];

  it('consumes once per batch, preserves reservations and capitalizes the actual FIFO cost', async () => {
    const result = await produce();
    expect(result.new_quantity).toBe(13);
    expect(await total(ingredient)).toBe(4);
    expect(await total(ingredient, foreign)).toBe(100);
    const mv = await movement();
    expect(Number(mv.total_cost)).toBe(110);
    const receipt = (
      await query('SELECT * FROM inventory_cost_layers WHERE source_movement_id=$1', [mv.id])
    ).rows[0];
    expect(receipt).toMatchObject({ quantity: 8, remaining_quantity: 8, total_cost: 110 });
    expect(
      Number(
        (
          await query(
            "SELECT quantity FROM inventory WHERE product_id=$1 AND batch_number='UNRELATED'",
            [product],
          )
        ).rows[0].quantity,
      ),
    ).toBe(5);
  });

  it('rolls back the output and every ingredient when the permitted stock is insufficient', async () => {
    await expect(produce(12)).rejects.toMatchObject({ statusCode: 409 });
    expect(await total(product)).toBe(5);
    expect(await total(ingredient)).toBe(12);
    expect(await total(ingredient, foreign)).toBe(100);
    expect(
      (
        await query('SELECT id FROM stock_movements WHERE product_id=ANY($1::int[])', [
          [product, ingredient],
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('rejects production in a foreign warehouse', async () => {
    await expect(produce(1, foreign)).rejects.toMatchObject({ statusCode: 403 });
    expect(await total(product, foreign)).toBe(0);
  });

  it('reverses only this receipt, restores ingredient quantities and costs once, and rejects another reversal', async () => {
    await produce();
    const mv = await movement();
    await reverseProductionBatch(mv.id, cashier);
    expect(await total(product)).toBe(5);
    expect(await total(ingredient)).toBe(12);
    const restored = (
      await query(
        "SELECT SUM(total_cost) AS cost FROM stock_movements WHERE movement_type='return' AND reference_id=$1",
        [mv.id],
      )
    ).rows[0];
    expect(Number(restored.cost)).toBe(110);
    await expect(reverseProductionBatch(mv.id, cashier)).rejects.toMatchObject({ statusCode: 400 });
    expect(await total(ingredient)).toBe(12);
  });

  it('keeps partial reversals available in the list and rejects quantities greater than the remainder', async () => {
    await produce();
    const mv = await movement();
    await reverseProductionBatch(mv.id, cashier, { reverseQty: 2 });
    const row = (await listProductionBatches({ recipe_id: recipe }, cashier)).find(
      (row) => row.movement_id === mv.id,
    );
    expect(row).toMatchObject({ is_reversed: false, reversed_quantity: 2 });
    await expect(reverseProductionBatch(mv.id, cashier, { reverseQty: 7 })).rejects.toMatchObject({
      statusCode: 400,
    });
    await reverseProductionBatch(mv.id, cashier, { reverseQty: 6 });
    expect(await total(ingredient)).toBe(12);
    expect(await total(product)).toBe(5);
  });

  it('does not consume reserved output when reversing', async () => {
    await produce();
    const mv = await movement();
    await query(
      "UPDATE inventory SET reserved_quantity=1 WHERE product_id=$1 AND COALESCE(batch_number,'')=''",
      [product],
    );
    await expect(reverseProductionBatch(mv.id, cashier)).rejects.toMatchObject({ statusCode: 409 });
    expect(await total(product)).toBe(13);
    expect(await total(ingredient)).toBe(4);
  });

  it('preserves the original cents across three partial reversals', async () => {
    await query(
      'UPDATE inventory_cost_layers SET unit_cost=0.01666667, total_cost=ROUND(quantity * 0.01666667,2) WHERE product_id=$1',
      [ingredient],
    );
    await produce(3);
    const mv = await movement();
    expect(Number(mv.total_cost)).toBe(0.05);
    for (let part = 0; part < 3; part++)
      await reverseProductionBatch(mv.id, cashier, { reverseQty: 1 });
    const costs = (
      await query(
        `SELECT movement_type, SUM(total_cost) AS cost FROM stock_movements
      WHERE reference_id=$1 AND reference_type='production' GROUP BY movement_type`,
        [mv.id],
      )
    ).rows;
    expect(costs.find((row) => row.movement_type === 'return')?.cost).toBe(0.05);
    expect(costs.find((row) => row.movement_type === 'adjustment')?.cost).toBe(0.05);
  });

  it('can reverse opening production without inventing ingredient consumption', async () => {
    await produce(2, warehouse, 'opening_production');
    const mv = await movement();
    await reverseProductionBatch(mv.id, cashier);
    expect(await total(product)).toBe(5);
    expect(await total(ingredient)).toBe(12);
  });
});
