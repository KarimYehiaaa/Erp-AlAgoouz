import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';

let server: http.Server;
let baseUrl: string;
let adminToken: string;
let adminUserId: number;

const cleanup = {
  journalEntryIds: [] as number[],
  purchaseReturnIds: [] as number[],
  purchaseInvoiceIds: [] as number[],
  saleIds: [] as number[],
  supplierIds: [] as number[],
  customerIds: [] as number[],
  productIds: [] as number[],
  warehouseIds: [] as number[],
  userIds: [] as number[],
};

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
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Create admin user for tests
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('AccTestPass123!', salt);
  const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
  const roleId = roleRes.rows[0]?.id || 1;

  const uRes = await query(
    `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING id, username`,
    [`test_acc_admin_${Date.now()}`, hash, 'Test Accounting Admin', roleId],
  );
  adminUserId = uRes.rows[0].id;
  cleanup.userIds.push(adminUserId);

  const loginRes = await apiReq('/auth/login', {
    method: 'POST',
    body: { username: uRes.rows[0].username, password: 'AccTestPass123!' },
  });
  adminToken = loginRes.data.data?.token || loginRes.data.token;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Teardown test artifacts
  try {
    if (cleanup.purchaseReturnIds.length) {
      await query(`DELETE FROM purchase_return_items WHERE purchase_return_id = ANY($1::int[])`, [cleanup.purchaseReturnIds]);
      await query(`DELETE FROM purchase_returns WHERE id = ANY($1::int[])`, [cleanup.purchaseReturnIds]);
    }
    if (cleanup.journalEntryIds.length) {
      await query(`DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[])`, [cleanup.journalEntryIds]);
      await query(`DELETE FROM journal_entries WHERE id = ANY($1::int[])`, [cleanup.journalEntryIds]);
    }
    if (cleanup.purchaseInvoiceIds.length) {
      await query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ANY($1::int[])`, [cleanup.purchaseInvoiceIds]);
      await query(`DELETE FROM purchase_invoices WHERE id = ANY($1::int[])`, [cleanup.purchaseInvoiceIds]);
    }
    if (cleanup.saleIds.length) {
      await query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE sale_id = ANY($1::int[]))`, [cleanup.saleIds]);
      await query(`DELETE FROM invoices WHERE sale_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM sale_items WHERE sale_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`, [cleanup.saleIds]);
      await query(`DELETE FROM sales WHERE id = ANY($1::int[])`, [cleanup.saleIds]);
    }
    if (cleanup.productIds.length) {
      await query(`DELETE FROM inventory_cost_layers WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
      await query(`DELETE FROM stock_movements WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
      await query(`DELETE FROM inventory WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
      await query(`DELETE FROM products WHERE id = ANY($1::int[])`, [cleanup.productIds]);
    }
    if (cleanup.warehouseIds.length) {
      await query(`DELETE FROM warehouses WHERE id = ANY($1::int[])`, [cleanup.warehouseIds]);
    }
    if (cleanup.supplierIds.length) {
      await query(`DELETE FROM suppliers WHERE id = ANY($1::int[])`, [cleanup.supplierIds]);
    }
    if (cleanup.customerIds.length) {
      await query(`DELETE FROM customers WHERE id = ANY($1::int[])`, [cleanup.customerIds]);
    }
    if (cleanup.userIds.length) {
      await query(`DELETE FROM audit_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM activity_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [cleanup.userIds]);
    }
  } catch (err) {
    console.error('Accounting test teardown error:', err);
  }
});

describe('1. Chart of Accounts (دليل الحسابات)', () => {
  it('GET /accounting/accounts returns standard chart of accounts hierarchy', async () => {
    const res = await apiReq('/accounting/accounts', { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const accounts = res.data.data;
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBeGreaterThanOrEqual(30);

    // Verify key core accounts exist
    const cash = accounts.find((a: any) => a.code === '1101');
    expect(cash).toBeDefined();
    expect(cash.account_type).toBe('asset');
    expect(cash.normal_balance).toBe('debit');

    const ar = accounts.find((a: any) => a.code === '1102');
    expect(ar).toBeDefined();
    expect(ar.account_type).toBe('asset');

    const ap = accounts.find((a: any) => a.code === '2101');
    expect(ap).toBeDefined();
    expect(ap.account_type).toBe('liability');
    expect(ap.normal_balance).toBe('credit');

    const sales = accounts.find((a: any) => a.code === '4101');
    expect(sales).toBeDefined();
    expect(sales.account_type).toBe('revenue');

    const cogs = accounts.find((a: any) => a.code === '5101');
    expect(cogs).toBeDefined();
    expect(cogs.account_type).toBe('expense');
  });

  it('POST /accounting/accounts fails with duplicate code', async () => {
    const res = await apiReq('/accounting/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        code: '1101', // Already exists (الخزينة النقدية)
        name_ar: 'حساب مكرر',
        account_type: 'asset',
      },
    });
    expect([400, 409]).toContain(res.status);
    expect(res.data.success).toBe(false);
  });
});

describe('2. Double-Entry Invariant & Journal Entries (قيود اليومية المزدوجة المتوازنة)', () => {
  it('POST /accounting/journal-entries rejects unbalanced entry (Debit != Credit)', async () => {
    const cashRes = await query(`SELECT id FROM accounts WHERE code = '1101' LIMIT 1`);
    const revRes = await query(`SELECT id FROM accounts WHERE code = '4101' LIMIT 1`);
    const cashId = cashRes.rows[0].id;
    const revId = revRes.rows[0].id;

    const res = await apiReq('/accounting/journal-entries', {
      method: 'POST',
      token: adminToken,
      body: {
        entry_date: '2026-09-18',
        description: 'قيد غير متوازن للاختبار',
        lines: [
          { account_id: cashId, debit: 1000, credit: 0, description: 'مدين 1000' },
          { account_id: revId, debit: 0, credit: 900, description: 'دائن 900' }, // الفرق 100
        ],
      },
    });

    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.error || res.data.message).toMatch(/غير متوازن/);
  });

  it('POST /accounting/journal-entries accepts balanced entry and sets posted status', async () => {
    const cashRes = await query(`SELECT id FROM accounts WHERE code = '1101' LIMIT 1`);
    const capRes = await query(`SELECT id FROM accounts WHERE code = '3101' LIMIT 1`);
    const cashId = cashRes.rows[0].id;
    const capId = capRes.rows[0].id;

    const res = await apiReq('/accounting/journal-entries', {
      method: 'POST',
      token: adminToken,
      body: {
        entry_date: '2026-09-18',
        description: 'زيادة رأس مال نقداً',
        lines: [
          { account_id: cashId, debit: 50000, credit: 0, description: 'إيداع بالخزينة' },
          { account_id: capId, debit: 0, credit: 50000, description: 'رأس مال المساهمين' },
        ],
      },
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const entry = res.data.data;
    expect(entry.id).toBeDefined();
    expect(entry.entry_number).toMatch(/^JE-\d{4}-\d{5}$/);
    expect(Number(entry.total_debit)).toBe(50000);
    expect(Number(entry.total_credit)).toBe(50000);

    const linesRes = await query(`SELECT * FROM journal_entry_lines WHERE journal_entry_id = $1`, [entry.id]);
    expect(linesRes.rows.length).toBe(2);

    cleanup.journalEntryIds.push(entry.id);
  });
});

describe('3. Automated Operational Posting: Sales & Purchases', () => {
  let warehouseId: number;
  let productId: number;
  let supplierId: number;
  let purchaseInvoiceId: number;

  beforeAll(async () => {
    // Setup warehouse
    const whRes = await query(
      `INSERT INTO warehouses (name_ar, code, is_active)
       VALUES ($1, $2, TRUE) RETURNING id`,
      [`مستودع تجارب المحاسبة ${Date.now()}`, `WH-ACC-${Date.now()}`],
    );
    warehouseId = whRes.rows[0].id;
    cleanup.warehouseIds.push(warehouseId);

    // Setup product
    const pRes = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
       VALUES ($1, $2, 160.00, 100.00, $3, TRUE) RETURNING id`,
      [`SKU-ACC-${Date.now()}`, `بن تجارب محاسبية ${Date.now()}`, warehouseId],
    );
    productId = pRes.rows[0].id;
    cleanup.productIds.push(productId);

    // Setup supplier
    const supRes = await query(
      `INSERT INTO suppliers (name_ar, phone, balance)
       VALUES ($1, $2, 0.00) RETURNING id`,
      [`مورد تجارب محاسبية ${Date.now()}`, `0100${Date.now().toString().slice(-7)}`],
    );
    supplierId = supRes.rows[0].id;
    cleanup.supplierIds.push(supplierId);
  });

  it('Creating purchase invoice automatically posts balanced Journal Entry (Dr Inventory, Cr AP)', async () => {
    const res = await apiReq('/purchases', {
      method: 'POST',
      token: adminToken,
      body: {
        supplier_id: supplierId,
        invoice_date: '2026-09-18',
        warehouse_id: warehouseId,
        payment_status: 'unpaid',
        items: [
          {
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: 20,
            unit_price: 100.0,
            total_amount: 2000.0,
          },
        ],
      },
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const invoice = res.data.data;
    purchaseInvoiceId = invoice.id;
    cleanup.purchaseInvoiceIds.push(purchaseInvoiceId);

    // Check that journal entry was posted
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'purchase' AND reference_id = $1`,
      [purchaseInvoiceId],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const sumRes = await query(
      `SELECT COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit
       FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [je.id],
    );
    expect(Number(sumRes.rows[0].total_debit)).toBe(2000.0);
    expect(Number(sumRes.rows[0].total_credit)).toBe(2000.0);

    // Verify lines
    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel JOIN accounts a ON a.id = jel.account_id WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const inventoryLine = linesRes.rows.find((l: any) => l.code.startsWith('1103'));
    expect(inventoryLine).toBeDefined();
    expect(Number(inventoryLine.debit)).toBe(2000.0);

    const apLine = linesRes.rows.find((l: any) => l.code.startsWith('2101'));
    expect(apLine).toBeDefined();
    expect(Number(apLine.credit)).toBe(2000.0);
  });

  it('Creating cash sale automatically posts balanced Journal Entry (Dr Cash/COGS, Cr Sales/Inventory)', async () => {
    const res = await apiReq('/sales', {
      method: 'POST',
      token: adminToken,
      body: {
        sale_type: 'pos',
        payment_method: 'cash',
        warehouse_id: warehouseId,
        items: [
          {
            product_id: productId,
            quantity: 5,
            unit_price: 160.0,
            unit_cost: 100.0,
          },
        ],
      },
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const sale = res.data.data;
    cleanup.saleIds.push(sale.id);

    // Verify journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1`,
      [sale.id],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    expect(je.status).toBe('posted');
    cleanup.journalEntryIds.push(je.id);

    const sumRes = await query(
      `SELECT COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit
       FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [je.id],
    );
    const totalDebit = Number(sumRes.rows[0].total_debit);
    const totalCredit = Number(sumRes.rows[0].total_credit);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(800.0 + 500.0); // 800 sale + 500 cogs

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel JOIN accounts a ON a.id = jel.account_id WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(4);

    // Cash line: Dr 800
    const cashLine = linesRes.rows.find((l: any) => l.code.startsWith('1101'));
    expect(cashLine).toBeDefined();
    expect(Number(cashLine.debit)).toBe(800.0);

    // Sales revenue: Cr 800
    const revLine = linesRes.rows.find((l: any) => l.code === '4101');
    expect(revLine).toBeDefined();
    expect(Number(revLine.credit)).toBe(800.0);

    // COGS: Dr 500
    const cogsLine = linesRes.rows.find((l: any) => l.code === '5101');
    expect(cogsLine).toBeDefined();
    expect(Number(cogsLine.debit)).toBe(500.0);

    // Inventory: Cr 500
    const invLine = linesRes.rows.find((l: any) => l.code.startsWith('1103'));
    expect(invLine).toBeDefined();
    expect(Number(invLine.credit)).toBe(500.0);
  });
});

describe('4. Purchase Returns & Debit Notes (مرتجعات المشتريات وإشعار الخصم)', () => {
  let warehouseId: number;
  let productId: number;
  let supplierId: number;
  let invoiceId: number;

  beforeAll(async () => {
    const whRes = await query(
      `INSERT INTO warehouses (name_ar, code, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
      [`مستودع المرتجعات ${Date.now()}`, `WH-RET-${Date.now()}`],
    );
    warehouseId = whRes.rows[0].id;
    cleanup.warehouseIds.push(warehouseId);

    const pRes = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
       VALUES ($1, $2, 220.00, 150.00, $3, TRUE) RETURNING id`,
      [`SKU-RET-${Date.now()}`, `بن مرتجع ${Date.now()}`, warehouseId],
    );
    productId = pRes.rows[0].id;
    cleanup.productIds.push(productId);

    const supRes = await query(
      `INSERT INTO suppliers (name_ar, phone, balance) VALUES ($1, $2, 0.00) RETURNING id`,
      [`مورد مرتجعات ${Date.now()}`, `0102${Date.now().toString().slice(-7)}`],
    );
    supplierId = supRes.rows[0].id;
    cleanup.supplierIds.push(supplierId);

    // Create a purchase invoice with 10 units @ 150 = 1500 EGP
    const invRes = await apiReq('/purchases', {
      method: 'POST',
      token: adminToken,
      body: {
        supplier_id: supplierId,
        invoice_date: '2026-09-18',
        warehouse_id: warehouseId,
        payment_status: 'unpaid',
        items: [
          {
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: 10,
            unit_price: 150.0,
            total_amount: 1500.0,
          },
        ],
      },
    });
    invoiceId = invRes.data.data.id;
    cleanup.purchaseInvoiceIds.push(invoiceId);
  });

  it('Rejects return quantity exceeding purchased invoice quantity', async () => {
    const res = await apiReq('/accounting/purchase-returns', {
      method: 'POST',
      token: adminToken,
      body: {
        purchase_invoice_id: invoiceId,
        return_date: '2026-09-18',
        reason: 'تالف من المصدر',
        items: [
          {
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: 15, // Invoice only has 10!
            unit_price: 150.0,
          },
        ],
      },
    });

    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.error || res.data.message).toMatch(/تتجاوز الكمية/);
  });

  it('Successfully processes purchase return, deducts inventory, reduces supplier balance, and creates reversing journal entry', async () => {
    // Initial inventory check
    const invBefore = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    const qtyBefore = Number(invBefore.rows[0]?.quantity || 0);
    expect(qtyBefore).toBe(10);

    // Return 3 units @ 150 = 450 EGP
    const res = await apiReq('/accounting/purchase-returns', {
      method: 'POST',
      token: adminToken,
      body: {
        purchase_invoice_id: invoiceId,
        return_date: '2026-09-18',
        reason: 'تالف في التغليف',
        items: [
          {
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: 3,
            unit_price: 150.0,
          },
        ],
      },
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const ret = res.data.data;
    cleanup.purchaseReturnIds.push(ret.id);
    expect(ret.return_number).toMatch(/^PR-\d{4}-\d+$/);
    expect(Number(ret.total_amount)).toBe(450.0);

    // 1. Check inventory reduced by 3
    const invAfter = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    expect(Number(invAfter.rows[0].quantity)).toBe(7);

    // 2. Check stock movement recorded as purchase_return
    const smRes = await query(
      `SELECT * FROM stock_movements WHERE reference_type = 'purchase_return' AND reference_id = $1`,
      [ret.id],
    );
    expect(smRes.rows.length).toBe(1);
    expect(Number(smRes.rows[0].quantity)).toBe(3);

    // 3. Check reversing journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'purchase_return' AND reference_id = $1`,
      [ret.id],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const sumRes = await query(
      `SELECT COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit
       FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [je.id],
    );
    expect(Number(sumRes.rows[0].total_debit)).toBe(450.0);
    expect(Number(sumRes.rows[0].total_credit)).toBe(450.0);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel JOIN accounts a ON a.id = jel.account_id WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    // Debit AP (reducing supplier liability)
    const apLine = linesRes.rows.find((l: any) => l.code.startsWith('2101'));
    expect(apLine).toBeDefined();
    expect(Number(apLine.debit)).toBe(450.0);

    // Credit Inventory (reducing asset)
    const invLine = linesRes.rows.find((l: any) => l.code.startsWith('1103'));
    expect(invLine).toBeDefined();
    expect(Number(invLine.credit)).toBe(450.0);
  });
});

describe('5. General Ledger, Trial Balance, and Balance Sheet Verification', () => {
  it('GET /accounting/general-ledger computes accurate chronological running balance', async () => {
    const res = await apiReq('/accounting/general-ledger?account_code=1101', {
      token: adminToken,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const gl = res.data.data;
    expect(gl.account).toBeDefined();
    expect(gl.account.code).toBe('1101');
    expect(Array.isArray(gl.entries)).toBe(true);

    if (gl.entries.length > 0) {
      let running = gl.opening_balance;
      for (const entry of gl.entries) {
        running = running + entry.debit - entry.credit;
        expect(Math.abs(entry.running_balance - running)).toBeLessThanOrEqual(0.01);
      }
      expect(Math.abs(gl.closing_balance - running)).toBeLessThanOrEqual(0.01);
    }
  });

  it('GET /accounting/trial-balance proves mathematical balance (Total Debit == Total Credit)', async () => {
    const res = await apiReq('/accounting/trial-balance', {
      token: adminToken,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const tb = res.data.data;
    expect(tb.totals.is_balanced).toBe(true);
    expect(Math.abs(tb.totals.closing_debit - tb.totals.closing_credit)).toBeLessThanOrEqual(0.01);
    expect(Array.isArray(tb.accounts)).toBe(true);
  });

  it('GET /accounting/balance-sheet satisfies fundamental accounting equation (Assets == Liabilities + Equity)', async () => {
    const res = await apiReq('/accounting/balance-sheet', {
      token: adminToken,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const bs = res.data.data;
    expect(bs.is_balanced).toBe(true);
    expect(Math.abs(bs.assets.total - (bs.liabilities.total + bs.equity.total))).toBeLessThanOrEqual(0.01);
  });
});
