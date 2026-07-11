#!/usr/bin/env node
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('ERROR: Missing DATABASE_URL environment variable.');
    console.error("Set DATABASE_URL before running this script. Example:\n  $env:DATABASE_URL='postgres://user:pass@host:5432/db' (PowerShell)");
    process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const client = await pool.connect();
    try {
        console.log('Checking v_product_stock contents...');

        const totalProducts = await client.query(`SELECT COUNT(*)::int as cnt FROM products WHERE is_active=TRUE`);
        console.log('Active products count:', totalProducts.rows[0].cnt);

        const productsWithRecipes = await client.query(`
            SELECT COUNT(DISTINCT p.id)::int as cnt
            FROM products p
            JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
            WHERE p.is_active = TRUE
        `);
        console.log('Products with active recipes:', productsWithRecipes.rows[0].cnt);

        const viewCount = await client.query(`SELECT COUNT(*)::int as cnt FROM v_product_stock`);
        console.log('Rows in view v_product_stock:', viewCount.rows[0].cnt);

        const recipeProductsInView = await client.query(`
            SELECT COUNT(*)::int as cnt
            FROM v_product_stock v
            JOIN product_recipes r ON r.product_id = v.product_id AND r.deleted_at IS NULL AND r.is_active = TRUE
        `);
        console.log('Recipe products present in v_product_stock:', recipeProductsInView.rows[0].cnt);

        const sample = await client.query(`SELECT product_id, name_ar, total_quantity FROM v_product_stock ORDER BY total_quantity DESC NULLS LAST LIMIT 10`);
        console.log('\nTop 10 by total_quantity from v_product_stock:');
        console.table(sample.rows);

        console.log('\nDone.');
    } catch (err) {
        console.error('Check failed:', err.message || err);
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
