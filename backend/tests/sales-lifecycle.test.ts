/**
 * اختبار دورة المبيعات الكاملة (POS):
 *   إنشاء بيع بخصم وضريبة ← تعديله ← إرجاعه، مع التحقق من:
 *   - المجاميع الحسابية (subtotal/خصم/ضريبة/إجمالي/تكلفة/ربح) في كل خطوة
 *   - المخزون (خصم عند الإنشاء، إعادة تسوية عند التعديل، استرجاع عند الإرجاع)
 *   - الدفعات (إنشاء/استبدال/تعليم كمستردة) ورصيد العميل
 *
 * تُشغَّل على قاعدة محلية معزولة عبر: npm run test:local
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDailySale, updateSale, returnSale } from '../src/services/salesService';
import { query } from '../src/database/pool';

describe('دورة المبيعات الكاملة (POS: إنشاء ← تعديل ← إرجاع)', () => {
  const stamp = Date.now().toString(36);
  const userId = 1;
  const WAREHOUSE_ID = 1;
  const UNIT_COST = 30; // purchase_price للمنتج

  let productId: number;
  let customerId: number;
  let saleId: number;

  const getStock = async (): Promise<number> => {
    const r = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, WAREHOUSE_ID],
    );
    return Number(r.rows[0]?.quantity ?? 0);
  };

  const getSalePayments = async (sid: number) => {
    const r = await query(
      `SELECT amount, refunded_at FROM payments
       WHERE (reference_type = 'sale' AND reference_id = $1)
          OR (reference_type = 'invoice' AND reference_id = (SELECT id FROM invoices WHERE sale_id = $1 LIMIT 1))`,
      [sid],
    );
    return r.rows;
  };

  const getCustomerBalance = async () => {
    const r = await query(`SELECT balance FROM customers WHERE id = $1`, [customerId]);
    return Number(r.rows[0]?.balance ?? 0);
  };

  beforeAll(async () => {
    // منتج بتكلفة وحدة 30 + مخزون 100 + عميل
    const prod = await query(
      `INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, primary_warehouse_id, category_id, is_active)
       VALUES ($1, $2, 5, 100, $3, $4, 1, true) RETURNING id`,
      [`TEST-POS-${stamp}`, `منتج POS ${stamp}`, UNIT_COST, WAREHOUSE_ID],
    );
    productId = prod.rows[0].id;
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 100)`,
      [productId, WAREHOUSE_ID],
    );
    const cust = await query(
      `INSERT INTO customers (code, name_ar, customer_type, opening_balance, balance, current_balance)
       VALUES ($1, $2, 'retail', 0, 0, 0) RETURNING id`,
      [`C-POS-${stamp}`, `عميل POS ${stamp}`],
    );
    customerId = cust.rows[0].id;
  });

  afterAll(async () => {
    if (saleId) {
      await query(
        `DELETE FROM payments
         WHERE (reference_type = 'sale' AND reference_id = $1)
            OR (reference_type = 'invoice' AND reference_id = (SELECT id FROM invoices WHERE sale_id = $1 LIMIT 1))`,
        [saleId],
      );
      await query(`DELETE FROM invoices WHERE sale_id = $1`, [saleId]);
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
      await query(`DELETE FROM stock_movements WHERE reference_type = 'sale' AND reference_id = $1`, [
        saleId,
      ]);
      await query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    }
    if (customerId) await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    if (productId) {
      await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it('ينشئ بيع POS بالخصم والضريبة ويخصم المخزون ويسجل الدفعة', async () => {
    const sale = await createDailySale(
      {
        sale_type: 'pos',
        customer_id: customerId,
        warehouse_id: WAREHOUSE_ID,
        payment_status: 'paid',
        payment_method: 'cash',
        discount_amount: 20,
        tax_enabled: true,
        tax_percent: 14,
        items: [
          { product_id: productId, quantity: 2, unit_price: 50 },
          { product_id: productId, quantity: 1, unit_price: 80 },
        ],
      },
      userId,
    );
    saleId = sale.id;

    // الحساب: البنود 100 + 80 = 180، خصم 20 → 160، ضريبة 14% = 22.4 → الإجمالي 182.4
    expect(Number(sale.subtotal)).toBe(180);
    expect(Number(sale.discount_amount)).toBe(20);
    expect(Number(sale.tax_amount)).toBe(22.4);
    expect(Number(sale.tax_percent)).toBe(14);
    expect(Number(sale.total_amount)).toBe(182.4);
    // التكلفة: 2×30 + 1×30 = 90، الربح: 182.4 − 90 = 92.4
    expect(Number(sale.cost_amount)).toBe(90);
    expect(Number(sale.profit_amount)).toBe(92.4);
    expect(sale.status).toBe('completed');
    expect(sale.payment_status).toBe('paid');

    // المخزون: 100 − 3 = 97
    expect(await getStock()).toBe(97);

    // الدفعة مسجلة بكامل المبلغ
    const pays = await getSalePayments(saleId);
    expect(pays.length).toBe(1);
    expect(Number(pays[0].amount)).toBe(182.4);
    expect(pays[0].refunded_at).toBeFalsy();

    // بيع POS لا يُنشئ مديونية على العميل
    expect(await getCustomerBalance()).toBe(0);
  });

  it('يعدّل البيع ويعيد تسوية المخزون والدفعة والقيم', async () => {
    const updated = await updateSale(
      saleId,
      {
        sale_type: 'pos',
        customer_id: customerId,
        warehouse_id: WAREHOUSE_ID,
        payment_status: 'paid',
        payment_method: 'cash',
        discount_amount: 10,
        tax_enabled: true,
        tax_percent: 14,
        items: [
          { product_id: productId, quantity: 1, unit_price: 50 },
          { product_id: productId, quantity: 1, unit_price: 80 },
        ],
      },
      userId,
    );

    // البنود 50 + 80 = 130، خصم 10 → 120، ضريبة 14% = 16.8 → الإجمالي 136.8
    expect(Number(updated.subtotal)).toBe(130);
    expect(Number(updated.discount_amount)).toBe(10);
    expect(Number(updated.tax_amount)).toBe(16.8);
    expect(Number(updated.total_amount)).toBe(136.8);
    // التكلفة: 1×30 + 1×30 = 60، الربح: 136.8 − 60 = 76.8
    expect(Number(updated.cost_amount)).toBe(60);
    expect(Number(updated.profit_amount)).toBe(76.8);

    // المخزون: استرجاع 3 ثم خصم 2 → 100 − 2 = 98
    expect(await getStock()).toBe(98);

    // الدفعة استُبدلت بقيمة جديدة واحدة (لا تكرار)
    const pays = await getSalePayments(saleId);
    expect(pays.length).toBe(1);
    expect(Number(pays[0].amount)).toBe(136.8);

    expect(await getCustomerBalance()).toBe(0);
  });

  it('يرجع البيع ويستعيد المخزون ويعلّم الدفعة كمستردة', async () => {
    const returned = await returnSale(saleId, userId, 'إرجاع كامل للاختبار');

    expect(returned.status).toBe('returned');
    expect(returned.payment_status).toBe('refunded');
    // المبلغ المسترد = آخر مبلغ مدفوع (بعد التعديل)
    expect(Number(returned.refunded_amount)).toBe(136.8);
    expect(returned.returned_at).toBeTruthy();

    // المخزون عاد لمستواه الأصلي قبل البيع: 100
    expect(await getStock()).toBe(100);

    // الدفعة ما زالت موجودة لكن مُعلَّمة كمستردة
    const pays = await getSalePayments(saleId);
    expect(pays.length).toBe(1);
    expect(pays[0].refunded_at).toBeTruthy();

    expect(await getCustomerBalance()).toBe(0);
  });
});
