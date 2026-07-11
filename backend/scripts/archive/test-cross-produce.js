import { produceRecipeBatch } from '../src/services/recipesService.js';
import { getClient } from '../src/database/pool.js';

async function testProduce() {
  try {
    console.log('Testing produceRecipeBatch for recipe 7 (قهوة تركى سنجل) targeting warehouse 1 (MAIN)...');
    
    await produceRecipeBatch({
      recipeId: 7,
      quantity: 1,
      warehouseId: 1, // MAIN
      notes: 'Test production cross-warehouse',
      mode: 'production'
    }, 1);

    console.log('Production successful!');
    
    const client = await getClient();
    const invRes = await client.query('SELECT product_id, warehouse_id, quantity FROM inventory WHERE product_id IN (54, 74, 77) ORDER BY product_id, warehouse_id');
    console.log('Inventory post-production:');
    console.table(invRes.rows);
    
    process.exit(0);
  } catch (err) {
    console.error('Production failed:', err.message);
    process.exit(1);
  }
}

testProduce();
