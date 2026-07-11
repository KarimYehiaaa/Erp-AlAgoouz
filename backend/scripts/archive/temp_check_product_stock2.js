import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bin_al_ajouz',
  user: process.env.DB_USER || 'erp_user',
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    console.log("=== Checking Product (ID 74) and Recipe ===");
    const recipeRes = await pool.query(
      `SELECT pr.* FROM product_recipes pr WHERE pr.product_id = 74;`
    );
    console.log("Recipe:", recipeRes.rows);

    const recipeIds = recipeRes.rows.map(r => r.id);
    const itemsRes = await pool.query(
      `SELECT pri.*, p.name_ar as ingredient_name 
       FROM product_recipe_items pri
       JOIN products p ON pri.ingredient_product_id = p.id
       WHERE pri.recipe_id = ANY($1);`,
      [recipeIds]
    );
    console.log("Recipe components:", itemsRes.rows);

    const ingredientIds = itemsRes.rows.map(i => i.ingredient_product_id);
    const allProductIds = [74, ...ingredientIds];

    console.log("\n=== Checking Inventory balances ===");
    const inventoryRes = await pool.query(
      `SELECT i.*, p.name_ar, w.name_ar as warehouse_name 
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       JOIN warehouses w ON i.warehouse_id = w.id
       WHERE i.product_id = ANY($1)
       ORDER BY i.product_id, i.warehouse_id;`,
      [allProductIds]
    );
    console.log("Inventory balances:");
    console.table(inventoryRes.rows.map(r => ({
      product_id: r.product_id,
      name_ar: r.name_ar,
      warehouse: r.warehouse_name,
      quantity: r.quantity
    })));

    console.log("\n=== Checking Stock Movements for Product 74 ===");
    const movementsRes = await pool.query(
      `SELECT sm.id, sm.movement_type, sm.quantity, sm.from_warehouse_id, sm.to_warehouse_id, 
              sm.reference_type, sm.reference_id, sm.notes, sm.created_at, sm.unit_cost, sm.total_cost
       FROM stock_movements sm
       WHERE sm.product_id = 74
       ORDER BY sm.created_at DESC;`
    );
    console.log("Stock movements for product 74:");
    console.table(movementsRes.rows.map(r => ({
      id: r.id,
      type: r.movement_type,
      qty: r.quantity,
      from: r.from_warehouse_id,
      to: r.to_warehouse_id,
      ref_type: r.reference_type,
      ref_id: r.reference_id,
      notes: r.notes,
      date: r.created_at
    })));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
