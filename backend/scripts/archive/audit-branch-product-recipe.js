import pool from '../src/database/pool.js';

async function main() {
  console.log('=== AUDITING BRANCH PRODUCT FOR "قهوة تركى سنجل" (ID 77) ===');
  
  // 1. Warehouse 1 (MAIN)
  const resWH1 = await pool.query(`
    SELECT
      p.id, p.name_ar,
      COALESCE((
        SELECT json_agg(json_build_object(
          'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name_ar,
          'quantity', ri.quantity,
          'unit_code', ri.unit_code,
          'stock_available', COALESCE((SELECT SUM(ii.quantity) FROM inventory ii WHERE ii.product_id = ri.ingredient_product_id AND ii.warehouse_id = $1), 0)
        ))
        FROM product_recipe_items ri
        JOIN products ip ON ip.id = ri.ingredient_product_id
        WHERE ri.recipe_id = r.id
      ), '[]'::json) AS recipe_items
    FROM products p
    LEFT JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
    WHERE p.id = 77
  `, [1]);
  
  console.log('\nWarehouse 1 (MAIN):');
  console.log(JSON.stringify(resWH1.rows[0], null, 2));

  // 2. Warehouse 2 (STORE)
  const resWH2 = await pool.query(`
    SELECT
      p.id, p.name_ar,
      COALESCE((
        SELECT json_agg(json_build_object(
          'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name_ar,
          'quantity', ri.quantity,
          'unit_code', ri.unit_code,
          'stock_available', COALESCE((SELECT SUM(ii.quantity) FROM inventory ii WHERE ii.product_id = ri.ingredient_product_id AND ii.warehouse_id = $1), 0)
        ))
        FROM product_recipe_items ri
        JOIN products ip ON ip.id = ri.ingredient_product_id
        WHERE ri.recipe_id = r.id
      ), '[]'::json) AS recipe_items
    FROM products p
    LEFT JOIN product_recipes r ON r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
    WHERE p.id = 77
  `, [2]);
  
  console.log('\nWarehouse 2 (STORE):');
  console.log(JSON.stringify(resWH2.rows[0], null, 2));
}

main().catch(console.error).finally(() => pool.end());
