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

        console.log("=== Recipe 1 Details ===");
        const recipeRes = await client.query(`
            SELECT id, name_ar, product_id 
            FROM product_recipes 
            WHERE id = 1
        `);
        console.dir(recipeRes.rows);

        console.log("\n=== Ingredient Consumption Events for Recipe 1 ===");
        const consRes = await client.query(`
            SELECT DISTINCT created_at, notes, user_id
            FROM stock_movements
            WHERE reference_type = 'production' AND reference_id = 1
            ORDER BY created_at ASC
        `);
        
        console.log(`Found ${consRes.rows.length} unique consumption timestamps.`);

        let totalExpectedProduced = 0;

        for (const event of consRes.rows) {
            const date = event.created_at;
            
            // Get all ingredient consumptions for this timestamp
            const itemsRes = await client.query(`
                SELECT sm.id, sm.product_id, p.name_ar, sm.quantity, sm.movement_type, sm.notes
                FROM stock_movements sm
                JOIN products p ON p.id = sm.product_id
                WHERE sm.reference_type = 'production' AND sm.reference_id = 1 AND sm.created_at = $1
            `, [date]);
            
            // Calculate how many units of the recipe this consumption represents.
            // Recipe 1 ingredients formula:
            // 26 (Colombian): 0.15 kg
            // 23 (Brazilian): 0.3 kg
            // 32 (Indonesian): 0.3 kg
            // 28 (Ethiopian): 0.05 kg
            // 37 (Indian): 0.1 kg
            // 33 (Indonesian Medium): 0.1 kg
            // Let's inspect the quantity of one ingredient to determine the batch size.
            // Say, Brazilian (ID 23) quantity / 0.3
            const brItem = itemsRes.rows.find(i => i.product_id === 23);
            const colItem = itemsRes.rows.find(i => i.product_id === 26);
            let batchSize = 0;
            if (brItem) {
                batchSize = Number(brItem.quantity) / 0.3;
            } else if (colItem) {
                batchSize = Number(colItem.quantity) / 0.15;
            }

            console.log(`\nDate: ${date.toISOString()} | User: ${event.user_id} | Notes: ${event.notes}`);
            console.log(`  --> Determined Batch Size: ${batchSize} kg`);
            itemsRes.rows.forEach(i => {
                console.log(`    - Ingredient: ${i.name_ar} (ID: ${i.product_id}) | Qty: ${i.quantity} | Type: ${i.movement_type}`);
            });

            // Check if final product (74) has a corresponding stock movement around this date
            const finalMoveRes = await client.query(`
                SELECT id, movement_type, quantity, notes, created_at
                FROM stock_movements
                WHERE product_id = 74
                  AND created_at BETWEEN $1::timestamp - INTERVAL '10 seconds' AND $1::timestamp + INTERVAL '10 seconds'
            `, [date]);

            if (finalMoveRes.rows.length > 0) {
                console.log("  --> Found corresponding movement for final product 74:");
                finalMoveRes.rows.forEach(fm => {
                    console.log(`      ID: ${fm.id} | Type: ${fm.movement_type} | Qty: ${fm.quantity} | Notes: ${fm.notes} | Date: ${fm.created_at.toISOString()}`);
                });
            } else {
                console.log("  ⚠️ WARNING: No final product movement found for this consumption event!");
                totalExpectedProduced += batchSize;
            }
        }

        console.log(`\nTotal Expected Production missing from stock_movements: ${totalExpectedProduced} kg`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
