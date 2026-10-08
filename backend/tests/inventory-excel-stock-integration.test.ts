import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import XLSX from 'xlsx';
import { query } from '../src/database/pool.ts';
import {
  importReturnFromExcel,
  validateReturnExcel,
} from '../src/services/inventoryExcelService.ts';

it('records the exact Excel return quantity in stock, movement and cost layers and rejects malformed input', async () => {
  const suffix = randomUUID();
  let warehouseId: number | undefined;
  let productId: number | undefined;
  try {
    const admin = await query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'admin' AND u.is_active = TRUE AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1`,
    );
    expect(admin.rows).toHaveLength(1);
    const userId = admin.rows[0].id;
    const warehouseName = `Excel return ${suffix}`;
    warehouseId = (
      await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
       VALUES ($1, $2, 'main', TRUE) RETURNING id`,
        [`ER${suffix.slice(0, 16)}`, warehouseName],
      )
    ).rows[0].id;
    if (typeof warehouseId !== 'number') throw new Error('Warehouse fixture was not created');
    const sku = `EXCEL-RETURN-${suffix}`;
    productId = (
      await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, primary_warehouse_id, is_active)
       VALUES ($1, 'Excel return fixture', 10, 20, $2, TRUE) RETURNING id`,
        [sku, warehouseId],
      )
    ).rows[0].id;
    const file = (quantity: string) => {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([
          ['كود العميل', 'SKU', 'current_quantity', 'الكمية المرتجعة', 'warehouse_notes', 'المخزن'],
          ['WRONG-CUSTOMER', sku, 999, quantity, 'WRONG-WAREHOUSE', warehouseName],
        ]),
        'returns',
      );
      return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    };
    expect(await validateReturnExcel(file('١٬٠٠٠'), userId, warehouseId)).toMatchObject({
      ok: true,
      validCount: 1,
    });
    expect(await importReturnFromExcel(file('١٬٠٠٠'), userId, warehouseId)).toMatchObject({
      success: 1,
      failed: [],
    });
    expect(await importReturnFromExcel(file('1l'), userId, warehouseId)).toMatchObject({
      success: 0,
    });
    const stock = await query(
      'SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
      [productId, warehouseId],
    );
    expect(stock.rows).toHaveLength(1);
    expect(Number(stock.rows[0].quantity)).toBe(1000);
    const movement = await query(
      'SELECT quantity, total_cost FROM stock_movements WHERE product_id = $1',
      [productId],
    );
    expect(movement.rows).toHaveLength(1);
    expect(Number(movement.rows[0].quantity)).toBe(1000);
    expect(Number(movement.rows[0].total_cost)).toBe(10000);
    const layers = await query(
      'SELECT remaining_quantity, total_cost FROM inventory_cost_layers WHERE product_id = $1',
      [productId],
    );
    expect(layers.rows).toHaveLength(1);
    expect(Number(layers.rows[0].remaining_quantity)).toBe(1000);
    expect(Number(layers.rows[0].total_cost)).toBe(10000);
  } finally {
    if (productId) {
      await query(
        "DELETE FROM activity_logs WHERE module = 'products' AND details::jsonb ->> 'product_id' = $1",
        [String(productId)],
      );
      await query('DELETE FROM inventory_cost_layers WHERE product_id = $1', [productId]);
      await query('DELETE FROM stock_movements WHERE product_id = $1', [productId]);
      await query('DELETE FROM inventory WHERE product_id = $1', [productId]);
      await query('DELETE FROM products WHERE id = $1', [productId]);
    }
    if (warehouseId) await query('DELETE FROM warehouses WHERE id = $1', [warehouseId]);
  }
});
