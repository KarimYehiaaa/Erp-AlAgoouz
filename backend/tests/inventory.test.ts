import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inventoryRepository } from '../src/repositories/inventory.repository';
import { query } from '../src/database/pool';
import { roundMoney } from '../src/utils/money';

describe('Inventory Calculations', () => {
  let productId: number;
  let warehouse1: number;
  let warehouse2: number;

  beforeAll(async () => {
    // Setup dummy data
    const prodRes = await query(`
      INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, category_id, is_active)
      VALUES ('TEST-INV-VITEST-1', 'Test Inv Product Vitest', 5, 150, 80, 1, true)
      RETURNING id
    `);
    productId = prodRes.rows[0].id;

    const w1Res = await query(`
      INSERT INTO warehouses (name_ar, code, type, is_active)
      VALUES ('Test W1 MAIN VITEST', 'TW1V', 'main', true)
      RETURNING id
    `);
    warehouse1 = w1Res.rows[0].id;

    const w2Res = await query(`
      INSERT INTO warehouses (name_ar, code, type, is_active)
      VALUES ('Test W2 BRANCH VITEST', 'TW2V', 'branch', true)
      RETURNING id
    `);
    warehouse2 = w2Res.rows[0].id;

    // Insert inventory
    await query(`
      INSERT INTO inventory (product_id, warehouse_id, quantity)
      VALUES ($1, $2, $3)
    `, [productId, warehouse1, 0.1]);

    await query(`
      UPDATE inventory 
      SET quantity = quantity + 0.2
      WHERE product_id = $1 AND warehouse_id = $2
    `, [productId, warehouse1]);

    await query(`
      INSERT INTO inventory (product_id, warehouse_id, quantity)
      VALUES ($1, $2, $3)
    `, [productId, warehouse2, 0.5]);
  });

  afterAll(async () => {
    // Cleanup dummy data
    await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
    await query(`DELETE FROM products WHERE id = $1`, [productId]);
    await query(`DELETE FROM warehouses WHERE id IN ($1, $2)`, [warehouse1, warehouse2]);
  });

  it('should correctly sum and round fractional inventory quantities', async () => {
    const inventoryList = await inventoryRepository.getInventoryList();
    const testItem = inventoryList.find(i => i.product_id === productId);
    
    expect(testItem).toBeDefined();
    
    if (testItem) {
      const expectedTotal = 0.8;
      const expectedMain = 0.3;
      
      const mQty = roundMoney(testItem.main_quantity);
      expect(mQty).toBe(expectedMain);
      
      const tQty = roundMoney(testItem.total_quantity);
      expect(tQty).toBe(expectedTotal);
    }
  });
});
