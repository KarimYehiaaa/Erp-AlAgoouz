import pool from '../src/database/pool.js';

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');

const normalizeBatchExpr = "COALESCE(batch_number, '')";

const findDuplicateGroups = async (client) => {
    const res = await client.query(
        `SELECT product_id, warehouse_id, ${normalizeBatchExpr} AS batch_norm, COUNT(*) AS cnt
     FROM inventory
     GROUP BY product_id, warehouse_id, ${normalizeBatchExpr}
     HAVING COUNT(*) > 1
     ORDER BY product_id, warehouse_id`
    );
    return res.rows;
};

const loadGroupRows = async (client, productId, warehouseId, batchNorm) => {
    const res = await client.query(
        `SELECT id, product_id, warehouse_id, quantity, reserved_quantity, expiry_date, batch_number
     FROM inventory
     WHERE product_id = $1 AND warehouse_id = $2 AND COALESCE(batch_number, '') = $3
     ORDER BY id`,
        [productId, warehouseId, batchNorm]
    );
    return res.rows;
};

const mergeGroup = async (client, rows) => {
    const keeper = rows[0];
    const duplicates = rows.slice(1);
    const totalQty = rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
    const totalReserved = rows.reduce((s, r) => s + Number(r.reserved_quantity || 0), 0);
    const expiryDates = rows.map((r) => r.expiry_date).filter(Boolean).sort();
    const chosenExpiry = expiryDates.length ? expiryDates[0] : null;

    console.log(`\nProduct ${keeper.product_id} @ warehouse ${keeper.warehouse_id} batch='${keeper.batch_number}'`);
    console.table(rows.map(r => ({ id: r.id, quantity: r.quantity, reserved: r.reserved_quantity, expiry: r.expiry_date, batch: r.batch_number })));

    if (!shouldApply) return;

    await client.query(
        `UPDATE inventory SET quantity = $1, reserved_quantity = $2, expiry_date = $3, updated_at = NOW() WHERE id = $4`,
        [totalQty, totalReserved, chosenExpiry, keeper.id]
    );

    const duplicateIds = duplicates.map(r => r.id);
    await client.query(`DELETE FROM inventory WHERE id = ANY($1::int[])`, [duplicateIds]);
    console.log(`Merged ${duplicateIds.length} rows into id ${keeper.id}`);
};

const main = async () => {
    const client = await pool.connect();
    try {
        if (!shouldApply) console.log('Dry-run: no changes will be applied. Re-run with --apply to commit.');
        await client.query('BEGIN');

        const groups = await findDuplicateGroups(client);
        if (!groups.length) {
            console.log('No duplicate inventory groups found.');
            await client.query('ROLLBACK');
            return;
        }

        for (const g of groups) {
            const rows = await loadGroupRows(client, g.product_id, g.warehouse_id, g.batch_norm);
            await mergeGroup(client, rows);
        }

        if (shouldApply) {
            await client.query('COMMIT');
            console.log('\nApplied inventory merges.');
        } else {
            await client.query('ROLLBACK');
            console.log('\nDry-run complete. No changes saved.');
        }
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
};

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
