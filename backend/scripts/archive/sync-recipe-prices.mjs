import { getClient } from './src/database/pool.js';
import pool from './src/database/pool.js';
import { getProductsEffectiveCosts } from './src/services/productCostService.js';

async function syncRecipePrices() {
  const client = await getClient();
  try {
    console.log('--- Syncing Database Purchase Prices for Recipes ---');
    
    // Find all products that have an active recipe
    const resProducts = await client.query(`
      SELECT p.id, p.name_ar, p.purchase_price
      FROM products p
      WHERE EXISTS (
        SELECT 1 FROM product_recipes r
        WHERE r.product_id = p.id AND r.deleted_at IS NULL AND r.is_active = TRUE
      )
    `);
    
    const products = resProducts.rows;
    console.log(`Found ${products.length} products with active recipes.`);
    
    if (products.length === 0) return;

    const ids = products.map(p => p.id);
    const costs = await getProductsEffectiveCosts(client, ids);
    
    let updatedCount = 0;
    
    await client.query('BEGIN');
    
    for (const product of products) {
      const effective = costs.get(Number(product.id));
      if (effective && effective.cost > 0 && effective.cost !== Number(product.purchase_price || 0)) {
        await client.query(
          `UPDATE products SET purchase_price = $1, updated_at = NOW() WHERE id = $2`,
          [effective.cost, product.id]
        );
        console.log(`Updated ${product.name_ar}: ${product.purchase_price} -> ${effective.cost}`);
        updatedCount++;
      }
    }
    
    await client.query('COMMIT');
    console.log(`Successfully synced ${updatedCount} products.`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

syncRecipePrices();
