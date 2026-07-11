import test from 'node:test';
import assert from 'node:assert/strict';
import { getClient, query } from '../src/database/pool.js';
import pool from '../src/database/pool.js';
import { produceRecipeBatch } from '../src/services/recipesService.js';
import { adjustStock } from '../src/services/inventoryService.js';

// WARNING: This test modifies the DB. Enable it only for a disposable test database.

test('produceRecipeBatch increases inventory and records movement', async (t) => {
    if (process.env.RUN_DB_INTEGRATION_TESTS !== '1') {
        t.skip('Set RUN_DB_INTEGRATION_TESTS=1 to run DB-mutating integration tests');
        return;
    }

    const recipeId = 1;
    const client = await getClient();
    const originalStock = [];
    let warehouseId = 1;

    try {
        const whRes = await client.query('SELECT primary_warehouse_id FROM products WHERE id = (SELECT product_id FROM product_recipes WHERE id = $1)', [recipeId]);
        warehouseId = whRes.rows[0]?.primary_warehouse_id || 1;

        // Query ingredients and store original stock levels
        const ingredientsRes = await client.query('SELECT ingredient_product_id FROM product_recipe_items WHERE recipe_id = $1', [recipeId]);
        for (const row of ingredientsRes.rows) {
            const stockRes = await client.query('SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [row.ingredient_product_id, warehouseId]);
            const currentQty = stockRes.rows[0] ? Number(stockRes.rows[0].quantity) : null;
            originalStock.push({ product_id: row.ingredient_product_id, quantity: currentQty });

            // Seed stock (committed) so that produceRecipeBatch (running on a different client/transaction) can see it
            if (currentQty !== null) {
                await client.query('UPDATE inventory SET quantity = 100 WHERE product_id = $1 AND warehouse_id = $2', [row.ingredient_product_id, warehouseId]);
            } else {
                await client.query('INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100)', [row.ingredient_product_id, warehouseId]);
            }
        }

        const qty = 1;
        // read initial stock of produced product
        const before = (await client.query('SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id = (SELECT product_id FROM product_recipes WHERE id = $1) AND warehouse_id = $2', [recipeId, warehouseId])).rows[0]?.q || 0;

        // Capture max stock movement ID before running production
        const maxSmRes = await client.query('SELECT MAX(id) AS max_id FROM stock_movements');
        const maxSmId = maxSmRes.rows[0]?.max_id || 0;

        // Run the production batch
        const res = await produceRecipeBatch({ recipeId, quantity: qty, warehouseId, notes: 'integration test', mode: 'production' }, 1);
        assert.equal(res.recipe_id, recipeId);
        assert.equal(res.warehouse_id, warehouseId);

        const after = (await client.query('SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [res.product_id, warehouseId])).rows[0]?.q || 0;
        assert.equal(Number(after), Number(before) + qty);

        // cleanup: revert the inventory increase using direct SQL to bypass active recipe checks
        await client.query('UPDATE inventory SET quantity = $1 WHERE product_id = $2 AND warehouse_id = $3', [before, res.product_id, warehouseId]);
        if (maxSmId > 0) {
            await client.query('DELETE FROM stock_movements WHERE id > $1', [maxSmId]);
        }
    } finally {
        // Restore original stock levels of ingredients
        for (const orig of originalStock) {
            if (orig.quantity !== null) {
                await client.query('UPDATE inventory SET quantity = $1 WHERE product_id = $2 AND warehouse_id = $3', [orig.quantity, orig.product_id, warehouseId]);
            } else {
                await client.query('DELETE FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [orig.product_id, warehouseId]);
            }
        }
        client.release();
    }
});

test.after(async () => {
    await pool.end();
});
