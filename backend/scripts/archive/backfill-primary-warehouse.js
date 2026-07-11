import pool from '../src/database/pool.js';

const main = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ensure column exists (for environments where migration wasn't applied)
        await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_warehouse_id INT NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_products_primary_warehouse ON products(primary_warehouse_id) WHERE deleted_at IS NULL`);

        const productsRes = await client.query(
            `SELECT id FROM products WHERE deleted_at IS NULL`
        );

        let updated = 0;
        for (const row of productsRes.rows) {
            const pid = row.id;
            const w = await client.query(
                `SELECT warehouse_id, SUM(quantity) as total_qty
         FROM inventory
         WHERE product_id = $1
         GROUP BY warehouse_id
         ORDER BY SUM(quantity) DESC, warehouse_id ASC
         LIMIT 1`,
                [pid]
            );
            const wid = w.rows[0]?.warehouse_id || null;
            if (wid) {
                const res = await client.query(
                    `UPDATE products SET primary_warehouse_id = $1, updated_at = NOW() WHERE id = $2 AND COALESCE(primary_warehouse_id, 0) <> $1`,
                    [wid, pid]
                );
                if (res.rowCount) updated++;
            }
        }

        await client.query('COMMIT');
        console.log(`Backfill complete. Products updated: ${updated}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error:', err.message || err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
};

main();
