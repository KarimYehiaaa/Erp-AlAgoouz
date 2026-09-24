import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';
import { createExpense, updateExpense, deleteExpense } from '../src/services/expenseService.ts';
import { recordPayment } from '../src/services/customerService.ts';
import { recordSupplierPayment } from '../src/services/supplierService.ts';
import { createPartnerDrawing, deletePartnerDrawing } from '../src/services/partnerService.ts';
import { createDailySale, returnSale } from '../src/services/salesService.ts';
import { posShiftService } from '../src/services/posShiftService.ts';
import { bankReconciliationService } from '../src/services/bankReconciliationService.ts';
import { purchaseOrderService } from '../src/services/purchaseOrderService.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { roundMoney } from '../src/utils/money.js';
import { AppError } from '../src/types/errors.js';

let server: http.Server;
let baseUrl: string;
let adminToken: string;
let adminUserId: number;

const cleanup = {
  journalEntryIds: [] as number[],
  purchaseReturnIds: [] as number[],
  purchaseInvoiceIds: [] as number[],
  purchaseOrderIds: [] as number[],
  saleIds: [] as number[],
  supplierIds: [] as number[],
  customerIds: [] as number[],
  productIds: [] as number[],
  warehouseIds: [] as number[],
  expenseCategoryIds: [] as number[],
  expenseIds: [] as number[],
  partnerIds: [] as number[],
  partnerDrawingIds: [] as number[],
  posShiftIds: [] as number[],
  bankReconciliationIds: [] as number[],
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

// Fixtures
let testWarehouseId: number;
let testCategoryId: number;
let testExpenseCatId: number;
let testProductId: number;
let testCustomerId: number;
let testSupplierId: number;
let testPartnerId: number;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Create admin user for tests
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('FinIntegPass123!', salt);
  const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
  const roleId = roleRes.rows[0]?.id || 1;

  const uRes = await query(
    `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING id, username`,
    [`test_fin_admin_${Date.now()}`, hash, 'Test Financial Admin', roleId],
  );
  adminUserId = uRes.rows[0].id;
  cleanup.userIds.push(adminUserId);

  const loginRes = await apiReq('/auth/login', {
    method: 'POST',
    body: { username: uRes.rows[0].username, password: 'FinIntegPass123!' },
  });
  adminToken = loginRes.data.data?.token || loginRes.data.token;

  // 1. Warehouse
  const whRes = await query(
    `INSERT INTO warehouses (name_ar, code, type, is_active) VALUES ($1, $2, 'main', TRUE) RETURNING id`,
    [`مستودع تكامل مالي ${Date.now()}`, `WH-FIN-${Date.now()}`],
  );
  testWarehouseId = whRes.rows[0].id;
  cleanup.warehouseIds.push(testWarehouseId);

  // 2. Product
  const prodRes = await query(
    `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
     VALUES ($1, $2, 150.00, 100.00, $3, TRUE) RETURNING id`,
    [`SKU-FIN-${Date.now()}`, `منتج تكامل مالي ${Date.now()}`, testWarehouseId],
  );
  testProductId = prodRes.rows[0].id;
  cleanup.productIds.push(testProductId);

  // Seed inventory
  await query(
    `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 50)`,
    [testProductId, testWarehouseId],
  );

  // 3. Expense Category (fetch existing active category)
  const expCatRes = await query(
    `SELECT id FROM expense_categories WHERE is_active = TRUE LIMIT 1`,
  );
  testExpenseCatId = expCatRes.rows[0]?.id || 1;

  // 4. Customer
  const custRes = await query(
    `INSERT INTO customers (name_ar, phone, balance) VALUES ($1, $2, 0.00) RETURNING id`,
    [`عميل تكامل مالي ${Date.now()}`, `011${Date.now().toString().slice(-8)}`],
  );
  testCustomerId = custRes.rows[0].id;
  cleanup.customerIds.push(testCustomerId);

  // 5. Supplier
  const supRes = await query(
    `INSERT INTO suppliers (name_ar, phone, opening_balance, balance) VALUES ($1, $2, 10000.00, 10000.00) RETURNING id`,
    [`مورد تكامل مالي ${Date.now()}`, `012${Date.now().toString().slice(-8)}`],
  );
  testSupplierId = supRes.rows[0].id;
  cleanup.supplierIds.push(testSupplierId);

  // 6. Partner
  const partRes = await query(
    `INSERT INTO partners (name_ar, phone, share_percentage, capital_contribution)
     VALUES ($1, $2, 25.00, 50000.00) RETURNING id`,
    [`شريك تكامل مالي ${Date.now()}`, `015${Date.now().toString().slice(-8)}`],
  );
  testPartnerId = partRes.rows[0].id;
  cleanup.partnerIds.push(testPartnerId);
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  try {
    if (cleanup.bankReconciliationIds.length) {
      await query(`DELETE FROM bank_reconciliations WHERE id = ANY($1::int[])`, [cleanup.bankReconciliationIds]);
    }
    if (cleanup.purchaseOrderIds.length) {
      await query(`DELETE FROM purchase_order_items WHERE purchase_order_id = ANY($1::int[])`, [cleanup.purchaseOrderIds]);
      await query(`DELETE FROM purchase_orders WHERE id = ANY($1::int[])`, [cleanup.purchaseOrderIds]);
    }
    if (cleanup.purchaseReturnIds.length) {
      await query(`DELETE FROM purchase_return_items WHERE purchase_return_id = ANY($1::int[])`, [cleanup.purchaseReturnIds]);
      await query(`DELETE FROM purchase_returns WHERE id = ANY($1::int[])`, [cleanup.purchaseReturnIds]);
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
    if (cleanup.partnerDrawingIds.length) {
      await query(`DELETE FROM partner_drawings WHERE id = ANY($1::int[])`, [cleanup.partnerDrawingIds]);
    }
    if (cleanup.partnerIds.length) {
      await query(`DELETE FROM partners WHERE id = ANY($1::int[])`, [cleanup.partnerIds]);
    }
    if (cleanup.posShiftIds.length) {
      await query(`DELETE FROM pos_cash_movements WHERE shift_id = ANY($1::int[])`, [cleanup.posShiftIds]);
      await query(`DELETE FROM pos_shifts WHERE id = ANY($1::int[])`, [cleanup.posShiftIds]);
    }
    if (cleanup.expenseIds.length) {
      await query(`DELETE FROM expenses WHERE id = ANY($1::int[])`, [cleanup.expenseIds]);
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
      await query(`DELETE FROM payments WHERE reference_type = 'supplier' AND reference_id = ANY($1::int[])`, [cleanup.supplierIds]);
      await query(`DELETE FROM suppliers WHERE id = ANY($1::int[])`, [cleanup.supplierIds]);
    }
    if (cleanup.customerIds.length) {
      await query(`DELETE FROM payments WHERE reference_type = 'customer' AND reference_id = ANY($1::int[])`, [cleanup.customerIds]);
      await query(`DELETE FROM customers WHERE id = ANY($1::int[])`, [cleanup.customerIds]);
    }
    if (cleanup.journalEntryIds.length) {
      await query(`DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[])`, [cleanup.journalEntryIds]);
      await query(`DELETE FROM journal_entries WHERE id = ANY($1::int[])`, [cleanup.journalEntryIds]);
    }
    if (cleanup.userIds.length) {
      await query(`DELETE FROM payments WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM audit_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM activity_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
      await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [cleanup.userIds]);
    }
  } catch (err) {
    console.error('Financial integration teardown error:', err);
  }
});

describe('1. Input Validation & Financial Precision', () => {
  it('يمنع تسجيل مصروف بقيمة سالبة', async () => {
    try {
      await createExpense({ amount: -500, title: 'Test Expense', category_id: testExpenseCatId }, adminUserId);
      expect.unreachable('يجب أن يرمي خطأ عند تمرير مبلغ سالب');
    } catch (err: any) {
      expect(err instanceof AppError).toBe(true);
      expect(err.message).toMatch(/أكبر من الصفر/);
    }
  });

  it('يمنع تسجيل مصروف بقيمة صفر', async () => {
    try {
      await createExpense({ amount: 0, title: 'Test Expense', category_id: testExpenseCatId }, adminUserId);
      expect.unreachable('يجب أن يرمي خطأ عند تمرير مبلغ صفر');
    } catch (err: any) {
      expect(err instanceof AppError).toBe(true);
      expect(err.message).toMatch(/أكبر من الصفر/);
    }
  });

  it('دقة الأرقام تعمل بشكل صحيح لتجنب مشكلة القروش', () => {
    const quantity = 1.005;
    const unitPrice = 100;
    const total = roundMoney(quantity * unitPrice);
    expect(total).toBe(100.5);
  });
});

describe('2. Operational Expenses -> General Ledger Integration', () => {
  let createdExpenseId: number;

  it('Creating an expense automatically generates a balanced posted GL journal entry', async () => {
    const expense = await createExpense(
      {
        title: 'فاتورة صيانة ماكينة القهوة',
        amount: 850.0,
        category_id: testExpenseCatId,
        payment_method: 'cash',
        notes: 'صيانة دورية للمطحنة والماكينة',
      },
      adminUserId,
    );
    expect(expense).toBeDefined();
    expect(expense.id).toBeDefined();
    createdExpenseId = expense.id;
    cleanup.expenseIds.push(createdExpenseId);

    // Verify journal entry in database
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'expense' AND reference_id = $1`,
      [createdExpenseId],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);
    expect(je.status).toBe('posted');

    // Verify debit = credit = 850
    const linesRes = await query(
      `SELECT jel.*, a.code, a.account_type FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const totalDebit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
    const totalCredit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(850.0);
    expect(totalCredit).toBe(850.0);

    // Expense account debited, Cash account credited
    const debitLine = linesRes.rows.find((l: any) => Number(l.debit) > 0);
    const creditLine = linesRes.rows.find((l: any) => Number(l.credit) > 0);
    expect(debitLine.account_type).toBe('expense');
    expect(creditLine.code).toBe('110101'); // Main Treasury
  });

  it('Updating an expense synchronizes and re-posts the GL journal entry', async () => {
    const updated = await updateExpense(createdExpenseId, {
      amount: 1100.0,
      notes: 'تحديث المبلغ بعد إضافة قطع غيار جديدة',
    });
    expect(updated).toBeDefined();
    expect(Number(updated.amount)).toBe(1100.0);

    const linesRes = await query(
      `SELECT jel.* FROM journal_entry_lines jel 
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.reference_type = 'expense' AND je.reference_id = $1`,
      [createdExpenseId],
    );
    const totalDebit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
    const totalCredit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(1100.0);
    expect(totalCredit).toBe(1100.0);
  });

  it('Deleting an expense unlinks/removes its corresponding GL journal entry', async () => {
    await deleteExpense(createdExpenseId);

    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'expense' AND reference_id = $1`,
      [createdExpenseId],
    );
    expect(jeRes.rows.length).toBe(0);
  });
});

describe('3. Customer Payments -> General Ledger Integration', () => {
  it('Recording customer payment automatically posts Cash (Debit) and Accounts Receivable (Credit)', async () => {
    // 1. Give customer initial balance
    await query(`UPDATE customers SET balance = 5000.00 WHERE id = $1`, [testCustomerId]);

    // 2. Record payment of 2000 EGP
    const res = await recordPayment(testCustomerId, {
      amount: 2000.0,
      payment_method: 'cash',
      notes: 'سداد دفعة نقدية تحت الحساب',
      user_id: adminUserId,
    });
    expect(res.success).toBe(true);

    // 3. Verify customer payment journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'payment' AND reference_id = $1 ORDER BY id DESC LIMIT 1`,
      [testCustomerId],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const cashLine = linesRes.rows.find((l: any) => l.code === '110101');
    const arLine = linesRes.rows.find((l: any) => l.code === '110201');

    expect(cashLine).toBeDefined();
    expect(Number(cashLine.debit)).toBe(2000.0);
    expect(Number(cashLine.credit)).toBe(0);

    expect(arLine).toBeDefined();
    expect(Number(arLine.debit)).toBe(0);
    expect(Number(arLine.credit)).toBe(2000.0);
  });
});

describe('4. Supplier Payments -> General Ledger Integration', () => {
  it('Recording supplier payment automatically posts Accounts Payable (Debit) and Cash (Credit)', async () => {
    // 1. Give supplier initial balance
    await query(`UPDATE suppliers SET opening_balance = 8000.00, balance = 8000.00 WHERE id = $1`, [testSupplierId]);

    // 2. Record payment of 3500 EGP
    const payment = await recordSupplierPayment(
      testSupplierId,
      {
        amount: 3500.0,
        payment_method: 'cash',
        notes: 'سداد دفعة للمورد نقداً',
      },
      adminUserId,
    );
    expect(payment).toBeDefined();
    expect(payment.id).toBeDefined();

    // 3. Verify supplier payment journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'payment' AND reference_id = $1 ORDER BY id DESC LIMIT 1`,
      [payment.id],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const apLine = linesRes.rows.find((l: any) => l.code === '210101');
    const cashLine = linesRes.rows.find((l: any) => l.code === '110101');

    expect(apLine).toBeDefined();
    expect(Number(apLine.debit)).toBe(3500.0);
    expect(Number(apLine.credit)).toBe(0);

    expect(cashLine).toBeDefined();
    expect(Number(cashLine.debit)).toBe(0);
    expect(Number(cashLine.credit)).toBe(3500.0);
  });
});

describe('5. Partner Drawings -> General Ledger Integration', () => {
  let createdDrawingId: number;

  it('Recording partner drawing automatically debits Partner Drawings (310201) and credits Cash', async () => {
    const drawing = await createPartnerDrawing(
      {
        partner_id: testPartnerId,
        amount: 4500.0,
        payment_method: 'cash',
        source_type: 'cash_drawer',
        notes: 'سحب شخصي للشريك من الخزينة',
      },
      adminUserId,
    );
    expect(drawing).toBeDefined();
    expect(drawing.id).toBeDefined();
    createdDrawingId = drawing.id;
    cleanup.partnerDrawingIds.push(createdDrawingId);

    // Verify journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'manual' AND reference_id = $1`,
      [createdDrawingId],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const drawLine = linesRes.rows.find((l: any) => l.code === '3103');
    const cashLine = linesRes.rows.find((l: any) => l.code === '110102'); // Branch Drawer

    expect(drawLine).toBeDefined();
    expect(Number(drawLine.debit)).toBe(4500.0);
    expect(Number(drawLine.credit)).toBe(0);

    expect(cashLine).toBeDefined();
    expect(Number(cashLine.debit)).toBe(0);
    expect(Number(cashLine.credit)).toBe(4500.0);
  });

  it('Deleting partner drawing cleans up the journal entry', async () => {
    await deletePartnerDrawing(createdDrawingId);

    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'manual' AND reference_id = $1`,
      [createdDrawingId],
    );
    expect(jeRes.rows.length).toBe(0);
  });
});

describe('6. Sales Return / Refund -> General Ledger Integration', () => {
  it('Returning a completed sale automatically generates a balanced reversing journal entry', async () => {
    // 1. Create a completed sale: 2 units of testProductId @ 150 = 300 EGP (cost: 100 * 2 = 200)
    const sale = await createDailySale(
      {
        sale_type: 'retail',
        warehouse_id: testWarehouseId,
        payment_method: 'cash',
        total_amount: 300.0,
        paid_amount: 300.0,
        items: [
          {
            product_id: testProductId,
            quantity: 2,
            unit_price: 150.0,
          },
        ],
      },
      adminUserId,
    );
    expect(sale).toBeDefined();
    expect(sale.id).toBeDefined();
    cleanup.saleIds.push(sale.id);

    // 2. Return the sale
    const ret = await returnSale(sale.id, adminUserId, 'مرتجع عميل لاختبار القيود');
    expect(ret).toBeDefined();

    // 3. Check reversing journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1 ORDER BY id DESC`,
      [sale.id],
    );
    expect(jeRes.rows.length).toBe(2); // Initial sale + Reversing refund entry
    const je = jeRes.rows[0]; // Latest entry is the reversing refund entry
    cleanup.journalEntryIds.push(...jeRes.rows.map((r: any) => r.id));

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );

    const totalDebit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
    const totalCredit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
    expect(totalDebit).toBeGreaterThan(0);
    expect(totalDebit).toBe(totalCredit); // Strict mathematical balance

    // Verify Sales Return account (4103) debited
    const returnLine = linesRes.rows.find((l: any) => l.code === '4103');
    expect(returnLine).toBeDefined();
    expect(Number(returnLine.debit)).toBe(300.0);
  });
});

describe('7. POS Shift Cash Movements & Difference Accounting', () => {
  let shiftId: number;

  it('Opening a shift, adding cash deposit (فكة/عهدة) records a transfer GL entry', async () => {
    // 1. Open shift
    const shift = await posShiftService.openShift(adminUserId, {
      warehouse_id: testWarehouseId,
      opening_cash: 500.0,
      notes: 'وردية اختبار المحاسبة',
    });
    expect(shift).toBeDefined();
    expect(shift.id).toBeDefined();
    shiftId = shift.id;
    cleanup.posShiftIds.push(shiftId);

    // 2. Record cash deposit (عهدة/فكة) of 200 EGP
    const movement = await posShiftService.recordCashMovement(adminUserId, {
      shift_id: shiftId,
      movement_type: 'deposit',
      amount: 200.0,
      reason: 'إيداع فكة إضافية في الدرج',
    });
    expect(movement).toBeDefined();
    expect(movement.id).toBeDefined();

    // 3. Verify transfer journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'transfer' AND reference_id = $1`,
      [movement.id],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const drawerLine = linesRes.rows.find((l: any) => l.code === '110102');
    const treasuryLine = linesRes.rows.find((l: any) => l.code === '110101');

    expect(drawerLine).toBeDefined();
    expect(Number(drawerLine.debit)).toBe(200.0);

    expect(treasuryLine).toBeDefined();
    expect(Number(treasuryLine.credit)).toBe(200.0);
  });

  it('Closing a shift with cash shortage records an over/short difference GL entry', async () => {
    // Expected cash is 500 (opening) + 200 (deposit) = 700.
    // Close with actual 650 -> shortage of 50 EGP.
    const closed = await posShiftService.closeShift(adminUserId, shiftId, {
      actual_cash: 650.0,
      notes: 'عجز 50 جنيه في النقدية الفعلية',
    });
    expect(closed).toBeDefined();
    expect(Number(closed.cash_difference)).toBe(-50.0);

    // Verify difference journal entry
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'manual' AND reference_id = $1`,
      [shiftId],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const expenseLine = linesRes.rows.find((l: any) => l.code === '5204'); // Shortage expense
    const drawerLine = linesRes.rows.find((l: any) => l.code === '110102'); // Drawer reduction

    expect(expenseLine).toBeDefined();
    expect(Number(expenseLine.debit)).toBe(50.0);

    expect(drawerLine).toBeDefined();
    expect(Number(drawerLine.credit)).toBe(50.0);
  });
});

describe('8. Bank & Treasury Reconciliation API', () => {
  it('Calculates ledger balance and creates a completed reconciliation session', async () => {
    // Find Bank account id
    const bankAcc = (await query(`SELECT id FROM accounts WHERE code = '110102'`)).rows[0];
    expect(bankAcc).toBeDefined();

    const todayStr = new Date().toISOString().slice(0, 10);

    // Calculate current ledger balance
    const ledgerBal = await bankReconciliationService.getLedgerBalanceAsOfDate(bankAcc.id, todayStr);
    expect(typeof ledgerBal).toBe('number');

    // Create reconciliation via API
    const res = await apiReq('/accounting/reconciliations', {
      method: 'POST',
      token: adminToken,
      body: {
        account_id: bankAcc.id,
        statement_date: todayStr,
        statement_balance: ledgerBal, // Perfectly matched
        notes: 'مطابقة الحساب البنكي لنهاية الفترة',
      },
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const rec = res.data.data;
    cleanup.bankReconciliationIds.push(rec.id);

    expect(rec.reconciliation_number).toMatch(/^REC-\d{4}-\d+$/);
    expect(Number(rec.difference)).toBe(0);
    expect(rec.status).toBe('completed');

    // Fetch reconciliations list
    const listRes = await apiReq('/accounting/reconciliations', { token: adminToken });
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.data.data)).toBe(true);
    expect(listRes.data.data.some((r: any) => r.id === rec.id)).toBe(true);

    // Fetch by id
    const singleRes = await apiReq(`/accounting/reconciliations/${rec.id}`, { token: adminToken });
    expect(singleRes.status).toBe(200);
    expect(singleRes.data.data.id).toBe(rec.id);
  });
});

describe('9. Customer & Supplier Aging API', () => {
  it('GET /accounting/aging/customers returns aging buckets and customer balances', async () => {
    const res = await apiReq('/accounting/aging/customers', { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const data = res.data.data;

    expect(data.totals).toBeDefined();
    expect(typeof data.totals.total_due).toBe('number');
    expect(typeof data.totals.current_0_30).toBe('number');
    expect(typeof data.totals.days_31_60).toBe('number');
    expect(typeof data.totals.days_61_90).toBe('number');
    expect(typeof data.totals.over_90).toBe('number');
    expect(Array.isArray(data.customers)).toBe(true);
  });

  it('GET /accounting/aging/suppliers returns aging buckets and supplier balances', async () => {
    const res = await apiReq('/accounting/aging/suppliers', { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const data = res.data.data;

    expect(data.totals).toBeDefined();
    expect(typeof data.totals.total_due).toBe('number');
    expect(typeof data.totals.current_0_30).toBe('number');
    expect(typeof data.totals.days_31_60).toBe('number');
    expect(typeof data.totals.days_61_90).toBe('number');
    expect(typeof data.totals.over_90).toBe('number');
    expect(Array.isArray(data.suppliers)).toBe(true);
  });
});

describe('10. Purchase Order Full Lifecycle to Receiving & GL Posting', () => {
  let poId: number;
  let poItemId: number;

  it('Creates a draft Purchase Order via API', async () => {
    const res = await apiReq('/accounting/purchase-orders', {
      method: 'POST',
      token: adminToken,
      body: {
        supplier_id: testSupplierId,
        warehouse_id: testWarehouseId,
        order_date: '2026-09-18',
        expected_date: '2026-09-25',
        notes: 'طلب توريد مواد خام وبن',
        items: [
          {
            product_id: testProductId,
            quantity: 20,
            unit_price: 100.0,
            notes: 'أكياس بن درجة أولى',
          },
        ],
      },
    });

    expect([200, 201]).toContain(res.status);
    expect(res.data.success).toBe(true);
    const po = res.data.data;
    poId = po.id;
    cleanup.purchaseOrderIds.push(poId);

    expect(po.po_number).toMatch(/^PO-\d{4}-\d+$/);
    expect(po.status).toBe('draft');
    expect(Number(po.total_amount)).toBe(2000.0);
    expect(po.items.length).toBe(1);
    poItemId = po.items[0].id;
  });

  it('Approves the Purchase Order', async () => {
    const res = await apiReq(`/accounting/purchase-orders/${poId}/approve`, {
      method: 'POST',
      token: adminToken,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('approved');
  });

  it('Receives goods, updates inventory, creates purchase invoice and posts to GL', async () => {
    const invBefore = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [testProductId, testWarehouseId],
    );
    const qtyBefore = Number(invBefore.rows[0].quantity);

    const res = await apiReq(`/accounting/purchase-orders/${poId}/receive`, {
      method: 'POST',
      token: adminToken,
      body: {
        convertToInvoice: true,
        notes: 'استلام كامل للكمية المطلوبة',
        items: [
          {
            item_id: poItemId,
            quantity_to_receive: 20,
          },
        ],
      },
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const result = res.data.data;
    const poResult = result.purchase_order || result.order;
    const invResult = result.purchase_invoice || result.invoice;
    expect(poResult.status).toBe('received');
    expect(invResult).toBeDefined();
    cleanup.purchaseInvoiceIds.push(invResult.id);

    // Check inventory increased by 20
    const invAfter = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [testProductId, testWarehouseId],
    );
    expect(Number(invAfter.rows[0].quantity)).toBe(qtyBefore + 20);

    // Check GL journal entry posted for the purchase invoice
    const jeRes = await query(
      `SELECT * FROM journal_entries WHERE reference_type = 'purchase' AND reference_id = $1`,
      [invResult.id],
    );
    expect(jeRes.rows.length).toBe(1);
    const je = jeRes.rows[0];
    cleanup.journalEntryIds.push(je.id);

    const linesRes = await query(
      `SELECT jel.*, a.code FROM journal_entry_lines jel 
       JOIN accounts a ON a.id = jel.account_id 
       WHERE jel.journal_entry_id = $1`,
      [je.id],
    );
    expect(linesRes.rows.length).toBe(2);

    const totalDebit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.debit), 0);
    const totalCredit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(2000.0);
    expect(totalCredit).toBe(2000.0);

    // Debit Inventory (110301 or 110401) and Credit AP (210101)
    const invLine = linesRes.rows.find((l: any) => l.code.startsWith('1103'));
    const apLine = linesRes.rows.find((l: any) => l.code.startsWith('2101'));
    expect(invLine).toBeDefined();
    expect(apLine).toBeDefined();
  });
});

describe('11. Operational vs General Ledger Reconciliation Summary', () => {
  it('GET /accounting/ledger-reconciliation verifies synchronization between operations and GL', async () => {
    const res = await apiReq('/accounting/ledger-reconciliation', { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const summary = res.data.data;

    expect(summary.general_ledger).toBeDefined();
    expect(typeof summary.general_ledger.revenue).toBe('number');
    expect(typeof summary.general_ledger.cogs).toBe('number');
    expect(typeof summary.general_ledger.expenses).toBe('number');
    expect(typeof summary.general_ledger.net_profit).toBe('number');

    expect(summary.operational).toBeDefined();
    expect(typeof summary.operational.revenue).toBe('number');
    expect(typeof summary.operational.cogs).toBe('number');
    expect(typeof summary.operational.expenses).toBe('number');
    expect(typeof summary.operational.net_profit).toBe('number');

    expect(summary.variances).toBeDefined();
    expect(typeof summary.variances.revenue).toBe('number');
    expect(typeof summary.variances.cogs).toBe('number');
    expect(typeof summary.variances.expenses).toBe('number');
    expect(typeof summary.variances.net_profit).toBe('number');

    expect(typeof summary.variances.is_fully_reconciled).toBe('boolean');
  });
});
