import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inventoryRepository } from '../src/repositories/inventory.repository';
import { query } from '../src/database/pool';
import { roundMoney } from '../src/utils/money';
import { transferStock } from '../src/services/inventoryService';
import { randomUUID } from 'node:crypto';

describe('Cross-product transfers', () => {
  it('commits both stock movements and rolls back an insufficient-stock transfer', async () => {
    const suffix = randomUUID();
    const productIds: number[] = [];
    const warehouseIds: number[] = [];
    try {
      for (let i = 0; i < 2; i++) {
        const product = await query(
          `INSERT INTO products (sku, name_ar, purchase_price, sale_price, is_active)
           VALUES ($1, $2, 10, 15, TRUE) RETURNING id`,
          [`AUDIT-TRF-${i}-${suffix}`, `Audit transfer ${i}`],
        );
        productIds.push(product.rows[0].id);
        const warehouse = await query(
          `INSERT INTO warehouses (code, name_ar, type, is_active)
           VALUES ($1, $2, 'main', TRUE) RETURNING id`,
          [`AT${i}${suffix.slice(0, 8)}`, `Audit warehouse ${i}`],
        );
        warehouseIds.push(warehouse.rows[0].id);
      }
      const user = await query('SELECT id FROM users ORDER BY id LIMIT 1');
      await query(
        'INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 10), ($3, $4, 2)',
        [productIds[0], warehouseIds[0], productIds[1], warehouseIds[1]],
      );
      const payload = {
        product_id: productIds[0],
        to_product_id: productIds[1],
        from_warehouse_id: warehouseIds[0],
        to_warehouse_id: warehouseIds[1],
        quantity: 3,
        notes: suffix,
      };
      const result = await transferStock(payload, user.rows[0].id);
      expect(result.success).toBe(true);
      const stock = await query(
        'SELECT product_id, quantity FROM inventory WHERE product_id = ANY($1::int[]) ORDER BY product_id',
        [productIds],
      );
      expect(stock.rows.map((row) => Number(row.quantity))).toEqual([7, 5]);
      const movements = await query(
        'SELECT product_id, quantity, reference_type FROM stock_movements WHERE product_id = ANY($1::int[]) ORDER BY id',
        [productIds],
      );
      expect(movements.rows).toHaveLength(2);
      expect(movements.rows.map((row) => row.product_id)).toEqual(productIds);
      expect(movements.rows.every((row) => Number(row.quantity) === 3 && row.reference_type === 'transfer_voucher')).toBe(true);
      await expect(transferStock({ ...payload, quantity: 8 }, user.rows[0].id)).rejects.toMatchObject({ statusCode: 400 });
      const afterFailure = await query(
        'SELECT quantity FROM inventory WHERE product_id = ANY($1::int[]) ORDER BY product_id',
        [productIds],
      );
      expect(afterFailure.rows.map((row) => Number(row.quantity))).toEqual([7, 5]);
    } finally {
      await query('DELETE FROM stock_movements WHERE product_id = ANY($1::int[])', [productIds]);
      await query('DELETE FROM inventory WHERE product_id = ANY($1::int[])', [productIds]);
      await query('DELETE FROM products WHERE id = ANY($1::int[])', [productIds]);
      await query('DELETE FROM warehouses WHERE id = ANY($1::int[])', [warehouseIds]);
    }
  });
});

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
