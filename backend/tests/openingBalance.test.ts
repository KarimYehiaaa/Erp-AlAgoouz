import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateDynamicOpeningBalance } from '../src/services/openingBalanceService.ts';
import { query } from '../src/database/pool.ts';

/**
 * يثبت أن التكرار الرجعي في calculateDynamicOpeningBalance يتوقف
 * (سقف 60 شهرًا) بدل التعليق بلا حدّ — كان يعلّق تقرير P&L لأبدًا
 * (30+ ثانية) على أي قاعدة بلا أرصدة افتتاح مخزنة.
 */
describe('opening balance recursion على قاعدة فارغة', () => {
  it('يتوقف خلال مهلة قصيرة ويعيد 0 على قاعدة بلا أرصدة', async () => {
    // تاريخ قديم (1900) يجعل نافذة الـ 60 شهرًا (1895–1900) مستقلة عن
    // بيانات التشغيل والاختبارات الحديثة الموجودة في قاعدة الاختبار المشتركة.
    const start = Date.now();
    const result = await calculateDynamicOpeningBalance(new Date(1900, 0, 1));
    const elapsed = Date.now() - start;

    // قبل الإصلاح كان يستغرق 30+ ثانية (تكرار بلا حدّ) — الإصلاح ~0.5 ثانية.
    expect(elapsed).toBeLessThan(5000);
    expect(result).toBe(0);
  }, 10000); // مهلة صريحة: لو عاد التكرار اللانهائي يفشل الاختبار بالتأكيد
});

describe('batched opening balance preserves the monthly calculation', () => {
  const keys = [
    'sales_opening_balance:1800-01',
    'sales_opening_balance:1800-02',
    'sales_opening_balance:1801-02',
    'sales_opening_balance:1801-03',
  ];
  const cleanup = async () => {
    await query("DELETE FROM sales WHERE sale_number LIKE 'TEST-OPEN-BATCH-%'");
    await query("DELETE FROM purchase_invoices WHERE invoice_number='TEST-OPEN-BATCH-PURCHASE'");
    await query("DELETE FROM expenses WHERE expense_number='TEST-OPEN-BATCH-EXPENSE'");
    await query('DELETE FROM settings WHERE key=ANY($1::text[])', [keys]);
  };
  beforeAll(async () => {
    await cleanup();
    await query(
      `INSERT INTO settings(key,value) VALUES
      ($1,'{"amount":1000}'),($2,'{"amount":200}'),($3,'{"amount":900}'),($4,'{"amount":0}')`,
      keys,
    );
    await query(`INSERT INTO sales(sale_number,sale_date,warehouse_id,user_id,total_amount,status) VALUES
      ('TEST-OPEN-BATCH-OLDER','1800-01-15',1,1,900,'completed'),
      ('TEST-OPEN-BATCH-NEAREST','1800-02-15',1,1,50,'completed'),
      ('TEST-OPEN-BATCH-CURRENT','1800-03-15',1,1,800,'completed'),
      ('TEST-OPEN-BATCH-PENDING','1800-02-15',1,1,600,'draft'),
      ('TEST-OPEN-BATCH-OUTSIDE','1805-02-28',1,1,1000,'completed'),
      ('TEST-OPEN-BATCH-BOUNDARY','1805-03-01',1,1,7,'completed')`);
    await query(`INSERT INTO purchase_invoices(invoice_number,invoice_date,warehouse_id,subtotal,total_amount)
      VALUES('TEST-OPEN-BATCH-PURCHASE','1800-02-15',1,10,10)`);
    await query(`INSERT INTO expenses(expense_number,title,amount,expense_date)
      VALUES('TEST-OPEN-BATCH-EXPENSE','opening balance fixture',5,'1800-02-15')`);
  });
  afterAll(cleanup);

  it('uses the nearest stored month and includes only subsequent completed movements', async () => {
    expect(await calculateDynamicOpeningBalance(new Date(1800, 2, 1))).toBe(245);
  });
  it('honors an explicit zero for the requested month', async () => {
    expect(await calculateDynamicOpeningBalance(new Date(1801, 2, 1))).toBe(0);
  });
  it('includes month 60 and excludes movements before the original recursion boundary', async () => {
    expect(await calculateDynamicOpeningBalance(new Date(1810, 2, 1))).toBe(7);
  });
  it('keeps the recursion cutoff when an internal caller already reached depth 60', async () => {
    expect(await calculateDynamicOpeningBalance(new Date(1800, 1, 1), 60)).toBe(0);
  });
});
