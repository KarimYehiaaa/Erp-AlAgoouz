import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getDashboardStats,
  invalidateDashboardCache,
  resolveCogs,
} from '../src/services/dashboardService.ts';
import { query } from '../src/database/pool.ts';
import pool from '../src/database/pool.ts';

/**
 * اختبارات الخوارزميات الجديدة في لوحة التحكم:
 * 1) فصل أرصدة العملاء الافتتاحية عن المبيعات والأرباح (كانت تضخّمهما + عد مزدوج في الأصول).
 * 2) خوارزمية COGS الثلاثية: cost_stored ← sale_items ← purchases.
 *
 * تُستخدم نوافذ تواريخ قديمة معزولة (2025-06) لا يلمسها أي اختبار آخر،
 * حتى تكون التوقعات الدقيقة صحيحة مهما كانت بيانات الاختبارات المتوازية.
 */
describe('خوارزميات لوحة التحكم (dashboardService)', () => {
  // نوافذ معزولة: كل حالة في يوم مختلف
  const W = {
    opening: '2025-06-15', // فصل الأرصدة الافتتاحية
    cogsTier1: '2025-06-16', // cost_amount مخزّن يغلب sale_items
    cogsTier2: '2025-06-17', // sale_items عندما لا توجد تكلفة مخزنة
    cogsTier3: '2025-06-18', // المشتريات كتقدير
    cogsZero: '2025-06-19', // لا توجد أي تكلفة
  };

  let productId = 0;
  let customerId = 0;
  const saleIds: number[] = [];
  const itemSaleIds: number[] = [];

  const insertSale = async (saleNumber: string, date: string, opts: any = {}) => {
    const res = await query(
      `INSERT INTO sales (sale_number, sale_type, sale_date, entry_mode, warehouse_id, user_id,
                          subtotal, discount_amount, tax_amount, total_amount, cost_amount, profit_amount,
                          payment_status, status)
       VALUES ($1, 'branch', $2, 'pos', 1, 1,
               $3, 0, 0, $3, $4, $5, 'paid', 'completed')
       RETURNING id`,
      [saleNumber, date, opts.total ?? 0, opts.cost ?? 0, opts.profit ?? 0],
    );
    return res.rows[0].id as number;
  };

  beforeAll(async () => {
    // تنظيف أي بقايا من تشغيل سابق فاشل
    // ملاحظة: لا نلمس جدول payments إطلاقًا — اختبار طرق الدفع (payment-methods.test.ts)
    // يشغّل نفسه بالتوازي على نفس القاعدة ويستخدم بادئة PMT-TEST الخاصة به.
    await query(`DELETE FROM expenses WHERE expense_number LIKE 'EXP-TEST-DASH-%'`);
    await query(`DELETE FROM purchase_invoices WHERE invoice_number LIKE 'PI-TEST-DASH-%'`);
    await query(
      `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE sale_number LIKE 'SL-TEST-DASH-%')`,
    );
    await query(`DELETE FROM sales WHERE sale_number LIKE 'SL-TEST-DASH-%'`);
    await query(`DELETE FROM customers WHERE code = 'C-TEST-DASH-OPEN'`);
    await query(`DELETE FROM products WHERE sku = 'SKU-TEST-DASH-1'`);

    // ── نافذة فصل الأرصدة الافتتاحية (2025-06-15) ──
    // عميل عليه رصيد افتتاحي 5000 (ديون قديمة من قبل النظام)
    const custRes = await query(
      `INSERT INTO customers (code, name_ar, opening_balance, balance, current_balance)
       VALUES ('C-TEST-DASH-OPEN', 'عميل اختبار الأرصدة', 5000, 5000, 5000)
       RETURNING id`,
    );
    customerId = custRes.rows[0].id;

    // بيع 1000 بتكلفة 400 (ربح 600) + مصروف 100 — لا علاقة لهم برصيد العميل
    saleIds.push(
      await insertSale('SL-TEST-DASH-001', W.opening, { total: 1000, cost: 400, profit: 600 }),
    );
    await query(
      `INSERT INTO expenses (expense_number, title, amount, expense_date)
       VALUES ('EXP-TEST-DASH-001', 'مصروف اختبار الأرصدة', 100, $1)`,
      [W.opening],
    );

    // ── نافذة COGS المستوى الأول (2025-06-16): cost_amount مخزّن يغلب sale_items ──
    const prodRes = await query(
      `INSERT INTO products (sku, name_ar, sale_price, purchase_price, category_id, is_active)
       VALUES ('SKU-TEST-DASH-1', 'منتج اختبار التكلفة', 500, 250, 1, true)
       RETURNING id`,
    );
    productId = prodRes.rows[0].id;

    const tier1SaleId = await insertSale('SL-TEST-DASH-002', W.cogsTier1, {
      total: 1000,
      cost: 400,
      profit: 600,
    });
    // sale_items بتكلفة 2 × 500 = 1000 — لو كان المستوى الثاني سيفوز لظهرت 1000
    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, total_amount)
       VALUES ($1, $2, 2, 500, 500, 1000)`,
      [tier1SaleId, productId],
    );

    // ── نافذة COGS المستوى الثاني (2025-06-17): sale_items بتكلفة 4 × 50 = 200 ──
    const tier2SaleId = await insertSale('SL-TEST-DASH-003', W.cogsTier2, {
      total: 1000,
      cost: 0,
      profit: 0,
    });
    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, total_amount)
       VALUES ($1, $2, 4, 250, 50, 1000)`,
      [tier2SaleId, productId],
    );
    itemSaleIds.push(tier2SaleId);

    // ── نافذة COGS المستوى الثالث (2025-06-18): لا تكلفة، المشتريات 300 ──
    saleIds.push(
      await insertSale('SL-TEST-DASH-004', W.cogsTier3, { total: 1000, cost: 0, profit: 0 }),
    );
    await query(
      `INSERT INTO purchase_invoices (invoice_number, invoice_date, warehouse_id, subtotal, total_amount)
       VALUES ('PI-TEST-DASH-001', $1, 1, 300, 300)`,
      [W.cogsTier3],
    );

    // ── نافذة بلا أي تكلفة (2025-06-19): بيع 100 بدون تكلفة وبدون مشتريات ──
    saleIds.push(
      await insertSale('SL-TEST-DASH-005', W.cogsZero, { total: 100, cost: 0, profit: 0 }),
    );

    invalidateDashboardCache();
  });

  afterAll(async () => {
    await query(
      `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE sale_number LIKE 'SL-TEST-DASH-%')`,
    );
    for (const id of saleIds) await query(`DELETE FROM sales WHERE id = $1`, [id]);
    for (const id of itemSaleIds) await query(`DELETE FROM sales WHERE id = $1`, [id]);
    await query(`DELETE FROM expenses WHERE expense_number = 'EXP-TEST-DASH-001'`);
    await query(`DELETE FROM purchase_invoices WHERE invoice_number = 'PI-TEST-DASH-001'`);
    if (customerId) await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    if (productId) await query(`DELETE FROM products WHERE id = $1`, [productId]);
    invalidateDashboardCache();
  });

  const getStatsFor = async (date: string) => {
    const stats = await getDashboardStats({
      range: 'custom',
      from_date: date,
      to_date: date,
    });
    return stats;
  };

  // ═══════════════════════════════════════════════════════════════
  // 1) فصل الأرصدة الافتتاحية عن المبيعات والأرباح
  // ═══════════════════════════════════════════════════════════════
  describe('فصل أرصدة العملاء الافتتاحية عن المبيعات والأرباح', () => {
    it('لا تُضاف الأرصدة الافتتاحية (5000) إلى المبيعات ولا إلى الربح', async () => {
      const stats = await getStatsFor(W.opening);

      // البيع الفعلي 1000 فقط — كان الخلل يظهر 6000 (1000 + 5000)
      expect(stats.month.sales).toBe(1000);
      // الربح الإجمالي 600 (1000 - 400) — كان الخلل يظهر 5600
      expect(stats.month.grossProfit).toBe(600);
      // صافي الربح 500 (600 - مصروف 100) — كان الخلل يظهر 5500
      expect(stats.month.netProfit).toBe(500);

      // الأرصدة الافتتاحية تظهر كبند مستقل وليس داخل المبيعات
      expect(stats.customerOpeningBalances).toBe(5000);

      // الديون القديمة ما زالت محفوظة ضمن مديونيات العملاء (لم تُفقد)
      expect(stats.unpaidInvoices.amount).toBeGreaterThanOrEqual(5000);
    }, 20000);
  });

  // ═══════════════════════════════════════════════════════════════
  // 2) خوارزمية COGS الثلاثية — اختبارات وحدة للدالة النقية
  // ═══════════════════════════════════════════════════════════════
  describe('resolveCogs (الدالة النقية — كل الحالات)', () => {
    it('المستوى الأول: cost_amount المخزّن يغلب دائمًا حتى لو وُجدت sale_items أو مشتريات', () => {
      expect(resolveCogs(400, 1000, 300)).toEqual({ value: 400, basis: 'cost_stored' });
      expect(resolveCogs(0.01, 1000, 300)).toEqual({ value: 0.01, basis: 'cost_stored' });
      expect(resolveCogs(1, 0, 300)).toEqual({ value: 1, basis: 'cost_stored' });
    });

    it('المستوى الثاني: sale_items عندما لا توجد تكلفة مخزنة', () => {
      expect(resolveCogs(0, 200, 300)).toEqual({ value: 200, basis: 'sale_items' });
      expect(resolveCogs(0, 0.01, 300)).toEqual({ value: 0.01, basis: 'sale_items' });
      expect(resolveCogs(null, 200, 300)).toEqual({ value: 200, basis: 'sale_items' });
    });

    it('المستوى الثالث: مشتريات الفترة كتقدير عندما لا توجد أي تكلفة', () => {
      expect(resolveCogs(0, 0, 300)).toEqual({ value: 300, basis: 'purchases' });
      expect(resolveCogs(0, null, 300)).toEqual({ value: 300, basis: 'purchases' });
      expect(resolveCogs(undefined, 0, '250.5')).toEqual({ value: 250.5, basis: 'purchases' });
    });

    it('لا توجد أي بيانات تكلفة → صفر مع أساس purchases', () => {
      expect(resolveCogs(0, 0, 0)).toEqual({ value: 0, basis: 'purchases' });
      expect(resolveCogs(null, null, null)).toEqual({ value: 0, basis: 'purchases' });
      expect(resolveCogs('', '', '')).toEqual({ value: 0, basis: 'purchases' });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3) خوارزمية COGS الثلاثية — عبر التجميع الفعلي للوحة
  // ═══════════════════════════════════════════════════════════════
  describe('خوارزمية COGS الثلاثية عبر لوحة التحكم', () => {
    it('المستوى الأول: cost_amount المخزن (400) يغلب sale_items (1000)', async () => {
      const stats = await getStatsFor(W.cogsTier1);
      expect(stats.month.cogsBasis).toBe('cost_stored');
      expect(stats.month.cost).toBe(400);
      expect(stats.month.grossProfit).toBe(600);
      expect(stats.month.netProfit).toBe(600);
    }, 20000);

    it('المستوى الثاني: sale_items (4 × 50 = 200) عندما تكون التكلفة المخزنة صفرًا', async () => {
      const stats = await getStatsFor(W.cogsTier2);
      expect(stats.month.cogsBasis).toBe('sale_items');
      expect(stats.month.cost).toBe(200);
      expect(stats.month.grossProfit).toBe(800);
    }, 20000);

    it('المستوى الثالث: مشتريات الفترة (300) عندما لا توجد تكلفة مفصلة', async () => {
      const stats = await getStatsFor(W.cogsTier3);
      expect(stats.month.cogsBasis).toBe('purchases');
      expect(stats.month.cost).toBe(300);
      expect(stats.month.grossProfit).toBe(700);
    }, 20000);

    it('لا توجد أي تكلفة → صفر مع أساس purchases والربح يساوي المبيعات', async () => {
      const stats = await getStatsFor(W.cogsZero);
      expect(stats.month.cogsBasis).toBe('purchases');
      expect(stats.month.cost).toBe(0);
      expect(stats.month.grossProfit).toBe(100);
      expect(stats.month.netProfit).toBe(100);
    }, 20000);

    it('تحتوي لوحة التحكم على مركز العمليات والمخاطر actionCenter بالملخص والتنبيهات', async () => {
      const stats = await getStatsFor(W.cogsZero);
      expect(stats).toHaveProperty('actionCenter');
      expect(stats.actionCenter).toHaveProperty('red');
      expect(stats.actionCenter).toHaveProperty('orange');
      expect(stats.actionCenter).toHaveProperty('yellow');
      expect(stats.actionCenter).toHaveProperty('total');
      expect(stats.actionCenter).toHaveProperty('alerts');
      expect(Array.isArray(stats.actionCenter.alerts)).toBe(true);
    }, 20000);
  });
});
