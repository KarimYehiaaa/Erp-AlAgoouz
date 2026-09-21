import { describe, it, expect } from 'vitest';
import { query } from '../src/database/pool.ts';
import {
  createStocktake,
  getStocktakeDetails,
  updateStocktakeItems,
  completeStocktake,
  deleteStocktake,
} from '../src/services/stocktakeService.ts';

describe('Stocktake Lifecycle Integration Tests', () => {
  it('Full stocktake lifecycle integration test', async () => {
    // Pre-cleanup in case of previous aborted runs
    await query(
      `DELETE FROM stock_movements WHERE notes LIKE '%معرف الجرد%' OR notes LIKE '%جرد مخازن%'`,
    );
    await query(
      `DELETE FROM inventory WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code = 'TST-WH')`,
    );
    await query(
      `DELETE FROM stocktake_items WHERE product_id IN (SELECT id FROM products WHERE sku = 'SKU-TST-1')`,
    );
    await query(
      `DELETE FROM stocktakes WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code = 'TST-WH')`,
    );
    await query(`DELETE FROM products WHERE sku = 'SKU-TST-1'`);
    await query(`DELETE FROM product_categories WHERE name_ar = 'تصنيف اختبار الجرد'`);
    await query(`DELETE FROM warehouses WHERE code = 'TST-WH'`);

    let warehouseId: number | undefined;
    let categoryId: number | undefined;
    let productId: number | undefined;

    try {
      // 1. Setup temporary test data (warehouse, product, inventory)
      const whRes = await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
         VALUES ('TST-WH', 'مخزن اختبار الجرد', 'store', true)
         RETURNING id`,
      );
      warehouseId = whRes.rows[0].id;

      const catRes = await query(
        `INSERT INTO product_categories (name_ar)
         VALUES ('تصنيف اختبار الجرد')
         RETURNING id`,
      );
      categoryId = catRes.rows[0].id;

      const prodRes = await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, is_active)
         VALUES ('SKU-TST-1', 'منتج اختبار جرد 1', 10.00, 15.00, $1, true)
         RETURNING id`,
        [categoryId],
      );
      productId = prodRes.rows[0].id;

      // Insert initial inventory quantity of 10
      await query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity)
         VALUES ($1, $2, 10.000)`,
        [productId, warehouseId],
      );

      // Get a valid user ID for creator
      const userRes = await query(`SELECT id FROM users LIMIT 1`);
      const userId = userRes.rows[0].id;

      // 2. Test createStocktake
      const stocktake = await createStocktake(warehouseId!, userId, 'ملاحظات جرد تجريبي');
      expect(stocktake.id).toBeDefined();
      expect(stocktake.status).toBe('draft');
      expect(stocktake.warehouse_id).toBe(warehouseId);

      // 3. Test getStocktakeDetails
      const details = await getStocktakeDetails(stocktake.id);
      const testItem = details.items.find((item: any) => item.product_id === productId);
      expect(testItem).toBeDefined();
      expect(Number(testItem.system_quantity)).toBe(10);
      expect(testItem.actual_quantity).toBeNull();

      // 4. Test updateStocktakeItems (input actual quantity = 15, so surplus of +5)
      await updateStocktakeItems(stocktake.id, {
        items: [{ product_id: productId, actual_quantity: 15 }],
        notes: 'تحديث ملاحظات الجرد',
      });

      const updatedDetails = await getStocktakeDetails(stocktake.id);
      const updatedTestItem = updatedDetails.items.find((item: any) => item.product_id === productId);
      expect(updatedTestItem).toBeDefined();
      expect(Number(updatedTestItem.actual_quantity)).toBe(15);
      expect(Number(updatedTestItem.difference)).toBe(5);

      // 5. Test completeStocktake (reconcile)
      const result = await completeStocktake(stocktake.id, userId);
      expect(result.success).toBe(true);
      expect(Number(result.total_surplus_value)).toBe(50.0);
      expect(Number(result.total_deficit_value)).toBe(0.0);

      // Check database to ensure inventory is updated to 15
      const invRes = await query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
        [productId, warehouseId],
      );
      expect(Number(invRes.rows[0].quantity)).toBe(15);

      // Check that a stock movement of type 'adjustment' was created
      const smRes = await query(
        `SELECT * FROM stock_movements
         WHERE product_id = $1 AND to_warehouse_id = $2 AND movement_type = 'adjustment'`,
        [productId, warehouseId],
      );
      expect(smRes.rows.length).toBe(1);
      expect(Number(smRes.rows[0].quantity)).toBe(5);

      // 6. Test deleteStocktake fails for completed stocktakes
      await expect(deleteStocktake(stocktake.id)).rejects.toThrow(/لا يمكن حذف عملية جرد تم اعتمادها/);
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
});
