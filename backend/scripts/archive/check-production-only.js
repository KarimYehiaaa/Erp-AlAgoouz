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

        console.log("=== Production Movements for Product 74 (Final Product Stock In) ===");
        const res = await client.query(`
            SELECT sm.id, sm.created_at, sm.product_id, p.name_ar, sm.quantity, sm.to_warehouse_id, sm.notes
            FROM stock_movements sm
            JOIN products p ON p.id = sm.product_id
            WHERE sm.product_id = 74 AND sm.movement_type = 'production'
            ORDER BY sm.created_at DESC
        `);
        console.log(`Found ${res.rows.length} rows.`);
        res.rows.forEach(r => {
            console.log(`- ID: ${r.id} | Date: ${r.created_at.toISOString()} | Qty: ${r.quantity} | WH: ${r.to_warehouse_id} | Notes: ${r.notes}`);
        });

        console.log("\n=== Total consumption batches for Product 74 ===");
        const consRes = await client.query(`
            SELECT COUNT(DISTINCT created_at) as count
            FROM stock_movements
            WHERE reference_type = 'production' AND reference_id = 1
        `);
        console.log(`Unique consumption batch count: ${consRes.rows[0].count}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
