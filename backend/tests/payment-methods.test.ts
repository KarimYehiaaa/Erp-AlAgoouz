import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDashboardStats, invalidateDashboardCache } from '../src/services/dashboardService';
import { query } from '../src/database/pool';
import pool from '../src/database/pool.js';

/**
 * اختبار انتكاس لرسم "طرق الدفع" (paymentMethodSummary):
 * - مدفوعات الفواتير الآجلة (reference_type='invoice') يجب أن تظهر في التوزيع
 *   (كانت مستثناة بـ reference_type != 'invoice' فتختفي تحصيلات فواتير الآجل).
 * - مدفوعات الموردين (خروج نقد) لا تدخل في طرق دفع التحصيل.
 * - مدفوعات المبيعات المرتجعة / الفواتير المستردة مستبعدة (المبلغ رجع للعميل).
 * - مبالغ الرسم مطابقة تمامًا لسجل المدفوعات (جدول payments) بنفس الفلاتر.
 */
describe('رسم طرق الدفع (paymentMethodSummary)', () => {
  let today = '';
  let saleId = 0;
  let invoiceId = 0;
  let returnedSaleId = 0;
  let supplierId = 0;

  beforeAll(async () => {
    const d = await query(`SELECT CURRENT_DATE::text AS d`);
    today = d.rows[0].d;

    // تنظيف أي بقايا من تشغيل سابق فاشل
    await query(`DELETE FROM payments WHERE payment_number LIKE 'PMT-TEST-%'`);
    await query(`DELETE FROM invoices WHERE invoice_number = 'INV-TEST-PMT-001'`);
    await query(`DELETE FROM sales WHERE sale_number LIKE 'SL-TEST-PMT-%'`);
    await query(`DELETE FROM suppliers WHERE name_ar = 'مورد اختبار طرق الدفع'`);

    // 1) بيع مكتمل مدفوع كاش
    const saleRes = await query(
      `INSERT INTO sales (sale_number, sale_type, sale_date, entry_mode, warehouse_id, user_id, subtotal, discount_amount, tax_amount, total_amount, cost_amount, profit_amount, payment_status, status)
       VALUES ('SL-TEST-PMT-001', 'branch', CURRENT_DATE, 'pos', 1, 1, 500, 0, 0, 500, 300, 200, 'paid', 'completed')
       RETURNING id`,
    );
    saleId = saleRes.rows[0].id;
    await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method)
       VALUES ('PMT-TEST-001', 'sale', $1, 500, 'cash')`,
      [saleId],
    );

    // 2) فاتورة آجلة مستقلة (سدادها كارت) — كانت مختفية قبل الإصلاح
    const invRes = await query(
      `INSERT INTO invoices (invoice_number, subtotal, discount_amount, tax_amount, total_amount, payment_status)
       VALUES ('INV-TEST-PMT-001', 700, 0, 0, 700, 'unpaid')
       RETURNING id`,
    );
    invoiceId = invRes.rows[0].id;
    await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method)
       VALUES ('PMT-TEST-002', 'invoice', $1, 700, 'card')`,
      [invoiceId],
    );

    // 3) بيع مرتجع كان مدفوعًا كاش — يجب ألا يظهر (المبلغ رجع للعميل)
    const retRes = await query(
      `INSERT INTO sales (sale_number, sale_type, sale_date, entry_mode, warehouse_id, user_id, subtotal, discount_amount, tax_amount, total_amount, cost_amount, profit_amount, payment_status, status)
       VALUES ('SL-TEST-PMT-002', 'branch', CURRENT_DATE, 'pos', 1, 1, 300, 0, 0, 300, 180, 120, 'refunded', 'returned')
       RETURNING id`,
    );
    returnedSaleId = retRes.rows[0].id;
    await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method)
       VALUES ('PMT-TEST-004', 'sale', $1, 300, 'cash')`,
      [returnedSaleId],
    );

    // 4) دفعة مورد (خروج نقد) — لا تدخل في طرق دفع التحصيل
    const supRes = await query(
      `INSERT INTO suppliers (name_ar) VALUES ('مورد اختبار طرق الدفع') RETURNING id`,
    );
    supplierId = supRes.rows[0].id;
    await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method)
       VALUES ('PMT-TEST-003', 'supplier', $1, 900, 'bank')`,
      [supplierId],
    );

    invalidateDashboardCache();
  });

  afterAll(async () => {
    await query(`DELETE FROM payments WHERE payment_number LIKE 'PMT-TEST-%'`);
    if (returnedSaleId) await query(`DELETE FROM sales WHERE id = $1`, [returnedSaleId]);
    if (invoiceId) await query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);
    if (saleId) await query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    if (supplierId) await query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
    invalidateDashboardCache();
    await pool.end();
  });

  const getSummary = async () => {
    const stats = await getDashboardStats({
      range: 'custom',
      from_date: today,
      to_date: today,
    });
    return (stats.paymentMethodSummary as any[]) || [];
  };

  it('يشمل مدفوعات الفواتير الآجلة (invoice) في توزيع طرق الدفع', async () => {
    const summary = await getSummary();
    const card = summary.find((r: any) => r.payment_method === 'card');
    expect(card).toBeDefined();
    // 700 = سداد الفاتورة الآجلة بالكارت — كانت مستثناة قبل الإصلاح
    expect(Number(card.total)).toBe(700);
  });

  it('يستبعد مدفوعات الموردين (خروج نقد) من طرق دفع التحصيل', async () => {
    const summary = await getSummary();
    const bank = summary.find((r: any) => r.payment_method === 'bank');
    expect(bank).toBeUndefined();
  });

  it('يستبعد مدفوعات المبيعات المرتجعة (المسترّدة للعميل)', async () => {
    const summary = await getSummary();
    const cash = summary.find((r: any) => r.payment_method === 'cash');
    expect(cash).toBeDefined();
    // 500 فقط = البيع المكتمل، بدون دفعة البيع المرتجع (300)
    expect(Number(cash.total)).toBe(500);
  });

  it('مبالغ الرسم مطابقة تمامًا لسجل المدفوعات بنفس الفلاتر', async () => {
    const summary = await getSummary();
    const ledger = await query(
      `SELECT payment_method, COALESCE(SUM(p.amount),0) AS total
       FROM payments p
       WHERE DATE(p.created_at) BETWEEN $1::date AND $2::date
         AND p.reference_type IN ('sale', 'invoice')
         AND NOT EXISTS (
           SELECT 1 FROM sales s2
           WHERE p.reference_type = 'sale' AND s2.id = p.reference_id AND s2.status = 'returned'
         )
         AND NOT EXISTS (
           SELECT 1 FROM invoices i2
           WHERE p.reference_type = 'invoice' AND i2.id = p.reference_id AND i2.payment_status = 'refunded'
         )
       GROUP BY payment_method`,
      [today, today],
    );
    const apiMap = Object.fromEntries(
      summary.map((r: any) => [r.payment_method, Number(r.total)]),
    );
    const dbMap = Object.fromEntries(
      ledger.rows.map((r: any) => [r.payment_method, Number(r.total)]),
    );
    expect(apiMap).toEqual(dbMap);
  });
});
