import { produceRecipeBatch } from '../src/services/recipesService.js';
import { getClient } from '../src/database/pool.js';

(async () => {
    const client = await getClient();
    const originalStock = [];
    let warehouseId = 1;
    let maxSmId = 0;
    let finalProductId = 74; // Product 74 is the final product for recipe 1
    let finalProductOriginalQty = null;

    try {
        const whRes = await client.query('SELECT primary_warehouse_id, product_id FROM products p JOIN product_recipes r ON r.product_id = p.id WHERE r.id = 1');
        warehouseId = whRes.rows[0]?.primary_warehouse_id || 1;
        finalProductId = whRes.rows[0]?.product_id || 74;

        // Query final product original stock
        const finalStockRes = await client.query('SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [finalProductId, warehouseId]);
        finalProductOriginalQty = finalStockRes.rows[0] ? Number(finalStockRes.rows[0].quantity) : null;

        // Query ingredients and store original stock levels
        const ingredientsRes = await client.query('SELECT ingredient_product_id FROM product_recipe_items WHERE recipe_id = 1');
        for (const row of ingredientsRes.rows) {
            const stockRes = await client.query('SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [row.ingredient_product_id, warehouseId]);
            const currentQty = stockRes.rows[0] ? Number(stockRes.rows[0].quantity) : null;
            originalStock.push({ product_id: row.ingredient_product_id, quantity: currentQty });

            // Seed stock (committed) so that produceRecipeBatch can see it
            if (currentQty !== null) {
                await client.query('UPDATE inventory SET quantity = 100 WHERE product_id = $1 AND warehouse_id = $2', [row.ingredient_product_id, warehouseId]);
            } else {
                await client.query('INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100)', [row.ingredient_product_id, warehouseId]);
            }
        }

        // Capture max stock movement ID before running production
        const maxSmRes = await client.query('SELECT MAX(id) AS max_id FROM stock_movements');
        maxSmId = maxSmRes.rows[0]?.max_id || 0;

        console.log(`Running trial production (recipeId=1, qty=1, warehouseId=${warehouseId}, userId=1)`);
        const res = await produceRecipeBatch({ recipeId: 1, quantity: 1, warehouseId, notes: 'Trial produce script', mode: 'production' }, 1);
        console.log('Produce trial result:');
        console.dir(res, { depth: null });
    } catch (e) {
        console.error('Produce trial failed:', e.message || e);
        if (e.stack) console.error(e.stack);
        process.exitCode = 1;
    } finally {
        // Revert final product stock
        if (finalProductOriginalQty !== null) {
            await client.query('UPDATE inventory SET quantity = $1 WHERE product_id = $2 AND warehouse_id = $3', [finalProductOriginalQty, finalProductId, warehouseId]);
        } else {
            await client.query('DELETE FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [finalProductId, warehouseId]);
        }

        // Restore original stock levels of ingredients
        for (const orig of originalStock) {
            if (orig.quantity !== null) {
                await client.query('UPDATE inventory SET quantity = $1 WHERE product_id = $2 AND warehouse_id = $3', [orig.quantity, orig.product_id, warehouseId]);
            } else {
                await client.query('DELETE FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [orig.product_id, warehouseId]);
            }
        }

        // Delete any stock movements created during the trial run
        if (maxSmId > 0) {
            await client.query('DELETE FROM stock_movements WHERE id > $1', [maxSmId]);
        }

        client.release();
    }
})();
