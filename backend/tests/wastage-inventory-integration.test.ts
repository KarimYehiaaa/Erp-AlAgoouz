import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { inventoryAdjustSchema } from '../src/routes/schemas.ts';
import { adjustStock } from '../src/services/inventoryService.ts';

it('records a wastage write-off through validation, stock, and movement history', async () => {
  const suffix = randomUUID();
  let productId: number | undefined;
  let warehouseId: number | undefined;
  try {
    const user = await query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = TRUE AND u.deleted_at IS NULL AND r.name = 'admin'
       ORDER BY u.id LIMIT 1`,
    );
    expect(user.rows[0]?.id).toBeTruthy();

    const product = await query(
      `INSERT INTO products (sku, name_ar, purchase_price, sale_price, is_active)
       VALUES ($1, $2, 10, 15, TRUE) RETURNING id`,
      [`WASTE-${suffix}`, `Wastage test ${suffix}`],
    );
    productId = Number(product.rows[0].id);
    const warehouse = await query(
      `INSERT INTO warehouses (code, name_ar, type, is_active)
       VALUES ($1, $2, 'main', TRUE) RETURNING id`,
      [`W${suffix.slice(0, 8)}`, `Wastage test ${suffix}`],
    );
    warehouseId = Number(warehouse.rows[0].id);
    await query('INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1,$2,10)', [
      productId,
      warehouseId,
    ]);

    const payload = {
      product_id: productId,
      warehouse_id: warehouseId,
      quantity: 8,
      movement_type: 'wastage',
      notes: `Wastage test ${suffix}`,
    };
    expect(inventoryAdjustSchema.safeParse(payload).success).toBe(true);
    await adjustStock(payload, Number(user.rows[0].id));

    const result = await query(
      `SELECT i.quantity, sm.movement_type, sm.quantity AS movement_quantity,
              sm.from_warehouse_id, sm.to_warehouse_id
       FROM inventory i JOIN stock_movements sm ON sm.product_id = i.product_id
       WHERE i.product_id = $1 AND i.warehouse_id = $2 AND sm.movement_type = 'wastage'
       ORDER BY sm.id DESC LIMIT 1`,
      [productId, warehouseId],
    );
    expect(Number(result.rows[0]?.quantity)).toBe(8);
    expect(Number(result.rows[0]?.movement_quantity)).toBe(2);
    expect(Number(result.rows[0]?.from_warehouse_id)).toBe(warehouseId);
    expect(result.rows[0]?.to_warehouse_id).toBeNull();
  } finally {
    if (productId) {
      await query(
        `DELETE FROM inventory_cost_layer_consumptions
         WHERE stock_movement_id IN (SELECT id FROM stock_movements WHERE product_id = $1)`,
        [productId],
      );
      await query('DELETE FROM inventory_cost_layers WHERE product_id = $1', [productId]);
      await query('DELETE FROM stock_movements WHERE product_id = $1', [productId]);
      await query('DELETE FROM inventory WHERE product_id = $1', [productId]);
      await query('DELETE FROM products WHERE id = $1', [productId]);
    }
    if (warehouseId) await query('DELETE FROM warehouses WHERE id = $1', [warehouseId]);
  }
});
