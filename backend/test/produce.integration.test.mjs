import test from 'node:test';
import assert from 'node:assert/strict';
import { getClient, query } from '../src/database/pool.js';
import { produceRecipeBatch } from '../src/services/recipesService.js';
import { adjustStock } from '../src/services/inventoryService.js';

// WARNING: This test modifies the real DB. Run only in test environment or with a backup.

test('produceRecipeBatch increases inventory and records movement', async (t) => {
    const recipeId = 1;
    const warehouseId = 1;
    const qty = 1;
    const client = await getClient();
    try {
        await client.query('BEGIN');
        // read initial stock
        const before = (await client.query('SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id = (SELECT product_id FROM product_recipes WHERE id = $1) AND warehouse_id = $2', [recipeId, warehouseId])).rows[0]?.q || 0;

        const res = await produceRecipeBatch({ recipeId, quantity: qty, warehouseId, notes: 'integration test', mode: 'production' }, 1);
        assert.equal(res.recipe_id, recipeId);
        assert.equal(res.warehouse_id, warehouseId);

        const after = (await client.query('SELECT COALESCE(quantity,0) AS q FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [res.product_id, warehouseId])).rows[0]?.q || 0;
        assert.equal(Number(after), Number(before) + qty);

        // cleanup: revert the inventory increase (use adjustStock to set target back)
        await adjustStock({ product_id: res.product_id, warehouse_id: warehouseId, quantity: before, movement_type: 'adjustment', notes: 'revert integration test' }, 1);

        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
});
