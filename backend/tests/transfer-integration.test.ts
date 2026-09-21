import { describe, it, expect } from 'vitest';
import { query } from '../src/database/pool.ts';
import { transferStock } from '../src/services/inventoryService.ts';

describe('Stock Transfer Integration Tests', () => {
  it('Stock transfer integration tests', async () => {
    // Pre-cleanup
    await query(`DELETE FROM stock_movements WHERE notes LIKE '%TST-TRF%'`);
    await query(
      `DELETE FROM inventory WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code IN ('TST-WH1', 'TST-WH2'))`,
    );
    await query(`DELETE FROM products WHERE sku IN ('SKU-TRF-1', 'SKU-TRF-2')`);
    await query(`DELETE FROM product_categories WHERE name_ar = 'تصنيف اختبار التحويل'`);
    await query(`DELETE FROM warehouses WHERE code IN ('TST-WH1', 'TST-WH2')`);

    let wh1Id: number | undefined;
    let wh2Id: number | undefined;
    let catId: number | undefined;
    let p1Id: number | undefined;
    let p2Id: number | undefined;
    let userId: number;

    try {
      // 1. Setup Test Warehouses
      const wh1Res = await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
         VALUES ('TST-WH1', 'مخزن اختبار تحويل 1', 'main', true)
         RETURNING id`,
      );
      wh1Id = wh1Res.rows[0].id;

      const wh2Res = await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
         VALUES ('TST-WH2', 'مخزن اختبار تحويل 2', 'store', true)
         RETURNING id`,
      );
      wh2Id = wh2Res.rows[0].id;

      // 2. Setup Test Category & Products
      const catRes = await query(
        `INSERT INTO product_categories (name_ar)
         VALUES ('تصنيف اختبار التحويل')
         RETURNING id`,
      );
      catId = catRes.rows[0].id;

      const prod1Res = await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, is_active)
         VALUES ('SKU-TRF-1', 'منتج تحويل مصدر', 10.00, 15.00, $1, true)
         RETURNING id`,
        [catId],
      );
      p1Id = prod1Res.rows[0].id;

      const prod2Res = await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, is_active)
         VALUES ('SKU-TRF-2', 'منتج تحويل هدف', 20.00, 30.00, $1, true)
         RETURNING id`,
        [catId],
      );
      p2Id = prod2Res.rows[0].id;

      // 3. Setup Initial Stock
      // Product 1 has 10 units in Warehouse 1
      await query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity)
         VALUES ($1, $2, 10.000)`,
        [p1Id, wh1Id],
      );

      // Product 2 has 2 units in Warehouse 2
      await query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity)
         VALUES ($1, $2, 2.000)`,
        [p2Id, wh2Id],
      );

      const userRes = await query(`SELECT id FROM users LIMIT 1`);
      userId = userRes.rows[0].id;

      // --- TEST 1: Same product transfer (Product 1 from WH1 to WH2) ---
      const res1 = await transferStock(
        {
          product_id: p1Id!,
          from_warehouse_id: wh1Id!,
          to_warehouse_id: wh2Id!,
          quantity: 4,
          notes: 'TST-TRF: Same product transfer',
        },
        userId,
      );

      expect(res1.success).toBe(true);

      // Check stock: WH1 should have 6, WH2 should have 4
      const stockWH1 = await query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
        [p1Id, wh1Id],
      );
      const stockWH2 = await query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
        [p1Id, wh2Id],
      );
      expect(Number(stockWH1.rows[0].quantity)).toBe(6);
      expect(Number(stockWH2.rows[0].quantity)).toBe(4);

      // Check movement: Should have 1 transfer movement
      const movs1 = await query(
        `SELECT * FROM stock_movements WHERE product_id = $1 AND reference_type = 'transfer_voucher' AND notes LIKE $2`,
        [p1Id, `%${res1.transfer_number}%`],
      );
      expect(movs1.rows.length).toBe(1);
      expect(movs1.rows[0].product_id).toBe(p1Id);
      expect(Number(movs1.rows[0].quantity)).toBe(4);

      // --- TEST 2: Different product transfer (Product 1 from WH1 to Product 2 in WH2) ---
      const res2 = await transferStock(
        {
          product_id: p1Id!,
          to_product_id: p2Id!,
          from_warehouse_id: wh1Id!,
          to_warehouse_id: wh2Id!,
          quantity: 3,
          notes: 'TST-TRF: Cross product transfer',
        },
        userId,
      );

      expect(res2.success).toBe(true);

      // Check stock:
      // Product 1 in WH1 should decrease by 3 (from 6 to 3)
      const stockP1WH1 = await query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
        [p1Id, wh1Id],
      );
      expect(Number(stockP1WH1.rows[0].quantity)).toBe(3);

      // Product 2 in WH2 should increase by 3 (from 2 to 5)
      const stockP2WH2 = await query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
        [p2Id, wh2Id],
      );
      expect(Number(stockP2WH2.rows[0].quantity)).toBe(5);

      // Check movements: Should have 2 transfer movements (one outward from P1, one inward to P2)
      const movs2 = await query(
        `SELECT * FROM stock_movements WHERE notes LIKE '%TST-TRF: Cross product transfer%' ORDER BY id`,
      );
      expect(movs2.rows.length).toBe(2);

      // First movement should be for Product 1 (outward)
      expect(movs2.rows[0].product_id).toBe(p1Id);
      expect(Number(movs2.rows[0].quantity)).toBe(3);
      expect(movs2.rows[0].notes.includes('تحويل إلى: منتج تحويل هدف')).toBe(true);

      // Second movement should be for Product 2 (inward)
      expect(movs2.rows[1].product_id).toBe(p2Id);
      expect(Number(movs2.rows[1].quantity)).toBe(3);
      expect(movs2.rows[1].notes.includes('تحويل من: منتج تحويل مصدر')).toBe(true);
    } finally {
      // Cleanup
      await query(`DELETE FROM stock_movements WHERE notes LIKE '%TST-TRF%'`);
      await query(
        `DELETE FROM inventory WHERE warehouse_id IN (SELECT id FROM warehouses WHERE code IN ('TST-WH1', 'TST-WH2'))`,
      );
      await query(`DELETE FROM products WHERE sku IN ('SKU-TRF-1', 'SKU-TRF-2')`);
      await query(`DELETE FROM product_categories WHERE name_ar = 'تصنيف اختبار التحويل'`);
      await query(`DELETE FROM warehouses WHERE code IN ('TST-WH1', 'TST-WH2')`);
    }
  });
});
