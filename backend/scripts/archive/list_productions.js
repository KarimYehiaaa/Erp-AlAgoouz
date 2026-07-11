#!/usr/bin/env node
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();
if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(2);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT id, product_id, quantity, from_warehouse_id, to_warehouse_id, reference_type, reference_id, notes, created_at FROM stock_movements WHERE movement_type IN ('production','opening_production') ORDER BY created_at DESC LIMIT 50`);
        console.log('Recent production movements:');
        console.table(res.rows);
    } catch (err) {
        console.error('Failed:', err.message || err);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(e => { console.error(e); process.exit(1); });
