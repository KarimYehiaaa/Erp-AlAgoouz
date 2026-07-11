import { getClient, query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { parseLocalizedNumber } from '../utils/numberParsing.js';

const generateInvoiceNumber = async (client) => {
  const settings = await client.query(`SELECT value FROM settings WHERE key = 'invoice' FOR UPDATE`);
  const config = settings.rows[0]?.value || { prefix: 'INV', next_number: 1001 };
  const number = `${config.prefix || 'INV'}-${String(config.next_number).padStart(5, '0')}`;
  config.next_number = (config.next_number || 1001) + 1;
  await client.query(`UPDATE settings SET value = $1::jsonb WHERE key = 'invoice'`, [JSON.stringify(config)]);
  return number;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const sanitizeLimit = (value, fallback = 100, max = 500) => {
  const n = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};
export const parseInvoiceData = (data = {}) => {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new AppError('لا توجد بنود في الفاتورة');

  let subtotal = 0;
  const parsedItems = items.map((item, idx) => {
    const qty = parseLocalizedNumber(item.quantity);
    const price = parseLocalizedNumber(item.unit_price);
    const disc = parseLocalizedNumber(item.discount_amount ?? 0, 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new AppError(`Item ${idx + 1}: quantity must be greater than zero`);
    if (!Number.isFinite(price) || price < 0) throw new AppError(`Item ${idx + 1}: unit price cannot be negative`);
    if (!Number.isFinite(disc) || disc < 0) throw new AppError(`Item ${idx + 1}: discount cannot be negative`);
    if (disc > roundMoney(qty * price)) throw new AppError(`Item ${idx + 1}: discount cannot exceed line total`);
    const lineTotal = qty * price - disc;
    subtotal += lineTotal;
    return {
      product_id: item.product_id || null,
      description: item.description || item.product_name || 'وصف البند',
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

    await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
    for (const item of parsedItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, discount_amount, total_amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, item.product_id, item.description, item.quantity, item.unit_price, item.discount_amount, item.total_amount, item.sort_order]
      );
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

    await client.query(`UPDATE invoices SET deleted_at = NOW() WHERE id = $1`, [id]);

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


