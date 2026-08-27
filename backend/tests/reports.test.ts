import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getProfitAndLoss } from '../src/services/plService';
import { query } from '../src/database/pool';

describe('Financial Reports (P&L)', () => {
  let productId: number;
  let saleId: number;

  beforeAll(async () => {
    // Cleanup any orphaned test data just in case
    await query(`DELETE FROM sales WHERE sale_number = 'TEST-SALE-VITEST-001'`);
    await query(`DELETE FROM products WHERE sku = 'TEST-REP-VITEST-1'`);
    await query(`DELETE FROM expenses WHERE expense_number = 'EXP-TEST-VITEST-001'`);

    // 1. Create a product
    const prodRes = await query(`
      INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, category_id, is_active)
      VALUES ('TEST-REP-VITEST-1', 'Test Report Product Vitest', 5, 200, 100, 1, true)
      RETURNING id
    `);
    productId = prodRes.rows[0].id;

    // 2. Create a sale
    const invRes = await query(`
      INSERT INTO sales (sale_number, warehouse_id, user_id, total_amount, discount_amount, cost_amount, profit_amount, status)
      VALUES ('TEST-SALE-VITEST-001', 1, 1, 400, 0, 200, 200, 'completed')
      RETURNING id
    `);
    saleId = invRes.rows[0].id;

    // 3. Add sale items
    await query(`
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_amount, cost_price)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [saleId, productId, 2, 200, 400, 100]); // Revenue 400, COGS 200 (2 * 100)

    // 4. Add an expense
    await query(`
      INSERT INTO expenses (expense_number, title, amount, expense_date)
      VALUES ('EXP-TEST-VITEST-001', 'Test expense', 50, NOW())
    `);
  });

  afterAll(async () => {
    // Cleanup
    await query(`DELETE FROM expenses WHERE expense_number = 'EXP-TEST-VITEST-001'`);
    if (saleId) {
       await query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
       await query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    }
    if (productId) {
        await query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it('should correctly calculate revenue, COGS, and profit in P&L report', async () => {
    // "اليوم" من القاعدة نفسها (CURRENT_DATE) — وليس من toISOString() (UTC) —
    // حتى يطابق sale_date دائمًا مهما كانت المنطقة الزمنية للخادم.
    const today = (await query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d as string;
    const pl = await getProfitAndLoss(today, today);

    expect(pl).toBeDefined();

    // Test that the revenue reflects the test invoice (400)
    const revenue = pl.revenue?.net || pl.summary?.sales || 0;

    // We expect revenue to be at least 400 since there might be other transactions in DB
    expect(revenue).toBeGreaterThanOrEqual(400);

    // Test that expenses reflect our test expense (50)
    const expenses = pl.operating_expenses?.total || pl.summary?.expenses || 0;
    expect(expenses).toBeGreaterThanOrEqual(50);
  });
});

describe('P&L كاملًا على قاعدة فارغة', () => {
  it(
    'ينجز التقرير كاملًا خلال مهلة قصيرة ويعيد أصفارًا على نافذة قديمة بلا بيانات',
    async () => {
      // نافذة 2005 فارغة تمامًا من أي بيانات (كل الاختبارات تستخدم تواريخ اليوم)
      // — تختبر المسار الكامل: الاستعلامات المتوازية + تكرار رصيد الافتتاح.
      const start = Date.now();
      const pl = await getProfitAndLoss('2005-01-01', '2005-01-31');
      const elapsed = Date.now() - start;

      // قبل إصلاح تكرار رصيد الافتتاح كان التقرير يعلّق 30+ ثانية على قاعدة فارغة
      expect(elapsed).toBeLessThan(5000);
      expect(pl).toBeDefined();
      expect(pl.period).toEqual({ from: '2005-01-01', to: '2005-01-31' });
      expect(pl.revenue?.net ?? 0).toBe(0);
      expect(pl.operating_expenses?.total ?? 0).toBe(0);
      expect(pl.cogs?.total ?? 0).toBe(0);
      expect(pl.purchases?.total ?? 0).toBe(0);
      expect(pl.opening_balance ?? 0).toBe(0);
      expect(pl.net_profit?.amount ?? 0).toBe(0);
    },
    10000, // مهلة صريحة: لو عاد التكرار اللانهائي يفشل الاختبار بالتأكيد
  );
});
