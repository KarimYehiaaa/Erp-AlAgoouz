import { describe, it, expect, beforeAll } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import { createDailySale } from '../src/services/salesService.ts';
import { getAllowedWarehouses } from '../src/middleware/branchIsolation.ts';
import { randomUUID } from 'node:crypto';

describe('POS Branch Isolation & Batch Sync Security (Items 24, 25, 26)', () => {
  let adminUserId: number;
  let cashierUserId: number;
  let allowedWarehouseId: number;
  let forbiddenWarehouseId: number;
  let productId: number;

  beforeAll(async () => {
    // 1. Get or create warehouses
    const w1 = await query(`SELECT id FROM warehouses WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`);
    if (w1.rows.length === 0) {
      const insW1 = await query(`INSERT INTO warehouses (name, name_ar, code) VALUES ('Main', 'الرئيسي', 'WH-MAIN') RETURNING id`);
      allowedWarehouseId = insW1.rows[0].id;
    } else {
      allowedWarehouseId = w1.rows[0].id;
    }

    const w2 = await query(`SELECT id FROM warehouses WHERE id <> $1 AND deleted_at IS NULL LIMIT 1`, [allowedWarehouseId]);
    if (w2.rows.length === 0) {
      const insW2 = await query(`INSERT INTO warehouses (name, name_ar, code) VALUES ('Branch 2', 'فرع 2', 'WH-BR2') RETURNING id`);
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
        [`admin_test_${Date.now()}`, roleAdmin.rows[0].id]
      );
      adminUserId = newAdmin.rows[0].id;
    }

    // 3. Create Cashier user
    let cashierRole = await query(`SELECT id FROM roles WHERE name = 'cashier'`);
    if (cashierRole.rows.length === 0) {
      cashierRole = await query(`INSERT INTO roles (name, name_ar) VALUES ('cashier', 'كاشير') RETURNING id`);
    }
    const cashierRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id) VALUES ($1, 'hash', 'Cashier Test', $2) RETURNING id`,
      [`cashier_test_${Date.now()}`, cashierRole.rows[0].id]
    );
    cashierUserId = cashierRes.rows[0].id;

    // 4. Assign explicit branches so the branch-to-warehouse path is exercised.
    const allowedBranchId = 7001;
    const forbiddenBranchId = 7002;
    await query(`UPDATE warehouses SET branch_id = $1 WHERE id = $2`, [allowedBranchId, allowedWarehouseId]);
    await query(`UPDATE warehouses SET branch_id = $1 WHERE id = $2`, [forbiddenBranchId, forbiddenWarehouseId]);
    await query(`UPDATE users SET warehouse_id = NULL, branch_id = $1 WHERE id = $2`, [allowedBranchId, cashierUserId]);

    // 5. Create or get test product with stock in both warehouses
    const pRes = await query(`SELECT id FROM products WHERE deleted_at IS NULL LIMIT 1`);
    if (pRes.rows.length > 0) {
      productId = pRes.rows[0].id;
    } else {
      const insP = await query(
        `INSERT INTO products (code, name, name_ar, sale_price, cost_price, barcode, is_active)
         VALUES ($1, 'Test Product', 'منتج تجريبي', 100, 70, $2, TRUE) RETURNING id`,
        [`P-${Date.now()}`, `BC-${Date.now()}`]
      );
      productId = insP.rows[0].id;
    }

    // Ensure stock exists in both warehouses for tests
    await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 500), ($1, $3, 500)`,
      [productId, allowedWarehouseId, forbiddenWarehouseId]
    );
  });

  it('resolves only warehouses assigned to the cashier branch', async () => {
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
      'غير مصرح لك بإنشاء مبيعات على هذا المخزن/الفرع'
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
    const countRes = await query(`SELECT COUNT(*)::int as count FROM sales WHERE sync_id = $1::uuid`, [syncId]);
    expect(countRes.rows[0].count).toBe(1);
  });
});
