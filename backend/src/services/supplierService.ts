import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';

/**
 * جلب قائمة الموردين النشطين.
 * @returns {Promise<Array<Record<string, any>>>} قائمة الموردين
 */
export const getSuppliers = async () =>
  (
    await query(
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
     ORDER BY s.name_ar`,
    )
  ).rows;

/**
 * جلب مورد حسب معرفه.
 * @param {number} id معرف المورد
 * @returns {Promise<Record<string, any>>} بيانات المورد
 */
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
    [id],
  );
  if (!result.rows[0]) throw new AppError('المورد غير موجود', 404);
  return result.rows[0];
};

/**
 * إنشاء مورد جديد وتسجيل النشاط.
 * @param {{ code?: string, name_ar: string, phone?: string, email?: string, address?: string, notes?: string }} data بيانات المورد
 * @param {number} [userId] معرف المستخدم المنفذ
 * @returns {Promise<Record<string, any>>} المورد المنشأ
 */
export const createSupplier = async (data, userId) => {
  const openingBalance = Number(data.opening_balance || 0);
  const result = await query(
    `INSERT INTO suppliers (code, name_ar, phone, email, address, notes, opening_balance, balance)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
    [data.code, data.name_ar, data.phone, data.email, data.address, data.notes, openingBalance],
  );
  if (userId) {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'suppliers',$2,$3)`,
      [
        userId,
        `إضافة مورد ${result.rows[0].name_ar}`,
        JSON.stringify({ supplier_id: result.rows[0].id, action: 'create' }),
      ],
    );
  }
  return result.rows[0];
};

/**
 * تحديث بيانات مورد.
 * @param {number} id معرف المورد
 * @param {{ name_ar?: string, phone?: string, email?: string, address?: string, notes?: string, opening_balance?: number }} data البيانات الجديدة
 * @param {number} [userId] معرف المستخدم المنفذ
 * @returns {Promise<Record<string, any>>} المورد المحدّث
 */
export const updateSupplier = async (id, data, userId) => {
  const result = await query(
    `UPDATE suppliers SET 
       name_ar=COALESCE($1,name_ar), 
       phone=COALESCE($2,phone), 
       email=COALESCE($3,email),
       address=COALESCE($4,address), 
       notes=COALESCE($5,notes),
       opening_balance=CASE WHEN $6::decimal IS NOT NULL THEN $6::decimal ELSE opening_balance END,
       updated_at=NOW()
     WHERE id=$7 AND deleted_at IS NULL RETURNING *`,
    [
      data.name_ar,
      data.phone,
      data.email,
      data.address,
      data.notes,
      data.opening_balance !== undefined && data.opening_balance !== null
        ? Number(data.opening_balance)
        : null,
      id,
    ],
  );
  if (!result.rows[0]) throw new AppError('المورد غير موجود', 404);
  await recalculateSupplierBalance(query, id);
  if (userId) {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'suppliers',$2,$3)`,
      [
        userId,
        `تعديل مورد ${result.rows[0].name_ar}`,
        JSON.stringify({ supplier_id: result.rows[0].id, action: 'update' }),
      ],
    );
  }
  return result.rows[0];
};

/**
 * حذف مورد (حذف ناعم عبر deleted_at).
 * @param {number} id معرف المورد
 * @param {number} [userId] معرف المستخدم المنفذ
 * @returns {Promise<Record<string, any>>} المورد المحذوف
 */
export const deleteSupplier = async (id, userId) => {
  const result = await query(
    `UPDATE suppliers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, name_ar`,
    [id],
  );
  if (!result.rows[0]) throw new AppError('المورد غير موجود', 404);
  if (userId) {
    await query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'suppliers',$2,$3)`,
      [
        userId,
        `حذف مورد ${result.rows[0].name_ar}`,
        JSON.stringify({ supplier_id: result.rows[0].id, action: 'delete' }),
      ],
    );
  }
  return { id: result.rows[0].id };
};

/**
 * جلب فواتير الشراء الخاصة بمورد مع المبالغ المدفوعة.
 * @param {number} supplierId معرف المورد
 * @returns {Promise<Array<Record<string, any>>>} قائمة الفواتير
 */
export const getSupplierInvoices = async (supplierId) => {
  const invoicesRes = await query(
    `SELECT id, invoice_number, invoice_date AS created_at, total_amount, notes
     FROM purchase_invoices
     WHERE supplier_id = $1 AND deleted_at IS NULL
     ORDER BY invoice_date ASC, id ASC`,
    [supplierId],
  );

  const directPaymentsRes = await query(
    `SELECT reference_id as invoice_id, COALESCE(SUM(amount), 0) as paid_amount
     FROM payments
     WHERE reference_type = 'purchase_invoice'
       AND reference_id IN (SELECT id FROM purchase_invoices WHERE supplier_id = $1)
     GROUP BY reference_id`,
    [supplierId],
  );

  const supplierDirectPaymentsRes = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_supplier_payments
     FROM payments
     WHERE reference_type = 'supplier' AND reference_id = $1`,
    [supplierId],
  );

  const directMap = new Map<number, number>();
  for (const row of directPaymentsRes.rows) {
    directMap.set(Number(row.invoice_id), Number(row.paid_amount || 0));
  }

  let generalPool = Number(supplierDirectPaymentsRes.rows[0]?.total_supplier_payments || 0);

  const enriched = invoicesRes.rows.map((inv) => {
    const totalAmount = Number(inv.total_amount || 0);
    const directPaid = directMap.get(Number(inv.id)) || 0;
    const remainingBeforeGeneral = Math.max(0, totalAmount - directPaid);

    const fromGeneral = Math.min(generalPool, remainingBeforeGeneral);
    generalPool = Math.max(0, generalPool - fromGeneral);

    const totalPaid = Math.round((directPaid + fromGeneral) * 100) / 100;
    let status = 'pending';
    if (totalPaid >= totalAmount - 0.001) {
      status = 'paid';
    } else if (totalPaid > 0.001) {
      status = 'partial';
    }

    return {
      ...inv,
      paid_amount: totalPaid,
      status,
    };
  });

  return enriched.reverse();
};

/**
 * جلب مدفوعات مورد.
 * @param {number} supplierId معرف المورد
 * @returns {Promise<Array<Record<string, any>>>} قائمة المدفوعات
 */
export const getSupplierPayments = async (supplierId) =>
  (
    await query(
      `SELECT * FROM payments
     WHERE reference_type = 'supplier' AND reference_id = $1
     ORDER BY created_at DESC`,
      [supplierId],
    )
  ).rows;

/**
 * إعادة حساب رصيد المورد من فواتير الشراء والمدفوعات ورصيد أول المدة.
 * @param {typeof query | import('pg').PoolClient} [db] اتصال قاعدة البيانات (عادي أو داخل معاملة)
 * @param {number} [supplierId] معرف المورد
 */
export const recalculateSupplierBalance = async (
  db: typeof query | import('pg').PoolClient = query,
  supplierId?: number,
) => {
  if (!supplierId) return;
  const execQuery = typeof db === 'function' ? db : (text, params) => db.query(text, params);
  await execQuery(
    `UPDATE suppliers s
     SET balance = COALESCE(s.opening_balance, 0) + COALESCE((
       SELECT COALESCE(SUM(total_amount), 0)
       FROM purchase_invoices
       WHERE supplier_id = $1 AND deleted_at IS NULL
     ), 0) - COALESCE((
       SELECT COALESCE(SUM(amount), 0)
       FROM payments
       WHERE (reference_type = 'supplier' AND reference_id = $1)
          OR (reference_type = 'purchase_invoice' AND reference_id IN (SELECT id FROM purchase_invoices WHERE supplier_id = $1))
     ), 0),
     updated_at = NOW()
     WHERE s.id = $1`,
    [supplierId],
  );
};

/**
 * تسجيل دفعة لمورد وتحديث رصيده.
 * @param {number} supplierId معرف المورد
 * @param {{ amount: number, payment_method?: string, notes?: string }} data بيانات الدفعة
 * @param {number} [userId] معرف المستخدم المنفذ
 * @returns {Promise<Record<string, any>>} الدفعة المسجلة
 */
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
    [paymentNumber, supplierId, amount, data.payment_method || 'cash', data.notes || null, userId],
  );

  await recalculateSupplierBalance(query, supplierId);

  try {
    const { accountingService } = await import('./accountingService.ts');
    await accountingService.postSupplierPaymentJournalEntry(null, {
      id: res.rows[0].id,
      payment_number: paymentNumber,
      supplier_id: supplierId,
      amount,
      payment_method: data.payment_method || 'cash',
      notes: data.notes || `سداد مستحقات مورد`,
      user_id: userId,
    });
  } catch (accErr: any) {
    console.warn(`[Accounting] تعذر ترحيل قيد سداد المورد تلقائياً: ${accErr.message}`);
  }

  return res.rows[0];
};
