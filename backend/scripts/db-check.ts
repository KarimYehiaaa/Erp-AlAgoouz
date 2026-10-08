/** Read-only counts use exactly the same DATABASE_URL/TLS policy as the application. */
import { query, closePool } from '../src/database/pool.ts';
try {
  const checks = {
    PRODUCTS:
      'SELECT COUNT(*) AS total_products, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_products FROM products',
    INVENTORY:
      'SELECT COUNT(*) AS inventory_rows, COALESCE(SUM(quantity),0) AS total_stock FROM inventory',
    RECIPES:
      'SELECT COUNT(*) AS total_recipes, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_recipes FROM product_recipes',
    RECIPE_ITEMS: 'SELECT COUNT(*) AS product_recipe_items FROM product_recipe_items',
  };
  for (const [label, sql] of Object.entries(checks)) console.log(label, (await query(sql)).rows);
} catch {
  console.error('Database counts check failed; check the application connection settings.');
  process.exitCode = 1;
} finally {
  await closePool();
}
