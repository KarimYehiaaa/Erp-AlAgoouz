/**
 * اختبار دورة الفواتير اليدوية:
 *   إنشاء فاتورة بخصم وضريبة ودفع جزئي ← تعديلها ← حذفها،
 *   مع التحقق في كل خطوة من:
 *   - المجاميع الحسابية (subtotal/خصم/ضريبة/إجمالي/تكلفة/ربح البيع المرتبط)
 *   - المخزون (خصم عند الإنشاء، إعادة تسوية عند التعديل، استرجاع عند الحذف)
 *   - الدفعات (جزئية عند الإنشاء، تسوية كاملة عند التعديل، حذف عند الحذف)
 *   - رصيد العميل (مديونية ← صفر بعد الدفع الكامل ← صفر بعد الحذف)
 *
 * تُشغَّل على قاعدة محلية معزولة عبر: npm run test:local
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createInvoice, updateInvoice, deleteInvoice, getInvoiceById } from '../src/services/invoiceService';
import { recalculateCustomerBalance } from '../src/services/customerBalanceService';
import { query } from '../src/database/pool';

describe('دورة الفواتير (إنشاء ← تعديل ← حذف)', () => {
  const stamp = Date.now().toString(36);
  const userId = 1;
  const WAREHOUSE_ID = 1;
  const UNIT_COST = 25; // purchase_price للمنتج

  let productId: number;
  let customerId: number;
  let invoiceId: number;
  let linkedSaleId: number | null = null;

  const getStock = async (): Promise<number> => {
    const r = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, WAREHOUSE_ID],
    );
    return Number(r.rows[0]?.quantity ?? 0);
  };

  const getCustomerBalance = async (): Promise<number> => {
    await recalculateCustomerBalance(query, customerId);
    const r = await query(`SELECT balance FROM customers WHERE id = $1`, [customerId]);
    return Number(r.rows[0]?.balance ?? 0);
  };

  const getInvoicePayments = async (): Promise<any[]> => {
    const r = await query(
      `SELECT amount, refunded_at FROM payments
       WHERE (reference_type = 'invoice' AND reference_id = $1)
          OR (reference_type = 'sale' AND reference_id = $2)`,
      [invoiceId, linkedSaleId || 0],
    );
    return r.rows;
  };

  beforeAll(async () => {
    const prod = await query(
      `INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, primary_warehouse_id, category_id, is_active)
       VALUES ($1, $2, 5, 100, $3, $4, 1, true) RETURNING id`,
      [`TEST-INV-${stamp}`, `منتج فاتورة ${stamp}`, UNIT_COST, WAREHOUSE_ID],
    );
    productId = prod.rows[0].id;
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 20)`,
      [productId, WAREHOUSE_ID],
    );
    const cust = await query(
      `INSERT INTO customers (code, name_ar, customer_type, opening_balance, balance, current_balance)
       VALUES ($1, $2, 'wholesale', 0, 0, 0) RETURNING id`,
      [`C-INV-${stamp}`, `عميل فاتورة ${stamp}`],
    );
    customerId = cust.rows[0].id;
  });

  afterAll(async () => {
    if (invoiceId) {
      await query(`DELETE FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`, [
        invoiceId,
      ]);
      await query(`DELETE FROM stock_movements WHERE reference_type = 'invoice' AND reference_id = $1`, [
        invoiceId,
      ]);
      await query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
    }
    if (linkedSaleId) {
      await query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = $1`, [
        linkedSaleId,
      ]);
    }
    // ترتيب مهم: الفاتورة تُحذف قبل البيع المرتبط (invoices.sale_id → sales FK)
    if (invoiceId) await query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);
    if (linkedSaleId) {
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [linkedSaleId]);
      await query(`DELETE FROM sales WHERE id = $1`, [linkedSaleId]);
    }
    if (customerId) await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    if (productId) {
      await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it('ينشئ فاتورة يدوية بخصم وضريبة ودفع جزئي ويخصم المخزون ويسجل المديونية', async () => {
    const invoice = await createInvoice(
      {
        customer_id: customerId,
        payment_status: 'partial',
        paid_amount: 100,
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
    invoiceId = invoice.id;
    linkedSaleId = invoice.sale_id;

    // الحساب: البنود 100 + 80 = 180، خصم 20 → 160، ضريبة 14% = 22.4 → الإجمالي 182.4
    expect(Number(invoice.subtotal)).toBe(180);
    expect(Number(invoice.discount_amount)).toBe(20);
    expect(Number(invoice.tax_amount)).toBe(22.4);
    expect(Number(invoice.total_amount)).toBe(182.4);
    expect(invoice.payment_status).toBe('partial');
    expect(Number(invoice.paid_amount)).toBe(100);

    // بيع جملة مرتبط تلقائيًا: الإجمالي نفسه، التكلفة 3×25=75، الربح 107.4
    expect(linkedSaleId).toBeTruthy();
    const sale = (
      await query(`SELECT total_amount, cost_amount, profit_amount FROM sales WHERE id = $1`, [
        linkedSaleId,
      ])
    ).rows[0];
    expect(Number(sale.total_amount)).toBe(182.4);
    expect(Number(sale.cost_amount)).toBe(75);
    expect(Number(sale.profit_amount)).toBe(107.4);

    // المخزون: 20 − 3 = 17
    expect(await getStock()).toBe(17);

    // دفعة جزئية 100
    const pays = await getInvoicePayments();
    expect(pays.length).toBe(1);
    expect(Number(pays[0].amount)).toBe(100);

    // رصيد العميل: 182.4 − 100 = 82.4
    expect(await getCustomerBalance()).toBe(82.4);
  });

  it('يعدّل الفاتورة ويعيد تسوية المخزون والدفعة والرصيد', async () => {
    const updated = await updateInvoice(
      invoiceId,
      {
        customer_id: customerId,
        payment_status: 'paid',
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
    expect(updated.payment_status).toBe('paid');

    // البيع المرتبط: التكلفة 2×25=50، الربح 86.8
    const sale = (
      await query(`SELECT total_amount, cost_amount, profit_amount FROM sales WHERE id = $1`, [
        linkedSaleId,
      ])
    ).rows[0];
    expect(Number(sale.total_amount)).toBe(136.8);
    expect(Number(sale.cost_amount)).toBe(50);
    expect(Number(sale.profit_amount)).toBe(86.8);

    // المخزون: استرجاع 3 ثم خصم 2 → 20 − 2 = 18
    expect(await getStock()).toBe(18);

    // الدفعة استُبدلت بدفعة كاملة واحدة (136.8) — لا تكرار
    const pays = await getInvoicePayments();
    expect(pays.length).toBe(1);
    expect(Number(pays[0].amount)).toBe(136.8);

    // الرصيد: مدفوع بالكامل → 0
    expect(await getCustomerBalance()).toBe(0);
  });

  it('يحذف الفاتورة ويستعيد المخزون ويحذف الدفعات ويصفّر الرصيد', async () => {
    await deleteInvoice(invoiceId, userId);

    // المخزون عاد لمستواه الأصلي: 20
    expect(await getStock()).toBe(20);

    // الفاتورة والبيع المرتبط حذف ناعم
    const inv = (
      await query(`SELECT deleted_at FROM invoices WHERE id = $1`, [invoiceId])
    ).rows[0];
    expect(inv.deleted_at).toBeTruthy();
    const sale = (
      await query(`SELECT deleted_at FROM sales WHERE id = $1`, [linkedSaleId])
    ).rows[0];
    expect(sale.deleted_at).toBeTruthy();

    // الدفعات حُذفت
    const pays = await getInvoicePayments();
    expect(pays.length).toBe(0);

    // رصيد العميل صفر (لا فواتير ولا مبيعات متبقية)
    expect(await getCustomerBalance()).toBe(0);
  });
});
