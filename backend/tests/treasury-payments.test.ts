/**
 * اختبار عمليات الخزينة:
 *   تسجيل دفعة على رصيد عميل تُوزَّع تلقائيًا (FIFO — الأقدم أولًا)
 *   على فواتير متعددة، مع التحقق في كل خطوة من:
 *   - التوزيع الصحيح للمبلغ على الفواتير حسب تاريخ الاستحقاق
 *   - إنشاء سطر دفع مستقل لكل فاتورة بالمبلغ المخصص لها
 *   - تحديث حالة الدفع (paid/partial) للفاتورة والبيع المرتبط معًا
 *   - رصيد العميل (ينقص بمقدار الدفعة فقط، بلا خصم مزدوج)
 *   - رفض الدفعات الزائدة عن إجمالي المستحق
 *
 * السيناريو: 3 فواتير بنفس العميل
 *   أ: 100 ج.م (الأقدم — 2026-08-01، بيع مرتبط تلقائيًا)
 *   ب: 120 ج.م (2026-08-02، بيع مرتبط تلقائيًا)
 *   ج: 80 ج.م (2026-08-03، فاتورة مستقلة بدون بيع مرتبط)
 * الإجمالي المستحق: 300 ج.م
 *
 * تُشغَّل على قاعدة محلية معزولة عبر: npm run test:local
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createInvoice } from '../src/services/invoiceService';
import { getCustomerStatement, recordPayment } from '../src/services/customerService';
import { recalculateCustomerBalance } from '../src/services/customerBalanceService';
import { query } from '../src/database/pool';

describe('عمليات الخزينة: توزيع الدفعات على فواتير متعددة (FIFO)', () => {
  const stamp = Date.now().toString(36);
  const userId = 1;
  const WAREHOUSE_ID = 1;

  let productId: number;
  let customerId: number;
  let invoiceA: any; // 100 ج.م — الأقدم
  let invoiceB: any; // 120 ج.م
  let invoiceC: any; // 80 ج.م — فاتورة مستقلة (sale_id NULL)
  let saleA: number;
  let saleB: number;

  const getCustomerBalance = async (): Promise<number> => {
    await recalculateCustomerBalance(query, customerId);
    const r = await query(`SELECT balance FROM customers WHERE id = $1`, [customerId]);
    return Number(r.rows[0]?.balance ?? 0);
  };

  const getPayments = async (refType: string, refId: number): Promise<any[]> => {
    const r = await query(
      `SELECT amount, payment_method FROM payments
       WHERE reference_type = $1 AND reference_id = $2 ORDER BY id`,
      [refType, refId],
    );
    return r.rows;
  };

  const getStatus = async (table: 'sales' | 'invoices', id: number): Promise<string> => {
    const r = await query(`SELECT payment_status FROM ${table} WHERE id = $1`, [id]);
    return r.rows[0]?.payment_status;
  };

  const allocationsShape = (allocations: any[]) =>
    allocations.map((a) => ({ type: a.type, id: a.id, amount: a.amount, new_status: a.new_status }));

  beforeAll(async () => {
    const prod = await query(
      `INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, primary_warehouse_id, category_id, is_active)
       VALUES ($1, $2, 5, 100, 25, $3, 1, true) RETURNING id`,
      [`TEST-TRE-${stamp}`, `منتج خزينة ${stamp}`, WAREHOUSE_ID],
    );
    productId = prod.rows[0].id;
    await query(
      `INSERT INTO inventory (product_id, warehouse_id, quantity) VALUES ($1, $2, 50)`,
      [productId, WAREHOUSE_ID],
    );
    const cust = await query(
      `INSERT INTO customers (code, name_ar, customer_type, opening_balance, balance, current_balance)
       VALUES ($1, $2, 'wholesale', 0, 0, 0) RETURNING id`,
      [`C-TRE-${stamp}`, `عميل خزينة ${stamp}`],
    );
    customerId = cust.rows[0].id;

    // فاتورة أ (الأقدم): 2 × 50 = 100 — تُنشئ بيع جملة مرتبطًا تلقائيًا
    invoiceA = await createInvoice(
      {
        customer_id: customerId,
        payment_status: 'unpaid',
        issued_at: '2026-08-01',
        due_date: '2026-08-01',
        items: [{ product_id: productId, quantity: 2, unit_price: 50 }],
      },
      userId,
    );
    saleA = invoiceA.sale_id;

    // فاتورة ب: 3 × 40 = 120
    invoiceB = await createInvoice(
      {
        customer_id: customerId,
        payment_status: 'unpaid',
        issued_at: '2026-08-02',
        due_date: '2026-08-02',
        items: [{ product_id: productId, quantity: 3, unit_price: 40 }],
      },
      userId,
    );
    saleB = invoiceB.sale_id;

    // فاتورة ج: مستقلة (بدون بيع مرتبط) — تختبر مسار التوزيع 'invoice'
    const invC = await query(
      `INSERT INTO invoices (invoice_number, sale_id, customer_id, invoice_type, subtotal, discount_amount, tax_amount, total_amount, payment_status, issued_at, due_date, user_id, qr_data)
       VALUES ($1, NULL, $2, 'manual', 80, 0, 0, 80, 'unpaid', '2026-08-03', '2026-08-03', $3, $4)
       RETURNING id`,
      [`INV-TRE-C-${stamp}`, customerId, userId, `INV:TREC-${stamp}`],
    );
    invoiceC = { id: invC.rows[0].id, total_amount: 80 };

    // إجمالي المستحق الابتدائي: 100 + 120 + 80 = 300
    expect(await getCustomerBalance()).toBe(300);
  });

  afterAll(async () => {
    // التنظيف بترتيب المفاتيح الأجنبية
    if (saleA) await query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = $1`, [saleA]);
    if (saleB) await query(`DELETE FROM payments WHERE reference_type = 'sale' AND reference_id = $1`, [saleB]);
    if (invoiceC?.id)
      await query(`DELETE FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`, [invoiceC.id]);
    for (const invId of [invoiceA?.id, invoiceB?.id]) {
      if (!invId) continue;
      await query(`DELETE FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`, [invId]);
      await query(`DELETE FROM stock_movements WHERE reference_type = 'invoice' AND reference_id = $1`, [invId]);
      await query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invId]);
    }
    // الفاتورة تُحذف قبل البيع المرتبط (invoices.sale_id → sales FK)
    if (invoiceC?.id) await query(`DELETE FROM invoices WHERE id = $1`, [invoiceC.id]);
    for (const invId of [invoiceA?.id, invoiceB?.id]) if (invId) await query(`DELETE FROM invoices WHERE id = $1`, [invId]);
    for (const sid of [saleA, saleB]) {
      if (!sid) continue;
      await query(`DELETE FROM sale_items WHERE sale_id = $1`, [sid]);
      await query(`DELETE FROM sales WHERE id = $1`, [sid]);
    }
    if (customerId) await query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    if (productId) {
      await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it('يرفض دفعة أكبر من إجمالي المستحق (300) دون تغيير الرصيد', async () => {
    await expect(
      recordPayment(customerId, { amount: 301, payment_method: 'cash', user_id: userId }),
    ).rejects.toThrow(/أكبر من إجمالي المستحق/);

    // الرصيد لم يتغيّر — العملية رُفضت بالكامل
    expect(await getCustomerBalance()).toBe(300);
  });

  it('يوزع دفعة 150: الفاتورة الأولى كاملة (100) والثانية جزئيًا (50)', async () => {
    const res = await recordPayment(customerId, { amount: 150, payment_method: 'cash', user_id: userId });
    expect(res.success).toBe(true);

    // التوزيع: أ(100 مدفوعة) ثم ب(50 جزئي) — الأقدم أولًا
    expect(allocationsShape(res.allocations)).toEqual([
      { type: 'sale', id: saleA, amount: 100, new_status: 'paid' },
      { type: 'sale', id: saleB, amount: 50, new_status: 'partial' },
    ]);

    // سطر دفع مستقل لكل فاتورة بالمبلغ المخصص
    expect((await getPayments('sale', saleA)).map((p) => Number(p.amount))).toEqual([100]);
    expect((await getPayments('sale', saleB)).map((p) => Number(p.amount))).toEqual([50]);

    // حالة الدفع تحدثت في الفاتورة والبيع المرتبط معًا
    expect(await getStatus('invoices', invoiceA.id)).toBe('paid');
    expect(await getStatus('sales', saleA)).toBe('paid');
    expect(await getStatus('invoices', invoiceB.id)).toBe('partial');
    expect(await getStatus('sales', saleB)).toBe('partial');
    expect(await getStatus('invoices', invoiceC.id)).toBe('unpaid');

    // الرصيد: 300 − 150 = 150
    expect(await getCustomerBalance()).toBe(150);
  });

  it('يوزع دفعة 120: يستكمل الثانية (70) ويكسر من الثالثة (50)', async () => {
    const res = await recordPayment(customerId, { amount: 120, payment_method: 'transfer', user_id: userId });
    expect(res.success).toBe(true);

    // التوزيع: ب(70 → مدفوعة) ثم ج(50 → جزئي)
    expect(allocationsShape(res.allocations)).toEqual([
      { type: 'sale', id: saleB, amount: 70, new_status: 'paid' },
      { type: 'invoice', id: invoiceC.id, amount: 50, new_status: 'partial' },
    ]);

    // سطر دفع جديد لكل فاتورة — لا تكرار ولا فقدان
    expect((await getPayments('sale', saleB)).map((p) => Number(p.amount))).toEqual([50, 70]);
    expect((await getPayments('invoice', invoiceC.id)).map((p) => Number(p.amount))).toEqual([50]);

    expect(await getStatus('invoices', invoiceB.id)).toBe('paid');
    expect(await getStatus('sales', saleB)).toBe('paid');
    expect(await getStatus('invoices', invoiceC.id)).toBe('partial');

    // الرصيد: 150 − 120 = 30
    expect(await getCustomerBalance()).toBe(30);
  });

  it('دفعة أخيرة 30 تغطي المتبقي وتصفّر رصيد العميل', async () => {
    const res = await recordPayment(customerId, { amount: 30, payment_method: 'cash', user_id: userId });
    expect(res.success).toBe(true);

    expect(allocationsShape(res.allocations)).toEqual([
      { type: 'invoice', id: invoiceC.id, amount: 30, new_status: 'paid' },
    ]);
    expect((await getPayments('invoice', invoiceC.id)).map((p) => Number(p.amount))).toEqual([50, 30]);
    expect(await getStatus('invoices', invoiceC.id)).toBe('paid');

    // الرصيد صفر بعد السداد الكامل
    expect(await getCustomerBalance()).toBe(0);
  });

  it('يرفض أي دفعة أخرى عندما لا توجد مستحقات متبقية', async () => {
    await expect(
      recordPayment(customerId, { amount: 10, payment_method: 'cash', user_id: userId }),
    ).rejects.toThrow(/لا توجد مبيعات أو فواتير مستحقة/);
  });

  it('كشف الحساب يفصل رصيد بداية المدة عن المستحق القابل للدفع (payable_total)', async () => {
    // محاكاة مديونية سابقة قبل النظام
    await query(`UPDATE customers SET opening_balance = 500 WHERE id = $1`, [customerId]);

    const stmt = await getCustomerStatement(customerId);

    // الرصيد الإجمالي يشمل رصيد بداية المدة
    expect(Number(stmt.summary.total_balance)).toBe(500);

    // لكن المستحق القابل للدفع من شاشة الدفعات لا يشمل رصيد بداية المدة
    // (كل الفواتير مسددة → صفر) — يطابق بالضبط ما يقبله recordPayment
    expect(Number(stmt.summary.payable_total)).toBe(0);
  });
});
