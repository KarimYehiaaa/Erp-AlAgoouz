/**
 * اختبارات مستهدفة للإصلاحات الحسابية:
 *  1) COGS تُحسب من تكلفة السطر (cost_price) بدون مضاعفة الكمية — CALC-01
 *  2) إرجاع البيع يُعلّم المدفوعات كمستردة (refunded_at) ويُظهر المبلغ المسترد — ACC-01
 *  3) رصيد العميل متطابق بين القائمة والرصيد المخزن مع مدفوعات الفاتورة المرتبطة — ACC-02
 *
 * تُشغَّل على قاعدة محلية معزولة عبر: npm run test:local
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getProfitAndLoss } from '../src/services/plService';
import { returnSale, getSaleById } from '../src/services/salesService';
import { getCustomers } from '../src/services/customerService';
import { recalculateCustomerBalance } from '../src/services/customerBalanceService';
import { query } from '../src/database/pool';
import { appCache } from '../src/utils/cache';

describe('إصلاحات الحسابات (COGS / المرتجعات / رصيد العميل)', () => {
  const stamp = Date.now().toString(36);
  const COGS_DATE = '2024-06-10'; // تاريخ فريد بعيد عن تواريخ الاختبارات الأخرى

  let productId: number;
  let cogsSaleId: number;
  let returnSaleId: number;
  let returnPaymentId: number;
  let customerId: number;
  let balanceSaleId: number;
  let balanceInvoiceId: number;
  let balancePaymentId: number;

  beforeAll(async () => {
    // ── منتج مشترك (تكلفة الوحدة 30) ──
    const prod = await query(
      `INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, category_id, is_active)
       VALUES ($1, $2, 5, 100, 30, 1, true) RETURNING id`,
      [`TEST-FIX-${stamp}`, `منتج اختبار ${stamp}`],
    );
    productId = prod.rows[0].id;

    // ── 1) بيع لاختبار COGS: cost_amount = 0 عمدًا حتى يستخدم التقرير مسار sale_items ──
    const cogsSale = await query(
      `INSERT INTO sales (sale_number, sale_date, warehouse_id, user_id, total_amount, cost_amount, profit_amount, status, payment_status)
       VALUES ($1, $2::date, 1, 1, 300, 0, 300, 'completed', 'paid') RETURNING id`,
      [`TEST-COGS-${stamp}`, COGS_DATE],
    );
    cogsSaleId = cogsSale.rows[0].id;
    // cost_price مخزّن كتكلفة السطر: 3×30=90 و 2×30=60 (دلالة saleInventoryOps)
    // الخطأ القديم (cost_price × quantity) كان سيعطي 90×3 + 60×2 = 390
    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, total_amount)
       VALUES ($1, $2, 3, 50, 90, 150), ($1, $2, 2, 75, 60, 150)`,
      [cogsSaleId, productId],
    );

    // ── 2) بيع مكتمل بمدفوعات (ليُرجَع لاحقًا) ──
    const retSale = await query(
      `INSERT INTO sales (sale_number, sale_date, warehouse_id, user_id, total_amount, cost_amount, profit_amount, status, payment_status)
       VALUES ($1, CURRENT_DATE, 1, 1, 150, 0, 150, 'completed', 'paid') RETURNING id`,
      [`TEST-RET-${stamp}`],
    );
    returnSaleId = retSale.rows[0].id;
    const pay = await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
       VALUES ($1, 'sale', $2, 150, 'cash', 1) RETURNING id`,
      [`PAY-TEST-${stamp}`, returnSaleId],
    );
    returnPaymentId = pay.rows[0].id;

    // ── 3) عميل ببيع جملة مدفوع بالكامل عبر فاتورة مرتبطة (دفعة reference_type='invoice') ──
    const cust = await query(
      `INSERT INTO customers (code, name_ar, customer_type, opening_balance, balance, current_balance)
       VALUES ($1, $2, 'wholesale', 0, 0, 0) RETURNING id`,
      [`C-TEST-${stamp}`, `عميل اختبار ${stamp}`],
    );
    customerId = cust.rows[0].id;
    const bSale = await query(
      `INSERT INTO sales (sale_number, sale_date, warehouse_id, user_id, customer_id, sale_type, total_amount, cost_amount, profit_amount, status, payment_status)
       VALUES ($1, CURRENT_DATE, 1, 1, $2, 'wholesale', 100, 0, 100, 'completed', 'partial') RETURNING id`,
      [`TEST-BAL-${stamp}`, customerId],
    );
    balanceSaleId = bSale.rows[0].id;
    const inv = await query(
      `INSERT INTO invoices (invoice_number, sale_id, customer_id, subtotal, total_amount, payment_status, user_id)
       VALUES ($1, $2, $3, 100, 100, 'partial', 1) RETURNING id`,
      [`INV-TEST-${stamp}`, balanceSaleId, customerId],
    );
    balanceInvoiceId = inv.rows[0].id;
    const bPay = await query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, user_id)
       VALUES ($1, 'invoice', $2, 100, 'cash', 1) RETURNING id`,
      [`PAY-BAL-${stamp}`, balanceInvoiceId],
    );
    balancePaymentId = bPay.rows[0].id;
  });

  afterAll(async () => {
    if (balancePaymentId) await query(`DELETE FROM payments WHERE id = $1`, [balancePaymentId]);
    if (balanceInvoiceId) await query(`DELETE FROM invoices WHERE id = $1`, [balanceInvoiceId]);
    if (balanceSaleId) {
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [balanceSaleId]);
      await query(`DELETE FROM sales WHERE id = $1`, [balanceSaleId]);
    }
    if (returnPaymentId) await query(`DELETE FROM payments WHERE id = $1`, [returnPaymentId]);
    if (returnSaleId) {
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [returnSaleId]);
      await query(`DELETE FROM sales WHERE id = $1`, [returnSaleId]);
    }
    if (cogsSaleId) {
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [cogsSaleId]);
      await query(`DELETE FROM sales WHERE id = $1`, [cogsSaleId]);
    }
    if (customerId) await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    if (productId) await query(`DELETE FROM products WHERE id = $1`, [productId]);
    appCache.clear();
  });

  it('COGS تُحسب من تكلفة السطر بدون مضاعفة الكمية', async () => {
    appCache.clear();
    const pl = await getProfitAndLoss(COGS_DATE, COGS_DATE);
    // تكلفة السطر الصحيحة: 90 + 60 = 150
    // الخطأ القديم (SUM(cost_price × quantity)) كان يعطي 390
    expect(pl.cogs.total).toBe(150);
    expect(pl.cogs.from_items).toBe(150);
    expect(pl.cogs.basis || pl.cogs_basis).toBeDefined();
  });

  it('إرجاع البيع يعلّم المدفوعات كمستردة ويُظهر المبلغ المسترد', async () => {
    const returned = await returnSale(returnSaleId, 1, 'اختبار الإرجاع');
    expect(returned.status).toBe('returned');
    expect(returned.payment_status).toBe('refunded');
    expect(Number(returned.refunded_amount)).toBe(150);
    expect(returned.returned_at).toBeTruthy();
    expect(returned.payments?.[0]?.refunded).toBe(true);
    expect(Number(returned.payments?.[0]?.amount)).toBe(150);

    // الدفعة مُعلَّمة كمستردة في الجدول ولا تُحتسب ضمن النقد غير المسترد
    const row = (
      await query(`SELECT refunded_at FROM payments WHERE id = $1`, [returnPaymentId])
    ).rows[0];
    expect(row.refunded_at).toBeTruthy();
    const stillActive = (
      await query(
        `SELECT COUNT(*)::int AS n FROM payments WHERE id = $1 AND refunded_at IS NULL`,
        [returnPaymentId],
      )
    ).rows[0].n;
    expect(stillActive).toBe(0);

    // getSaleById يعيد نفس بيانات الإرجاع
    const byId = await getSaleById(returnSaleId);
    expect(Number(byId.refunded_amount)).toBe(150);
  });

  it('رصيد العميل متطابق بين القائمة والرصيد المخزن مع مدفوعات الفاتورة المرتبطة', async () => {
    await recalculateCustomerBalance(query, customerId);
    const customersList = await getCustomers({ search: `عميل اختبار ${stamp}` });
    const stored = (
      await query(`SELECT balance, current_balance FROM customers WHERE id = $1`, [customerId])
    ).rows[0];

    const row = customersList.find((c: any) => c.id === customerId);
    expect(row).toBeTruthy();
    // البيع (100) مدفوع بالكامل عبر دفعة على الفاتورة المرتبطة → الرصيد 0
    expect(Number(row.total_balance)).toBe(0);
    expect(Number(stored.balance)).toBe(0);
    expect(Number(stored.current_balance)).toBe(0);
  });
});
