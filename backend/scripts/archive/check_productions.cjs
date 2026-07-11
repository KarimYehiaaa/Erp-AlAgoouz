const { Client } = require('pg');
const client = new Client({ host: '127.0.0.1', port: 5432, database: 'bin_al_ajouz', user: 'erp_user', password: process.env.DB_PASSWORD });
(async () => {
    try {
        await client.connect();
        const prodQ = `
      SELECT sm.id, sm.product_id, p.name_ar AS product_name, sm.to_warehouse_id, tw.name_ar AS warehouse_name,
             sm.movement_type, sm.quantity, sm.reference_type, sm.reference_id, sm.created_at
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      LEFT JOIN warehouses tw ON tw.id = sm.to_warehouse_id
      WHERE sm.movement_type IN ('production','opening_production')
        AND sm.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY sm.created_at DESC
      LIMIT 50
    `;
        const prod = await client.query(prodQ);
        console.log('--- PRODUCTIONS (last 7 days) ---');
        console.dir(prod.rows, { depth: null });
        const prodIds = prod.rows.map(r => r.product_id);
        if (prodIds.length) {
            const invQ = `
        SELECT i.product_id, i.warehouse_id, w.name_ar AS warehouse_name, SUM(i.quantity) AS quantity
        FROM inventory i
        JOIN warehouses w ON w.id = i.warehouse_id
        WHERE i.product_id = ANY($1)
        GROUP BY i.product_id, i.warehouse_id, w.name_ar
        ORDER BY i.product_id
      `;
            const inv = await client.query(invQ, [prodIds]);
            console.log('--- INVENTORY FOR PRODUCED PRODUCTS ---');
            console.dir(inv.rows, { depth: null });
        } else {
            console.log('No recent productions found');
        }
    } catch (e) { console.error('ERROR', e); } finally { await client.end(); }
})();
