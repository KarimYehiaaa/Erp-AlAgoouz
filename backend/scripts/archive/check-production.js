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
        const movementsRes = await client.query(`
            SELECT sm.id, sm.created_at, sm.movement_type, sm.quantity, sm.from_warehouse_id, sm.to_warehouse_id,
                   sm.reference_type, sm.reference_id, sm.notes
            FROM stock_movements sm
            WHERE sm.product_id = 74
            ORDER BY sm.created_at ASC, sm.id ASC
        `);
        console.log("=== All Stock Movements for Product 74 ===");
        movementsRes.rows.forEach(m => {
            console.log(`ID: ${m.id} | Date: ${m.created_at.toISOString()} | Type: ${m.movement_type} | Qty: ${m.quantity} | From WH: ${m.from_warehouse_id} | To WH: ${m.to_warehouse_id} | Ref: ${m.reference_type} [${m.reference_id}] | Notes: ${m.notes}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
