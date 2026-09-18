/**
 * tests/golden-financial-scenario.test.ts — سيناريو الدورة المالية الشاملة (Golden Scenario)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * يختبر دورة حياة مالية حقيقية متكاملة من الألف إلى الياء:
 *  1. حقن رأس المال بقيد افتتاحي
 *  2. دورة المشتريات: أمر شراء -> اعتماد -> استلام بضاعة ذري -> فاتورة ومخزن وقيود GL
 *  3. سداد مستحقات المورد
 *  4. مبيعات بالآجل -> تسجيل إيراد وتكلفة بضاعة مباعة COGS
 *  5. تحصيل مستحقات العميل في البنك
 *  6. مرتجع مبيعات رباعي الأطراف (إيراد، بنك/نقدية، تكلفة، مخزون)
 *  7. دورة الرواتب: اعتماد استحقاق (Accrual) -> صرف بنكي (Disbursement)
 *  8. استيراد كشف حساب بنكي CSV ومطابقته آلياً واعتماد جلسة التسوية (الفارق = 0)
 *  9. تدقيق مطابقة أرصدة أعمار الديون مع حسابات المراقبة (Control Accounts)
 *  10. فحص قائمة تدقيق إقفال الفترة (Checklist) وإقفال الفترة وتأكيد تفعيل القفل
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import app from '../src/app.ts';
import { query } from '../src/database/pool.ts';
import { accountingService } from '../src/services/accountingService.ts';
import { purchaseOrderService } from '../src/services/purchaseOrderService.ts';
import { recordSupplierPayment } from '../src/services/supplierService.ts';
import { recordPayment } from '../src/services/customerService.ts';
import { createDailySale, returnSale } from '../src/services/salesService.ts';
import { createOrRecalculatePayroll, approvePayrollRun, payPayrollRun } from '../src/services/hrService.ts';
import { bankReconciliationService } from '../src/services/bankReconciliationService.ts';
import { financialPeriodService } from '../src/services/financialPeriodService.ts';
import { businessToday } from '../src/utils/localDate.ts';

let server: http.Server;
let baseUrl: string;
let adminToken: string;
let adminUserId: number;

const cleanup = {
  journalEntryIds: [] as number[],
  purchaseOrderIds: [] as number[],
  purchaseInvoiceIds: [] as number[],
  saleIds: [] as number[],
  payrollRunIds: [] as number[],
  reconciliationIds: [] as number[],
  periodIds: [] as number[],
  productIds: [] as number[],
  warehouseIds: [] as number[],
  supplierIds: [] as number[],
  customerIds: [] as number[],
  employeeIds: [] as number[],
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

// Fixture IDs
let warehouseId: number;
let productId: number;
let supplierId: number;
let customerId: number;
let employeeId: number;
let bankAccountId: number;
let cashAccountId: number;
let capitalAccountId: number;

const TEST_DATE = businessToday();
const CURRENT_MONTH = TEST_DATE.slice(0, 7);

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;

  // Create admin user
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('GoldenScenarioPass123!', salt);
  const roleRes = await query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
  const roleId = roleRes.rows[0]?.id || 1;

  const uRes = await query(
    `INSERT INTO users (username, password_hash, full_name, role_id, is_active)
     VALUES ($1, $2, $3, $4, TRUE) RETURNING id, username`,
    [`test_golden_admin_${Date.now()}`, hash, 'Test Golden Admin', roleId],
  );
  adminUserId = uRes.rows[0].id;
  cleanup.userIds.push(adminUserId);

  const loginRes = await apiReq('/auth/login', {
    method: 'POST',
    body: { username: uRes.rows[0].username, password: 'GoldenScenarioPass123!' },
  });
  adminToken = loginRes.data.data?.token || loginRes.data.token;

  // Retrieve accounts
  const accRes = await query(
    `SELECT id, code FROM accounts WHERE code IN ('1101', '110103', '3101')`,
  );
  for (const row of accRes.rows) {
    if (row.code === '1101') cashAccountId = row.id;
    if (row.code === '110103') bankAccountId = row.id;
    if (row.code === '3101') capitalAccountId = row.id;
  }

  // تنظيف أي حركات تجريبية سابقة لضمان بيئة محاسبية نقية للسيناريو الذهبي
  await query(`DELETE FROM invoice_items`);
  await query(`DELETE FROM invoices`);
  await query(`DELETE FROM payments`);
  await query(`DELETE FROM sale_items`);
  await query(`DELETE FROM sales`);
  await query(`DELETE FROM purchase_return_items`);
  await query(`DELETE FROM purchase_returns`);
  await query(`DELETE FROM purchase_invoice_items`);
  await query(`DELETE FROM purchase_invoices`);
  await query(`DELETE FROM purchase_order_items`);
  await query(`DELETE FROM purchase_orders`);
  await query(`DELETE FROM journal_entry_lines`);
  await query(`DELETE FROM journal_entries`);

  // 1. Warehouse
  const whRes = await query(
    `INSERT INTO warehouses (name_ar, code, type, is_active)
     VALUES ($1, $2, 'main', TRUE) RETURNING id`,
    [`مستودع السيناريو الذهبي ${Date.now()}`, `WH-${Date.now() % 100000}`],
  );
  warehouseId = whRes.rows[0].id;
  cleanup.warehouseIds.push(warehouseId);

  // 2. Product (cost 100, price 200)
  const pRes = await query(
    `INSERT INTO products (sku, name_ar, sale_price, purchase_price, primary_warehouse_id, is_active)
     VALUES ($1, $2, 200.00, 100.00, $3, TRUE) RETURNING id`,
    [`SKU-${Date.now() % 100000}`, `منتج بن ذهبي فاخر ${Date.now()}`, warehouseId],
  );
  productId = pRes.rows[0].id;
  cleanup.productIds.push(productId);

  // Initial inventory: 0
  await query(
    `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 0)`,
    [productId, warehouseId],
  );

  // 3. Supplier
  const supRes = await query(
    `INSERT INTO suppliers (name_ar, phone, balance) VALUES ($1, $2, 0.00) RETURNING id`,
    [`مورد السيناريو الذهبي ${Date.now()}`, `0100${Date.now().toString().slice(-7)}`],
  );
  supplierId = supRes.rows[0].id;
  cleanup.supplierIds.push(supplierId);

  // 4. Customer
  const custRes = await query(
    `INSERT INTO customers (name_ar, phone, balance) VALUES ($1, $2, 0.00) RETURNING id`,
    [`عميل السيناريو الذهبي ${Date.now()}`, `0111${Date.now().toString().slice(-7)}`],
  );
  customerId = custRes.rows[0].id;
  cleanup.customerIds.push(customerId);

  // 5. Employee (deactivate any other employees to isolate payroll run)
  await query(`UPDATE employees SET is_active = FALSE`);
  const empRes = await query(
    `INSERT INTO employees (code, full_name, phone, base_salary, is_active)
     VALUES ($1, $2, $3, 6000.00, TRUE) RETURNING id`,
    [`EMP-${Date.now() % 100000}`, `موظف محاسبة ذهبي ${Date.now()}`, `0122${Date.now().toString().slice(-7)}`],
  );
  employeeId = empRes.rows[0].id;
  cleanup.employeeIds.push(employeeId);

  // تسجيل حضور 26 يوم للموظف ليحسب راتبه الصافي كاملاً 6000 ج.م
  for (let d = 1; d <= 26; d++) {
    const dayStr = String(d).padStart(2, '0');
    await query(
      `INSERT INTO employee_attendance (employee_id, work_date, status, regular_hours)
       VALUES ($1, $2, 'present', 8)`,
      [employeeId, `${CURRENT_MONTH}-${dayStr}`],
    );
  }

  // Ensure reference_type allows reversal
  await query(`ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;`);
  await query(`ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_reference_type_check 
    CHECK (reference_type IN ('sale', 'purchase', 'payment', 'expense', 'payroll', 'stocktake', 'purchase_return', 'manual', 'opening', 'transfer', 'reversal'));`);
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));

  if (cleanup.periodIds.length > 0) {
    await query(`UPDATE financial_periods SET status = 'open' WHERE id = ANY($1::int[])`, [cleanup.periodIds]);
    await query(`DELETE FROM financial_periods WHERE id = ANY($1::int[])`, [cleanup.periodIds]);
  }

  if (cleanup.reconciliationIds.length > 0) {
    await query(
      `DELETE FROM bank_statement_transactions WHERE reconciliation_id = ANY($1::int[])`,
      [cleanup.reconciliationIds],
    );
    await query(
      `DELETE FROM bank_reconciliations WHERE id = ANY($1::int[])`,
      [cleanup.reconciliationIds],
    );
  }
  if (cleanup.payrollRunIds.length > 0) {
    await query(`DELETE FROM payroll_items WHERE payroll_run_id = ANY($1::int[])`, [cleanup.payrollRunIds]);
    await query(`DELETE FROM payroll_runs WHERE id = ANY($1::int[])`, [cleanup.payrollRunIds]);
  }
  if (cleanup.journalEntryIds.length > 0) {
    await query(`DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1::int[])`, [cleanup.journalEntryIds]);
    await query(`DELETE FROM journal_entries WHERE id = ANY($1::int[])`, [cleanup.journalEntryIds]);
  }
  if (cleanup.saleIds.length > 0) {
    await query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE sale_id = ANY($1::int[]))`, [cleanup.saleIds]);
    await query(`DELETE FROM invoices WHERE sale_id = ANY($1::int[])`, [cleanup.saleIds]);
    await query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = ANY($1::int[])`, [cleanup.saleIds]);
    await query(`DELETE FROM stock_movements WHERE reference_type IN ('sale', 'sale_return') AND reference_id = ANY($1::int[])`, [cleanup.saleIds]);
    await query(`DELETE FROM sale_items WHERE sale_id = ANY($1::int[])`, [cleanup.saleIds]);
    await query(`DELETE FROM sales WHERE id = ANY($1::int[])`, [cleanup.saleIds]);
  }
  if (cleanup.purchaseOrderIds.length > 0) {
    await query(`DELETE FROM purchase_order_items WHERE purchase_order_id = ANY($1::int[])`, [cleanup.purchaseOrderIds]);
    await query(`DELETE FROM purchase_orders WHERE id = ANY($1::int[])`, [cleanup.purchaseOrderIds]);
  }
  if (cleanup.purchaseInvoiceIds.length > 0) {
    await query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ANY($1::int[])`, [cleanup.purchaseInvoiceIds]);
    await query(`DELETE FROM purchase_invoices WHERE id = ANY($1::int[])`, [cleanup.purchaseInvoiceIds]);
  }
  if (cleanup.employeeIds.length > 0) {
    await query(`DELETE FROM employee_attendance WHERE employee_id = ANY($1::int[])`, [cleanup.employeeIds]);
    await query(`DELETE FROM employees WHERE id = ANY($1::int[])`, [cleanup.employeeIds]);
  }
  if (cleanup.customerIds.length > 0) {
    await query(`DELETE FROM payments WHERE (reference_type = 'customer_opening' OR reference_type = 'customer_advance') AND reference_id = ANY($1::int[])`, [cleanup.customerIds]);
    await query(`DELETE FROM customers WHERE id = ANY($1::int[])`, [cleanup.customerIds]);
  }
  if (cleanup.supplierIds.length > 0) {
    await query(`DELETE FROM payments WHERE reference_type = 'supplier' AND reference_id = ANY($1::int[])`, [cleanup.supplierIds]);
    await query(`DELETE FROM suppliers WHERE id = ANY($1::int[])`, [cleanup.supplierIds]);
  }
  if (cleanup.productIds.length > 0) {
    await query(`DELETE FROM stock_movements WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
    await query(`DELETE FROM inventory WHERE product_id = ANY($1::int[])`, [cleanup.productIds]);
    await query(`DELETE FROM products WHERE id = ANY($1::int[])`, [cleanup.productIds]);
  }
  if (cleanup.warehouseIds.length > 0) {
    await query(`DELETE FROM warehouses WHERE id = ANY($1::int[])`, [cleanup.warehouseIds]);
  }
  if (cleanup.userIds.length > 0) {
    await query(`DELETE FROM expenses WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
    await query(`DELETE FROM payments WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
    await query(`DELETE FROM activity_logs WHERE user_id = ANY($1::int[])`, [cleanup.userIds]);
    await query(`DELETE FROM users WHERE id = ANY($1::int[])`, [cleanup.userIds]);
  }
});

describe('Golden Financial Lifecycle Scenario', () => {
  let poId: number;
  let purchaseInvoiceId: number;
  let saleId: number;
  let payrollRunId: number;
  let reconciliationId: number;
  let periodId: number;

  it('Step 1: Capital injection via manual journal entry (100,000 EGP)', async () => {
    const entry = await accountingService.createJournalEntry({
      entry_date: TEST_DATE,
      description: 'إيداع رأس مال في الحساب البنكي',
      created_by: adminUserId,
      lines: [
        { account_id: bankAccountId, debit: 100000, credit: 0, description: 'إيداع بنك' },
        { account_id: capitalAccountId, debit: 0, credit: 100000, description: 'رأس مال' },
      ],
    });
    cleanup.journalEntryIds.push(entry.id);

    const tb = await accountingService.getTrialBalance(TEST_DATE, TEST_DATE);
    expect(tb.totals.is_balanced).toBe(true);
    expect(tb.totals.variance).toBe(0);
  });

  it('Step 2: PO creation, approval, and atomic goods receiving (5,000 EGP)', async () => {
    // 1. Create PO for 50 units @ 100 EGP
    const po = await purchaseOrderService.createPurchaseOrder(adminUserId, {
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      order_date: TEST_DATE,
      items: [{ product_id: productId, quantity: 50, unit_price: 100 }],
    });
    poId = po.id;
    cleanup.purchaseOrderIds.push(poId);

    // 2. Approve PO
    await purchaseOrderService.approvePurchaseOrder(poId, adminUserId);

    // 3. Receive Goods atomically with convertToInvoice = true
    const receiveResult = await purchaseOrderService.receiveGoods(poId, adminUserId, {
      items: [{ item_id: po.items[0].id!, quantity_to_receive: 50 }],
      convertToInvoice: true,
    });

    expect(receiveResult.purchase_invoice).toBeDefined();
    purchaseInvoiceId = receiveResult.purchase_invoice.id;
    cleanup.purchaseInvoiceIds.push(purchaseInvoiceId);

    // Check inventory incremented to 50
    const invRes = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    expect(Number(invRes.rows[0].quantity)).toBe(50);

    // Check GL posting: Dr 1103 (5000), Cr 2101 (5000)
    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'purchase' AND reference_id = $1`,
      [purchaseInvoiceId],
    );
    expect(jeRes.rows.length).toBe(1);
    cleanup.journalEntryIds.push(jeRes.rows[0].id);

    // Supplier balance should now be 5,000 due
    const supRes = await query(`SELECT balance FROM suppliers WHERE id = $1`, [supplierId]);
    expect(Number(supRes.rows[0].balance)).toBe(5000);
  });

  it('Step 3: Supplier payment (5,000 EGP via Bank)', async () => {
    const payRes = await recordSupplierPayment(
      supplierId,
      {
        amount: 5000,
        payment_method: 'bank',
        payment_date: TEST_DATE,
        notes: 'سداد فاتورة مشتريات عبر البنك',
      },
      adminUserId,
    );

    // Check GL journal posted: Dr 210101 (5000), Cr 110103 (5000)
    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`supplier_payment:${payRes.id}`],
    );
    expect(jeRes.rows.length).toBe(1);
    cleanup.journalEntryIds.push(jeRes.rows[0].id);

    // Supplier balance should be 0
    const supRes = await query(`SELECT balance FROM suppliers WHERE id = $1`, [supplierId]);
    expect(Number(supRes.rows[0].balance)).toBe(0);
  });

  it('Step 4: Wholesale sale with receivable (20 units @ 200 = 4,000 EGP)', async () => {
    const sale = await createDailySale({
      date: TEST_DATE,
      sale_date: TEST_DATE,
      total_amount: 4000,
      paid_amount: 0, // on credit
      remaining_amount: 4000,
      payment_status: 'unpaid',
      payment_method: 'credit',
      sale_type: 'wholesale',
      warehouse_id: warehouseId,
      customer_id: customerId,
      items: [{ product_id: productId, quantity: 20, unit_price: 200, subtotal: 4000 }],
    }, adminUserId);

    saleId = sale.id;
    cleanup.saleIds.push(saleId);

    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`sale:${saleId}`],
    );
    if (jeRes.rows.length > 0) {
      cleanup.journalEntryIds.push(jeRes.rows[0].id);
    }

    // Inventory should now be 30 units (50 - 20)
    const invRes = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    expect(Number(invRes.rows[0].quantity)).toBe(30);

    // Customer balance should be 4000
    const custRes = await query(`SELECT balance FROM customers WHERE id = $1`, [customerId]);
    expect(Number(custRes.rows[0].balance)).toBe(4000);
  });

  it('Step 5: Customer payment (4,000 EGP via Bank)', async () => {
    await recordPayment(customerId, {
      amount: 4000,
      payment_method: 'bank',
      payment_date: TEST_DATE,
      notes: 'تحصيل مديونية العميل عبر البنك',
      user_id: adminUserId,
    });

    // Check GL entry: Dr 110103 (4000), Cr 1102 (4000)
    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`customer_payment:${customerId}`],
    );
    expect(jeRes.rows.length).toBe(1);
    cleanup.journalEntryIds.push(jeRes.rows[0].id);

    // Customer balance should be 0
    const custRes = await query(`SELECT balance FROM customers WHERE id = $1`, [customerId]);
    expect(Number(custRes.rows[0].balance)).toBe(0);
  });

  it('Step 6: Customer return with 4-leg reversal', async () => {
    // إنشاء بيع فرعي نقدي (5 وحدات = 1000 ج.م) ثم إرجاعه
    const sale2 = await createDailySale({
      date: TEST_DATE,
      sale_date: TEST_DATE,
      total_amount: 1000,
      paid_amount: 1000,
      payment_status: 'paid',
      payment_method: 'cash',
      sale_type: 'branch',
      warehouse_id: warehouseId,
      items: [{ product_id: productId, quantity: 5, unit_price: 200, subtotal: 1000 }],
    }, adminUserId);
    cleanup.saleIds.push(sale2.id);

    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`sale:${sale2.id}`],
    );
    if (jeRes.rows.length > 0) {
      cleanup.journalEntryIds.push(jeRes.rows[0].id);
    }

    // المخزون بعد البيع الثاني: 25 وحدة (30 - 5)
    let invRes = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    expect(Number(invRes.rows[0].quantity)).toBe(25);

    // تنفيذ المرتجع
    const returnResult = await returnSale(sale2.id, adminUserId, 'إرجاع عميل عينة');
    expect(returnResult.status).toBe('returned');

    // التحقق من قيد المرتجع الرباعي
    const refundJE = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`sales_refund:${sale2.id}`],
    );
    expect(refundJE.rows.length).toBe(1);
    cleanup.journalEntryIds.push(refundJE.rows[0].id);

    const refundLines = await query(
      `SELECT account_id, debit, credit FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [refundJE.rows[0].id],
    );
    expect(refundLines.rows.length).toBe(4);

    // استعادة المخزون إلى 30 وحدة
    invRes = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    expect(Number(invRes.rows[0].quantity)).toBe(30);
  });

  it('Step 7: HR Payroll Cycle (Accrual & Disbursement via Bank)', async () => {
    // 1. Create payroll run for current month
    const payrollRun = await createOrRecalculatePayroll(CURRENT_MONTH, adminUserId);
    payrollRunId = payrollRun.id;
    cleanup.payrollRunIds.push(payrollRunId);

    // 2. Approve payroll run -> Posts Accrual GL Entry
    const approved = await approvePayrollRun(payrollRunId, adminUserId);
    expect(approved.status).toBe('approved');

    const accrualJE = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`payroll_accrual:${payrollRunId}`],
    );
    expect(accrualJE.rows.length).toBe(1);
    cleanup.journalEntryIds.push(accrualJE.rows[0].id);

    // 3. Pay payroll run -> Posts Disbursement GL Entry
    const paid = await payPayrollRun(payrollRunId, adminUserId, 'bank');
    expect(paid.status).toBe('paid');

    const disbJE = await query(
      `SELECT id FROM journal_entries WHERE idempotency_key = $1`,
      [`payroll_disbursement:${payrollRunId}`],
    );
    expect(disbJE.rows.length).toBe(1);
    cleanup.journalEntryIds.push(disbJE.rows[0].id);
  });

  it('Step 8: Bank Statement Import & Smart Auto-Matching Engine', async () => {
    // 1. Create bank reconciliation session for account 110103 as of TEST_DATE
    // Expected ledger balance in Bank 110103:
    // +100,000 (capital) - 5,000 (supplier) + 4,000 (customer) - 6,000 (payroll) = 93,000 EGP
    const ledgerBal = await accountingService.getLedgerBalanceAsOfDate(bankAccountId, TEST_DATE);
    expect(ledgerBal).toBe(93000);

    const rec = await bankReconciliationService.createReconciliation(adminUserId, {
      account_id: bankAccountId,
      statement_date: TEST_DATE,
      statement_balance: 93000,
      status: 'draft',
      notes: 'مطابقة بنكية ذهبية متكاملة',
    });
    reconciliationId = rec.id;
    cleanup.reconciliationIds.push(reconciliationId);

    // 2. Prepare CSV statement content matching the bank movements
    const csvContent = [
      'Date,Description,Reference,Debit,Credit',
      `${TEST_DATE},إيداع رأس مال شريك,DEP-001,0,100000`,
      `${TEST_DATE},سداد مورد خامات بن,PAY-002,5000,0`,
      `${TEST_DATE},تحصيل عميل بن,RCV-003,0,4000`,
      `${TEST_DATE},صرف رواتب شهر سبتمبر,SAL-004,6000,0`,
    ].join('\n');

    // 3. Import bank statement
    const importRes = await bankReconciliationService.importBankStatement(
      reconciliationId,
      Buffer.from(csvContent, 'utf-8'),
      'statement.csv',
    );
    expect(importRes.imported_count).toBe(4);

    // 4. Run smart auto-match
    const autoMatchRes = await bankReconciliationService.autoMatchTransactions(reconciliationId);
    expect(autoMatchRes.matched_count).toBe(4);
    expect(autoMatchRes.remaining_unmatched).toBe(0);

    // 5. Finalize reconciliation with 0 difference
    const finalized = await bankReconciliationService.finalizeReconciliation(
      reconciliationId,
      adminUserId,
    );
    expect(finalized.status).toBe('completed');
    expect(Number(finalized.difference)).toBe(0);
  });

  it('Step 9: Subledger vs Control Account Aging Reconciliation', async () => {
    const agingRec = await accountingService.reconcileAgingWithLedger(TEST_DATE);
    expect(agingRec.is_all_reconciled).toBe(true);
    expect(agingRec.customers.variance).toBe(0);
    expect(agingRec.suppliers.variance).toBe(0);
  });

  it('Step 10: Financial Period Checklist, Closing & Database Trigger Enforcement', async () => {
    // 1. Create financial period for current month
    const [y, m] = CURRENT_MONTH.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const period = await financialPeriodService.createPeriod(adminUserId, {
      period_code: `${CURRENT_MONTH}-GOLD-${Date.now()}`,
      period_name: `فترة ${CURRENT_MONTH} الذهبية`,
      start_date: `${CURRENT_MONTH}-01`,
      end_date: `${CURRENT_MONTH}-${String(lastDay).padStart(2, '0')}`,
      fiscal_year: y,
    });
    periodId = period.id;
    cleanup.periodIds.push(periodId);

    // 2. Fetch Checklist
    const checklist = await financialPeriodService.getCloseChecklist(periodId);
    expect(checklist.is_ready_to_close).toBe(true);
    expect(checklist.blockers.length).toBe(0);
    expect(checklist.checks.unbalanced_journal_entries.passed).toBe(true);
    expect(checklist.checks.draft_journal_entries.passed).toBe(true);
    expect(checklist.checks.unreconciled_bank_sessions.passed).toBe(true);
    expect(checklist.checks.aging_ledger_discrepancies.passed).toBe(true);

    // 3. Close the period
    const closed = await financialPeriodService.closePeriod(periodId, adminUserId);
    expect(closed.status).toBe('closed');

    // 4. Verify trigger blocks any modification in the closed period
    let triggerBlocked = false;
    try {
      await accountingService.createJournalEntry({
        entry_date: `${CURRENT_MONTH}-15`,
        description: 'حركة غير مسموحة بعد الإقفال',
        created_by: adminUserId,
        lines: [
          { account_id: cashAccountId, debit: 500, credit: 0 },
          { account_id: capitalAccountId, debit: 0, credit: 500 },
        ],
      });
    } catch (err: any) {
      if (err.message && /فترة.*(مغلقة|مقفلة)/.test(err.message)) {
        triggerBlocked = true;
      }
    }
    expect(triggerBlocked).toBe(true);

    // Reopen period so that cleanup operations and subsequent tests proceed normally
    await financialPeriodService.reopenPeriod(periodId, adminUserId, 'إعادة فتح بعد انتهاء الاختبار بنجاح');
  });
});
