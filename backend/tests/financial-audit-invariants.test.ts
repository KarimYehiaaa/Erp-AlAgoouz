import { describe, it, expect, afterAll, vi } from 'vitest';
import { query, getClient } from '../src/database/pool.ts';
import { accountingService, STANDARD_ACCOUNTS } from '../src/services/accountingService.ts';
import { recalculateSupplierBalance } from '../src/services/supplierService.ts';
import {
  createStocktake,
  updateStocktakeItems,
  completeStocktake,
} from '../src/services/stocktakeService.ts';
import { posShiftService } from '../src/services/posShiftService.ts';
import {
  createPurchaseInvoice,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
} from '../src/services/purchaseService.ts';
import {
  createDailySale,
  updateSale,
  deleteSalesByDate,
} from '../src/services/salesService.ts';

describe('Financial Audit Invariants Suite (Real PostgreSQL Invariants)', () => {
  const cleanup = {
    supplierIds: [] as number[],
    invoiceIds: [] as number[],
    purchaseReturnIds: [] as number[],
    periodIds: [] as number[],
    expenseIds: [] as number[],
    journalEntryIds: [] as number[],
    paymentIds: [] as number[],
    warehouseIds: [] as number[],
    productIds: [] as number[],
    categoryIds: [] as number[],
    stocktakeIds: [] as (number | string)[],
    customerIds: [] as number[],
    saleIds: [] as number[],
    shiftIds: [] as number[],
  };

  afterAll(async () => {
    // Cleanup generated records - ensure periods opened first
    if (cleanup.periodIds.length > 0) {
      await query("UPDATE financial_periods SET status = 'open' WHERE id = ANY($1)", [cleanup.periodIds]);
    }
    if (cleanup.shiftIds.length > 0) {
      await query('DELETE FROM pos_cash_movements WHERE shift_id = ANY($1)', [cleanup.shiftIds]);
      await query('DELETE FROM pos_shifts WHERE id = ANY($1)', [cleanup.shiftIds]);
    }
    if (cleanup.saleIds.length > 0) {
      await query('DELETE FROM sale_items WHERE sale_id = ANY($1)', [cleanup.saleIds]);
      await query('DELETE FROM invoices WHERE sale_id = ANY($1)', [cleanup.saleIds]);
      await query("DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = ANY($1)", [cleanup.saleIds]);
      await query('DELETE FROM sales WHERE id = ANY($1)', [cleanup.saleIds]);
    }
    if (cleanup.customerIds.length > 0) {
      await query('DELETE FROM customers WHERE id = ANY($1)', [cleanup.customerIds]);
    }
    if (cleanup.journalEntryIds.length > 0) {
      await query('DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1)', [cleanup.journalEntryIds]);
      await query('DELETE FROM journal_entries WHERE id = ANY($1)', [cleanup.journalEntryIds]);
    }
    if (cleanup.expenseIds.length > 0) {
      await query('DELETE FROM expenses WHERE id = ANY($1)', [cleanup.expenseIds]);
    }
    if (cleanup.paymentIds.length > 0) {
      await query('DELETE FROM payments WHERE id = ANY($1)', [cleanup.paymentIds]);
    }
    if (cleanup.stocktakeIds.length > 0) {
      await query('DELETE FROM stocktake_items WHERE stocktake_id = ANY($1)', [cleanup.stocktakeIds]);
      await query('DELETE FROM stocktakes WHERE id = ANY($1)', [cleanup.stocktakeIds]);
    }
    if (cleanup.purchaseReturnIds.length > 0) {
      await query('DELETE FROM purchase_return_items WHERE purchase_return_id = ANY($1)', [cleanup.purchaseReturnIds]).catch(() => {});
      await query('DELETE FROM purchase_returns WHERE id = ANY($1)', [cleanup.purchaseReturnIds]);
    }
    if (cleanup.invoiceIds.length > 0) {
      await query('DELETE FROM purchase_invoice_items WHERE invoice_id = ANY($1)', [cleanup.invoiceIds]).catch(() => {});
      await query('DELETE FROM purchase_invoices WHERE id = ANY($1)', [cleanup.invoiceIds]);
    }
    if (cleanup.warehouseIds.length > 0) {
      await query(
        'DELETE FROM inventory_cost_layers WHERE warehouse_id = ANY($1)',
        [cleanup.warehouseIds],
      );
      await query('DELETE FROM inventory WHERE warehouse_id = ANY($1)', [cleanup.warehouseIds]);
      await query(
        'DELETE FROM stock_movements WHERE from_warehouse_id = ANY($1) OR to_warehouse_id = ANY($1)',
        [cleanup.warehouseIds],
      );
    }
    if (cleanup.productIds.length > 0) {
      await query('DELETE FROM inventory_cost_layers WHERE product_id = ANY($1)', [cleanup.productIds]);
      await query('DELETE FROM inventory WHERE product_id = ANY($1)', [cleanup.productIds]);
      await query('DELETE FROM stock_movements WHERE product_id = ANY($1)', [cleanup.productIds]);
      await query('DELETE FROM products WHERE id = ANY($1)', [cleanup.productIds]);
    }
    if (cleanup.warehouseIds.length > 0) {
      await query('DELETE FROM warehouses WHERE id = ANY($1)', [cleanup.warehouseIds]);
    }
    if (cleanup.categoryIds.length > 0) {
      await query('DELETE FROM product_categories WHERE id = ANY($1)', [cleanup.categoryIds]);
    }
    if (cleanup.supplierIds.length > 0) {
      await query('DELETE FROM suppliers WHERE id = ANY($1)', [cleanup.supplierIds]);
    }
    if (cleanup.periodIds.length > 0) {
      await query('DELETE FROM financial_periods WHERE id = ANY($1)', [cleanup.periodIds]);
    }
  });

  describe('Invariant 1: Strict Double-Entry Equilibrium (1-Piastre Leak Prevention)', () => {
    it('يرفض قيد اليومية إذا كان هناك عدم توازن ولو بقرش واحد (0.01 EGP Imbalance)', async () => {
      const imbalancedData = {
        entry_date: new Date().toISOString().slice(0, 10),
        description: 'اختبار عدم التوازن بقرش واحد',
        lines: [
          {
            account_code: STANDARD_ACCOUNTS.MAIN_TREASURY,
            debit: 100.00,
            credit: 0,
            description: 'مدين 100.00',
          },
          {
            account_code: STANDARD_ACCOUNTS.POS_SALES_REVENUE,
            debit: 0,
            credit: 99.99, // فارق 0.01 قرش
            description: 'دائن 99.99',
          },
        ],
      };

      await expect(
        accountingService.createJournalEntry(imbalancedData),
      ).rejects.toThrow(/قيد اليومية غير متوازن/);
    });

    it('يقبل القيد المتوازن بدقة صفرية (Perfect Zero Imbalance)', async () => {
      const balancedData = {
        entry_date: new Date().toISOString().slice(0, 10),
        description: 'اختبار قيد متوازن تماماً',
        idempotency_key: 'test_balanced_invariant_' + Date.now(),
        lines: [
          {
            account_code: STANDARD_ACCOUNTS.MAIN_TREASURY,
            debit: 250.50,
            credit: 0,
            description: 'مدين الخزينة',
          },
          {
            account_code: STANDARD_ACCOUNTS.POS_SALES_REVENUE,
            debit: 0,
            credit: 250.50,
            description: 'دائن الإيرادات',
          },
        ],
      };

      const entry = await accountingService.createJournalEntry(balancedData);
      expect(entry).toBeDefined();
      expect(entry.id).toBeGreaterThan(0);
      cleanup.journalEntryIds.push(entry.id);
    });
  });

  describe('Invariant 2: Supplier Subledger & Aging (Deducting Purchase Returns)', () => {
    it('يخصم مرتجعات المشتريات المعتمدة من رصيد المورد وفي تقرير أعمار ديون الموردين', async () => {
      // 1. إنشاء مورد تجريبي
      const supCode = 'SUP-INV-' + Date.now();
      const supRes = await query(
        'INSERT INTO suppliers (code, name_ar, phone, opening_balance, balance) VALUES ($1, $2, $3, 0, 0) RETURNING id',
        [supCode, 'مورد اختبار المرتجع', '0109999999'],
      );
      const supplierId = supRes.rows[0].id;
      cleanup.supplierIds.push(supplierId);

      // 2. إنشاء فاتورة مشتريات بـ 10,000 ج.م
      const invNum = 'PI-TEST-' + Date.now();
      const invRes = await query(
        'INSERT INTO purchase_invoices (invoice_number, supplier_id, warehouse_id, total_amount, paid_amount, payment_status, invoice_date, created_by) VALUES ($1, $2, 1, 10000.00, 0, $3, CURRENT_DATE, 1) RETURNING id',
        [invNum, supplierId, 'unpaid'],
      );
      const invoiceId = invRes.rows[0].id;
      cleanup.invoiceIds.push(invoiceId);

      // فحص رصيد المورد قبل المرتجع
      await recalculateSupplierBalance(query, supplierId);
      const supBefore = (await query('SELECT balance FROM suppliers WHERE id = $1', [supplierId])).rows[0];
      expect(Number(supBefore.balance)).toBe(10000);

      // 3. تسجيل مرتجع مشتريات بـ 3,000 ج.م
      const retNum = 'PR-TEST-' + Date.now();
      const retRes = await query(
        'INSERT INTO purchase_returns (return_number, purchase_invoice_id, supplier_id, warehouse_id, total_amount, return_date, status, created_by) VALUES ($1, $2, $3, 1, 3000.00, CURRENT_DATE, $4, 1) RETURNING id',
        [retNum, invoiceId, supplierId, 'completed'],
      );
      cleanup.purchaseReturnIds.push(retRes.rows[0].id);

      // 4. إعادة حساب رصيد المورد
      await recalculateSupplierBalance(query, supplierId);
      const supAfter = (await query('SELECT balance FROM suppliers WHERE id = $1', [supplierId])).rows[0];
      // الرصيد يجب أن يكون 10000 - 3000 = 7000 ج.م تماماً
      expect(Number(supAfter.balance)).toBe(7000);

      // 5. فحص تقرير أعمار ديون الموردين (getSupplierAging)
      const aging = await accountingService.getSupplierAging();
      const supAging = aging.suppliers.find((s: any) => s.supplier_id === supplierId);
      expect(supAging).toBeDefined();
      expect(Number(supAging.total_due)).toBe(7000);
    });
  });

  describe('Invariant 3: Financial Period Lock Trigger (BEFORE DELETE Prevention)', () => {
    it('يمنع حذف أو تعديل أي سجل مالي يقع في فترة محاسبية مغلقة (Locked/Closed Period)', async () => {
      const pStart = '2019-01-01';
      const pEnd = '2019-01-31';

      // 1. إنشاء فترة محاسبية مفتوحة أولاً لتسجيل المصروف
      const perRes = await query(
        'INSERT INTO financial_periods (period_start, period_end, status, notes) VALUES ($1, $2, $3, $4) ON CONFLICT (period_start, period_end) DO UPDATE SET status = EXCLUDED.status RETURNING id',
        [pStart, pEnd, 'open', 'فترة اختبار القفل'],
      );
      const periodId = perRes.rows[0].id;
      cleanup.periodIds.push(periodId);

      // 2. إدراج مصروف في نطاق تلك الفترة
      const expNum = 'EXP-LOCK-TEST-' + Date.now();
      const expRes = await query(
        'INSERT INTO expenses (expense_number, category_id, title, amount, expense_date, payment_method, user_id) VALUES ($1, 1, $2, 500.00, $3, $4, 1) RETURNING id',
        [expNum, 'مصروف اختبار القفل', '2019-01-15', 'cash'],
      );
      const expenseId = expRes.rows[0].id;
      cleanup.expenseIds.push(expenseId);

      // 3. إقفال الفترة المحاسبية
      await query('UPDATE financial_periods SET status = $1 WHERE id = $2', ['locked', periodId]);

      // 4. محاولة حذف المصروف => يجب أن يفشل بسبب تريجر حماية الفترة المقفلة
      await expect(
        query('DELETE FROM expenses WHERE id = $1', [expenseId]),
      ).rejects.toThrow(/لا يمكن حذف سجل في فترة محاسبية مغلقة/);

      // 5. محاولة تعديل المصروف => يجب أن يفشل
      await expect(
        query('UPDATE expenses SET amount = 600 WHERE id = $1', [expenseId]),
      ).rejects.toThrow(/لا يمكن تعديل أو تسجيل عملية في فترة محاسبية مغلقة/);

      // 6. إعادة فتح الفترة للتنظيف
      await query('UPDATE financial_periods SET status = $1 WHERE id = $2', ['open', periodId]);
      await query('DELETE FROM expenses WHERE id = $1', [expenseId]);
    });
  });

  describe('Invariant 4: Stocktake Atomic Reconciliation & Complete Rollback on GL Failure', () => {
    it('يتراجع عن تسوية الجرد وحركات المخزون والمصروف بالكامل عند فشل ترحيل قيد الأستاذ العام (Atomic Rollback)', async () => {
      // 1. إعداد بيئة اختبار نظيفة: مخزن ومنتج ورصيد ابتدائي
      const whCode = 'WHR-' + (Date.now() % 10000000);
      const whRes = await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
         VALUES ($1, 'مخزن اختبار التراجع الذري', 'store', true)
         RETURNING id`,
        [whCode],
      );
      const whId = whRes.rows[0].id;
      cleanup.warehouseIds.push(whId);

      const catRes = await query(
        `INSERT INTO product_categories (name_ar) VALUES ('تصنيف اختبار التراجع الذري') RETURNING id`,
      );
      const catId = catRes.rows[0].id;
      cleanup.categoryIds.push(catId);

      const sku = 'SKU-ROLLBACK-' + Date.now();
      const prodName = 'منتج اختبار التراجع ' + Date.now();
      const prodRes = await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, is_active)
         VALUES ($1, $2, 25.00, 40.00, $3, true)
         RETURNING id`,
        [sku, prodName, catId],
      );
      const prodId = prodRes.rows[0].id;
      cleanup.productIds.push(prodId);

      // رصيد ابتدائي 50 قطعة
      await query(
        `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 50.000)`,
        [prodId, whId],
      );

      // 2. إنشاء مسودة جرد
      const stk = await createStocktake(whId, 1, 'جرد اختبار التراجع الذري');
      expect(stk.id).toBeDefined();
      expect(stk.status).toBe('draft');
      cleanup.stocktakeIds.push(stk.id);

      // 3. تحديث كمية الجرد الفعلية لتكون 40 (عجز بمقدار 10 قطع = 250 ج.م)
      await updateStocktakeItems(stk.id, {
        items: [{ product_id: prodId, actual_quantity: 40 }],
      });

      // 4. محاكاة فشل في خدمة الأستاذ العام أثناء ترحيل القيد
      const glSpy = vi.spyOn(accountingService, 'postStocktakeJournalEntry').mockRejectedValueOnce(
        new Error('Simulated GL Posting Database Failure'),
      );

      // 5. محاولة اعتماد الجرد مع تعطل GL => يجب أن تفشل المعاملة وترمي استثناء
      await expect(completeStocktake(stk.id, 1)).rejects.toThrow(
        'Simulated GL Posting Database Failure',
      );

      // 6. التحقق الدقيق من سلامة قاعدة البيانات وتراجع كافة العمليات الوسيطة
      // أ) حالة الجرد يجب أن تظل 'draft' ولم تتحول إلى 'completed'
      const stkCheck = (await query('SELECT status FROM stocktakes WHERE id = $1', [stk.id])).rows[0];
      expect(stkCheck.status).toBe('draft');

      // ب) رصيد المخزون يجب أن يظل 50 كما هو دون أي تغيير
      const invCheck = (
        await query('SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [
          prodId,
          whId,
        ])
      ).rows[0];
      expect(Number(invCheck.quantity)).toBe(50);

      // ج) لم يتم إنشاء أي حركة مخزنية
      const movCount = (
        await query('SELECT COUNT(*) FROM stock_movements WHERE notes LIKE $1', [
          `%معرف الجرد: ${stk.id}%`,
        ])
      ).rows[0];
      expect(Number(movCount.count)).toBe(0);

      // د) لم يتم إنشاء أي مصروف عجز
      const expCount = (
        await query('SELECT COUNT(*) FROM expenses WHERE expense_number LIKE $1', [
          `EXP-STK-${stk.id}-%`,
        ])
      ).rows[0];
      expect(Number(expCount.count)).toBe(0);

      // هـ) لم يتم إنشاء أي قيد يومية
      const jeCount = (
        await query('SELECT COUNT(*) FROM journal_entries WHERE idempotency_key = $1', [
          `stocktake_adjustment:${stk.id}`,
        ])
      ).rows[0];
      expect(Number(jeCount.count)).toBe(0);

      // 7. استعادة دالة GL للتحقق من نجاح الاعتماد الكامل في المرة التالية (Atomic Commit)
      glSpy.mockRestore();

      const successResult = await completeStocktake(stk.id, 1);
      expect(successResult.success).toBe(true);

      // التحقق من اكتمال عناصر الدورة الـ 5 بنجاح:
      // 1. حالة الجرد أصبحت completed
      const stkSuccess = (
        await query('SELECT status, total_deficit_value FROM stocktakes WHERE id = $1', [stk.id])
      ).rows[0];
      expect(stkSuccess.status).toBe('completed');
      expect(Number(stkSuccess.total_deficit_value)).toBe(250);

      // 2. كمية المخزون تم تسويتها إلى 40
      const invSuccess = (
        await query('SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [
          prodId,
          whId,
        ])
      ).rows[0];
      expect(Number(invSuccess.quantity)).toBe(40);

      // 3. تم تسجيل حركة مخزنية واحدة
      const movSuccess = (
        await query(
          'SELECT movement_type, quantity, total_cost FROM stock_movements WHERE notes LIKE $1',
          [`%معرف الجرد: ${stk.id}%`],
        )
      ).rows;
      expect(movSuccess.length).toBe(1);
      expect(movSuccess[0].movement_type).toBe('adjustment');
      expect(Number(movSuccess[0].quantity)).toBe(10);
      expect(Number(movSuccess[0].total_cost)).toBe(250);

      // 4. تم تسجيل مصروف العجز بطريقة دفع adjustment (دون المساس بالخزينة)
      const expSuccess = (
        await query('SELECT id, amount, payment_method FROM expenses WHERE expense_number LIKE $1', [
          `EXP-STK-${stk.id}-%`,
        ])
      ).rows;
      expect(expSuccess.length).toBe(1);
      expect(Number(expSuccess[0].amount)).toBe(250);
      expect(expSuccess[0].payment_method).toBe('adjustment');
      cleanup.expenseIds.push(expSuccess[0].id);

      // 5. تم إنشاء قيد يومية متوازن (مدين 5204 ودائن 110301)
      const jeSuccess = (
        await query('SELECT id FROM journal_entries WHERE idempotency_key = $1', [
          `stocktake_adjustment:${stk.id}`,
        ])
      ).rows;
      expect(jeSuccess.length).toBe(1);
      const jeId = jeSuccess[0].id;
      cleanup.journalEntryIds.push(jeId);

      const jeLines = (
        await query(
          'SELECT jel.*, a.code FROM journal_entry_lines jel JOIN accounts a ON a.id = jel.account_id WHERE jel.journal_entry_id = $1',
          [jeId],
        )
      ).rows;
      expect(jeLines.length).toBe(2);
      const shortageLine = jeLines.find((l: any) => l.code === '5204');
      const stockLine = jeLines.find((l: any) => l.code === '110301');
      expect(shortageLine).toBeDefined();
      expect(Number(shortageLine.debit)).toBe(250);
      expect(stockLine).toBeDefined();
      expect(Number(stockLine.credit)).toBe(250);

      // التحقق من عدم لمس حساب النقدية (1101) نهائياً
      const cashLine = jeLines.find((l: any) => l.code === '1101');
      expect(cashLine).toBeUndefined();
    });
  });

  describe('Invariant 5: Financial Period Lock Hardening on Payments and Cascade Safety', () => {
    it('يمنع تسجيل مدفوعات جديدة (payments) إذا كانت تقع ضمن فترة مقفلة حتى لو لم يُحدد created_at صراحة', async () => {
      // 1. إنشاء فترة مقفلة لعام 2014 لتجنب التداخل مع أي اختبارات شهرية حالية
      const pStart = '2014-01-01';
      const pEnd = '2014-01-31';
      const perRes = await query(
        `INSERT INTO financial_periods (period_start, period_end, status, notes)
         VALUES ($1, $2, 'locked', 'فترة مقفلة 2014')
         ON CONFLICT (period_start, period_end) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [pStart, pEnd],
      );
      const periodId = perRes.rows[0].id;
      cleanup.periodIds.push(periodId);

      // 2. محاولة إدراج payment بتاريخ يقع في الفترة المقفلة (2014-01-15)
      await expect(
        query(
          `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id, created_at)
           VALUES ($1, 'sale', 99999, 150.00, 'cash', 1, '2014-01-15')`,
          ['PAY-LOCK-' + Date.now()],
        ),
      ).rejects.toThrow(/لا يمكن تعديل أو تسجيل عملية في فترة محاسبية مغلقة/);

      // 3. فتح الفترة للتنظيف
      await query(`UPDATE financial_periods SET status = 'open' WHERE id = $1`, [periodId]);
    });

    it('يمنع حذف سطر قيد فردي (journal_entry_lines) في فترة مقفلة', async () => {
      const pStart = '2018-05-01';
      const pEnd = '2018-05-31';

      // إنشاء فترة مفتوحة
      const perRes = await query(
        `INSERT INTO financial_periods (period_start, period_end, status, notes)
         VALUES ($1, $2, 'open', 'فترة أسطر القيود')
         ON CONFLICT (period_start, period_end) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [pStart, pEnd],
      );
      const periodId = perRes.rows[0].id;
      cleanup.periodIds.push(periodId);

      // إنشاء قيد وسطور متوازنة داخل معاملة
      const client = await getClient();
      let lineId: number;
      try {
        await client.query('BEGIN');
        const jeRes = await client.query(
          `INSERT INTO journal_entries (entry_number, entry_date, status, description)
           VALUES ($1, '2018-05-15', 'posted', 'قيد اختبار قفل الأسطر')
           RETURNING id`,
          ['JE-LINE-LOCK-' + Date.now()],
        );
        const jeId = jeRes.rows[0].id;
        cleanup.journalEntryIds.push(jeId);

        const lineRes = await client.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
           VALUES ($1, 1, 100, 0)
           RETURNING id`,
          [jeId],
        );
        lineId = lineRes.rows[0].id;

        await client.query(
          `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
           VALUES ($1, 2, 0, 100)
           RETURNING id`,
          [jeId],
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }

      // إقفال الفترة
      await query(`UPDATE financial_periods SET status = 'locked' WHERE id = $1`, [periodId]);

      // محاولة حذف السطر
      await expect(
        query('DELETE FROM journal_entry_lines WHERE id = $1', [lineId]),
      ).rejects.toThrow(/لا يمكن حذف سجل في فترة محاسبية مغلقة/);

      // فتح الفترة للتنظيف
      await query(`UPDATE financial_periods SET status = 'open' WHERE id = $1`, [periodId]);
    });
  });

  describe('Invariant 6: GL Synchronization on Operational Updates (updatePurchaseInvoice & updateSale)', () => {
    it('يقوم بتحديث قيد اليومية في دفتر الأستاذ العام عند تعديل فاتورة الشراء بدلاً من تركه دون تحديث', async () => {
      // 1. إنشاء مورد ومخزن ومنتج
      const supRes = await query(
        `INSERT INTO suppliers (code, name_ar, phone, opening_balance, balance)
         VALUES ($1, 'مورد تجربة تحديث الشراء', '0100000001', 0, 0) RETURNING id`,
        ['SUP-UPD-' + Date.now()],
      );
      const supplierId = supRes.rows[0].id;
      cleanup.supplierIds.push(supplierId);

      const whRes = await query(
        `INSERT INTO warehouses (code, name_ar, type, is_active)
         VALUES ($1, 'مخزن اختبار تعديل الشراء', 'store', true) RETURNING id`,
        ['WH-UPD-' + (Date.now() % 10000000)],
      );
      const warehouseId = whRes.rows[0].id;
      cleanup.warehouseIds.push(warehouseId);

      const catRes = await query(
        `INSERT INTO product_categories (name_ar) VALUES ('تصنيف اختبار تعديل الشراء') RETURNING id`,
      );
      const catId = catRes.rows[0].id;
      cleanup.categoryIds.push(catId);

      const sku = 'SKU-PUR-UPD-' + Date.now();
      const prodName = 'منتج اختبار تعديل الشراء ' + Date.now();
      const prodRes = await query(
        `INSERT INTO products (sku, name_ar, purchase_price, sale_price, category_id, primary_warehouse_id, is_active)
         VALUES ($1, $2, 100.00, 150.00, $3, $4, true) RETURNING id`,
        [sku, prodName, catId, warehouseId],
      );
      const prodId = prodRes.rows[0].id;
      cleanup.productIds.push(prodId);

      // 2. إنشاء فاتورة شراء بـ 10 قطع × 100 = 1,000 ج.م
      const purchaseInv = await createPurchaseInvoice(
        {
          supplier_id: supplierId,
          items: [{ product_id: prodId, quantity: 10, unit_price: 100 }],
        },
        1,
      );
      cleanup.invoiceIds.push(purchaseInv.id);

      // فحص القيد المحاسبي الأولي
      const initialEntryRes = await query(
        `SELECT je.*, (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
         FROM journal_entries je WHERE reference_type = 'purchase' AND reference_id = $1`,
        [purchaseInv.id],
      );
      expect(initialEntryRes.rows.length).toBe(1);
      expect(Number(initialEntryRes.rows[0].total_debit)).toBe(1000);

      // 3. تعديل فاتورة الشراء إلى 15 قطعة × 100 = 1,500 ج.م
      await updatePurchaseInvoice(
        purchaseInv.id,
        {
          supplier_id: supplierId,
          items: [{ product_id: prodId, quantity: 15, unit_price: 100 }],
        },
        1,
      );

      // فحص القيد المحاسبي بعد التعديل: يجب أن يكون هناك قيد وحيد محدث بـ 1500 ج.م
      const updatedEntryRes = await query(
        `SELECT je.*, (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
         FROM journal_entries je WHERE reference_type = 'purchase' AND reference_id = $1`,
        [purchaseInv.id],
      );
      expect(updatedEntryRes.rows.length).toBe(1);
      expect(Number(updatedEntryRes.rows[0].total_debit)).toBe(1500);
    });

    it('يقوم بتحديث قيد اليومية في دفتر الأستاذ العام عند تعديل فاتورة البيع', async () => {
      // 1. إنشاء مبيعات أولية بمبلغ 1,200 ج.م
      const saleDate = new Date().toISOString().slice(0, 10);
      const createdSale = await createDailySale(
        {
          sale_type: 'branch',
          total_amount: 1200,
          payment_method: 'cash',
          payment_status: 'paid',
          sale_date: saleDate,
          items: [],
        },
        1,
      );
      cleanup.saleIds.push(createdSale.id);

      // فحص القيد المحاسبي الأولي
      const initialSaleEntry = await query(
        `SELECT je.*, (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
         FROM journal_entries je WHERE reference_type = 'sale' AND reference_id = $1`,
        [createdSale.id],
      );
      expect(initialSaleEntry.rows.length).toBe(1);
      expect(Number(initialSaleEntry.rows[0].total_debit)).toBe(1200);

      // 2. تعديل فاتورة البيع ليصبح الإجمالي 1,800 ج.م
      await updateSale(
        createdSale.id,
        {
          sale_type: 'branch',
          total_amount: 1800,
          payment_method: 'cash',
          payment_status: 'paid',
          sale_date: saleDate,
          items: [],
        },
        1,
      );

      // فحص القيد المحاسبي بعد التعديل
      const updatedSaleEntry = await query(
        `SELECT je.*, (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
         FROM journal_entries je WHERE reference_type = 'sale' AND reference_id = $1`,
        [createdSale.id],
      );
      expect(updatedSaleEntry.rows.length).toBe(1);
      expect(Number(updatedSaleEntry.rows[0].total_debit)).toBe(1800);
    });
  });

  describe('Invariant 7: Atomic POS Cash Movement & Shift Difference GL Posting', () => {
    it('يرحل حركة نقدية بالوردية (drop) إلى الأستاذ العام ذرياً مع قيد تحويل بين الخزينة ودرج الكاشير', async () => {
      // 1. التأكد من وجود وردية مفتوحة للمستخدم 1 أو فتح واحدة
      let currentShift = await posShiftService.getCurrentShift(1);
      if (!currentShift) {
        currentShift = await posShiftService.openShift(1, { opening_cash: 500 });
      }
      cleanup.shiftIds.push(currentShift.id);

      // 2. تسجيل حركة توريد نقدية (drop) بقيمة 300 ج.م
      const movement = await posShiftService.recordCashMovement(1, {
        shift_id: currentShift.id,
        movement_type: 'drop',
        amount: 300,
        reason: 'توريد نقدية للاختبار',
      });
      expect(movement).toBeDefined();
      expect(movement.id).toBeDefined();

      // 3. التحقق من القيد الدفتري للتحويل
      const jeRes = await query(
        `SELECT je.*, (SELECT SUM(debit) FROM journal_entry_lines WHERE journal_entry_id = je.id) as total_debit
         FROM journal_entries je WHERE reference_type = 'transfer' AND reference_id = $1`,
        [movement.id],
      );
      expect(jeRes.rows.length).toBe(1);
      expect(Number(jeRes.rows[0].total_debit)).toBe(300);
      cleanup.journalEntryIds.push(jeRes.rows[0].id);
    });

    it('يرحل عجز النقدية عند إغلاق الوردية إلى الأستاذ العام ذرياً في حساب عجز النقدية', async () => {
      // 1. إغلاق الوردية الحالية بعجز 50 ج.م (actual_cash أقل من expected_cash)
      const currentShift = await posShiftService.getCurrentShift(1);
      expect(currentShift).toBeDefined();
      const expected = Number(currentShift.expected_cash || currentShift.opening_cash || 500);
      const actualCash = expected - 50; // عجز 50 ج.م

      const closedShift = await posShiftService.closeShift(1, currentShift.id, {
        actual_cash: actualCash,
        notes: 'إغلاق مع عجز اختباري',
      });
      expect(closedShift.status).toBe('closed');
      expect(Number(closedShift.cash_difference)).toBe(-50);

      // 2. التحقق من وجود قيد تسوية العجز في الأستاذ العام
      const jeRes = await query(
        `SELECT je.*, jel.debit, jel.credit, a.code
         FROM journal_entries je
         JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
         JOIN accounts a ON a.id = jel.account_id
         WHERE je.reference_type = 'manual' AND je.reference_id = $1`,
        [currentShift.id],
      );
      expect(jeRes.rows.length).toBeGreaterThanOrEqual(2);
      cleanup.journalEntryIds.push(jeRes.rows[0].id);
      const shortageLine = jeRes.rows.find((r: any) => r.code === STANDARD_ACCOUNTS.SHORTAGE_EXPENSE);
      expect(shortageLine).toBeDefined();
      expect(Number(shortageLine.debit)).toBe(50);
    });
  });

  describe('Invariant 8: Strict Financial Period Lock Integrity on Operational Deletions', () => {
    it('يمنع حذف فاتورة شراء (deletePurchaseInvoice) إذا كانت تقع ضمن فترة مقفلة', async () => {
      // 1. إنشاء فترة مقفلة قديمة (2017)
      const pStart = '2017-01-01';
      const pEnd = '2017-01-31';
      const perRes = await query(
        `INSERT INTO financial_periods (period_start, period_end, status, notes)
         VALUES ($1, $2, 'open', 'فترة اختبار حذف الشراء')
         ON CONFLICT (period_start, period_end) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
        [pStart, pEnd],
      );
      const periodId = perRes.rows[0].id;
      cleanup.periodIds.push(periodId);

      // إنشاء فاتورة شراء في هذه الفترة
      const invRes = await query(
        `INSERT INTO purchase_invoices (invoice_number, supplier_id, warehouse_id, total_amount, invoice_date, created_by)
         VALUES ($1, NULL, 1, 3000, '2017-01-15', 1) RETURNING id`,
        ['PI-LOCK-DEL-' + Date.now()],
      );
      const invoiceId = invRes.rows[0].id;
      cleanup.invoiceIds.push(invoiceId);

      // إنشاء قيد مشتريات مقترن بنفس التاريخ
      await accountingService.postPurchaseJournalEntry(null, {
        id: invoiceId,
        invoice_number: 'PI-LOCK-DEL-' + invoiceId,
        total_amount: 3000,
        payment_status: 'unpaid',
        warehouse_id: 1,
        user_id: 1,
        invoice_date: '2017-01-15',
      });

      // إقفال الفترة
      await query(`UPDATE financial_periods SET status = 'locked' WHERE id = $1`, [periodId]);

      // محاولة حذف فاتورة الشراء في الفترة المغلقة => يجب أن يُرفض الحذف ويرمي استثناء
      await expect(deletePurchaseInvoice(invoiceId, 1)).rejects.toThrow(
        /لا يمكن تعديل أو تسجيل عملية في فترة محاسبية مغلقة|لا يمكن حذف سجل في فترة محاسبية مغلقة/,
      );

      // التأكد أن الفاتورة لم تُحذف
      const invCheck = await query(`SELECT deleted_at FROM purchase_invoices WHERE id = $1`, [invoiceId]);
      expect(invCheck.rows[0].deleted_at).toBeNull();

      // فتح الفترة للتنظيف
      await query(`UPDATE financial_periods SET status = 'open' WHERE id = $1`, [periodId]);
    });

    it('يمنع حذف المبيعات بتاريخ محدد (deleteSalesByDate) إذا كان التاريخ ضمن فترة مقفلة', async () => {
      // 1. إنشاء فترة مقفلة قديمة (2016)
      const pDate = '2016-06-15';
      const perRes = await query(
        `INSERT INTO financial_periods (period_start, period_end, status, notes)
         VALUES ('2016-06-01', '2016-06-30', 'open', 'فترة اختبار حذف المبيعات')
         ON CONFLICT (period_start, period_end) DO UPDATE SET status = EXCLUDED.status
         RETURNING id`,
      );
      const periodId = perRes.rows[0].id;
      cleanup.periodIds.push(periodId);

      // إنشاء عملية بيع في هذا التاريخ
      const saleRes = await query(
        `INSERT INTO sales (sale_number, sale_type, sale_date, total_amount, payment_status, user_id, warehouse_id)
         VALUES ($1, 'branch', $2::date, 500, 'paid', 1, 1) RETURNING id`,
        ['SALE-LOCK-' + Date.now(), pDate],
      );
      const saleId = saleRes.rows[0].id;
      cleanup.saleIds.push(saleId);

      // ترحيل القيد بنفس التاريخ
      await accountingService.postSaleJournalEntry(null, {
        id: saleId,
        sale_number: 'SALE-LOCK-' + saleId,
        sale_type: 'branch',
        total_amount: 500,
        user_id: 1,
        sale_date: pDate,
      });

      // إقفال الفترة
      await query(`UPDATE financial_periods SET status = 'locked' WHERE id = $1`, [periodId]);

      // محاولة حذف المبيعات بتاريخ الفترة المغلقة
      await expect(deleteSalesByDate(pDate, 1)).rejects.toThrow(
        /لا يمكن تعديل أو تسجيل عملية في فترة محاسبية مغلقة|لا يمكن حذف سجل في فترة محاسبية مغلقة/,
      );

      // التأكد من بقاء عملية البيع
      const saleCheck = await query(`SELECT deleted_at FROM sales WHERE id = $1`, [saleId]);
      expect(saleCheck.rows[0].deleted_at).toBeNull();

      // فتح الفترة للتنظيف
      await query(`UPDATE financial_periods SET status = 'open' WHERE id = $1`, [periodId]);
    });
  });
});
