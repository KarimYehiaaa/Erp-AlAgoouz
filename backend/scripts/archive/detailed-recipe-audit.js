import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    user: 'erp_user',
    password: process.env.DB_PASSWORD,
    database: 'bin_al_ajouz',
});

async function run() {
    try {
        await client.connect();

        // 1. Get all recipes
        const recipesRes = await client.query(`
            SELECT r.id, r.name_ar, r.product_id, p.name_ar as product_name
            FROM product_recipes r
            JOIN products p ON p.id = r.product_id
        `);
        const recipes = recipesRes.rows;
        console.log("=== Recipes in system ===");
        console.dir(recipes);

        // 2. Check all stock movements with movement_type = 'production'
        const prodRes = await client.query(`
            SELECT sm.id, sm.created_at, sm.product_id, p.name_ar, sm.quantity, sm.notes, sm.reference_type, sm.reference_id
            FROM stock_movements sm
            JOIN products p ON p.id = sm.product_id
            WHERE sm.movement_type = 'production'
            ORDER BY sm.created_at DESC
        `);
        console.log(`\n=== All 'production' type stock movements (Total: ${prodRes.rows.length}) ===`);
        prodRes.rows.forEach(r => {
            console.log(`ID: ${r.id} | Date: ${r.created_at.toISOString()} | Product: ${r.name_ar} (ID: ${r.product_id}) | Qty: ${r.quantity} | Ref: ${r.reference_type} [${r.reference_id}] | Notes: ${r.notes}`);
        });

        // 3. Find any orphaned consumption movements or mismatches
        console.log(`\n=== Auditing Production Batches (Consumptions vs Productions) ===`);
        // We group movements by reference_type = 'production' (which means consumption of ingredients) 
        // and reference_id (which is the recipe_id), or by notes/date
        const batchesRes = await client.query(`
            SELECT DISTINCT reference_id as recipe_id, created_at, notes
            FROM stock_movements
            WHERE reference_type = 'production'
            ORDER BY created_at DESC
        `);
        console.log(`Found ${batchesRes.rows.length} unique consumption events.`);

        for (const batch of batchesRes.rows) {
            const recipeId = batch.recipe_id;
            const date = batch.created_at;
            
            // Find the recipe and final product
            const recipe = recipes.find(r => r.id === recipeId);
            const finalProductId = recipe ? recipe.product_id : null;
            const finalProductName = recipe ? recipe.product_name : 'Unknown';

            // Find if there is a corresponding final product 'production' movement around the same time (+- 5 seconds)
            // or with the same reference_id/notes
            const matchingProd = await client.query(`
                SELECT id, quantity, notes, movement_type
                FROM stock_movements
                WHERE product_id = $1 
                  AND (movement_type = 'production' OR movement_type = 'opening_production')
                  AND created_at BETWEEN $2::timestamp - INTERVAL '5 seconds' AND $2::timestamp + INTERVAL '5 seconds'
            `, [finalProductId, date]);

            console.log(`\nEvent Date: ${date.toISOString()} | Recipe: ${recipe ? recipe.name_ar : 'ID ' + recipeId} (Final Product: ${finalProductName})`);
            
            // Get ingredients consumed in this event
            const ingCons = await client.query(`
                SELECT sm.product_id, p.name_ar as ingredient_name, sm.quantity
                FROM stock_movements sm
                JOIN products p ON p.id = sm.product_id
                WHERE sm.reference_type = 'production' AND sm.reference_id = $1 AND sm.created_at = $2
            `, [recipeId, date]);
            
            console.log(`  Ingredients Consumed:`);
            ingCons.rows.forEach(i => {
                console.log(`    - ${i.ingredient_name}: ${i.quantity}`);
            });

            if (matchingProd.rows.length > 0) {
                console.log(`  Matching Final Product Production:`);
                matchingProd.rows.forEach(p => {
                    console.log(`    - ID: ${p.id} | Qty Produced: ${p.quantity} | Type: ${p.movement_type} | Notes: ${p.notes}`);
                });
            } else {
                console.log(`  ⚠️ MISMATCH: No matching final product production movement found in stock_movements!`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
