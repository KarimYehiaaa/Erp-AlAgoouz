import { describe, it, expect, afterAll } from 'vitest';
import { query } from '../src/database/pool.ts';
import { accountingService, STANDARD_ACCOUNTS } from '../src/services/accountingService.ts';
import { recalculateSupplierBalance } from '../src/services/supplierService.ts';

describe('Financial Audit Invariants Suite (Real PostgreSQL Invariants)', () => {
  const cleanup = {
    supplierIds: [] as number[],
    invoiceIds: [] as number[],
    purchaseReturnIds: [] as number[],
    periodIds: [] as number[],
    expenseIds: [] as number[],
    journalEntryIds: [] as number[],
  };

  afterAll(async () => {
    // Cleanup generated records - ensure periods opened first
    if (cleanup.periodIds.length > 0) {
      await query("UPDATE financial_periods SET status = 'open' WHERE id = ANY($1)", [cleanup.periodIds]);
      await query('DELETE FROM financial_periods WHERE id = ANY($1)', [cleanup.periodIds]);
    }
    if (cleanup.journalEntryIds.length > 0) {
      await query('DELETE FROM journal_entry_lines WHERE journal_entry_id = ANY($1)', [cleanup.journalEntryIds]);
      await query('DELETE FROM journal_entries WHERE id = ANY($1)', [cleanup.journalEntryIds]);
    }
    if (cleanup.expenseIds.length > 0) {
      await query('DELETE FROM expenses WHERE id = ANY($1)', [cleanup.expenseIds]);
    }
    if (cleanup.purchaseReturnIds.length > 0) {
      await query('DELETE FROM purchase_returns WHERE id = ANY($1)', [cleanup.purchaseReturnIds]);
    }
    if (cleanup.invoiceIds.length > 0) {
      await query('DELETE FROM purchase_invoices WHERE id = ANY($1)', [cleanup.invoiceIds]);
    }
    if (cleanup.supplierIds.length > 0) {
      await query('DELETE FROM suppliers WHERE id = ANY($1)', [cleanup.supplierIds]);
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
        'INSERT INTO financial_periods (period_start, period_end, status, notes) VALUES ($1, $2, $3, $4) RETURNING id',
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
      await query('UPDATE financial_periods SET status = $1, closed_at = NOW() WHERE id = $2', ['closed', periodId]);

      // 4. محاولة حذف المصروف أثناء إغلاق الفترة => يجب أن يفشل فورياً من الـ Trigger
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

  describe('Invariant 4: Stocktake GL Posting Integration', () => {
    it('يرحل قيد فروقات الجرد (عجز وفائض) بنجاح إلى حسابات الأستاذ العام', async () => {
      const stocktakeMock = {
        id: 999991,
        warehouse_id: 1,
        total_deficit: 450.00,
        total_surplus: 0,
        user_id: 1,
      };

      const entry = await accountingService.postStocktakeJournalEntry(null, stocktakeMock);
      expect(entry).toBeDefined();
      expect(entry?.id).toBeGreaterThan(0);
      cleanup.journalEntryIds.push(entry!.id);

      // التحقق من توازن القيد وسطور الحسابات (5204 مدين و 110301 دائن)
      const lines = (await query(
        'SELECT jel.*, a.code FROM journal_entry_lines jel JOIN accounts a ON a.id = jel.account_id WHERE jel.journal_entry_id = $1',
        [entry!.id],
      )).rows;

      expect(lines.length).toBe(2);
      const shortageLine = lines.find((l: any) => l.code === '5204');
      const stockLine = lines.find((l: any) => l.code === '110301');

      expect(shortageLine).toBeDefined();
      expect(Number(shortageLine.debit)).toBe(450);
      expect(stockLine).toBeDefined();
      expect(Number(stockLine.credit)).toBe(450);
    });
  });
});
