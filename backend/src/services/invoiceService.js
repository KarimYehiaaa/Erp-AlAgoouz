import { getClient, query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parseLocalizedNumber } from '../utils/numberParsing.js';
import { roundMoney, toNumber, sanitizeLimit } from '../utils/money.js';
import { recalculateCustomerBalance } from './customerBalanceService.js';
import { getDefaultWarehouseId } from './warehouseService.js';
import { ensureInventoryRow } from './inventoryService.js';

const generateInvoiceNumber = async (client) => {
  const settings = await client.query(`SELECT value FROM settings WHERE key = 'invoice'`);
  const config = settings.rows[0]?.value || { prefix: 'INV' };
  const res = await client.query(`SELECT nextval('seq_invoices_number') AS next_val`);
  return `${config.prefix || 'INV'}-${String(res.rows[0].next_val).padStart(5, '0')}`;
};


export const parseInvoiceData = (data = {}) => {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new AppError('لا توجد بنود في الفاتورة');

  let subtotal = 0;
  const parsedItems = items.map((item, idx) => {
    if (!item.product_id) {
      throw new AppError(`البند رقم ${idx + 1}: يجب اختيار منتج مسجل من القائمة`);
    }
    const productId = Number(item.product_id);
    const qty = parseLocalizedNumber(item.quantity);
    const price = parseLocalizedNumber(item.unit_price);
    const disc = parseLocalizedNumber(item.discount_amount ?? 0, 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new AppError(`البند رقم ${idx + 1}: الكمية يجب أن تكون أكبر من صفر`);
    if (!Number.isFinite(price) || price < 0) throw new AppError(`البند رقم ${idx + 1}: السعر لا يمكن أن يكون بالسالب`);
    if (!Number.isFinite(disc) || disc < 0) throw new AppError(`البند رقم ${idx + 1}: الخصم لا يمكن أن يكون بالسالب`);
    if (disc > roundMoney(qty * price)) throw new AppError(`البند رقم ${idx + 1}: الخصم يتجاوز إجمالي البند`);
    const lineTotal = qty * price - disc;
    subtotal += lineTotal;
    return {
      product_id: productId,
      description: item.description || item.product_name || 'وصف البند',
      quantity: qty,
      unit_price: price,
      discount_amount: disc,
      total_amount: roundMoney(lineTotal),
      sort_order: idx,
    };
  });

const deductInvoiceInventory = async (client, invoiceId, items, userId, invoiceNumber) => {
  const defaultWhId = await getDefaultWarehouseId((text, params) => client.query(text, params));

  for (const item of items) {
    if (!item.product_id) continue;
    const productId = Number(item.product_id);
    const qty = Number(item.quantity || 0);
    if (qty <= 0) continue;

    const stockRes = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE product_id = $1`,
      [productId]
    );
    const globalTotal = Number(stockRes.rows[0]?.total || 0);

    const productRes = await client.query(`SELECT name_ar, primary_warehouse_id FROM products WHERE id = $1`, [productId]);
    const pName = productRes.rows[0]?.name_ar || 'المنتج';

    if (globalTotal < qty - 0.0001) {
      throw new AppError(`لا يوجد مخزون كافٍ للمنتج (${pName}). المطلوب ${qty} والمتاح كلياً بالمنشأة ${globalTotal}`);
    }

    const targetWhId = productRes.rows[0]?.primary_warehouse_id || defaultWhId;
    let remainingNeeded = qty;

    if (targetWhId) {
      await ensureInventoryRow(client, productId, targetWhId);
      const lock = await client.query(
        `SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = $2 FOR UPDATE`,
        [productId, targetWhId]
      );
      const avail = Number(lock.rows[0]?.quantity || 0);
      if (avail > 0) {
        const deductQty = Math.min(avail, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, productId, targetWhId]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6)`,
          [productId, targetWhId, deductQty, invoiceId, userId, `صرف فاتورة مبيعات ${invoiceNumber}`]
        );
        remainingNeeded -= deductQty;
      }
    }

    if (remainingNeeded > 0.0001) {
      const otherWhs = await client.query(
        `SELECT warehouse_id, quantity FROM inventory WHERE product_id = $1 AND warehouse_id != $2 AND quantity > 0 ORDER BY quantity DESC FOR UPDATE`,
        [productId, targetWhId || 0]
      );
      for (const row of otherWhs.rows) {
        if (remainingNeeded <= 0.0001) break;
        const avail = Number(row.quantity || 0);
        const deductQty = Math.min(avail, remainingNeeded);
        await client.query(
          `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
          [deductQty, productId, row.warehouse_id]
        );
        await client.query(
          `INSERT INTO stock_movements (product_id, from_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
           VALUES ($1, $2, 'sale', $3, 'invoice', $4, $5, $6)`,
          [productId, row.warehouse_id, deductQty, invoiceId, userId, `صرف فاتورة مبيعات ${invoiceNumber}`]
        );
        remainingNeeded -= deductQty;
      }
    }
  }
};

const restoreInvoiceInventory = async (client, invoiceId, userId, invoiceNumber) => {
  const movements = (await client.query(
    `SELECT * FROM stock_movements WHERE reference_type = 'invoice' AND reference_id = $1 AND movement_type = 'sale'`,
    [invoiceId]
  )).rows;

  for (const m of movements) {
    await client.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3`,
      [m.quantity, m.product_id, m.from_warehouse_id]
    );
    await client.query(
      `INSERT INTO stock_movements (product_id, to_warehouse_id, movement_type, quantity, reference_type, reference_id, user_id, notes)
       VALUES ($1, $2, 'return', $3, 'invoice', $4, $5, $6)`,
      [m.product_id, m.from_warehouse_id, m.quantity, invoiceId, userId, `إعادة مخزون إثر إلغاء/تعديل فاتورة ${invoiceNumber}`]
    );
  }
};

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

const loadItemsJson = `COALESCE(
  (SELECT json_agg(json_build_object(
    'id', ii.id, 'product_id', ii.product_id, 'product_name', p.name_ar,
    'description', ii.description, 'quantity', ii.quantity, 'unit_price', ii.unit_price,
    'discount_amount', ii.discount_amount, 'total_amount', ii.total_amount
  ) ORDER BY ii.sort_order, ii.id)
   FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = i.id),
  '[]'::json
) as items`;


export const getInvoices = async (filters = {}) => {
  let sql = `SELECT i.*, c.name_ar as customer_name, s.sale_number
    FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN sales s ON i.sale_id = s.id WHERE i.deleted_at IS NULL AND i.sale_id IS NULL`;
  const params = [];
  let idx = 1;
  if (filters.payment_status) { sql += ` AND i.payment_status = $${idx++}`; params.push(filters.payment_status); }
  if (filters.customer_id) { sql += ` AND i.customer_id = $${idx++}`; params.push(filters.customer_id); }
  sql += ` ORDER BY i.created_at DESC LIMIT ${sanitizeLimit(filters.limit)}`;
  return (await query(sql, params)).rows;
};

export const getInvoiceById = async (id) => {
  const result = await query(
    `SELECT i.*, c.name_ar as customer_name, c.phone as customer_phone, c.address as customer_address,
      c.tax_number as customer_tax, s.sale_number, s.sale_type, u.full_name as issued_by,
      ${loadItemsJson}
     FROM invoices i
     LEFT JOIN customers c ON i.customer_id = c.id
     LEFT JOIN sales s ON i.sale_id = s.id
     LEFT JOIN users u ON i.user_id = u.id
     WHERE i.id = $1 AND i.deleted_at IS NULL`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('الفاتورة غير موجودة', 404);

  const settings = await query(`SELECT key, value FROM settings WHERE key IN ('company', 'tax')`);
  const company = settings.rows.find((r) => r.key === 'company')?.value || {};
  const tax = settings.rows.find((r) => r.key === 'tax')?.value || { rate: 14 };
  const inv = result.rows[0];
  inv.items = inv.items || [];
  return { ...inv, company, tax };
};

export const createInvoice = async (data, userId) => {
  const { items: parsedItems, subtotal, discountAmount, taxAmount, totalAmount, paymentStatus } = parseInvoiceData(data);

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
        data.issued_at || new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        `INV:${invoiceNumber}`,
      ]
    );
    const invoice = invResult.rows[0];

    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invoice.id, item.product_id, item.description, item.quantity, item.unit_price, item.discount_amount, item.total_amount, item.sort_order]
      );
    }

    // Deduct stock for manual invoice items
    await deductInvoiceInventory(client, invoice.id, parsedItems, userId, invoiceNumber);

    // Record payment if invoice is created as paid or partial
    const stamp = Date.now();
    if (paymentStatus === 'paid') {
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, invoice.id, totalAmount, data.payment_method || 'cash', data.notes || null, userId]
      );
    } else if (paymentStatus === 'partial' && Number(data.paid_amount) > 0) {
      const paidAmt = Math.min(totalAmount, Number(data.paid_amount));
      const payNum = `PAY-INV${invoice.id}-${stamp}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, invoice.id, paidAmt, data.payment_method || 'cash', data.notes || null, userId]
      );
    }

    if (data.customer_id) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), data.customer_id);
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [userId, `إنشاء فاتورة ${invoiceNumber}`, JSON.stringify({ invoice_id: invoice.id, total: totalAmount })]
    );

    await client.query('COMMIT');
    return getInvoiceById(invoice.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const updateInvoice = async (id, data, userId) => {
  const { items: parsedItems, subtotal, discountAmount, taxAmount, totalAmount, paymentStatus } = parseInvoiceData(data);
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const invoice = invRes.rows[0];
    if (!invoice) throw new AppError('الفاتورة غير موجودة', 404);
    if (invoice.sale_id) throw new AppError('لا يمكن تعديل فاتورة مرتبطة بعملية بيع', 400);

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
        data.issued_at || invoice.issued_at || new Date(),
        data.due_date || null,
        data.notes || null,
        userId,
        id,
      ]
    );

    // Restore previous stock for old invoice items
    await restoreInvoiceInventory(client, id, userId, invoice.invoice_number);

    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, item.product_id, item.description, item.quantity, item.unit_price, item.discount_amount, item.total_amount, item.sort_order]
      );
    }

    // Deduct stock for new invoice items
    await deductInvoiceInventory(client, id, parsedItems, userId, invoice.invoice_number);

    // Handle payment status changes for manual invoices
    const existingPaid = (await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`,
      [id]
    )).rows[0].total;

    if (paymentStatus === 'paid' && Number(existingPaid) < totalAmount - 0.01) {
      const remainingToPay = totalAmount - Number(existingPaid);
      const payNum = `PAY-INV${id}-${Date.now()}`;
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
        [payNum, id, remainingToPay, data.payment_method || 'cash', data.notes || null, userId]
      );
    }

    // Recalculate customer balance for old and new customer
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
      [userId, `تعديل فاتورة ${invoice.invoice_number}`, JSON.stringify({ invoice_id: id, total: totalAmount })]
    );

    await client.query('COMMIT');
    return getInvoiceById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const deleteInvoice = async (id, userId = null) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const invRes = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    const invoice = invRes.rows[0];
    if (!invoice) throw new AppError('الفاتورة غير موجودة', 404);
    if (invoice.sale_id) {
      throw new AppError('لا يمكن حذف فاتورة مرتبطة بعملية بيع', 400);
    }

    // Restore stock on invoice deletion
    await restoreInvoiceInventory(client, id, userId, invoice.invoice_number);

    await client.query(`UPDATE invoices SET deleted_at = NOW() WHERE id = $1`, [id]);

    if (invoice.customer_id) {
      await recalculateCustomerBalance((text, params) => client.query(text, params), invoice.customer_id);
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'invoices',$2,$3)`,
      [userId, `حذف فاتورة ${invoice.invoice_number}`, JSON.stringify({ invoice_id: id })]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


