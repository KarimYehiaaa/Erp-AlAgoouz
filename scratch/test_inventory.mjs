import { inventoryRepository } from 'file:///d:/AlAgoouz%20System/AlAgoouz-erp/backend/src/repositories/inventory.repository.js';
import { query, getClient } from 'file:///d:/AlAgoouz%20System/AlAgoouz-erp/backend/src/database/pool.js';
import { roundMoney } from 'file:///d:/AlAgoouz%20System/AlAgoouz-erp/backend/src/utils/money.js';

async function testInventory() {
  const client = await getClient();
  let productId = null;
  let warehouse1 = null;
  let warehouse2 = null;

  try {
    await client.query('BEGIN');
    
    // 1. Create a dummy product
    const prodRes = await client.query(`
      INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, category_id, is_active)
      VALUES ('TEST-INV-1', 'Test Inv Product', 5, 150, 80, 1, true)
      RETURNING id
    `);
    productId = prodRes.rows[0].id;

    // 2. Create two dummy warehouses
    const w1Res = await client.query(`
      INSERT INTO warehouses (name_ar, code, type, is_active)
      VALUES ('Test W1 MAIN', 'TW1', 'main', true)
      RETURNING id
    `);
    warehouse1 = w1Res.rows[0].id;

    const w2Res = await client.query(`
      INSERT INTO warehouses (name_ar, code, type, is_active)
      VALUES ('Test W2 BRANCH', 'TW2', 'branch', true)
      RETURNING id
    `);
    warehouse2 = w2Res.rows[0].id;

    // 3. Insert inventory
    // Insert 0.1 + 0.2 logic to test float issues
    await client.query(`
      INSERT INTO inventory (product_id, warehouse_id, quantity)
      VALUES ($1, $2, $3)
    `, [productId, warehouse1, 0.1]);

    await client.query(`
      UPDATE inventory 
      SET quantity = quantity + 0.2
      WHERE product_id = $1 AND warehouse_id = $2
    `, [productId, warehouse1]);

    // Insert 0.5 in branch
    await client.query(`
      INSERT INTO inventory (product_id, warehouse_id, quantity)
      VALUES ($1, $2, $3)
    `, [productId, warehouse2, 0.5]);

    // 4. Fetch via repository (but repository uses generic pool, so it won't see the uncommitted transaction!)
    // Wait, since repository uses `query`, it will run outside this client transaction.
    // So we must commit to test it properly, then clean up afterwards.
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    client.release();
    console.error("Setup error:", e);
    process.exit(1);
  }
  client.release();

  try {
    // 5. Test the repository
    const inventoryList = await inventoryRepository.getInventoryList();
    const testItem = inventoryList.find(i => i.product_id === productId);
    
    console.log('--- Inventory Repository Test Results ---');
    console.log(`Product found: ${!!testItem}`);
    if (testItem) {
      console.log(`Main Stock: ${testItem.main_quantity}`); // Expected: 0.3
      console.log(`Branch Stock: ${testItem.branch_quantity}`); // Expected: 0.5
      console.log(`Total Stock: ${testItem.total_quantity}`); // Expected: 0.8
      
      const expectedTotal = 0.8;
      const expectedMain = 0.3;
      
      // Because NUMERIC returns strings from node-postgres or numbers if parsed, we compare carefully
      const mQty = roundMoney(testItem.main_quantity);
      if (mQty !== expectedMain) {
         console.error(`❌ Floating point error detected! Main Stock is ${mQty}, expected ${expectedMain}`);
      } else {
         console.log(`✅ Main stock correctly rounded: ${mQty}`);
      }
    }
  } finally {
    // Cleanup
    console.log('Cleaning up test data...');
    await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
    await query(`DELETE FROM products WHERE id = $1`, [productId]);
    await query(`DELETE FROM warehouses WHERE id IN ($1, $2)`, [warehouse1, warehouse2]);
    console.log('Done.');
    process.exit(0);
  }
}

testInventory();
