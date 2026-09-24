import { describe, it, expect, beforeAll } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import {
  createDailySale,
  deleteSalesByDate,
  deleteSalesByType,
  getSales,
  getSalesSummary,
  returnSale,
  updateSale,
} from '../src/services/salesService.ts';
import { getAllowedWarehouses } from '../src/middleware/warehouseAccess.ts';
import { randomUUID } from 'node:crypto';

describe('POS Warehouse Access & Batch Sync Security (Items 24, 25, 26)', () => {
  let adminUserId: number;
  let cashierUserId: number;
  let allowedWarehouseId: number;
  let forbiddenWarehouseId: number;
  let productId: number;

  beforeAll(async () => {
    // 1. Get or create warehouses
    const w1 = await query(
      `SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
    );
    if (w1.rows.length === 0) {
      const insW1 = await query(
        `INSERT INTO warehouses (name, name_ar, code) VALUES ('Main', 'الرئيسي', 'WH-MAIN') RETURNING id`,
      );
      allowedWarehouseId = insW1.rows[0].id;
    } else {
      allowedWarehouseId = w1.rows[0].id;
    }

    const w2 = await query(
      `SELECT id FROM warehouses WHERE id <> $1 AND deleted_at IS NULL LIMIT 1`,
      [allowedWarehouseId],
    );
    if (w2.rows.length === 0) {
      const insW2 = await query(
        `INSERT INTO warehouses (name, name_ar, code) VALUES ('Storage 2', 'مخزن 2', 'WH-ST2') RETURNING id`,
      );
      forbiddenWarehouseId = insW2.rows[0].id;
    } else {
      forbiddenWarehouseId = w2.rows[0].id;
    }

    // 2. Get or create Admin user
    const adminRes = await query(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = 'admin' AND u.deleted_at IS NULL
      LIMIT 1
    `);
    if (adminRes.rows.length > 0) {
      adminUserId = adminRes.rows[0].id;
    } else {
      const roleAdmin = await query(`SELECT id FROM roles WHERE name = 'admin'`);
      const newAdmin = await query(
        `INSERT INTO users (username, password_hash, full_name, role_id) VALUES ($1, 'hash', 'Admin Test', $2) RETURNING id`,
        [`admin_test_${Date.now()}`, roleAdmin.rows[0].id],
      );
      adminUserId = newAdmin.rows[0].id;
    }

    // 3. Create Cashier user
    let cashierRole = await query(`SELECT id FROM roles WHERE name = 'cashier'`);
    if (cashierRole.rows.length === 0) {
      cashierRole = await query(
        `INSERT INTO roles (name, name_ar) VALUES ('cashier', 'كاشير') RETURNING id`,
      );
    }
    const cashierRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id) VALUES ($1, 'hash', 'Cashier Test', $2) RETURNING id`,
      [`cashier_test_${Date.now()}`, cashierRole.rows[0].id],
    );
    cashierUserId = cashierRes.rows[0].id;

    // 4. In the single-shop model, access is assigned by warehouse only.
    await query(`UPDATE users SET warehouse_id = $1 WHERE id = $2`, [
      allowedWarehouseId,
      cashierUserId,
    ]);

    // 5. Create or get test product with stock in both warehouses
    const pRes = await query(`SELECT id FROM products WHERE deleted_at IS NULL LIMIT 1`);
    if (pRes.rows.length > 0) {
      productId = pRes.rows[0].id;
    } else {
      const insP = await query(
        `INSERT INTO products (code, name, name_ar, sale_price, cost_price, barcode, is_active)
         VALUES ($1, 'Test Product', 'منتج تجريبي', 100, 70, $2, TRUE) RETURNING id`,
        [`P-${Date.now()}`, `BC-${Date.now()}`],
      );
      productId = insP.rows[0].id;
    }

    // Ensure stock exists in both warehouses for tests
    await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 500), ($1, $3, 500)`,
      [productId, allowedWarehouseId, forbiddenWarehouseId],
    );
  });

  it('resolves only warehouses assigned to the cashier', async () => {
    const allowed = await getAllowedWarehouses(cashierUserId);
    expect(allowed).toContain(allowedWarehouseId);
    expect(allowed).not.toContain(forbiddenWarehouseId);
  });

  it('1. Cashier with allowed warehouse creates sale successfully', async () => {
    const syncId = randomUUID();
    const payload = {
      sale_type: 'pos',
      warehouse_id: allowedWarehouseId,
      sync_id: syncId,
      items: [{ product_id: productId, quantity: 1, unit_price: 100 }],
      paid_amount: 100,
      payment_method: 'cash',
    };

    const sale = await createDailySale(payload, cashierUserId);
    expect(sale).toBeDefined();
    expect(sale.id).toBeDefined();
    expect(Number(sale.warehouse_id)).toBe(allowedWarehouseId);
  });

  it('2. Cashier with forbidden warehouse is strictly rejected with 403 error', async () => {
    const syncId = randomUUID();
    const payload = {
      sale_type: 'pos',
      warehouse_id: forbiddenWarehouseId,
      sync_id: syncId,
      items: [{ product_id: productId, quantity: 1, unit_price: 100 }],
      paid_amount: 100,
      payment_method: 'cash',
    };

    await expect(createDailySale(payload, cashierUserId)).rejects.toThrow(
      'غير مصرح لك بالوصول لهذا المخزن',
    );
  });

  it('3. Admin can create sale on any warehouse without restriction', async () => {
    const syncId = randomUUID();
    const payload = {
      sale_type: 'pos',
      warehouse_id: forbiddenWarehouseId,
      sync_id: syncId,
      items: [{ product_id: productId, quantity: 1, unit_price: 100 }],
      paid_amount: 100,
      payment_method: 'cash',
    };

    const sale = await createDailySale(payload, adminUserId);
    expect(sale).toBeDefined();
    expect(sale.id).toBeDefined();
    expect(Number(sale.warehouse_id)).toBe(forbiddenWarehouseId);
  });

  it('4. Idempotency: replaying same sync_id returns existing sale without duplicate insertion', async () => {
    const syncId = randomUUID();
    const payload = {
      sale_type: 'pos',
      warehouse_id: allowedWarehouseId,
      sync_id: syncId,
      items: [{ product_id: productId, quantity: 2, unit_price: 100 }],
      paid_amount: 200,
      payment_method: 'cash',
    };

    // First creation
    const firstSale = await createDailySale(payload, cashierUserId);
    expect(firstSale.id).toBeDefined();

    // Replay with identical sync_id (simulating network timeout and retry)
    const secondSale = await createDailySale(payload, cashierUserId);
    expect(secondSale.id).toBe(firstSale.id);
    expect(secondSale._duplicateSync).toBe(true);

    // Verify in database that only ONE record exists with this sync_id
    const countRes = await query(
      `SELECT COUNT(*)::int as count FROM sales WHERE sync_id = $1::uuid`,
      [syncId],
    );
    expect(countRes.rows[0].count).toBe(1);
  });

  it('5. Warehouse-scoped sales lists and summaries never expose another warehouse', async () => {
    await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: forbiddenWarehouseId,
        total_amount: 37,
        payment_status: 'paid',
      },
      adminUserId,
    );

    const allowedWarehouses = await getAllowedWarehouses(cashierUserId);
    const today = new Date().toISOString().slice(0, 10);
    const list = await getSales(
      { from_date: today, to_date: today, warehouse_id: allowedWarehouseId },
      allowedWarehouses,
    );
    const summary = await getSalesSummary(
      { from_date: today, to_date: today, warehouse_id: allowedWarehouseId },
      allowedWarehouses,
    );
    const expected = await query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0)::numeric AS total
       FROM sales WHERE deleted_at IS NULL AND status = 'completed'
         AND sale_date >= $1::date AND warehouse_id = ANY($2::int[])`,
      [today, allowedWarehouses],
    );

    expect(list.data.every((sale) => Number(sale.warehouse_id) === allowedWarehouseId)).toBe(true);
    expect(list.meta.total).toBe(expected.rows[0].count);
    expect(summary.reduce((total, row) => total + Number(row.total), 0)).toBe(
      Number(expected.rows[0].total),
    );
    const forbiddenList = await getSales(
      { from_date: today, to_date: today, warehouse_id: forbiddenWarehouseId },
      allowedWarehouses,
    );
    expect(forbiddenList.meta.total).toBe(0);
  });

  it('6. A user cannot move another warehouse sale into their own warehouse by editing it', async () => {
    const sale = await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: forbiddenWarehouseId,
        total_amount: 41,
        payment_status: 'paid',
      },
      adminUserId,
    );

    await expect(
      updateSale(
        sale.id,
        {
          sale_type: 'retail',
          warehouse_id: allowedWarehouseId,
          total_amount: 99,
          payment_status: 'paid',
        },
        cashierUserId,
      ),
    ).rejects.toThrow('غير مصرح لك بالوصول لهذا المخزن');

    const unchanged = await query('SELECT warehouse_id, total_amount FROM sales WHERE id = $1', [
      sale.id,
    ]);
    expect(Number(unchanged.rows[0].warehouse_id)).toBe(forbiddenWarehouseId);
    expect(Number(unchanged.rows[0].total_amount)).toBe(41);
  });

  it('7. A user cannot return a sale from another warehouse', async () => {
    const sale = await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: forbiddenWarehouseId,
        total_amount: 43,
        payment_status: 'paid',
      },
      adminUserId,
    );

    await expect(returnSale(sale.id, cashierUserId)).rejects.toThrow(
      'غير مصرح لك بالوصول لهذا المخزن',
    );
    const unchanged = await query('SELECT status FROM sales WHERE id = $1', [sale.id]);
    expect(unchanged.rows[0].status).toBe('completed');
  });

  it('8. Offline sync replay cannot disclose a sale from another warehouse', async () => {
    const syncId = randomUUID();
    await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: forbiddenWarehouseId,
        sync_id: syncId,
        total_amount: 47,
        payment_status: 'paid',
      },
      adminUserId,
    );

    await expect(
      createDailySale(
        {
          sale_type: 'retail',
          warehouse_id: allowedWarehouseId,
          sync_id: syncId,
          total_amount: 47,
          payment_status: 'paid',
        },
        cashierUserId,
      ),
    ).rejects.toThrow('غير مصرح لك بالوصول لهذا المخزن');
  });

  it("9. Date and type bulk deletions are limited to the user's allowed warehouses", async () => {
    const saleDate = '2099-01-01';
    const localSale = await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: allowedWarehouseId,
        sale_date: saleDate,
        total_amount: 53,
        payment_status: 'paid',
      },
      adminUserId,
    );
    const otherSale = await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: forbiddenWarehouseId,
        sale_date: saleDate,
        total_amount: 59,
        payment_status: 'paid',
      },
      adminUserId,
    );
    const allowedWarehouses = await getAllowedWarehouses(cashierUserId);

    await deleteSalesByDate(saleDate, cashierUserId, allowedWarehouses);
    const afterDateDelete = await query(
      'SELECT id, deleted_at FROM sales WHERE id = ANY($1::int[])',
      [[localSale.id, otherSale.id]],
    );
    expect(afterDateDelete.rows.find((sale) => sale.id === localSale.id).deleted_at).not.toBeNull();
    expect(afterDateDelete.rows.find((sale) => sale.id === otherSale.id).deleted_at).toBeNull();

    const localTypeSale = await createDailySale(
      { sale_type: 'retail', warehouse_id: allowedWarehouseId, total_amount: 61 },
      adminUserId,
    );
    const otherTypeSale = await createDailySale(
      { sale_type: 'retail', warehouse_id: forbiddenWarehouseId, total_amount: 67 },
      adminUserId,
    );
    await deleteSalesByType('retail', cashierUserId, allowedWarehouses);
    const afterTypeDelete = await query(
      'SELECT id, deleted_at FROM sales WHERE id = ANY($1::int[])',
      [[localTypeSale.id, otherTypeSale.id]],
    );
    expect(
      afterTypeDelete.rows.find((sale) => sale.id === localTypeSale.id).deleted_at,
    ).not.toBeNull();
    expect(afterTypeDelete.rows.find((sale) => sale.id === otherTypeSale.id).deleted_at).toBeNull();
  });
});
