#!/usr/bin/env node
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const argv = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.split('='); return [k.replace(/^--/, '').toLowerCase(), v === undefined ? true : v]; }));
const sku = argv.sku || argv.s || argv._ && argv._[0];
const limit = Number(argv.limit || 50);

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(2);
}
if (!sku) {
    console.error('Usage: node get_product_movements.js --sku=AGoouz-046 [--limit=50]');
    process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const client = await pool.connect();
    try {
        const p = await client.query(`SELECT id, sku, name_ar FROM products WHERE sku = $1 LIMIT 1`, [sku]);
        if (!p.rowCount) {
            console.error('Product with sku', sku, 'not found');
            return;
        }
        const product = p.rows[0];
        console.log('Product:', product);

        const mv = await client.query(`SELECT id, product_id, movement_type, quantity, from_warehouse_id, to_warehouse_id, reference_type, reference_id, notes, created_at FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT $2`, [product.id, limit]);
        console.log(`\nLast ${mv.rowCount} movements for product id=${product.id} (sku=${sku}):`);
        console.table(mv.rows);
    } catch (err) {
        console.error('Failed:', err.message || err);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(e => { console.error(e); process.exit(1) });
