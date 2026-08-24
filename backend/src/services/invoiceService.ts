import { getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { parseLocalizedNumber } from '../utils/numberParsing.ts';
import { roundMoney } from '../utils/money.ts';
import { recalculateCustomerBalance } from './customerBalanceService.ts';
import { getDefaultWarehouseId } from './warehouseService.ts';
import { ensureInventoryRow } from './inventoryService.ts';
import { invoicesRepository } from '../repositories/invoices.repository.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
const generateInvoiceNumber = async (client) => {
  const settings = await client.query(`SELECT value FROM settings WHERE key = 'invoice'`);
  const config = settings.rows[0]?.value || { prefix: 'INV' };
  const res = await client.query(`SELECT nextval('seq_invoices_number') AS next_val`);
  return `${config.prefix || 'INV'}-${String(res.rows[0].next_val).padStart(5, '0')}`;
};
/**
 * تحليل بيانات الفاتورة وتطبيع أصنافها (داخل معاملة).
 * @param {Record<string, any>} [data] بيانات الفاتورة
 * @returns {{ items: any[], discount_amount: number, tax_amount: number, total_amount: number, payment_status?: string }}
 */
const parseInvoiceData = (data: Record<string, any> = {}) => {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length)
    throw new AppError(
      '\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0646\u0648\u062F \u0641\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629',
    );
  let subtotal = 0;
  const parsedItems = items.map((item, idx) => {
    if (!item.product_id) {
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646\u062A\u062C \u0645\u0633\u062C\u0644 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629`,
      );
    }
    const productId = Number(item.product_id);
    const qty = parseLocalizedNumber(item.quantity);
    const price = parseLocalizedNumber(item.unit_price);
    const disc = parseLocalizedNumber(item.discount_amount ?? 0, 0);
    if (!Number.isFinite(qty) || qty <= 0)
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u0643\u0645\u064A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631`,
      );
    if (!Number.isFinite(price) || price < 0)
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u0633\u0639\u0631 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0633\u0627\u0644\u0628`,
      );
    if (!Number.isFinite(disc) || disc < 0)
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u062E\u0635\u0645 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0628\u0627\u0644\u0633\u0627\u0644\u0628`,
      );
    if (disc > roundMoney(qty * price))
      throw new AppError(
        `\u0627\u0644\u0628\u0646\u062F \u0631\u0642\u0645 ${idx + 1}: \u0627\u0644\u062E\u0635\u0645 \u064A\u062A\u062C\u0627\u0648\u0632 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0628\u0646\u062F`,
      );
    const lineTotal = qty * price - disc;
    subtotal += lineTotal;
    return {
      product_id: productId,
      description:
        item.description ||
        item.product_name ||
        '\u0648\u0635\u0641 \u0627\u0644\u0628\u0646\u062F',
      quantity: qty,
      unit_price: price,
      discount_amount: disc,
      total_amount: roundMoney(lineTotal),
      sort_order: idx,
    };
  });

  const discountPercent = parseLocalizedNumber(data.discount_percent ?? 0, 0);
  const percentDiscount = (subtotal * discountPercent) / 100;
  const fixedDiscount = parseLocalizedNumber(data.discount_amount ?? 0, 0);
  const discountAmount = roundMoney(percentDiscount + fixedDiscount);
  if (discountAmount < 0) throw new AppError('الخصم لا يمكن أن يكون أقل من صفر');
  if (discountAmount > subtotal) throw new AppError('الخصم لا يمكن أن يتجاوز إجمالي البنود');
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxPercent = parseLocalizedNumber(data.tax_percent ?? 0, 0);
  const taxAmount = data.tax_enabled ? roundMoney((afterDiscount * taxPercent) / 100) : 0;
  const totalAmount = roundMoney(afterDiscount + taxAmount);

  return {
    items: parsedItems,
    subtotal: roundMoney(subtotal),
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus: data.payment_status || 'paid',
  };
};

const deductInvoiceInventory = async (client, invoiceId, items, userId, invoiceNumber) => {
  const defaultWhId = await getDefaultWarehouseId((text, params) => client.query(text, params));
  for (const item of items) {
    if (!item.product_id) continue;
    const productId = Number(item.product_id);
    const qty = Number(item.quantity || 0);
    if (qty <= 0) continue;

    const stockRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE product_id = $1`,
      [productId],
    );
    const globalTotal = Number(stockRes.rows[0]?.total || 0);

    const productRes = await client.query(
      `SELECT name_ar, primary_warehouse_id FROM products WHERE id = $1`,
      [productId],
    );
    const pName = productRes.rows[0]?.name_ar || 'المنتج';

    if (globalTotal < qty - 1e-4) {
      throw new AppError(
        `لا يوجد مخزون كافٍ للمنتج (${pName}). المطلوب ${qty} والمتاح كلياً بالمنشأة ${globalTotal}`,
      );
    }

    const targetWhId = productRes.rows[0]?.primary_warehouse_id || defaultWhId;
    let remainingNeeded = qty;

    if (targetWhId) {
      await ensureInventoryRow(client, productId, targetWhId);
      const lock = await client.query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
        [productId, targetWhId],
      );
      const avail = Number(lock.rows[0]?.quantity || 0);
      if (avail > 0) {
        const deductQty = Math.min(avail, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, productId, targetWhId],
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6)`,
          [
            productId,
            targetWhId,
            deductQty,
            invoiceId,
            userId,
            `صرف فاتورة مبيعات ${invoiceNumber}`,
          ],
        );
        remainingNeeded -= deductQty;
      }
    }

    if (remainingNeeded > 1e-4) {
      const otherWhs = await client.query(
        `SELECT warehouse_id, quantity FROM inventory WHERE product_id = $1 AND warehouse_id != $2 AND quantity > 0 ORDER BY quantity DESC FOR UPDATE`,
        [productId, targetWhId || 0],
      );
      for (const row of otherWhs.rows) {
        if (remainingNeeded <= 1e-4) break;
        const avail = Number(row.quantity || 0);
        const deductQty = Math.min(avail, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, productId, row.warehouse_id],
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6)`,
          [
            productId,
            row.warehouse_id,
            deductQty,
            invoiceId,
            userId,
            `صرف فاتورة مبيعات ${invoiceNumber}`,
          ],
        );
        remainingNeeded -= deductQty;
      }
    }
  }
};

const restoreInvoiceInventory = async (client, invoiceId, userId, invoiceNumber) => {
  const movements = (
    await client.query(
      `SELECT * FROM stock_movements WHERE reference_type = 'invoice' AND reference_id = $1 AND movement_type = 'sale'`,
      [invoiceId],
    )
  ).rows;

  for (const m of movements) {
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
      [m.quantity, m.product_id, m.from_warehouse_id],
    );
    await client.query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
       VALUES ($1, $2, 'return', $3, 'invoice', $4, $5, $6)`,
      [
        m.product_id,
        m.from_warehouse_id,
        m.quantity,
        invoiceId,
        userId,
        `إعادة مخزون إثر إلغاء/تعديل فاتورة ${invoiceNumber}`,
      ],
    );
  }
};

/**
 * جلب الفواتير مع فلترة وترقيم.
 * @param {Record<string, any>} [filters] خيارات الفلترة
 * @returns {Promise<{ rows: any[], total: number }>}
 */
const getInvoices = async (filters: Record<string, any> = {}) => {
  return await invoicesRepository.getInvoicesList(filters);
};
/** جلب فاتورة واحدة كاملة بأصنافها. */
const getInvoiceById = async (id: number) => {
  return await invoicesRepository.getInvoiceDetails(id);
};
/**
 * إنشاء فاتورة خدمات مع تحديث رصيد العميل.
 * @param {Record<string, any>} data بيانات الفاتورة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const createInvoice = async (data: Record<string, any>, userId: number) => {
  const {
    items: parsedItems,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus,
  } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invoiceNumber = await generateInvoiceNumber(client);
    const invResult = await client.query(
      `INSERT INTO invoices (
        invoice_number, sale_id, customer_id, invoice_type, subtotal, discount_amount,
        tax_amount, total_amount, payment_status, issued_at, due_date, notes, user_id, qr_data
      ) VALUES ($1,$2,$3,'manual',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        invoiceNumber,
        null,
        data.customer_id || null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paymentStatus,
        data.issued_at || /* @__PURE__ */ new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        `INV:${invoiceNumber}`,
      ],
    );
    const invoice = invResult.rows[0];
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          invoice.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.total_amount,
          item.sort_order,
        ],
      );
    }
    await deductInvoiceInventory(client, invoice.id, parsedItems, userId, invoiceNumber);
    const stamp = Date.now();
    if (paymentStatus === 'paid') {
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [
          payNum,
          invoice.id,
          totalAmount,
          data.payment_method || 'cash',
          data.notes || null,
          userId,
        ],
      );
    } else if (paymentStatus === 'partial' && Number(data.paid_amount) > 0) {
      const paidAmt = Math.min(totalAmount, Number(data.paid_amount));
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, invoice.id, paidAmt, data.payment_method || 'cash', data.notes || null, userId],
      );
    }

    // Auto-create linked Wholesale Sale record for all invoices created in invoices section
    {
      // إصلاح N+1: جلب أسعار شراء جميع المنتجات دفعة واحدة بدلاً من query لكل بند
      const productIds = [...new Set(parsedItems.map((it) => Number(it.product_id)))];
      const purchasePriceMap = new Map();
      if (productIds.length > 0) {
        const pricesRes = await client.query(
          `SELECT id, purchase_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        );
        for (const row of pricesRes.rows) {
          purchasePriceMap.set(Number(row.id), Number(row.purchase_price || 0));
        }
      }

      let costAmount = 0;
      for (const item of parsedItems) {
        const costPrice = purchasePriceMap.get(Number(item.product_id)) ?? 0;
        costAmount = roundMoney(costAmount + Number(item.quantity) * costPrice);
      }
      const profitAmount = roundMoney(totalAmount - costAmount);
      const whId = data.warehouse_id ? Number(data.warehouse_id) : await getDefaultWarehouseId();
      if (!userId) throw new AppError('معرف المستخدم مطلوب لإنشاء الفاتورة', 400);

      const saleRes = await client.query(
        `INSERT INTO sales (
          sale_number, sale_type, sale_date, entry_mode, customer_id, warehouse_id, user_id,
          subtotal, discount_amount, tax_amount, tax_percent, total_amount, cost_amount, profit_amount,
          payment_status, status, notes
        ) VALUES ($1, 'wholesale', $2, 'invoice', $3, $4, $5, $6, $7, 0, 0, $8, $9, $10, $11, 'completed', $12)
        RETURNING id`,
        [
          `SL-${invoiceNumber}`,
          data.issued_at || new Date(),
          data.customer_id || null,
          whId,
          userId,
          subtotal,
          discountAmount,
          totalAmount,
          costAmount,
          profitAmount,
          paymentStatus,
          data.notes || null,
        ],
      );
      const createdSaleId = saleRes.rows[0].id;

      for (const item of parsedItems) {
        const costPrice = purchasePriceMap.get(Number(item.product_id)) ?? 0;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
          [
            createdSaleId,
            item.product_id,
            item.quantity,
            item.unit_price,
            costPrice,
            item.discount_amount,
            item.total_amount,
          ],
        );
      }

      await client.query(`UPDATE invoices SET sale_id = $1 WHERE id = $2`, [
        createdSaleId,
        invoice.id,
      ]);
    }

    if (data.customer_id) {
      await recalculateCustomerBalance(
        (text, params) => client.query(text, params),
        data.customer_id,
      );
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [
        userId,
        `\u0625\u0646\u0634\u0627\u0621 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoiceNumber}`,
        JSON.stringify({ invoice_id: invoice.id, total: totalAmount }),
      ],
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    return getInvoiceById(invoice.id);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * تحديث فاتورة (عكس وتطبيق التغييرات على الرصيد).
 * @param {number} id معرف الفاتورة
 * @param {Record<string, any>} data الحقول الجديدة
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const updateInvoice = async (id: number, data: Record<string, any>, userId: number) => {
  const {
    items: parsedItems,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    paymentStatus,
  } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `SELECT * FROM invoices WHERE (id = $1 OR sale_id = $1) AND deleted_at IS NULL ORDER BY (CASE WHEN id = $1 THEN 1 ELSE 2 END) LIMIT 1 FOR UPDATE`,
      [id],
    );
    const invoice = invRes.rows[0];
    if (!invoice)
      throw new AppError(
        '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );
    await client.query(
      `UPDATE invoices SET
        customer_id = $1,
        subtotal = $2,
        discount_amount = $3,
        tax_amount = $4,
        total_amount = $5,
        payment_status = $6,
        issued_at = $7,
        due_date = $8,
        notes = $9,
        user_id = $10
       WHERE id = $11`,
      [
        data.customer_id || null,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paymentStatus,
        data.issued_at || invoice.issued_at || /* @__PURE__ */ new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        invoice.id,
      ],
    );
    await restoreInvoiceInventory(client, invoice.id, userId, invoice.invoice_number);
    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoice.id]);
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          invoice.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_amount,
          item.total_amount,
          item.sort_order,
        ],
      );
    }
    await deductInvoiceInventory(client, invoice.id, parsedItems, userId, invoice.invoice_number);

    if (invoice.sale_id) {
      // إصلاح N+1: جلب أسعار شراء جميع المنتجات دفعة واحدة بدلاً من query لكل بند
      const productIds = [...new Set(parsedItems.map((it) => Number(it.product_id)))];
      const purchasePriceMap = new Map();
      if (productIds.length > 0) {
        const pricesRes = await client.query(
          `SELECT id, purchase_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        );
        for (const row of pricesRes.rows) {
          purchasePriceMap.set(Number(row.id), Number(row.purchase_price || 0));
        }
      }

      let costAmount = 0;
      for (const item of parsedItems) {
        const costPrice = purchasePriceMap.get(Number(item.product_id)) ?? 0;
        costAmount = roundMoney(costAmount + Number(item.quantity) * costPrice);
      }
      const profitAmount = roundMoney(totalAmount - costAmount);
      await client.query(
        `UPDATE sales SET
          customer_id = $1,
          subtotal = $2,
          discount_amount = $3,
          total_amount = $4,
          cost_amount = $5,
          profit_amount = $6,
          payment_status = $7,
          updated_at = NOW()
         WHERE id = $8`,
        [
          data.customer_id || invoice.customer_id,
          subtotal,
          discountAmount,
          totalAmount,
          costAmount,
          profitAmount,
          paymentStatus,
          invoice.sale_id,
        ],
      );
      await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [invoice.sale_id]);
      for (const item of parsedItems) {
        const costPrice = purchasePriceMap.get(Number(item.product_id)) ?? 0;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
          [
            invoice.sale_id,
            item.product_id,
            item.quantity,
            item.unit_price,
            costPrice,
            item.discount_amount,
            item.total_amount,
          ],
        );
      }
    }

    const existingPaid = (
      await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`,
        [id],
      )
    ).rows[0].total;
    if (paymentStatus === 'paid' && Number(existingPaid) < totalAmount - 0.01) {
      const remainingToPay = totalAmount - Number(existingPaid);
      const payNum = `PAY-INV${id}-${Date.now()}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, id, remainingToPay, data.payment_method || 'cash', data.notes || null, userId],
      );
    }
    const oldCustomerId = invoice.customer_id;
    const newCustomerId = data.customer_id || null;
    if (oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), oldCustomerId);
    }
    if (newCustomerId && newCustomerId !== oldCustomerId) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), newCustomerId);
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [
        userId,
        `\u062A\u0639\u062F\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoice.invoice_number}`,
        JSON.stringify({ invoice_id: id, total: totalAmount }),
      ],
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
    return getInvoiceById(id);
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
/**
 * حذف فاتورة وعكس أثرها على رصيد العميل.
 * @param {number} id معرف الفاتورة
 * @param {number | null} [userId] معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
const deleteInvoice = async (id: number, userId: number | null = null) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const invRes = await client.query(
      `SELECT * FROM invoices WHERE (id = $1 OR sale_id = $1) AND deleted_at IS NULL ORDER BY (CASE WHEN id = $1 THEN 1 ELSE 2 END) LIMIT 1 FOR UPDATE`,
      [id],
    );
    const invoice = invRes.rows[0];
    if (!invoice)
      throw new AppError(
        '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
        404,
      );

    if (invoice.sale_id) {
      await client.query(`UPDATE sales SET deleted_at = NOW() WHERE id = $1`, [invoice.sale_id]);
    }
    await restoreInvoiceInventory(client, invoice.id, userId, invoice.invoice_number);
    await client.query(`UPDATE invoices SET deleted_at = NOW() WHERE id = $1`, [invoice.id]);
    if (invoice.customer_id) {
      await recalculateCustomerBalance(
        (text, params) => client.query(text, params),
        invoice.customer_id,
      );
    }
    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [
        userId,
        `\u062D\u0630\u0641 \u0641\u0627\u062A\u0648\u0631\u0629 ${invoice.invoice_number}`,
        JSON.stringify({ invoice_id: id }),
      ],
    );
    await client.query('COMMIT');
    invalidateDashboardCache();
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * مزامنة الفواتير المستقلة (بدون بيع) مع مبيعات الجملة.
 * @returns {Promise<void>}
 */
const syncStandaloneInvoicesToWholesaleSales = async () => {
  const client = await getClient();
  try {
    // LIMIT 200: منع تراكم backlog غير محدود من إبطاء بدء التشغيل — يُكمل في الدورة التالية
    const unlinkedInvoices = await client.query(
      `SELECT i.* FROM invoices i
       WHERE i.sale_id IS NULL AND i.deleted_at IS NULL
       ORDER BY i.id
       LIMIT 200`,
    );
    for (const inv of unlinkedInvoices.rows) {
      const itemsRes = await client.query(`SELECT * FROM invoice_items WHERE invoice_id = $1`, [
        inv.id,
      ]);
      const items = itemsRes.rows;

      // إصلاح N+1: جلب أسعار شراء جميع المنتجات دفعة واحدة بدلاً من query لكل بند
      const productIds = [...new Set(items.map((it) => Number(it.product_id)))];
      const purchasePriceMap = new Map();
      if (productIds.length > 0) {
        const pricesRes = await client.query(
          `SELECT id, purchase_price FROM products WHERE id = ANY($1::int[])`,
          [productIds],
        );
        for (const row of pricesRes.rows) {
          purchasePriceMap.set(Number(row.id), Number(row.purchase_price || 0));
        }
      }

      let costAmount = 0;
      for (const it of items) {
        const cost = purchasePriceMap.get(Number(it.product_id)) ?? 0;
        costAmount = roundMoney(costAmount + Number(it.quantity) * cost);
      }
      const totalAmount = Number(inv.total_amount || 0);
      const profitAmount = roundMoney(totalAmount - costAmount);
      const whId = await getDefaultWarehouseId(client);

      const saleRes = await client.query(
        `INSERT INTO sales (
          sale_number, sale_type, sale_date, entry_mode, customer_id, warehouse_id, user_id,
          subtotal, discount_amount, tax_amount, tax_percent, total_amount, cost_amount, profit_amount,
          payment_status, status, notes
        ) VALUES ($1, 'wholesale', $2, 'invoice', $3, $4, $5, $6, $7, 0, 0, $8, $9, $10, $11, 'completed', $12)
        RETURNING id`,
        [
          `SL-${inv.invoice_number}`,
          inv.issued_at || inv.created_at || new Date(),
          inv.customer_id,
          whId,
          inv.user_id || 1,
          inv.subtotal || totalAmount,
          inv.discount_amount || 0,
          totalAmount,
          costAmount,
          profitAmount,
          inv.payment_status || 'unpaid',
          inv.notes || null,
        ],
      );
      const saleId = saleRes.rows[0].id;

      for (const it of items) {
        const cost = purchasePriceMap.get(Number(it.product_id)) ?? 0;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount_amount, tax_amount, total_amount)
           VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
          [
            saleId,
            it.product_id,
            it.quantity,
            it.unit_price,
            cost,
            it.discount_amount || 0,
            it.total_amount,
          ],
        );
      }

      await client.query(`UPDATE invoices SET sale_id = $1 WHERE id = $2`, [saleId, inv.id]);
    }
  } catch (err: any) {
    console.error('Failed to sync standalone invoices to wholesale sales:', err);
  } finally {
    client.release();
  }
};

export {
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoices,
  parseInvoiceData,
  updateInvoice,
  syncStandaloneInvoicesToWholesaleSales,
};
