const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  database: 'bin_al_ajouz',
  user: 'erp_user',
  password: 'ErpUser_9K7m2Q4t8N6p'
});

(async () => {
  try {
    await client.connect();

    // Show recent production stock movements
    const r = await client.query(`
      SELECT sm.id, sm.product_id, prd.name_ar,
        sm.movement_type, sm.quantity, sm.to_warehouse_id,
        wh.name_ar as warehouse_name,
        sm.reference_id, sm.created_at
      FROM stock_movements sm
      JOIN products prd ON sm.product_id = prd.id
      LEFT JOIN warehouses wh ON sm.to_warehouse_id = wh.id
      WHERE sm.reference_type = 'production'
        AND sm.created_at >= '2026-06-09'
      ORDER BY sm.id DESC
      LIMIT 30
    `);
    
    console.log('\n=== RECENT PRODUCTION MOVEMENTS ===');
    for (const m of r.rows) {
      console.log(`ID:${m.id} | ${m.name_ar} (${m.product_id}) | Type:${m.movement_type} | Qty:${m.quantity} | Wh:${m.warehouse_name}(${m.to_warehouse_id}) | RefId:${m.reference_id} | ${m.created_at}`);
    }

    // Show ALL movements today
    console.log('\n=== ALL MOVEMENTS (today) ===');
    const all = await client.query(`
      SELECT sm.id, sm.product_id, p.name_ar,
        sm.movement_type, sm.quantity, 
        sm.from_warehouse_id, sm.to_warehouse_id,
        sm.reference_type, sm.reference_id, sm.created_at
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      WHERE sm.created_at >= '2026-06-09'
      ORDER BY sm.id DESC
      LIMIT 40
    `);
    for (const m of all.rows) {
      console.log(`ID:${m.id} | ${m.name_ar}(${m.product_id}) | ${m.movement_type} | Qty:${m.quantity} | From:${m.from_warehouse_id} | To:${m.to_warehouse_id} | Ref:${m.reference_type}/${m.reference_id} | ${m.created_at}`);
    }

    // Current inventory for ALL products  
    console.log('\n=== CURRENT INVENTORY (products with qty) ===');
    const inv = await client.query(`
      SELECT i.product_id, p.name_ar, i.warehouse_id, w.name_ar as wh_name, i.quantity
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.quantity > 0
      ORDER BY i.product_id, i.warehouse_id
    `);
    for (const i of inv.rows) {
      console.log(`${i.name_ar} (${i.product_id}) | ${i.wh_name}(${i.warehouse_id}) | Qty:${i.quantity}`);
    }

    // CHECK: any consumption without matching production?
    console.log('\n=== PRODUCTION SUMMARY (today) ===');
    const summary = await client.query(`
      SELECT 
        sm.reference_id as production_id,
        SUM(CASE WHEN sm.movement_type = 'production' THEN sm.quantity ELSE 0 END) as produced,
        SUM(CASE WHEN sm.movement_type = 'consumption' AND sm.quantity < 0 THEN ABS(sm.quantity) ELSE 0 END) as consumed_neg,
        SUM(CASE WHEN sm.movement_type = 'consumption' AND sm.quantity > 0 THEN sm.quantity ELSE 0 END) as consumed_pos
      FROM stock_movements sm
      WHERE sm.reference_type = 'production'
        AND sm.created_at >= '2026-06-09'
      GROUP BY sm.reference_id
      ORDER BY sm.reference_id DESC
    `);
    for (const s of summary.rows) {
      console.log(`Production ${s.production_id}: produced=${s.produced}, consumed_neg=${s.consumed_neg}, consumed_pos=${s.consumed_pos}`);
    }

    await client.end();
  } catch (err) {
    console.error('Error:', (err && err.message) ? err.message : err);
    try { await client.end(); } catch(e){}
  }
})();
