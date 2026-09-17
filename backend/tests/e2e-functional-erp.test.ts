import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';
import { appCache } from '../src/utils/cache.ts';
import { createDailySale } from '../src/services/salesService.ts';
import { recordPayment, getCustomerStatement } from '../src/services/customerService.ts';

let server: http.Server;
let baseUrl: string;

// Store generated test IDs for clean teardown
const cleanup = {
  userIds: [] as number[],
  roleIds: [] as number[],
  productIds: [] as number[],
  warehouseIds: [] as number[],
  customerIds: [] as number[],
  saleIds: [] as number[],
  recipeIds: [] as number[],
};

// Helper: Make HTTP request to test app
const apiReq = async (
  endpoint: string,
  options: {
    method?: string;
    token?: string | null;
    body?: any;
    headers?: Record<string, string>;
  } = {},
) => {
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
};

beforeAll(async () => {
  // Start test express server on an ephemeral port
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  // Clean up test records
  try {
    if (cleanup.saleIds.length) {
      await query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE sale_id = ANY($1::int[]))`, [cleanup.saleIds]);
      await query(`DELETE FROM invoices WHERE sale_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM sale_items WHERE sale_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM sales WHERE id = ANY($1::int[])`, [cleanup.saleIds]);
    }
    if (cleanup.recipeIds.length) {
      await query(`DELETE FROM product_recipe_items WHERE recipe_id = ANY($1::int[])`, [cleanup.recipeIds]);
      await query(`DELETE FROM product_recipes WHERE id = ANY($1::int[])`, [cleanup.recipeIds]);
    }
    if (cleanup.productIds.length) {
      await query(`DELETE FROM stock_movements WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
      await query(`DELETE FROM inventory WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
      await query(`DELETE FROM products WHERE id = ANY($1::int[])`, [cleanup.productIds]);
    }
    if (cleanup.warehouseIds.length) {
      await query(`DELETE FROM warehouses WHERE id = ANY($1::int[])`, [cleanup.warehouseIds]);
    }
    if (cleanup.customerIds.length) {
      await query(`DELETE FROM payments WHERE reference_type IN ('customer', 'customer_opening', 'customer_advance') AND reference_id = ANY($1::int[])`, [cleanup.customerIds]);
      await query(`DELETE FROM customers WHERE id = ANY($1::int[])`, [cleanup.customerIds]);
    }
    if (cleanup.userIds.length) {
      await query(`DELETE FROM activity_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM audit_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [cleanup.userIds]);
    }
  } catch (err) {
    console.error('Error during test teardown:', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authentication & Security Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Authentication & Security Lifecycle', () => {
  const testPassword = 'TestPassword123!';
  let adminUser: any;
  let adminToken: string;

  beforeAll(async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(testPassword, salt);
    const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
    const roleId = roleRes.rows[0]?.id || 1;

    const uRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id, username`,
      [`test_auth_admin_${Date.now()}`, hash, 'Test Admin E2E', roleId],
    );
    adminUser = uRes.rows[0];
    cleanup.userIds.push(adminUser.id);
  });

  it('login with valid credentials returns 200 and valid JWT token', async () => {
    const res = await apiReq('/auth/login', {
      method: 'POST',
      body: { username: adminUser.username, password: testPassword },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const token = res.data.data?.token || res.data.token;
    expect(token).toBeDefined();
    adminToken = token;
  });

  it('rejects login with wrong password (401)', async () => {
    const res = await apiReq('/auth/login', {
      method: 'POST',
      body: { username: adminUser.username, password: 'WrongPassword999!' },
    });
    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
  });

  it('rejects login with non-existent user (401)', async () => {
    const res = await apiReq('/auth/login', {
      method: 'POST',
      body: { username: 'nobody_exists_here_xyz', password: testPassword },
    });
    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
  });

  it('rejects login with empty credentials (400 validation error)', async () => {
    const res = await apiReq('/auth/login', {
      method: 'POST',
      body: { username: '', password: '' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  it('authenticated profile endpoint succeeds with valid token', async () => {
    const res = await apiReq('/auth/profile', { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const profileUser = res.data.data?.user || res.data.user || res.data.data;
    expect(profileUser.username).toBe(adminUser.username);
  });

  it('rejects unauthenticated request to protected profile (401)', async () => {
    const res = await apiReq('/auth/profile', { token: null });
    expect(res.status).toBe(401);
  });

  it('rejects request with forged/invalid token (401)', async () => {
    const res = await apiReq('/auth/profile', { token: 'invalid.jwt.token.string' });
    expect(res.status).toBe(401);
  });

  it('immediately invalidates token when user token_version is incremented', async () => {
    // Invalidate user cache tag
    appCache.invalidateByTag('auth_users');
    await query(`UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1`, [
      adminUser.id,
    ]);

    const res = await apiReq('/auth/profile', { token: adminToken });
    expect(res.status).toBe(401);
    expect(res.data.code).toBe('SESSION_REVOKED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RBAC & Granular Permissions Enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('2. RBAC & Granular Permissions Enforcement', () => {
  const testPassword = 'RolePassword123!';
  let cashierToken: string;
  let warehouseToken: string;
  let managerToken: string;

  beforeAll(async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(testPassword, salt);

    // Fetch role IDs
    const rolesRes = await query(`SELECT id, name FROM roles WHERE name IN ('cashier', 'warehouse', 'manager')`);
    const roleMap = new Map(rolesRes.rows.map((r: any) => [r.name, r.id]));

    // Cashier user
    const cashierRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Cashier E2E', $3, TRUE) RETURNING id, username`,
      [`test_cashier_${Date.now()}`, hash, roleMap.get('cashier')],
    );
    cleanup.userIds.push(cashierRes.rows[0].id);

    // Warehouse user
    const whRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Warehouse E2E', $3, TRUE) RETURNING id, username`,
      [`test_warehouse_${Date.now()}`, hash, roleMap.get('warehouse')],
    );
    cleanup.userIds.push(whRes.rows[0].id);

    // Manager user
    const mgrRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Manager E2E', $3, TRUE) RETURNING id, username`,
      [`test_manager_${Date.now()}`, hash, roleMap.get('manager')],
    );
    cleanup.userIds.push(mgrRes.rows[0].id);

    const cLog = await apiReq('/auth/login', { method: 'POST', body: { username: cashierRes.rows[0].username, password: testPassword } });
    cashierToken = cLog.data.data?.token || cLog.data.token;

    const wLog = await apiReq('/auth/login', { method: 'POST', body: { username: whRes.rows[0].username, password: testPassword } });
    warehouseToken = wLog.data.data?.token || wLog.data.token;

    const mLog = await apiReq('/auth/login', { method: 'POST', body: { username: mgrRes.rows[0].username, password: testPassword } });
    managerToken = mLog.data.data?.token || mLog.data.token;
  });

  it('cashier CAN view branch sales / POS products', async () => {
    const res = await apiReq('/products/branch', { token: cashierToken });
    expect(res.status).toBe(200);
  });

  it('cashier is FORBIDDEN (403) from creating products', async () => {
    const res = await apiReq('/products', {
      method: 'POST',
      token: cashierToken,
      body: { name_ar: 'اختراق الكاشير', sale_price: 100 },
    });
    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);
  });

  it('cashier is FORBIDDEN (403) from adjusting inventory', async () => {
    const res = await apiReq('/inventory/adjust', {
      method: 'POST',
      token: cashierToken,
      body: { product_id: 1, warehouse_id: 1, adjustment_quantity: 10, adjustment_type: 'add' },
    });
    expect(res.status).toBe(403);
  });

  it('cashier is FORBIDDEN (403) from updating company settings', async () => {
    const res = await apiReq('/settings/company', {
      method: 'PUT',
      token: cashierToken,
      body: { name: 'New Name' },
    });
    expect(res.status).toBe(403);
  });

  it('warehouse keeper CAN access inventory endpoints but is FORBIDDEN from sales', async () => {
    const invRes = await apiReq('/inventory', { token: warehouseToken });
    expect(invRes.status).toBe(200);

    const saleRes = await apiReq('/sales', {
      method: 'POST',
      token: warehouseToken,
      body: { sale_type: 'branch', items: [{ product_id: 1, quantity: 1, unit_price: 10 }] },
    });
    expect(saleRes.status).toBe(403);
  });

  it('manager CAN access both sales and inventory', async () => {
    const invRes = await apiReq('/inventory', { token: managerToken });
    expect(invRes.status).toBe(200);

    const salesRes = await apiReq('/sales', { token: managerToken });
    expect(salesRes.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Products Lifecycle & Validation Rules
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Products Lifecycle & Validation', () => {
  let adminToken: string;
  let createdProductId: number;
  const uniqueSuffix = Date.now().toString().slice(-6);

  beforeAll(async () => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('AdminProdPass123!', salt);
    const uRes = await query(
      `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, 'Admin Products E2E', 1, TRUE) RETURNING id, username`,
      [`admin_prod_${uniqueSuffix}`, hash],
    );
    cleanup.userIds.push(uRes.rows[0].id);

    const loginRes = await apiReq('/auth/login', {
      method: 'POST',
      body: { username: uRes.rows[0].username, password: 'AdminProdPass123!' },
    });
    adminToken = loginRes.data.data?.token || loginRes.data.token;
  });

  it('rejects product with negative sale_price (400)', async () => {
    const res = await apiReq('/products', {
      method: 'POST',
      token: adminToken,
      body: {
        name_ar: `منتج بسعر سالب ${uniqueSuffix}`,
        sale_price: -45,
      },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  it('rejects product with empty name_ar (400)', async () => {
    const res = await apiReq('/products', {
      method: 'POST',
      token: adminToken,
      body: {
        name_ar: '   ',
        sale_price: 150,
      },
    });
    expect(res.status).toBe(400);
  });

  it('creates product successfully with valid details', async () => {
    const res = await apiReq('/products', {
      method: 'POST',
      token: adminToken,
      body: {
        sku: `SKU-E2E-${uniqueSuffix}`,
        barcode: `BAR-E2E-${uniqueSuffix}`,
        name_ar: `بن يمني محمص درجة أولى ${uniqueSuffix}`,
        sale_price: 285.50,
        purchase_price: 190.25,
        min_stock: 5,
        unit: 'كجم',
        is_active: true,
      },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    createdProductId = res.data.data.id;
    cleanup.productIds.push(createdProductId);

    expect(Number(res.data.data.sale_price)).toBe(285.50);
    expect(Number(res.data.data.purchase_price)).toBe(190.25);
  });

  it('reads back the created product with identical values', async () => {
    const res = await apiReq(`/products/${createdProductId}`, { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.data.data.name_ar).toContain(`بن يمني محمص درجة أولى ${uniqueSuffix}`);
    expect(Number(res.data.data.sale_price)).toBe(285.50);
  });

  it('updates product price and deactivates product', async () => {
    const updateRes = await apiReq(`/products/${createdProductId}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        sale_price: 310.00,
        is_active: false,
      },
    });
    expect(updateRes.status).toBe(200);

    const getRes = await apiReq(`/products/${createdProductId}`, { token: adminToken });
    expect(Number(getRes.data.data.sale_price)).toBe(310.00);
    expect(getRes.data.data.is_active).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Inventory Lifecycle & Golden Reconciliation Equation
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Inventory Lifecycle & Golden Equation', () => {
  let productId: number;
  let mainWhId: number;
  let branchWhId: number;
  let adminUserId: number;

  beforeAll(async () => {
    const u = await query(`SELECT id FROM users WHERE role_id = 1 LIMIT 1`);
    adminUserId = u.rows[0]?.id || 1;

    const suffix = Date.now().toString().slice(-6);

    // Create 2 warehouses
    const wMain = await query(
      `INSERT INTO warehouses (name_ar, code, type, is_active) VALUES ($1, $2, 'main', TRUE) RETURNING id`,
      [`مخزن رئيسي معادلة ${suffix}`, `WM${suffix}`],
    );
    mainWhId = wMain.rows[0].id;
    cleanup.warehouseIds.push(mainWhId);

    const wBranch = await query(
      `INSERT INTO warehouses (name_ar, code, type, is_active) VALUES ($1, $2, 'branch', TRUE) RETURNING id`,
      [`مخزن فرع معادلة ${suffix}`, `WB${suffix}`],
    );
    branchWhId = wBranch.rows[0].id;
    cleanup.warehouseIds.push(branchWhId);

    // Create product
    const prod = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
       VALUES ($1, $2, 100, 60, $3, TRUE) RETURNING id`,
      [`INV-EQ-${suffix}`, `منتج تدقيق المخزون ${suffix}`, mainWhId],
    );
    productId = prod.rows[0].id;
    cleanup.productIds.push(productId);
  });

  it('strictly validates Golden Equation across Opening, Transfer, Sale, Return, and Adjustments', async () => {
    // 1. Initial Opening Stock: +100 in Main
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO UPDATE SET quantity = 100`,
      [productId, mainWhId],
    );
    await query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, user_id, notes)
       VALUES ($1, $2, 'adjustment', 100, $3, 'رصيد افتتاحي')`,
      [productId, mainWhId, adminUserId],
    );

    // 2. Transfer: 20 units from Main -> Branch
    await query(`UPDATE inventory SET quantity = quantity - 20 WHERE product_id = $1 AND warehouse_id = $2`, [productId, mainWhId]);
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 20)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO UPDATE SET quantity = inventory.quantity + 20`,
      [productId, branchWhId],
    );
    await query(
      `INSERT INTO stock_movements (product_id, from_warehouse_id, to_warehouse_id, movement_type, quantity, user_id, notes)
       VALUES ($1, $2, $3, 'transfer', 20, $4, 'تحويل بين مخازن')`,
      [productId, mainWhId, branchWhId, adminUserId],
    );

    // 3. Manual Adjustment: +10 in Main, -5 in Branch
    await query(`UPDATE inventory SET quantity = quantity + 10 WHERE product_id = $1 AND warehouse_id = $2`, [productId, mainWhId]);
    await query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, user_id, notes)
       VALUES ($1, $2, 'adjustment', 10, $3, 'تسوية بالزيادة')`,
      [productId, mainWhId, adminUserId],
    );

    await query(`UPDATE inventory SET quantity = quantity - 5 WHERE product_id = $1 AND warehouse_id = $2`, [productId, branchWhId]);
    await query(
      `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, user_id, notes)
       VALUES ($1, $2, 'adjustment', 5, $3, 'تسوية بالعجز')`,
      [productId, branchWhId, adminUserId],
    );

    // 4. Sale from Main: 40 units
    const saleResult = await createDailySale(
      {
        sale_type: 'branch',
        warehouse_id: mainWhId,
        payment_status: 'paid',
        items: [{ product_id: productId, quantity: 40, unit_price: 100, total_amount: 4000 }],
      },
      adminUserId,
    );
    cleanup.saleIds.push(saleResult.id);

    // 5. Sale Return to Main: 5 units
    await query(`UPDATE inventory SET quantity = quantity + 5 WHERE product_id = $1 AND warehouse_id = $2`, [productId, mainWhId]);
    await query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, user_id, notes)
       VALUES ($1, $2, 'return', 5, $3, 'مرتجع مبيعات')`,
      [productId, mainWhId, adminUserId],
    );

    // Verify Main Warehouse: 100 (Open) - 20 (Trf Out) + 10 (Adj In) - 40 (Sale) + 5 (Return) = 55
    const mainInv = await query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`, [productId, mainWhId]);
    expect(Number(mainInv.rows[0].quantity)).toBe(55);

    // Verify Branch Warehouse: 0 (Open) + 20 (Trf In) - 5 (Adj Out) = 15
    const branchInv = await query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`, [productId, branchWhId]);
    expect(Number(branchInv.rows[0].quantity)).toBe(15);

    // Verify Stock Movements count & types
    const mvtRes = await query(
      `SELECT movement_type, SUM(quantity) as total_qty
       FROM stock_movements WHERE product_id = $1 GROUP BY movement_type`,
      [productId],
    );
    const mvtMap = new Map(mvtRes.rows.map((r: any) => [r.movement_type, Number(r.total_qty)]));
    expect(mvtMap.get('adjustment')).toBe(115); // 100 open + 10 adj + 5 adj
    expect(mvtMap.get('transfer')).toBe(20);
    expect(mvtMap.get('sale')).toBe(40);
    expect(mvtMap.get('return')).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. High-Concurrency Stock Locking (Preventing Race Conditions & Negative Stock)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Inventory Concurrency & SELECT FOR UPDATE', () => {
  let productId: number;
  let warehouseId: number;
  let adminUserId: number;

  beforeAll(async () => {
    const u = await query(`SELECT id FROM users WHERE role_id = 1 LIMIT 1`);
    adminUserId = u.rows[0]?.id || 1;

    const suffix = Date.now().toString().slice(-6);
    const wh = await query(
      `INSERT INTO warehouses (name_ar, code, type, is_active) VALUES ($1, $2, 'main', TRUE) RETURNING id`,
      [`مخزن التزامن ${suffix}`, `CW${suffix}`],
    );
    warehouseId = wh.rows[0].id;
    cleanup.warehouseIds.push(warehouseId);

    const prod = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
       VALUES ($1, $2, 100, 50, $3, TRUE) RETURNING id`,
      [`CONC-${suffix}`, `منتج فحص التزامن ${suffix}`, warehouseId],
    );
    productId = prod.rows[0].id;
    cleanup.productIds.push(productId);

    // Initial stock is exactly 10 units
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 10)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO UPDATE SET quantity = 10`,
      [productId, warehouseId],
    );
  });

  it('safely serializes concurrent sales: exactly 1 succeeds, 1 fails, remaining stock is 3 (never negative)', async () => {
    // Both sales request 7 units simultaneously. Total demanded = 14, Available = 10.
    const salePayload = {
      sale_type: 'branch',
      warehouse_id: warehouseId,
      payment_status: 'paid',
      items: [{ product_id: productId, quantity: 7, unit_price: 100, total_amount: 700 }],
    };

    const results = await Promise.allSettled([
      createDailySale(salePayload, adminUserId),
      createDailySale(salePayload, adminUserId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one sale must succeed and one must be rejected due to insufficient stock
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    if (fulfilled[0]?.status === 'fulfilled') {
      cleanup.saleIds.push((fulfilled[0] as any).value.id);
    }

    // Check error message on rejected call (matches either insufficient stock or stock changed)
    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error.message).toMatch(/لا يوجد مخزون كافٍ|تعذر سحب الكمية/);

    // Check actual DB stock: 10 - 7 = 3 (NEVER negative, NO double deduction)
    const stockRes = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    expect(Number(stockRes.rows[0].quantity)).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Recipe Consumption & Raw Material Deductions
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Composite Recipe Products (المنتجات المركبة وتفكيك المكونات)', () => {
  let compositeProductId: number;
  let rawMaterial1Id: number;
  let rawMaterial2Id: number;
  let warehouseId: number;
  let adminUserId: number;

  beforeAll(async () => {
    const u = await query(`SELECT id FROM users WHERE role_id = 1 LIMIT 1`);
    adminUserId = u.rows[0]?.id || 1;

    const suffix = Date.now().toString().slice(-6);
    const wh = await query(
      `INSERT INTO warehouses (name_ar, code, type, is_active) VALUES ($1, $2, 'main', TRUE) RETURNING id`,
      [`مخزن الوصفات ${suffix}`, `RW${suffix}`],
    );
    warehouseId = wh.rows[0].id;
    cleanup.warehouseIds.push(warehouseId);

    // Raw Material 1: البن البرازيلي (Stock: 70 kg, unit: 'kg')
    const raw1 = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, unit, is_active)
       VALUES ($1, $2, 100, 50, $3, 'kg', TRUE) RETURNING id`,
      [`RAW1-${suffix}`, `بن برازيلي خام ${suffix}`, warehouseId],
    );
    rawMaterial1Id = raw1.rows[0].id;
    cleanup.productIds.push(rawMaterial1Id);

    // Raw Material 2: البن الكولومبي (Stock: 30 kg, unit: 'kg')
    const raw2 = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, unit, is_active)
       VALUES ($1, $2, 120, 60, $3, 'kg', TRUE) RETURNING id`,
      [`RAW2-${suffix}`, `بن كولومبي خام ${suffix}`, warehouseId],
    );
    rawMaterial2Id = raw2.rows[0].id;
    cleanup.productIds.push(rawMaterial2Id);

    // Composite Product: خلطة بن العجوز المخصوصة (unit: 'kg')
    const comp = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, unit, is_active)
       VALUES ($1, $2, 200, 110, $3, 'kg', TRUE) RETURNING id`,
      [`COMP-${suffix}`, `خلطة بن العجوز المخصوصة ${suffix}`, warehouseId],
    );
    compositeProductId = comp.rows[0].id;
    cleanup.productIds.push(compositeProductId);

    // Stock initial raw materials
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 70), ($3, $4, 30)`,
      [rawMaterial1Id, warehouseId, rawMaterial2Id, warehouseId],
    );

    // Create Recipe in product_recipes and product_recipe_items
    const recipeRes = await query(
      `INSERT INTO product_recipes (product_id, name_ar, is_active, notes, created_by)
       VALUES ($1, $2, TRUE, 'وصفة خلطة بن العجوز', $3) RETURNING id`,
      [compositeProductId, `وصفة ${suffix}`, adminUserId],
    );
    const recipeId = recipeRes.rows[0].id;
    cleanup.recipeIds.push(recipeId);

    await query(
      `INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, quantity, unit_code)
       VALUES ($1, $2, 0.7, 'kg'), ($1, $3, 0.3, 'kg')`,
      [recipeId, rawMaterial1Id, rawMaterial2Id],
    );
  });

  it('selling composite product automatically decomposes and consumes raw materials', async () => {
    // Sell 10 units of composite product
    // Should consume: 10 * 0.7 = 7 units of Raw 1 (70 - 7 = 63 remaining)
    // Should consume: 10 * 0.3 = 3 units of Raw 2 (30 - 3 = 27 remaining)
    const saleResult = await createDailySale(
      {
        sale_type: 'branch',
        warehouse_id: warehouseId,
        payment_status: 'paid',
        items: [{ product_id: compositeProductId, quantity: 10, unit_price: 200, total_amount: 2000 }],
      },
      adminUserId,
    );
    cleanup.saleIds.push(saleResult.id);

    // Check remaining raw materials
    const raw1Stock = await query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`, [rawMaterial1Id, warehouseId]);
    expect(Number(raw1Stock.rows[0].quantity)).toBe(63);

    const raw2Stock = await query(`SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`, [rawMaterial2Id, warehouseId]);
    expect(Number(raw2Stock.rows[0].quantity)).toBe(27);

    // Check that consumption movements were logged
    const consumptionMoves = await query(
      `SELECT product_id, quantity, movement_type FROM stock_movements
       WHERE reference_type = 'sale' AND reference_id = $1`,
      [saleResult.id],
    );
    expect(consumptionMoves.rows.length).toBeGreaterThanOrEqual(2);
    expect(consumptionMoves.rows.every((m: any) => m.movement_type === 'consumption')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Customer Debt & FIFO Payment Allocation
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Customer Debt & FIFO Payment Allocation', () => {
  let customerId: number;
  let testProdId: number;
  let warehouseId: number;
  let adminUserId: number;

  beforeAll(async () => {
    const u = await query(`SELECT id FROM users WHERE role_id = 1 LIMIT 1`);
    adminUserId = u.rows[0]?.id || 1;

    const suffix = Date.now().toString().slice(-6);

    const wh = await query(
      `INSERT INTO warehouses (name_ar, code, type, is_active) VALUES ($1, $2, 'main', TRUE) RETURNING id`,
      [`مخزن فيفو ${suffix}`, `FW${suffix}`],
    );
    warehouseId = wh.rows[0].id;
    cleanup.warehouseIds.push(warehouseId);

    const prod = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
       VALUES ($1, $2, 100, 50, $3, TRUE) RETURNING id`,
      [`PROD-FIFO-${suffix}`, `منتج فيفو ${suffix}`, warehouseId],
    );
    testProdId = prod.rows[0].id;
    cleanup.productIds.push(testProdId);

    // Put ample stock in warehouse
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100)
       ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO UPDATE SET quantity = 100`,
      [testProdId, warehouseId],
    );

    const cust = await query(
      `INSERT INTO customers (code, name_ar, phone, balance, is_active)
       VALUES ($1, $2, '0100000000', 0, TRUE) RETURNING id`,
      [`CUST-${suffix}`, `عميل تجريبي فيفو ${suffix}`],
    );
    customerId = cust.rows[0].id;
    cleanup.customerIds.push(customerId);
  });

  it('FIFO payment distribution allocates payments to oldest outstanding sales first', async () => {
    // Create 2 unpaid wholesale sales:
    // Sale 1: 5 units @ 100 = 500 EGP
    const sale1 = await createDailySale(
      {
        sale_type: 'wholesale',
        customer_id: customerId,
        warehouse_id: warehouseId,
        payment_status: 'unpaid',
        items: [{ product_id: testProdId, quantity: 5, unit_price: 100, total_amount: 500 }],
      },
      adminUserId,
    );
    cleanup.saleIds.push(sale1.id);

    // Sale 2: 3 units @ 100 = 300 EGP
    const sale2 = await createDailySale(
      {
        sale_type: 'wholesale',
        customer_id: customerId,
        warehouse_id: warehouseId,
        payment_status: 'unpaid',
        items: [{ product_id: testProdId, quantity: 3, unit_price: 100, total_amount: 300 }],
      },
      adminUserId,
    );
    cleanup.saleIds.push(sale2.id);

    // Customer pays 600 EGP via recordPayment (FIFO logic):
    // Should fully cover Sale 1 (500), and cover 100 of Sale 2 (remaining 200)
    await recordPayment(customerId, {
      amount: 600,
      payment_method: 'cash',
      user_id: adminUserId,
    });

    // Check payments allocated to sale 1
    const p1 = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE reference_type = 'sale' AND reference_id = $1`,
      [sale1.id],
    );
    expect(Number(p1.rows[0].total_paid)).toBe(500);

    // Check payments allocated to sale 2
    const p2 = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE reference_type = 'sale' AND reference_id = $1`,
      [sale2.id],
    );
    expect(Number(p2.rows[0].total_paid)).toBe(100);

    // Total outstanding debt was 800, paid 600 -> remaining 200
    const statement = await getCustomerStatement(customerId);
    expect(statement.summary.total_purchased).toBe(800);
    expect(statement.summary.total_paid).toBe(600);
    expect(statement.summary.total_balance).toBe(200);
  });
});
