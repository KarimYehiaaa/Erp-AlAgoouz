import { getClient } from './src/database/pool.js';
import pool from './src/database/pool.js';

async function auditEspressoPrices() {
  const client = await getClient();
  try {
    console.log('--- Auditing Espresso Products ---');
    
    // 1. Find the exact IDs and info for the mentioned products
    const resProducts = await client.query(`
      SELECT id, name_ar as name, purchase_price, unit
      FROM products 
      WHERE name_ar LIKE '%أسبريسو سنجل%' OR name_ar LIKE '%اسبريسو ميكاتو سنجل%' OR name_ar LIKE '%اسبريسو سنجل%' OR name_ar LIKE '%أسبريسو ميكاتو سنجل%'
    `);
    
    const products = resProducts.rows;
    console.log('Target Products:', products);

    for (const product of products) {
      console.log(`\n--- Product: ${product.name} (ID: ${product.id}) ---`);
      
      // 2. Find their recipes
      const resRecipe = await client.query(`
        SELECT id as recipe_id FROM product_recipes WHERE product_id = $1
      `, [product.id]);
      
      if (resRecipe.rows.length === 0) {
        console.log(`No recipe found for this product.`);
        continue;
      }
      
      const recipeId = resRecipe.rows[0].recipe_id;
      console.log(`Recipe ID: ${recipeId}`);
      
      // 3. Find recipe items and their costs
      const resRecipeItems = await client.query(`
        SELECT 
          ri.ingredient_product_id as material_id, 
          m.name_ar as material_name, 
          ri.quantity, 
          m.purchase_price as material_cost,
          (ri.quantity * m.purchase_price) as total_item_cost
        FROM product_recipe_items ri
        JOIN products m ON ri.ingredient_product_id = m.id
        WHERE ri.recipe_id = $1
      `, [recipeId]);
      
      const items = resRecipeItems.rows;
      let calculatedCost = 0;
      
      console.log('Recipe Items:');
      for (const item of items) {
        console.log(`  - Material: ${item.material_name} (ID: ${item.material_id})`);
        console.log(`    Quantity: ${item.quantity}`);
        console.log(`    Material Cost: ${item.material_cost}`);
        console.log(`    Total Item Cost: ${item.total_item_cost}`);
        calculatedCost += parseFloat(item.total_item_cost || 0);
      }
      
      console.log(`\nCalculated Recipe Cost: ${calculatedCost}`);
      console.log(`Current Product Purchase Price: ${product.purchase_price}`);
      
      if (calculatedCost !== parseFloat(product.purchase_price || 0)) {
        console.log(`MISMATCH: Current price is ${product.purchase_price}, but calculated cost is ${calculatedCost}`);
      } else {
        console.log(`MATCH: Cost calculation is correct.`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

auditEspressoPrices();
