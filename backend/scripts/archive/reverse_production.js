#!/usr/bin/env node
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v === undefined ? true : v];
}));

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL. Set it before running this script.');
    process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const movementId = argv['movement-id'] ? Number(argv['movement-id']) : null;
const qtyArg = argv.qty ? Number(argv.qty) : null;
const apply = argv.apply === 'true' || argv.apply === true || argv.apply === '1';

if (!movementId) {
    console.error('Usage: node reverse_production.js --movement-id=<id> [--qty=<qty>] [--apply=true]');
    process.exit(2);
}

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mvRes = await client.query(`SELECT * FROM stock_movements WHERE id = $1 FOR UPDATE`, [movementId]);
        if (!mvRes.rowCount) throw new Error(`stock_movements id=${movementId} not found`);
        const mv = mvRes.rows[0];

        if (!['production', 'opening_production'].includes(mv.movement_type)) {
            console.warn(`Warning: movement ${movementId} has movement_type='${mv.movement_type}'. Proceeding but verify intent.`);
        }

        const prodQty = Number(mv.quantity || 0);
        const reverseQty = qtyArg != null ? qtyArg : prodQty;
        if (reverseQty <= 0) throw new Error('reverse qty must be > 0');
        if (reverseQty > prodQty) throw new Error('reverse qty cannot exceed original production quantity');

        const productId = mv.product_id;
        const toWarehouse = mv.to_warehouse_id || mv.to_warehouse || null;

        // check produced product inventory availability
        const invProdRes = await client.query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`, [productId, toWarehouse]);
        const prodInv = Number(invProdRes.rows[0]?.quantity || 0);
        if (prodInv < reverseQty) {
            throw new Error(`Not enough produced product in inventory to reverse: have ${prodInv}, need ${reverseQty}`);
        }

        // locate related consumption movements by matching reference_type/reference_id and time proximity
        const refType = mv.reference_type;
        const refId = mv.reference_id;
        // إصلاح: كانت النافذة 60 دقيقة مما يجلب consumptions من runs مختلفة
        // لنفس الوصفة. الآن 2 دقيقة فقط لربط الحركات المتزامنة فعلاً.
        const windowMinutes = 2;
        const startTime = new Date(new Date(mv.created_at).getTime() - windowMinutes * 60000).toISOString();
        const endTime = new Date(new Date(mv.created_at).getTime() + windowMinutes * 60000).toISOString();

        const consRes = await client.query(
            `SELECT * FROM stock_movements WHERE movement_type = 'consumption' AND reference_type = $1 AND reference_id = $2 AND created_at BETWEEN $3 AND $4 ORDER BY id`,
            [refType, refId, startTime, endTime]
        );

        if (!consRes.rowCount) {
            throw new Error('No related consumption movements found for this production (by reference and time window). Aborting.');
        }

        // calculate proportional restoration per consumption movement
        const proportionalFactor = reverseQty / prodQty;
        const restorePlan = consRes.rows.map((c) => {
            const needed = Number(c.quantity || 0) * proportionalFactor;
            return {
                movement: c,
                restoreQty: Number(needed.toFixed(6)),
            };
        });

        // summary
        console.log('Production movement id:', movementId);
        console.log('Produced product_id:', productId, 'warehouse:', toWarehouse, 'original_qty:', prodQty, 'reverse_qty:', reverseQty);
        console.log('\nPlanned ingredient restorations:');
        restorePlan.forEach((r) => {
            console.log(`- ingredient_product_id=${r.movement.product_id} from_warehouse=${r.movement.from_warehouse_id} restore_qty=${r.restoreQty}`);
        });

        if (!apply) {
            console.log('\nDry-run mode (no DB changes). To apply, re-run with --apply=true');
            await client.query('ROLLBACK');
            return;
        }

        // create backup of affected stock_movements
        await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements_reverse_backup (
        backup_id serial primary key,
        original_id int,
        data jsonb,
        created_at timestamptz default now()
      )
    `);

        const affectedIds = [mv.id, ...consRes.rows.map(r => r.id)];
        for (const id of affectedIds) {
            const row = await client.query(`SELECT row_to_json(t) as data FROM (SELECT * FROM stock_movements WHERE id = $1) t`, [id]);
            await client.query(`INSERT INTO stock_movements_reverse_backup (original_id, data) VALUES ($1, $2)`, [id, row.rows[0].data]);
        }

        // perform inventory updates and insert reversal movements
        // 1) decrease produced product inventory
        await client.query(`UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`, [reverseQty, productId, toWarehouse]);
        await client.query(`INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_at) VALUES ($1,$2,'adjustment', $3, $4, $5, $6, NOW())`, [productId, toWarehouse, -Math.abs(reverseQty), mv.reference_type, mv.reference_id, `Reverse of production id:${movementId}`]);

        // 2) restore each ingredient
        for (const r of restorePlan) {
            const ingr = r.movement;
            const restoreQty = r.restoreQty;
            // ensure inventory row exists
            await client.query(`INSERT INTO inventory (product_id, warehouse_id, quantity, updated_at) VALUES ($1,$2,0,NOW()) ON CONFLICT (product_id, warehouse_id, batch_number) DO NOTHING`, [ingr.product_id, ingr.from_warehouse_id]);
            await client.query(`UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`, [restoreQty, ingr.product_id, ingr.from_warehouse_id]);
            await client.query(`INSERT INTO stock_movements (product_id, to_warehouse_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, notes, created_at) VALUES ($1,$2,$3,'return',$4,$5,$6,$7,NOW())`, [ingr.product_id, ingr.from_warehouse_id, null, restoreQty, mv.reference_type, mv.reference_id, `Restore from reverse of production id:${movementId}`]);
        }

        await client.query('COMMIT');
        console.log('\nApplied reversal successfully. Backup of original movements created in stock_movements_reverse_backup.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed:', err.message || err);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch((e) => {
    console.error('Unexpected error:', e.message || e);
    process.exit(1);
});
