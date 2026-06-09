import pool from '../src/database/pool.js';

const NAME = process.argv[2] || 'اسبريسو خام';

const normalize = (s) => (String(s || '').trim().replace(/\s+/g, ' ').toLowerCase());

const main = async () => {
    const client = await pool.connect();
    try {
        console.log(`Searching products matching: "${NAME}"`);
        const norm = normalize(NAME);

        const prodRes = await client.query(
            `SELECT id, sku, name_ar, purchase_price, sale_price, is_active, deleted_at
       FROM products
       WHERE deleted_at IS NULL
         AND lower(regexp_replace(trim(name_ar), '\\s+', ' ', 'g')) = $1
       ORDER BY id`,
            [norm]
        );

        console.log('Products found:', prodRes.rows.length);
        console.table(prodRes.rows);

        if (!prodRes.rows.length) {
            console.log('No exact normalized-name match; trying ILIKE search...');
            const likeRes = await client.query(
                `SELECT id, sku, name_ar, purchase_price, sale_price, is_active, deleted_at
         FROM products
         WHERE deleted_at IS NULL AND name_ar ILIKE $1
         ORDER BY id`,
                [`%${NAME}%`]
            );
            console.log('ILIKE results:', likeRes.rows.length);
            console.table(likeRes.rows);
        }

        const ids = prodRes.rows.length ? prodRes.rows.map(r => r.id) : [];
        if (ids.length) {
            const inv = await client.query(
                `SELECT id, product_id, warehouse_id, quantity, reserved_quantity, batch_number, expiry_date
         FROM inventory
         WHERE product_id = ANY($1::int[])
         ORDER BY warehouse_id, id`,
                [ids]
            );
            console.log('Inventory rows for matched products:', inv.rows.length);
            console.table(inv.rows);
        }

        // Also check for inventory rows referencing products whose name contains the phrase
        const invByName = await client.query(
            `SELECT i.id, i.product_id, p.name_ar, i.warehouse_id, i.quantity, i.batch_number
       FROM inventory i JOIN products p ON p.id = i.product_id
       WHERE p.deleted_at IS NULL AND p.name_ar ILIKE $1
       ORDER BY p.id, i.warehouse_id, i.id`,
            [`%${NAME}%`]
        );
        console.log('Inventory rows with product name ILIKE:', invByName.rows.length);
        console.table(invByName.rows);

    } catch (err) {
        console.error(err.message || err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
};

main();
