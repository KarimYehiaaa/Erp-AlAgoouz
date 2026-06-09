import pool from '../src/database/pool.js';

const client = await pool.connect();

try {
  await client.query('BEGIN');

  const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
  const userId = Number(userRes.rows[0]?.id || 1);

  const storeRes = await client.query(
    `SELECT id, name_ar
     FROM warehouses
     WHERE code = 'STORE'
       AND deleted_at IS NULL
       AND is_active = TRUE
     LIMIT 1`
  );
  const store = storeRes.rows[0];
  if (!store) throw new Error('STORE warehouse was not found');

  const recipeProductsRes = await client.query(
    `SELECT DISTINCT p.id, p.sku, p.name_ar
     FROM products p
     JOIN product_recipes r ON r.product_id = p.id
     WHERE p.deleted_at IS NULL
       AND r.deleted_at IS NULL
       AND r.is_active = TRUE
     ORDER BY p.id`
  );

  const moved = [];
  for (const product of recipeProductsRes.rows) {
    await client.query(
      `UPDATE products
       SET primary_warehouse_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [store.id, product.id]
    );

    const rows = await client.query(
      `SELECT i.id, i.warehouse_id, w.name_ar AS warehouse_name, i.quantity
       FROM inventory i
       JOIN warehouses w ON w.id = i.warehouse_id
       WHERE i.product_id = $1
         AND i.warehouse_id <> $2
         AND i.quantity > 0
       FOR UPDATE`,
      [product.id, store.id]
    );

    for (const row of rows.rows) {
      const qty = Number(row.quantity || 0);
      if (qty <= 0) continue;

      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity)
         VALUES ($1, $2, 0)
         ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING`,
        [product.id, store.id]
      );
      await client.query(
        `UPDATE inventory
         SET quantity = quantity - $1, updated_at = NOW()
         WHERE id = $2`,
        [qty, row.id]
      );
      await client.query(
        `UPDATE inventory
         SET quantity = quantity + $1, updated_at = NOW()
         WHERE product_id = $2
           AND warehouse_id = $3
           AND COALESCE(batch_number, '') = ''`,
        [qty, product.id, store.id]
      );
      await client.query(
        `INSERT INTO stock_movements (
           product_id, from_warehouse_id, to_warehouse_id, movement_type,
           quantity, reference_type, user_id, notes
         ) VALUES ($1, $2, $3, 'transfer', $4, 'recipe_stock_consolidation', $5, $6)`,
        [
          product.id,
          row.warehouse_id,
          store.id,
          qty,
          userId,
          `Consolidated final recipe product stock into STORE (${store.name_ar})`,
        ]
      );

      moved.push({
        product_id: product.id,
        sku: product.sku,
        name_ar: product.name_ar,
        from_warehouse_id: row.warehouse_id,
        from_warehouse_name: row.warehouse_name,
        to_warehouse_id: store.id,
        to_warehouse_name: store.name_ar,
        quantity: qty,
      });
    }
  }

  await client.query(
    `DELETE FROM inventory i
     USING product_recipes r
     WHERE i.product_id = r.product_id
       AND i.warehouse_id <> $1
       AND i.quantity = 0
       AND r.deleted_at IS NULL
       AND r.is_active = TRUE`,
    [store.id]
  );

  await client.query('COMMIT');
  console.log(JSON.stringify({ ok: true, store, recipe_products: recipeProductsRes.rowCount, moved }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
