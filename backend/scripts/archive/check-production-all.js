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

        console.log("=== 1. All Production Stock Movements (Final Products) ===");
        const prodRes = await client.query(`
            SELECT sm.id, sm.created_at, sm.product_id, p.name_ar, sm.quantity, sm.to_warehouse_id, sm.notes
            FROM stock_movements sm
            JOIN products p ON p.id = sm.product_id
            WHERE sm.movement_type = 'production'
            ORDER BY sm.created_at DESC
        `);
        console.log(`Found ${prodRes.rows.length} production entries:`);
        prodRes.rows.forEach(r => {
            console.log(`ID: ${r.id} | Date: ${r.created_at.toISOString()} | Product: ${r.name_ar} (ID: ${r.product_id}) | Qty: ${r.quantity} | WH: ${r.to_warehouse_id} | Notes: ${r.notes}`);
        });

        console.log("\n=== 2. All Consumption Movements of Ingredients for Recipe ID 1 ===");
        const recipeRes = await client.query(`
            SELECT id, name_ar, product_id 
            FROM product_recipes 
            WHERE product_id = 74 AND deleted_at IS NULL
        `);
        if (recipeRes.rows.length > 0) {
            const recipeId = recipeRes.rows[0].id;
            console.log(`Recipe ID for Product 74 is: ${recipeId}`);
            
            const ingMovements = await client.query(`
                SELECT sm.id, sm.created_at, sm.product_id, p.name_ar as ingredient_name, sm.quantity, sm.notes, sm.reference_id
                FROM stock_movements sm
                JOIN products p ON p.id = sm.product_id
                WHERE sm.reference_type = 'production' AND sm.reference_id = $1
                ORDER BY sm.created_at DESC
            `, [recipeId]);
            console.log(`Found ${ingMovements.rows.length} ingredient consumption movements:`);
            
            // Group by batch / date
            const batches = {};
            ingMovements.rows.forEach(m => {
                const dateKey = m.created_at.toISOString();
                if (!batches[dateKey]) batches[dateKey] = [];
                batches[dateKey].push(m);
            });

            for (const [date, items] of Object.entries(batches)) {
                console.log(`\nBatch Date: ${date} | Total items consumed: ${items.length}`);
                items.forEach(it => {
                    console.log(`  - Ingredient: ${it.ingredient_name} (ID: ${it.product_id}) | Qty consumed: ${it.quantity} | Notes: ${it.notes}`);
                });
            }
        } else {
            console.log("No recipe found for Product 74");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
