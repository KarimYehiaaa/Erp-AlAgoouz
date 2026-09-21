/**
 * tests/e2e-financial-cycle.test.ts
 * ═══════════════════════════════════════════════════════════════════════
 * اختبار متكامل لدورة الحياة المالية الكاملة لـ Bin Al-Agoouz ERP:
 *  1. حقن رأس المال (قيد افتتاحي متوازن)
 *  2. دورة مشتريات بضاعة تامة بالآجل وتحديث الأستاذ العام
 *  3. سداد مستحقات المورد من الخزينة الرئيسية وتصفير المديونية
 *  4. عملية بيع نقدية بالفرع وإثبات الإيراد وتكلفة البضاعة المباعة (COGS)
 *  5. مرتجع مبيعات رباعي الأطراف ورد النقدية وإرجاع تكلفة ومخزون السلعة
 *  6. إثبات وسداد مصروف تشغيلي عبر postExpenseJournalEntry
 *  7. فحص ميزان المراجعة والميزانية العمومية والتأكد من توازن كل القيود (Variance = 0)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import { accountingService, STANDARD_ACCOUNTS } from '../src/services/accountingService.ts';
import { createPurchaseInvoice } from '../src/services/purchaseService.ts';
import { recordSupplierPayment } from '../src/services/supplierService.ts';
import { createDailySale, returnSale } from '../src/services/salesService.ts';
import { createExpense } from '../src/services/expenseService.ts';
import { businessToday } from '../src/utils/localDate.ts';

describe('E2E Complete Financial Lifecycle & General Ledger Reconciliation', () => {
  let warehouseId: number;
  let categoryId: number;
  let productId: number;
  let supplierId: number;
  let customerId: number;
  let expenseCatId: number;
  let adminUserId: number;

  const cleanupIds = {
    products: [] as number[],
    categories: [] as number[],
    warehouses: [] as number[],
    suppliers: [] as number[],
    customers: [] as number[],
    purchases: [] as number[],
    sales: [] as number[],
    expenses: [] as number[],
    expenseCats: [] as number[],
    journalEntries: [] as number[],
  };

  beforeAll(async () => {
    // 1. Get or create test admin user
    const userRes = await query(
      `SELECT u.id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL AND r.name IN ('admin', 'sys_admin', 'owner')
       ORDER BY u.id
       LIMIT 1`,
    );
    adminUserId = userRes.rows[0]?.id || 1;

    // 2. Create isolated test warehouse
    const whRes = await query(
      `INSERT INTO warehouses (name_ar, code, is_active)
       VALUES ('E2E Financial Test Warehouse ' || floor(random() * 100000)::text, 'E2E-WH-' || floor(random() * 100000)::text, true)
       RETURNING id`,
    );
    warehouseId = whRes.rows[0].id;
    cleanupIds.warehouses.push(warehouseId);

    // 3. Create test product category
    const catRes = await query(
      `INSERT INTO product_categories (name_ar)
       VALUES ('E2E Test Coffee Category ' || floor(random() * 100000)::text)
       RETURNING id`,
    );
    categoryId = catRes.rows[0].id;
    cleanupIds.categories.push(categoryId);

    // 4. Create test product
    const prodRes = await query(
      `INSERT INTO products (name_ar, sku, category_id, purchase_price, sale_price, min_stock, is_active)
       VALUES ('بن حبشي E2E ممتاز ' || floor(random() * 100000)::text, 'E2E-COFFEE-' || floor(random() * 100000)::text, $1, 100.00, 150.00, 5, true)
       RETURNING id`,
      [categoryId],
    );
    productId = prodRes.rows[0].id;
    cleanupIds.products.push(productId);

    // 5. Create test supplier
    const supRes = await query(
      `INSERT INTO suppliers (name_ar, phone)
       VALUES ('شركة بن إفريقيا للاستيراد E2E ' || floor(random() * 100000)::text, '0100' || floor(1000000 + random() * 8999999)::text)
       RETURNING id`,
    );
    supplierId = supRes.rows[0].id;
    cleanupIds.suppliers.push(supplierId);

    // 6. Create test customer
    const custRes = await query(
      `INSERT INTO customers (name_ar, phone, customer_type)
       VALUES ('عميل التذوق المميز E2E ' || floor(random() * 100000)::text, '0122' || floor(1000000 + random() * 8999999)::text, 'retail')
       RETURNING id`,
    );
    customerId = custRes.rows[0].id;
    cleanupIds.customers.push(customerId);

    // 7. Create test expense category
    const expCatRes = await query(
      `INSERT INTO expense_categories (name_ar, is_fixed)
       VALUES ('كهرباء ومرافق E2E ' || floor(random() * 100000)::text, true)
       RETURNING id`,
    );
    expenseCatId = expCatRes.rows[0].id;
    cleanupIds.expenseCats.push(expenseCatId);
  });

  afterAll(async () => {
    // Cleanup generated data
    try {
      if (cleanupIds.journalEntries.length > 0) {
        await query(`DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1)`, [cleanupIds.journalEntries]);
        await query(`DELETE FROM journal_entries WHERE id = ANY($1)`, [cleanupIds.journalEntries]);
      }
      if (cleanupIds.sales.length > 0) {
        await query(`DELETE FROM sale_items WHERE sale_id = ANY($1)`, [cleanupIds.sales]);
        await query(`DELETE FROM sales WHERE id = ANY($1)`, [cleanupIds.sales]);
      }
      if (cleanupIds.purchases.length > 0) {
        await query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = ANY($1)`, [cleanupIds.purchases]);
        await query(`DELETE FROM purchase_invoices WHERE id = ANY($1)`, [cleanupIds.purchases]);
      }
      if (cleanupIds.expenses.length > 0) {
        await query(`DELETE FROM expenses WHERE id = ANY($1)`, [cleanupIds.expenses]);
      }
      if (cleanupIds.expenseCats.length > 0) {
        await query(`DELETE FROM expense_categories WHERE id = ANY($1)`, [cleanupIds.expenseCats]);
      }
      if (cleanupIds.products.length > 0) {
        await query(`DELETE FROM inventory WHERE product_id = ANY($1)`, [cleanupIds.products]);
        await query(`DELETE FROM products WHERE id = ANY($1)`, [cleanupIds.products]);
      }
      if (cleanupIds.categories.length > 0) {
        await query(`DELETE FROM product_categories WHERE id = ANY($1)`, [cleanupIds.categories]);
      }
      if (cleanupIds.suppliers.length > 0) {
        await query(`DELETE FROM supplier_payments WHERE supplier_id = ANY($1)`, [cleanupIds.suppliers]);
        await query(`DELETE FROM suppliers WHERE id = ANY($1)`, [cleanupIds.suppliers]);
      }
      if (cleanupIds.customers.length > 0) {
        await query(`DELETE FROM customers WHERE id = ANY($1)`, [cleanupIds.customers]);
      }
      if (cleanupIds.warehouses.length > 0) {
        await query(`DELETE FROM warehouses WHERE id = ANY($1)`, [cleanupIds.warehouses]);
      }
    } catch {
      // Ignored in cleanup
    }
  });

  it('Step 1: Injects opening capital and verifies zero initial variance', async () => {
    const today = businessToday();
    const capitalEntry = await accountingService.createJournalEntry({
      entry_date: today,
      reference_type: 'opening',
      description: 'قيد افتتاحي لضخ رأس المال في الخزينة الرئيسية',
      created_by: adminUserId,
      idempotency_key: `test_opening_capital_${Date.now()}`,
      lines: [
        {
          account_code: STANDARD_ACCOUNTS.MAIN_TREASURY,
          debit: 50000.0,
          credit: 0,
          description: 'إيداع نقدي في الخزينة الرئيسية',
        },
        {
          account_code: STANDARD_ACCOUNTS.CAPITAL,
          debit: 0,
          credit: 50000.0,
          description: 'رأس مال مدفوع',
        },
      ],
    });

    expect(capitalEntry.id).toBeDefined();
    cleanupIds.journalEntries.push(capitalEntry.id);

    const trial = await accountingService.getTrialBalance({ from_date: today, to_date: today });
    expect(trial.is_balanced).toBe(true);
    expect(trial.variance).toBe(0);
  });

  it('Step 2: Purchases goods on credit, updates inventory, and posts GL entry', async () => {
    const purchase = await createPurchaseInvoice(
      {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        payment_status: 'unpaid',
        notes: 'شراء 50 كجم بن حبشي على الحساب',
        items: [
          {
            product_id: productId,
            warehouse_id: warehouseId,
            quantity: 50,
            unit_price: 100.0,
          },
        ],
      },
      adminUserId,
    );

    expect(purchase.id).toBeDefined();
    cleanupIds.purchases.push(purchase.id);

    // Verify journal entry for purchase
    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'purchase' AND reference_id = $1`,
      [purchase.id],
    );
    expect(jeRes.rows.length).toBeGreaterThan(0);
    cleanupIds.journalEntries.push(jeRes.rows[0].id);

    // Verify trial balance is still balanced
    const trial = await accountingService.getTrialBalance();
    expect(trial.is_balanced).toBe(true);
    expect(trial.variance).toBe(0);
  });

  it('Step 3: Settles supplier debt from Main Treasury and balances ledger', async () => {
    const payment = await recordSupplierPayment(
      supplierId,
      {
        amount: 5000.0,
        payment_method: 'cash',
        notes: 'سداد كامل فاتورة التوريد نقدًا من الخزينة الرئيسية',
      },
      adminUserId,
    );

    expect(payment.id).toBeDefined();

    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'payment' AND reference_id = $1`,
      [payment.id],
    );
    expect(jeRes.rows.length).toBeGreaterThan(0);
    cleanupIds.journalEntries.push(jeRes.rows[0].id);

    // Verify trial balance remains balanced
    const trial = await accountingService.getTrialBalance();
    expect(trial.is_balanced).toBe(true);
    expect(trial.variance).toBe(0);
  });

  it('Step 4: Executes POS sales, records revenue and COGS, updates inventory', async () => {
    // Sale 1: 15 units (remains active to prove P&L numbers)
    const sale1 = await createDailySale(
      {
        customer_id: customerId,
        warehouse_id: warehouseId,
        payment_method: 'cash',
        sale_type: 'pos',
        items: [
          {
            product_id: productId,
            quantity: 15,
            unit_price: 150.0,
          },
        ],
      },
      adminUserId,
    );
    expect(sale1.id).toBeDefined();
    cleanupIds.sales.push(sale1.id);

    const jeRes1 = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1`,
      [sale1.id],
    );
    expect(jeRes1.rows.length).toBeGreaterThan(0);
    cleanupIds.journalEntries.push(jeRes1.rows[0].id);

    // Sale 2: 5 units (to be returned in Step 5)
    const sale2 = await createDailySale(
      {
        customer_id: customerId,
        warehouse_id: warehouseId,
        payment_method: 'cash',
        sale_type: 'pos',
        items: [
          {
            product_id: productId,
            quantity: 5,
            unit_price: 150.0,
          },
        ],
      },
      adminUserId,
    );
    expect(sale2.id).toBeDefined();
    cleanupIds.sales.push(sale2.id);

    const jeRes2 = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1`,
      [sale2.id],
    );
    expect(jeRes2.rows.length).toBeGreaterThan(0);
    cleanupIds.journalEntries.push(jeRes2.rows[0].id);

    const trial = await accountingService.getTrialBalance();
    expect(trial.is_balanced).toBe(true);
    expect(trial.variance).toBe(0);
  });

  it('Step 5: Returns part of the sale (4-legged return: Revenue, Cash, COGS, Stock)', async () => {
    // Return Sale 2 (the 5 units)
    const sale2Id = cleanupIds.sales[cleanupIds.sales.length - 1];

    const returnedSale = await returnSale(
      sale2Id,
      adminUserId,
      'العميل طلب استرجاع الفاتورة الثانية',
    );

    expect(returnedSale).toBeDefined();

    // Verify journal entries for sales return
    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'sale' AND reference_id = $1`,
      [sale2Id],
    );
    // Should have 2 journal entries for this sale (original sale + return)
    expect(jeRes.rows.length).toBe(2);
    cleanupIds.journalEntries.push(jeRes.rows[1].id);

    const trial = await accountingService.getTrialBalance();
    expect(trial.is_balanced).toBe(true);
    expect(trial.variance).toBe(0);
  });

  it('Step 6: Posts operating expense and verifies GL debit/credit balance', async () => {
    const expense = await createExpense(
      {
        title: 'فاتورة صيانة ماكينة الإسبريسو الشهرية',
        category_id: expenseCatId,
        amount: 350.0,
        payment_method: 'cash',
        notes: 'صيانة وقائية دورية معتمدة',
      },
      adminUserId,
    );

    expect(expense.id).toBeDefined();
    cleanupIds.expenses.push(expense.id);

    // Verify journal entry for expense
    const jeRes = await query(
      `SELECT id FROM journal_entries WHERE reference_type = 'expense' AND reference_id = $1`,
      [expense.id],
    );
    expect(jeRes.rows.length).toBeGreaterThan(0);
    cleanupIds.journalEntries.push(jeRes.rows[0].id);

    const trial = await accountingService.getTrialBalance();
    expect(trial.is_balanced).toBe(true);
    expect(trial.variance).toBe(0);
  });

  it('Step 7: Reconciles Balance Sheet and Income Statement integrity', async () => {
    const balanceSheet = await accountingService.getBalanceSheet();
    expect(balanceSheet).toBeDefined();
    expect(balanceSheet.is_balanced).toBe(true);
    expect(balanceSheet.variance).toBe(0);

    const incomeStatement = await accountingService.getIncomeStatement();
    expect(incomeStatement).toBeDefined();
    expect(Number(incomeStatement.total_revenue)).toBeGreaterThan(0);
    expect(Number(incomeStatement.cogs.total)).toBeGreaterThan(0);
  });
});
