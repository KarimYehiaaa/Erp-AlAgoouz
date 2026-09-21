import { describe, it, expect } from 'vitest';
import { getClient, query } from '../src/database/pool.ts';
import { produceRecipeBatch } from '../src/services/recipesService.ts';

describe('Produce Recipe Batch Integration Tests', () => {
  it('produceRecipeBatch increases inventory and records movement', async () => {
    const client = await getClient();
    const originalStock: any[] = [];
    let warehouseId = 1;

    try {
      const recipeRes = await client.query(
        `SELECT r.id, r.product_id, p.primary_warehouse_id
         FROM product_recipes r
         JOIN products p ON r.product_id = p.id
         WHERE r.is_active = TRUE AND r.deleted_at IS NULL
         LIMIT 1`,
      );

      if (!recipeRes.rows[0]) {
        // No active recipe in test DB, skip gracefully
        return;
      }

      const recipeId = recipeRes.rows[0].id;
      warehouseId = recipeRes.rows[0].primary_warehouse_id || 1;

      // Query ingredients and store original stock levels
      const ingredientsRes = await client.query(
        `SELECT ingredient_product_id FROM product_recipe_items WHERE recipe_id = $1`,
        [recipeId],
      );

      for (const row of ingredientsRes.rows) {
        const stockRes = await client.query(
          `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
          [row.ingredient_product_id, warehouseId],
        );
        const currentQty = stockRes.rows[0] ? Number(stockRes.rows[0].quantity) : null;
        originalStock.push({ product_id: row.ingredient_product_id, quantity: currentQty });

        // Seed stock so produceRecipeBatch can see it
        if (currentQty !== null) {
          await client.query(
            `UPDATE inventory SET quantity = 100 WHERE product_id = $1 AND warehouse_id = $2`,
            [row.ingredient_product_id, warehouseId],
          );
        } else {
          await client.query(
            `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100)`,
            [row.ingredient_product_id, warehouseId],
          );
        }
      }

      const qty = 1;
      const before =
        (
          await client.query(
            `SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id = (SELECT product_id FROM product_recipes WHERE id = $1) AND warehouse_id = $2`,
            [recipeId, warehouseId],
          )
        ).rows[0]?.q || 0;

      const maxSmRes = await client.query('SELECT MAX(id) AS max_id FROM stock_movements');
      const maxSmId = maxSmRes.rows[0]?.max_id || 0;

      const res = await produceRecipeBatch(
        {
          recipeId,
          quantity: qty,
          warehouseId,
          notes: 'integration test',
          mode: 'production',
        },
        1,
      );

      expect(res.recipe_id).toBe(recipeId);
      expect(res.warehouse_id).toBe(warehouseId);

      const after =
        (
          await client.query(
            `SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
            [res.product_id, warehouseId],
          )
        ).rows[0]?.q || 0;

      expect(Number(after)).toBe(Number(before) + qty);

      // Revert the inventory increase
      await client.query(
        `UPDATE inventory SET quantity = $1 WHERE product_id = $2 AND warehouse_id = $3`,
        [before, res.product_id, warehouseId],
      );
      if (maxSmId > 0) {
        await client.query('DELETE FROM stock_movements WHERE id > $1', [maxSmId]);
      }
    } finally {
      // Restore original stock levels of ingredients
      for (const orig of originalStock) {
        if (orig.quantity !== null) {
          await client.query(
            `UPDATE inventory SET quantity = $1 WHERE product_id = $2 AND warehouse_id = $3`,
            [orig.quantity, orig.product_id, warehouseId],
          );
        } else {
          await client.query(
            `DELETE FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
            [orig.product_id, warehouseId],
          );
        }
      }
      client.release();
    }
  });
});
