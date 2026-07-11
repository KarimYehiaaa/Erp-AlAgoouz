import { query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';

export const getSuppliers = async () =>
  (await query(
    `SELECT s.*,
      lu.full_name AS last_updated_by,
      al.created_at AS last_updated_at
     FROM suppliers s
     LEFT JOIN LATERAL (
       SELECT a.user_id, a.created_at
       FROM activity_logs a
       WHERE a.module = 'suppliers'
         AND (a.details->>'supplier_id')::int = s.id
       ORDER BY a.created_at DESC
       LIMIT 1
     ) al ON TRUE
     LEFT JOIN users lu ON lu.id = al.user_id
     WHERE s.deleted_at IS NULL
     ORDER BY s.name_ar`
  )).rows;

export const getSupplierById = async (id) => {
  const result = await query(
    `SELECT s.*,
      lu.full_name AS last_updated_by,
      al.created_at AS last_updated_at
     FROM suppliers s
     LEFT JOIN LATERAL (
       SELECT a.user_id, a.created_at
       FROM activity_logs a
       WHERE a.module = 'suppliers'
         AND (a.details->>'supplier_id')::int = s.id
       ORDER BY a.created_at DESC
       LIMIT 1
     ) al ON TRUE
     LEFT JOIN users lu ON lu.id = al.user_id
     WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('المورد غير موجود', 404);
  return result.rows[0];
};

export const createSupplier = async (data, userId) => {
  const result = await query(
    `INSERT INTO suppliers (code, name_ar, phone, email, address, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.code, data.name_ar, data.phone, data.email, data.address, data.notes]
  );
  if (userId) {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'suppliers',$2,$3)`,
      [userId, `إضافة مورد ${result.rows[0].name_ar}`, JSON.stringify({ supplier_id: result.rows[0].id, action: 'create' })]
    );
  }
  return result.rows[0];
};

export const updateSupplier = async (id, data, userId) => {
  const result = await query(
    `UPDATE suppliers SET name_ar=COALESCE($1,name_ar), phone=COALESCE($2,phone), email=COALESCE($3,email),
     address=COALESCE($4,address), notes=COALESCE($5,notes) WHERE id=$6 AND deleted_at IS NULL RETURNING *`,
    [data.name_ar, data.phone, data.email, data.address, data.notes, id]
  );
  if (!result.rows[0]) throw new AppError('المورد غير موجود', 404);
  if (userId) {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'suppliers',$2,$3)`,
      [userId, `تعديل مورد ${result.rows[0].name_ar}`, JSON.stringify({ supplier_id: result.rows[0].id, action: 'update' })]
    );
  }
  return result.rows[0];
};

export const deleteSupplier = async (id, userId) => {
  const result = await query(
    `UPDATE suppliers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, name_ar`,
    [id]
  );
  if (!result.rows[0]) throw new AppError('المورد غير موجود', 404);
  if (userId) {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'suppliers',$2,$3)`,
      [userId, `حذف مورد ${result.rows[0].name_ar}`, JSON.stringify({ supplier_id: result.rows[0].id, action: 'delete' })]
    );
  }
  return { id: result.rows[0].id };
};

export const getSupplierInvoices = async (supplierId) =>
  (await query(
    `SELECT id, invoice_number, invoice_date AS created_at, total_amount, notes,
       COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'supplier' AND reference_id = $1), 0) AS paid_amount,
       CASE
         WHEN (SELECT s.balance FROM suppliers s WHERE s.id = $1) <= 0 THEN 'paid'
         WHEN (SELECT SUM(amount) FROM payments WHERE reference_type = 'supplier' AND reference_id = $1) > 0 THEN 'partial'
         ELSE 'pending'
       END AS status
     FROM purchase_invoices
     WHERE supplier_id = $1 AND deleted_at IS NULL
     ORDER BY invoice_date DESC, id DESC`,
    [supplierId]
  )).rows;

export const getSupplierPayments = async (supplierId) =>
  (await query(
    `SELECT * FROM payments
     WHERE reference_type = 'supplier' AND reference_id = $1
     ORDER BY created_at DESC`,
    [supplierId]
  )).rows;

export const recalculateSupplierBalance = async (db = query, supplierId) => {
  await db(
    `UPDATE suppliers s
     SET balance = COALESCE((
       SELECT COALESCE(SUM(total_amount), 0)
       FROM purchase_invoices
       WHERE supplier_id = $1 AND deleted_at IS NULL
     ), 0) - COALESCE((
       SELECT COALESCE(SUM(amount), 0)
       FROM payments
       WHERE reference_type = 'supplier' AND reference_id = $1
     ), 0)
     WHERE s.id = $1`,
    [supplierId]
  );
};

export const recordSupplierPayment = async (supplierId, data, userId) => {
  const amount = Number(data.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new AppError('المبلغ المدفوع يجب أن يكون أكبر من الصفر', 400);
  }

  // Verify supplier exists
  await getSupplierById(supplierId);

  const resSeq = await query(`SELECT nextval('seq_payments_number') AS next_val`);
  const paymentNumber = `SUP-PAY-${resSeq.rows[0].next_val}`;
  const res = await query(
    `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
     VALUES ($1, 'supplier', $2, $3, $4, $5, $6)
     RETURNING *`,
    [paymentNumber, supplierId, amount, data.payment_method || 'cash', data.notes || null, userId]
  );

  await recalculateSupplierBalance(query, supplierId);
  return res.rows[0];
};
