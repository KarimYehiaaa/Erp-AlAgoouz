import test from 'node:test';
import assert from 'node:assert/strict';
import pool, { query } from '../src/database/pool.js';
import { 
  createStocktake, 
  getStocktakeDetails, 
  updateStocktakeItems, 
  completeStocktake,
  deleteStocktake
} from '../src/services/stocktakeService.ts';

test.after(async () => {
  await pool.end();
});

test('Full stocktake lifecycle integration test', async () => {
  // Pre-cleanup in case of previous aborted runs
  await query(`DELETE FROM stock_movements WHERE notes LIKE '%معرف الجرد%' OR notes LIKE '%جرد مخازن%'`);
  await query(`DELETE FROM inventory WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code = 'TST-WH')`);
  await query(`DELETE FROM stocktake_items WHERE product_id IN (SELECT id FROM products WHERE sku = 'SKU-TST-1')`);
  await query(`DELETE FROM stocktakes WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code = 'TST-WH')`);
  await query(`DELETE FROM products WHERE sku = 'SKU-TST-1'`);
  await query(`DELETE FROM product_categories WHERE name_ar = 'تصنيف اختبار الجرد'`);
  await query(`DELETE FROM warehouses WHERE code = 'TST-WH'`);

  let warehouseId, categoryId, productId;

  try {
    // 1. Setup temporary test data (warehouse, product, inventory)
    const whRes = await query(
      `INSERT INTO warehouses (code, name_ar, type, is_active) 
       VALUES ('TST-WH', 'مخزن اختبار الجرد', 'store', true) 
       RETURNING id`
    );
    warehouseId = whRes.rows[0].id;

    const catRes = await query(
      `INSERT INTO product_categories (name_ar) 
       VALUES ('تصنيف اختبار الجرد') 
       RETURNING id`
    );
    categoryId = catRes.rows[0].id;

    const prodRes = await query(
      `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, is_active) 
       VALUES ('SKU-TST-1', 'منتج اختبار جرد 1', 10.00, 15.00, $1, true) 
       RETURNING id`,
      [categoryId]
    );
    productId = prodRes.rows[0].id;

    // Insert initial inventory quantity of 10
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) 
       VALUES ($1, $2, 10.000)`,
      [productId, warehouseId]
    );

    // Get a valid user ID for creator
    const userRes = await query(`SELECT id FROM users LIMIT 1`);
    const userId = userRes.rows[0].id;

    // 2. Test createStocktake
    const stocktake = await createStocktake(warehouseId, userId, 'ملاحظات جرد تجريبي');
    assert.ok(stocktake.id, 'Should generate stocktake ID');
    assert.equal(stocktake.status, 'draft', 'Status should be draft initially');
    assert.equal(stocktake.warehouse_id, warehouseId, 'Warehouse ID should match');

    // 3. Test getStocktakeDetails
    const details = await getStocktakeDetails(stocktake.id);
    const testItem = details.items.find(item => item.product_id === productId);
    assert.ok(testItem, 'Test product should be in the stocktake items');
    assert.equal(Number(testItem.system_quantity), 10, 'System quantity should be 10');
    assert.equal(testItem.actual_quantity, null, 'Actual quantity should be null initially');

    // 4. Test updateStocktakeItems (input actual quantity = 15, so surplus of +5)
    await updateStocktakeItems(stocktake.id, {
      items: [{ product_id: productId, actual_quantity: 15 }],
      notes: 'تحديث ملاحظات الجرد'
    });

    const updatedDetails = await getStocktakeDetails(stocktake.id);
    const updatedTestItem = updatedDetails.items.find(item => item.product_id === productId);
    assert.ok(updatedTestItem, 'Test product should be in the updated stocktake items');
    assert.equal(Number(updatedTestItem.actual_quantity), 15, 'Actual quantity should be updated to 15');
    assert.equal(Number(updatedTestItem.difference), 5, 'Difference should be +5');

    // 5. Test completeStocktake (reconcile)
    const result = await completeStocktake(stocktake.id, userId);
    assert.equal(result.success, true, 'Reconciliation should succeed');
    assert.equal(Number(result.total_surplus_value), 50.00, 'Surplus value should be 5 * 10 = 50');
    assert.equal(Number(result.total_deficit_value), 0.00, 'Deficit value should be 0');

    // Check database to ensure inventory is updated to 15
    const invRes = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId]
    );
    assert.equal(Number(invRes.rows[0].quantity), 15, 'Inventory quantity should be reconciled to 15');

    // Check that a stock movement of type 'adjustment' was created
    const smRes = await query(
      `SELECT * FROM stock_movements 
       WHERE product_id = $1 AND to_warehouse_id = $2 AND movement_type = 'adjustment'`,
      [productId, warehouseId]
    );
    assert.equal(smRes.rows.length, 1, 'Should record one adjustment stock movement');
    assert.equal(Number(smRes.rows[0].quantity), 5, 'Movement quantity should be 5');

    // 6. Test deleteStocktake fails for completed stocktakes
    await assert.rejects(
      async () => {
        await deleteStocktake(stocktake.id);
      },
      /لا يمكن حذف عملية جرد تم اعتمادها/
    );

  } finally {
    // 7. Cleanup database records in reverse order
    if (productId) {
      await query(`DELETE FROM stock_movements WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM stocktake_items WHERE product_id = $1`, [productId]);
    }
    if (warehouseId) {
      await query(`DELETE FROM stocktakes WHERE warehouse_id = $1`, [warehouseId]);
    }
    if (productId) {
      await query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
    if (categoryId) {
      await query(`DELETE FROM product_categories WHERE id = $1`, [categoryId]);
    }
    if (warehouseId) {
      await query(`DELETE FROM warehouses WHERE id = $1`, [warehouseId]);
    }
  }
});
