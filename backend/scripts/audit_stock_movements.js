#!/usr/bin/env node
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const KNOWN_REFERENCE_TYPES = [
    'sale', 'production', 'opening_production', 'purchase', 'transfer', 'return', 'product_return', 'adjustment', 'inventory_adjustment'
];

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error('ERROR: Missing DATABASE_URL environment variable.');
        console.error('Set DATABASE_URL in the environment, for example:');
        console.error("Windows (PowerShell): $env:DATABASE_URL = 'postgres://user:pass@host:5432/db'\n");
        console.error("Linux/macOS: export DATABASE_URL='postgres://user:pass@host:5432/db'\n");
        process.exit(2);
    }

    let client;
    try {
        client = await pool.connect();
    } catch (err) {
        console.error('Failed to connect to database. Please verify DATABASE_URL and credentials.');
        console.error('Connection error:', err.message || err);
        process.exit(3);
    }
    try {
        console.log('Running audit on stock_movements...');

        const byRefType = await client.query(`
            SELECT reference_type, movement_type, COUNT(*) as cnt
            FROM stock_movements
            GROUP BY reference_type, movement_type
            ORDER BY cnt DESC
            LIMIT 100
        `);

        console.log('\nTop reference_type x movement_type combos:');
        byRefType.rows.forEach(r => console.log(`${r.reference_type} | ${r.movement_type} : ${r.cnt}`));

        const nullRefs = await client.query(`
            SELECT id, product_id, movement_type, reference_type, reference_id, created_at
            FROM stock_movements
            WHERE reference_type IS NULL OR TRIM(reference_type) = ''
            ORDER BY created_at DESC
            LIMIT 20
        `);
        console.log(`\nRows with missing reference_type: ${nullRefs.rowCount}`);
        if (nullRefs.rowCount > 0) console.table(nullRefs.rows);

        const unknownRefs = await client.query(`
            SELECT reference_type, COUNT(*) as cnt
            FROM stock_movements
            WHERE reference_type IS NOT NULL
            GROUP BY reference_type
            HAVING LOWER(reference_type) NOT IN (${KNOWN_REFERENCE_TYPES.map((_, i) => `$${i + 1}`).join(',')})
            ORDER BY cnt DESC
        `, KNOWN_REFERENCE_TYPES.map(r => r.toLowerCase()));

        console.log(`\nUnknown reference_type values (not in whitelist): ${unknownRefs.rowCount}`);
        if (unknownRefs.rowCount > 0) console.table(unknownRefs.rows);

        const movementCounts = await client.query(`
            SELECT movement_type, COUNT(*) as cnt
            FROM stock_movements
            GROUP BY movement_type
            ORDER BY cnt DESC
        `);
        console.log('\nMovement type counts:');
        movementCounts.rows.forEach(r => console.log(`${r.movement_type} : ${r.cnt}`));

        console.log('\nAudit complete.');
    } catch (err) {
        console.error('Audit failed:', err.message || err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
