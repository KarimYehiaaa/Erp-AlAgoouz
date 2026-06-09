import pool from '../src/database/pool.js';

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
};

const shouldApply = args.includes('--apply');
const targetName = getArg('--name');
const keepId = Number(getArg('--keep') || 0);

const normalizeExpr = (column) => `lower(regexp_replace(trim(${column}), '\\s+', ' ', 'g'))`;

const tableExists = async (client, tableName) => {
  const result = await client.query(`SELECT to_regclass($1) AS name`, [tableName]);
  return Boolean(result.rows[0]?.name);
};

const loadDuplicateGroups = async (client) => {
  const params = [];
  let where = `deleted_at IS NULL`;
  if (targetName) {
    params.push(targetName);
    where += ` AND ${normalizeExpr('name_ar')} = ${normalizeExpr('$1')}`;
  }

  const result = await client.query(
    `WITH product_usage AS (
       SELECT
         p.id,
         p.sku,
         p.name_ar,
         p.unit,
         p.purchase_price,
         p.sale_price,
         ${normalizeExpr('p.name_ar')} AS norm_name,
         COALESCE(inv.total_stock, 0) AS total_stock,
         COALESCE(recipe_usage.used_in_recipe_items, 0) AS used_in_recipe_items,
         COALESCE(own_recipes.own_recipes, 0) AS own_recipes
       FROM products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity) AS total_stock
         FROM inventory
         GROUP BY product_id
       ) inv ON inv.product_id = p.id
       LEFT JOIN (
         SELECT ingredient_product_id AS product_id, COUNT(*) AS used_in_recipe_items
         FROM product_recipe_items
         GROUP BY ingredient_product_id
       ) recipe_usage ON recipe_usage.product_id = p.id
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS own_recipes
         FROM product_recipes
         WHERE deleted_at IS NULL
         GROUP BY product_id
       ) own_recipes ON own_recipes.product_id = p.id
       WHERE ${where}
     )
     SELECT norm_name, json_agg(product_usage ORDER BY id) AS products
     FROM product_usage
     GROUP BY norm_name
     HAVING COUNT(*) > 1
     ORDER BY norm_name`,
    params
  );
  return result.rows;
};

const chooseKeeper = (products) => {
  if (keepId) {
    const chosen = products.find((product) => Number(product.id) === keepId);
    if (!chosen) throw new Error(`--keep ${keepId} is not in the duplicate group`);
    return chosen;
  }

  return [...products].sort((a, b) => {
    const score = (p) =>
      (Number(p.purchase_price || 0) > 0 ? 100000 : 0) +
      Number(p.used_in_recipe_items || 0) * 1000 +
      (Number(p.total_stock || 0) > 0 ? 100 : 0) +
      Number(p.total_stock || 0);
    return score(b) - score(a) || Number(a.id) - Number(b.id);
  })[0];
};

const mergeGroup = async (client, group) => {
  const products = group.products;
  const keeper = chooseKeeper(products);
  const duplicates = products.filter((product) => Number(product.id) !== Number(keeper.id));
  const duplicateIds = duplicates.map((product) => Number(product.id));

  console.log(`\n${group.norm_name}`);
  console.table(products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name_ar,
    unit: p.unit,
    purchase_price: p.purchase_price,
    stock: p.total_stock,
    used_in_recipes: p.used_in_recipe_items,
    own_recipes: p.own_recipes,
    action: Number(p.id) === Number(keeper.id) ? 'KEEP' : 'MERGE',
  })));

  if (!duplicateIds.length) return;

  for (const duplicateId of duplicateIds) {
    const inventoryRows = (await client.query(
      `SELECT warehouse_id, quantity, reserved_quantity, expiry_date, batch_number
       FROM inventory
       WHERE product_id = $1`,
      [duplicateId]
    )).rows;

    for (const row of inventoryRows) {
      await client.query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity, reserved_quantity, expiry_date, batch_number)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, ''))
         DO UPDATE SET
           quantity = inventory.quantity + EXCLUDED.quantity,
           reserved_quantity = COALESCE(inventory.reserved_quantity, 0) + COALESCE(EXCLUDED.reserved_quantity, 0),
           updated_at = NOW()`,
        [keeper.id, row.warehouse_id, row.quantity, row.reserved_quantity || 0, row.expiry_date, row.batch_number]
      );
    }
  }

  await client.query(`DELETE FROM inventory WHERE product_id = ANY($1::int[])`, [duplicateIds]);
  await client.query(`UPDATE product_recipe_items SET ingredient_product_id = $1 WHERE ingredient_product_id = ANY($2::int[])`, [keeper.id, duplicateIds]);
  await client.query(`UPDATE sale_items SET product_id = $1 WHERE product_id = ANY($2::int[])`, [keeper.id, duplicateIds]);
  await client.query(`UPDATE stock_movements SET product_id = $1 WHERE product_id = ANY($2::int[])`, [keeper.id, duplicateIds]);

  if (await tableExists(client, 'invoice_items')) {
    await client.query(`UPDATE invoice_items SET product_id = $1 WHERE product_id = ANY($2::int[])`, [keeper.id, duplicateIds]);
  }

  if (await tableExists(client, 'purchase_invoice_items')) {
    await client.query(`UPDATE purchase_invoice_items SET product_id = $1 WHERE product_id = ANY($2::int[])`, [keeper.id, duplicateIds]);
  }

  await client.query(
    `UPDATE product_recipes
     SET product_id = $1, updated_at = NOW()
     WHERE product_id = ANY($2::int[])
       AND deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM product_recipes existing
         WHERE existing.product_id = $1
           AND existing.deleted_at IS NULL
       )`,
    [keeper.id, duplicateIds]
  );

  await client.query(
    `UPDATE products
     SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
     WHERE id = ANY($1::int[])`,
    [duplicateIds]
  );
};

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groups = await loadDuplicateGroups(client);
    if (!groups.length) {
      console.log(targetName ? `No active duplicate products found for "${targetName}".` : 'No active duplicate products found.');
      await client.query('ROLLBACK');
      return;
    }

    for (const group of groups) {
      await mergeGroup(client, group);
    }

    if (shouldApply) {
      await client.query('COMMIT');
      console.log('\nApplied duplicate product merge.');
    } else {
      await client.query('ROLLBACK');
      console.log('\nDry-run only. Re-run with --apply to save changes.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
