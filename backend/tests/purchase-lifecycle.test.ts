/**
 * اختبار دورة الشراء الكاملة:
 *   استلام بضاعة من مورد ← دفع جزء من التكلفة ← إرجاع البضاعة للمورد،
 *   مع التحقق في كل خطوة من:
 *   - المخزون (زيادة عند الاستلام، خصم عند الإرجاع)
 *   - رصيد المورد (استحقاق عند الاستلام، انخفاض عند الدفع، رصيد دائن عند الإرجاع)
 *   - سعر شراء المنتج المحدَّث وسجل حركات المخزون
 *
 * تُشغَّل على قاعدة محلية معزولة عبر: npm run test:local
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createPurchaseInvoice,
  deletePurchaseInvoice,
} from '../src/services/purchaseService';
import { recordSupplierPayment } from '../src/services/supplierService';
import { query } from '../src/database/pool';

describe('دورة الشراء (استلام ← دفع ← إرجاع للمورد)', () => {
  const stamp = Date.now().toString(36);
  const userId = 1;
  const WAREHOUSE_ID = 1;

  let supplierId: number;
  let productId: number;
  let invoiceId: number;

  const getStock = async (): Promise<number> => {
    const r = await query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, WAREHOUSE_ID],
    );
    return Number(r.rows[0]?.quantity ?? 0);
  };

  const getSupplierBalance = async (): Promise<number> => {
    const r = await query(`SELECT balance FROM suppliers WHERE id = $1`, [supplierId]);
    return Number(r.rows[0]?.balance ?? 0);
  };

  const getSupplierPaid = async (): Promise<number> => {
    const r = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE reference_type = 'supplier' AND reference_id = $1`,
      [supplierId],
    );
    return Number(r.rows[0]?.total ?? 0);
  };

  beforeAll(async () => {
    const sup = await query(
      `INSERT INTO suppliers (code, name_ar, balance) VALUES ($1, $2, 0) RETURNING id`,
      [`S-TEST-${stamp}`, `مورد اختبار ${stamp}`],
    );
    supplierId = sup.rows[0].id;

    const prod = await query(
      `INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, primary_warehouse_id, category_id, is_active)
       VALUES ($1, $2, 5, 100, 25, $3, 1, true) RETURNING id`,
      [`TEST-PUR-${stamp}`, `منتج شراء ${stamp}`, WAREHOUSE_ID],
    );
    productId = prod.rows[0].id;
  });

  afterAll(async () => {
    if (invoiceId) {
      await query(
        `DELETE FROM stock_movements WHERE reference_type = 'purchase_invoice' AND reference_id = $1`,
        [invoiceId],
      );
      await query(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1`, [invoiceId]);
      await query(`DELETE FROM purchase_invoices WHERE id = $1`, [invoiceId]);
    }
    if (supplierId) {
      await query(`DELETE FROM payments WHERE reference_type = 'supplier' AND reference_id = $1`, [
        supplierId,
      ]);
      await query(`DELETE FROM suppliers WHERE id = $1`, [supplierId]);
    }
    if (productId) {
      await query(`DELETE FROM inventory WHERE product_id = $1`, [productId]);
      await query(`DELETE FROM products WHERE id = $1`, [productId]);
    }
  });

  it('يستلم بضاعة من المورد ويزيد المخزون ورصيد المورد', async () => {
    const invoice = await createPurchaseInvoice(
      {
        supplier_id: supplierId,
        items: [{ product_id: productId, quantity: 10, unit_price: 20 }],
      },
      userId,
    );
    invoiceId = invoice.id;

    // قيمة الفاتورة: 10 × 20 = 200
    expect(Number(invoice.subtotal)).toBe(200);
    expect(Number(invoice.total_amount)).toBe(200);
    expect(invoice.supplier_id).toBe(supplierId);

    // المخزون: 0 → 10
    expect(await getStock()).toBe(10);

    // رصيد المورد: استحقاق 200 على المحل
    expect(await getSupplierBalance()).toBe(200);

    // سعر الشراء للمنتج تَحدّث إلى آخر سعر (20)
    const prod = (await query(`SELECT purchase_price FROM products WHERE id = $1`, [productId]))
      .rows[0];
    expect(Number(prod.purchase_price)).toBe(20);

    // حركة مخزون 'purchase' مسجلة
    const mov = (
      await query(
        `SELECT COALESCE(SUM(quantity), 0) AS qty FROM stock_movements
         WHERE reference_type = 'purchase_invoice' AND reference_id = $1 AND movement_type = 'purchase'`,
        [invoiceId],
      )
    ).rows[0];
    expect(Number(mov.qty)).toBe(10);
  });

  it('يسدد جزءًا من قيمة المشتريات ويخفض رصيد المورد', async () => {
    await recordSupplierPayment(supplierId, { amount: 150, payment_method: 'cash' }, userId);

    // المدفوع: 150
    expect(await getSupplierPaid()).toBe(150);
    // الرصيد: 200 - 150 = 50 مستحق
    expect(await getSupplierBalance()).toBe(50);
  });

  it('يرجع البضاعة للمورد ويستعيد المخزون ويصبح رصيد المورد دائنًا', async () => {
    const result = await deletePurchaseInvoice(invoiceId, userId);
    expect(result.success).toBe(true);
    expect(result.shortages).toEqual([]); // كل الكمية رجعت (10 متاحة)

    // المخزون رجع لمستواه قبل الشراء: 0
    expect(await getStock()).toBe(0);

    // الفاتورة حذف ناعم
    const inv = (
      await query(`SELECT deleted_at FROM purchase_invoices WHERE id = $1`, [invoiceId])
    ).rows[0];
    expect(inv.deleted_at).toBeTruthy();

    // رصيد المورد: لا فواتير متبقية (0) − مدفوعات (150) = -150 (المورد مدين لنا)
    expect(await getSupplierBalance()).toBe(-150);

    // حركة عكس 'purchase_reversal' مسجلة
    const rev = (
      await query(
        `SELECT COALESCE(SUM(quantity), 0) AS qty FROM stock_movements
         WHERE reference_type = 'purchase_invoice' AND reference_id = $1 AND movement_type = 'purchase_reversal'`,
        [invoiceId],
      )
    ).rows[0];
    expect(Number(rev.qty)).toBe(10);
  });
});
