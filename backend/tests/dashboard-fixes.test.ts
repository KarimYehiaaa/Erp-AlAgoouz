/**
 * اختبار لوحة التحكم — إصلاح احتساب الإيرادات:
 * أرصدة العملاء الافتتاحية (مديونيات قديمة قبل النظام) كانت تُضاف إلى مبيعات
 * الفترة عبر `periodSalesRow.total`، فتُضخّم المبيعات والأرباح.
 * بعد الإصلاح يجب أن تظهر ضمن "مديونيات العملاء" فقط، وليس ضمن إيرادات الفترة.
 *
 * تُشغَّل على قاعدة محلية معزولة عبر: npm run test:local
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDashboardStats, invalidateDashboardCache } from '../src/services/dashboardService';
import { query } from '../src/database/pool';

describe('لوحة التحكم — أرصدة العملاء الافتتاحية ليست إيرادات للفترة', () => {
  const stamp = Date.now().toString(36);
  const FROM = '2024-05-10';
  const TO = '2024-05-12';

  let customerId: number;
  let saleId: number;

  beforeAll(async () => {
    invalidateDashboardCache();

    // عميل برصيد افتتاحي 500 (مديونية سابقة) — كان يُضاف لإيرادات الفترة قبل الإصلاح
    const cust = await query(
      `INSERT INTO customers (code, name_ar, customer_type, opening_balance, balance, current_balance)
       VALUES ($1, $2, 'wholesale', 500, 500, 500) RETURNING id`,
      [`C-DASH-${stamp}`, `عميل داشبورد ${stamp}`],
    );
    customerId = cust.rows[0].id;

    // بيع واحد فقط ضمن الفترة: إجمالي 1000 وتكلفة 400 (ربح إجمالي 600)
    const sale = await query(
      `INSERT INTO sales (sale_number, sale_date, warehouse_id, user_id, customer_id, sale_type, total_amount, cost_amount, profit_amount, status, payment_status)
       VALUES ($1, '2024-05-11'::date, 1, 1, $2, 'wholesale', 1000, 400, 600, 'completed', 'paid') RETURNING id`,
      [`TEST-DASH-${stamp}`, customerId],
    );
    saleId = sale.rows[0].id;
  });

  afterAll(async () => {
    if (saleId) {
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
      await query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    }
    if (customerId) await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    invalidateDashboardCache();
  });

  it(
    'لا تُضاف أرصدة العملاء الافتتاحية إلى مبيعات/أرباح الفترة',
    async () => {
      invalidateDashboardCache();
      const stats = await getDashboardStats({
        range: 'custom',
        from_date: FROM,
        to_date: TO,
      });

      // المبيعات = 1000 فقط (قبل الإصلاح كانت 1000 + 500 = 1500)
      expect(stats.month.sales).toBe(1000);
      expect(stats.month.salesCount).toBe(1);

      // الربح الإجمالي = 1000 - 400 = 600 (قبل الإصلاح كان 1500 - 400 = 1100)
      expect(stats.month.grossProfit).toBe(600);

      // المديونية الافتتاحية تبقى ضمن مديونيات العملاء — وليست إيرادًا للفترة
      expect(Number(stats.unpaidInvoices?.amount || 0)).toBeGreaterThanOrEqual(500);
    },
    20000, // مهلة كافية لدورة الداشبورد الكاملة (30+ استعلام)
  );
});
