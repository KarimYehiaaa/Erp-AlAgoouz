import { linkPaymentJournalSources } from './paymentJournalSources.ts';
import { getClient, query, withTransaction } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { recalculateCustomerBalance } from './customerBalanceService.ts';
import { sanitizeLimit, roundMoney } from '../utils/money.ts';
import { getInvoiceWarehouseScope } from './invoiceService.ts';
import { requireReceiptMethod } from '../utils/receiptMethod.ts';

const generateCustomerCode = async (
  clientQuery?: (sql: string, params?: any[]) => Promise<any>,
) => {
  const runner = clientQuery || query;
  await runner(`SELECT pg_advisory_xact_lock(hashtext('customer_code_seq'))`);
  const res = await runner(
    `SELECT COALESCE(MAX(
       CASE WHEN code ~ '^C-[0-9]+$'
       THEN CAST(SUBSTRING(code FROM 3) AS INT)
       ELSE 0 END
     ), 0) + 1 AS next_num
     FROM customers`,
  );
  const nextNum = Number(res.rows[0]?.next_num || 1);
  return `C-${String(nextNum).padStart(3, '0')}`;
};

/**
 * جلب قائمة العملاء مع فلترة وبحث وترقيم صفحات.
 * @param {Record<string, any>} [filters] خيارات الفلترة (search, customer_type, limit...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export const getCustomers = async (filters: Record<string, any> = {}) => {
  let sql = `
    SELECT
      c.*,
      COALESCE(cs.total_purchased, 0) AS total_purchased,
      COALESCE(cs.total_paid, 0) + COALESCE(dp.total_direct_paid, 0) AS total_paid,
      COALESCE(c.opening_balance, 0) - COALESCE(dp.total_direct_paid, 0) + COALESCE(cs.total_purchased, 0) - COALESCE(cs.total_paid, 0) AS total_balance
    FROM customers c
    LEFT JOIN (
      SELECT reference_id AS customer_id, COALESCE(SUM(amount), 0) AS total_direct_paid
      FROM payments
      WHERE (reference_type IN ('customer_opening', 'customer_advance', 'customer_deposit') OR reference_type = 'customer')
        AND LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'
      GROUP BY reference_id
    ) dp ON dp.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id,
             SUM(total_purchased) AS total_purchased,
             SUM(total_paid) AS total_paid
      FROM (
        SELECT s.customer_id,
               COALESCE(s.total_amount, 0) AS total_purchased,
               CASE
                 WHEN s.payment_status = 'paid' AND NOT COALESCE(p.has_any, FALSE) THEN COALESCE(s.total_amount, 0)
                 ELSE COALESCE(p.total_paid, 0)
               END AS total_paid
        FROM sales s
        LEFT JOIN (
          SELECT reference_id, SUM(amount) FILTER (WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit') AS total_paid,
                 BOOL_OR(LOWER(TRIM(COALESCE(payment_method, 'cash'))) = 'credit') AS has_credit,
                 TRUE AS has_any
          FROM payments
          WHERE reference_type = 'sale'
          GROUP BY reference_id
        ) p ON p.reference_id = s.id
        WHERE s.deleted_at IS NULL
          AND s.status = 'completed'

        UNION ALL

        SELECT i.customer_id,
               COALESCE(i.total_amount, 0) AS total_purchased,
               CASE
                 WHEN i.payment_status = 'paid' AND NOT COALESCE(p.has_any, FALSE) THEN COALESCE(i.total_amount, 0)
                 ELSE COALESCE(p.total_paid, 0)
               END AS total_paid
        FROM invoices i
        LEFT JOIN (
          SELECT reference_id, SUM(amount) FILTER (WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit') AS total_paid,
                 BOOL_OR(LOWER(TRIM(COALESCE(payment_method, 'cash'))) = 'credit') AS has_credit,
                 TRUE AS has_any
          FROM payments
          WHERE reference_type = 'invoice'
          GROUP BY reference_id
        ) p ON p.reference_id = i.id
        WHERE i.customer_id IS NOT NULL
          AND i.sale_id IS NULL
          AND i.deleted_at IS NULL
      ) source
      GROUP BY customer_id
    ) cs ON cs.customer_id = c.id
    WHERE c.deleted_at IS NULL`;
  const params: any[] = [];
  let i = 1;
  if (filters.customer_type) {
    sql += ` AND c.customer_type = $${i++}`;
    params.push(filters.customer_type);
  }
  if (filters.search) {
    sql += ` AND (c.name_ar ILIKE $${i} OR c.phone ILIKE $${i} OR c.code ILIKE $${i})`;
    params.push(`%${filters.search}%`);
  }
  sql += ` ORDER BY c.name_ar LIMIT ${sanitizeLimit(filters.limit)}`;
  const rows = (await query(sql, params)).rows;
  return rows.map((c) => ({
    ...c,
    total_purchased: Number(c.total_purchased || 0),
    total_paid: Number(c.total_paid || 0),
    total_balance: Number(c.total_balance || 0),
  }));
};

/**
 * جلب عميل واحد حسب المعرف.
 * @param {number} id معرف العميل
 * @returns {Promise<any>}
 */
export const getCustomerById = async (id: number) => {
  const customer = (
    await query(`SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id])
  ).rows[0];
  if (!customer) throw new AppError('العميل غير موجود', 404);
  const transactions = await query(
    `SELECT
       'sale' AS entry_type,
       s.id,
       s.sale_number,
       NULL::text AS invoice_number,
       s.total_amount,
       s.payment_status,
       s.created_at
     FROM sales s
     WHERE s.customer_id = $1
       AND s.deleted_at IS NULL
       AND s.status = 'completed'
     UNION ALL
     SELECT
       'invoice' AS entry_type,
       i.id,
       NULL::text AS sale_number,
       i.invoice_number,
       i.total_amount,
       i.payment_status,
       i.created_at
     FROM invoices i
     WHERE i.customer_id = $1
       AND i.sale_id IS NULL
       AND i.deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 20`,
    [id],
  );
  return { ...customer, sales: transactions.rows, transactions: transactions.rows };
};

/**
 * إنشاء عميل جديد.
 * @param {Record<string, any>} data بيانات العميل
 * @returns {Promise<any>}
 */
export const createCustomer = async (data: Record<string, any>) => {
  const customerCode = String(data.code || '').trim() || (await generateCustomerCode());
  const openingBalance =
    data.opening_balance !== undefined && data.opening_balance !== null
      ? parseFloat(data.opening_balance) || 0
      : data.current_balance !== undefined && data.current_balance !== null
        ? parseFloat(data.current_balance) || 0
        : 0;

  const result = await query(
    `INSERT INTO customers (code, name_ar, phone, email, address, customer_type, credit_limit, opening_balance, balance, current_balance, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      customerCode,
      data.name_ar,
      data.phone,
      data.email,
      data.address,
      data.customer_type || 'retail',
      data.credit_limit || 0,
      openingBalance,
      openingBalance,
      openingBalance,
      data.notes,
    ],
  );
  const created = result.rows[0];
  await recalculateCustomerBalance(query, created.id);
  return (await query(`SELECT * FROM customers WHERE id = $1`, [created.id])).rows[0];
};

/**
 * تحديث بيانات عميل.
 * @param {number} id معرف العميل
 * @param {Record<string, any>} data الحقول المطلوب تحديثها
 * @returns {Promise<any>}
 */
export const updateCustomer = async (id: number, data: Record<string, any>) => {
  const hasOpening =
    (data.opening_balance !== undefined && data.opening_balance !== null) ||
    (data.current_balance !== undefined && data.current_balance !== null);
  const openingBalance = hasOpening
    ? parseFloat(
        data.opening_balance !== undefined && data.opening_balance !== null
          ? data.opening_balance
          : data.current_balance,
      ) || 0
    : null;

  const result = await query(
    `UPDATE customers SET
       name_ar = COALESCE($1, name_ar),
       phone = COALESCE($2, phone),
       email = COALESCE($3, email),
       address = COALESCE($4, address),
       customer_type = COALESCE($5, customer_type),
       credit_limit = COALESCE($6, credit_limit),
       loyalty_points = COALESCE($7, loyalty_points),
       notes = COALESCE($8, notes),
       is_active = COALESCE($9, is_active),
       opening_balance = CASE WHEN $10::decimal IS NOT NULL THEN $10::decimal ELSE opening_balance END,
       updated_at = NOW()
     WHERE id = $11 AND deleted_at IS NULL RETURNING *`,
    [
      data.name_ar,
      data.phone,
      data.email,
      data.address,
      data.customer_type,
      data.credit_limit,
      data.loyalty_points,
      data.notes,
      data.is_active,
      openingBalance,
      id,
    ],
  );
  if (!result.rows[0]) throw new AppError('العميل غير موجود', 404);

  await recalculateCustomerBalance(query, id);
  return (await query(`SELECT * FROM customers WHERE id = $1`, [id])).rows[0];
};

/**
 * حذف عميل (حذف ناعم).
 * @param {number} id معرف العميل
 * @returns {Promise<any>}
 */
export const deleteCustomer = async (id: number) => {
  await query(`UPDATE customers SET deleted_at = NOW() WHERE id = $1`, [id]);
};

/**
 * تسجيل دفعة على رصيد عميل.
 * @param {number} customerId معرف العميل
 * @param {Record<string, any>} data بيانات الدفعة (amount, payment_method, notes...)
 * @returns {Promise<any>}
 */
export const recordPayment = async (customerId: number, data: Record<string, any>) => {
  data = { ...data, payment_method: requireReceiptMethod(data.payment_method) };
  const amount = roundMoney(Number(data.amount));
  if (!Number.isFinite(amount) || amount <= 0)
    throw new AppError('المبلغ يجب أن يكون رقمًا صحيحًا أكبر من صفر');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const allowedWarehouses = await getInvoiceWarehouseScope(client, Number(data.user_id));
    // Sale/return paths lock their document before updating the customer balance.
    // Use the same order; taking the customer first creates a circular wait.
    await client.query(
      `SELECT id FROM sales WHERE customer_id = $1 AND deleted_at IS NULL
      ORDER BY id FOR UPDATE`,
      [customerId],
    );
    await client.query(
      `SELECT id FROM invoices WHERE customer_id = $1 AND sale_id IS NULL
      AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
      [customerId],
    );
    const customer = (
      await client.query(
        `SELECT id, name_ar, balance, COALESCE(opening_balance, 0) AS opening_balance FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [customerId],
      )
    ).rows[0];
    if (!customer) throw new AppError('العميل غير موجود', 404);

    const debts = (
      await client.query(
        `SELECT
         'sale' AS entry_type,
         s.id,
         s.sale_number AS entry_number,
         s.total_amount,
         s.warehouse_id,
         CASE WHEN s.payment_status = 'paid' AND NOT EXISTS (SELECT 1 FROM payments WHERE (reference_type='sale' AND reference_id=s.id) OR (reference_type='invoice' AND reference_id=(SELECT id FROM invoices WHERE sale_id=s.id LIMIT 1))) THEN s.total_amount ELSE COALESCE((SELECT SUM(amount) FROM payments WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit' AND ((reference_type = 'sale' AND reference_id = s.id) OR (reference_type = 'invoice' AND reference_id = (SELECT id FROM invoices WHERE sale_id = s.id LIMIT 1)))), 0) END AS paid_amount,
         COALESCE(s.sale_date, DATE(s.created_at)) AS entry_date,
         s.created_at
       FROM sales s
       WHERE s.customer_id = $1
        AND s.deleted_at IS NULL
        AND s.status = 'completed'

       UNION ALL

       SELECT
         'invoice' AS entry_type,
         i.id,
         i.invoice_number AS entry_number,
         i.total_amount,
         NULL::integer AS warehouse_id,
         CASE WHEN i.payment_status = 'paid' AND NOT EXISTS (SELECT 1 FROM payments WHERE reference_type='invoice' AND reference_id=i.id) THEN i.total_amount ELSE COALESCE((SELECT SUM(amount) FROM payments WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit' AND reference_type = 'invoice' AND reference_id = i.id), 0) END AS paid_amount,
         COALESCE(i.due_date, DATE(i.issued_at)) AS entry_date,
         i.created_at
       FROM invoices i
       WHERE i.customer_id = $1
        AND i.sale_id IS NULL
        AND i.deleted_at IS NULL
        AND i.payment_status IS DISTINCT FROM 'refunded'

       ORDER BY entry_date, created_at, id`,
        [customerId],
      )
    ).rows;

    const openDebts = debts
      .map((debt) => ({
        ...debt,
        remaining: Math.max(0, Number(debt.total_amount || 0) - Number(debt.paid_amount || 0)),
      }))
      .filter((debt) => debt.remaining > 0);

    if (
      allowedWarehouses &&
      openDebts.some(
        (debt) => !debt.warehouse_id || !allowedWarehouses.includes(Number(debt.warehouse_id)),
      )
    ) {
      throw new AppError(
        'دفعة الحساب تشمل فواتير خارج المخزن المصرح به؛ حصّل فاتورة محددة أو اطلب مسؤولًا',
        403,
      );
    }

    // الرصيد الافتتاحي يُعامل كدين قابل للتسوية بالأسبقية (FIFO) دون تعديل قيمته الأصلية
    const rawOpeningBalance = Number(customer.opening_balance || 0);
    const obPaidRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM payments
       WHERE reference_type = 'customer_opening' AND reference_id = $1
         AND LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'`,
      [customerId],
    );
    const obPaid = Number(obPaidRes.rows[0]?.paid || 0);
    const remainingOpeningBalance = Math.max(0, rawOpeningBalance - obPaid);

    if (remainingOpeningBalance > 0) {
      openDebts.unshift({
        entry_type: 'opening_balance',
        id: customer.id,
        entry_number: 'رصيد افتتاحي',
        total_amount: rawOpeningBalance,
        paid_amount: obPaid,
        entry_date: null,
        created_at: null,
        remaining: remainingOpeningBalance,
      });
    }

    let remainingPayment = amount;
    const allocations: any[] = [];
    const receiptNumbers: string[] = [];
    const stamp = Date.now();

    for (const debt of openDebts) {
      if (remainingPayment <= 0.001) break;

      if (debt.entry_type !== 'opening_balance') {
        // The initial FIFO list is only a candidate list. A sale payment/return or
        // invoice edit may commit while we wait; re-read its balance under its lock.
        const document =
          debt.entry_type === 'sale'
            ? (await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [debt.id]))
                .rows[0]
            : (await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [debt.id]))
                .rows[0];
        if (
          !document ||
          document.deleted_at ||
          Number(document.customer_id) !== Number(customerId) ||
          document.payment_status === 'refunded' ||
          (debt.entry_type === 'sale' ? document.status !== 'completed' : document.sale_id != null)
        )
          continue;
        if (
          allowedWarehouses &&
          (debt.entry_type !== 'sale' ||
            !document.warehouse_id ||
            !allowedWarehouses.includes(Number(document.warehouse_id)))
        ) {
          throw new AppError('تغير مخزن الفاتورة أو مصدرها؛ يلزم مراجعة صلاحية التحصيل', 403);
        }
        const paid =
          debt.entry_type === 'sale'
            ? await client.query(
                `SELECT
                  CASE WHEN $2='paid' AND NOT EXISTS (SELECT 1 FROM payments WHERE (reference_type='sale' AND reference_id=$1) OR (reference_type='invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id=$1))) THEN $3
                  ELSE COALESCE(SUM(amount) FILTER (WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'), 0) END AS total
                 FROM payments WHERE (reference_type = 'sale' AND reference_id = $1)
                    OR (reference_type = 'invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id = $1))`,
                [debt.id, document.payment_status, document.total_amount],
              )
            : await client.query(
                `SELECT CASE WHEN $2='paid' AND NOT EXISTS (SELECT 1 FROM payments WHERE reference_type='invoice' AND reference_id=$1) THEN $3
                  ELSE COALESCE(SUM(amount) FILTER (WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'),0) END AS total
                 FROM payments WHERE reference_type = 'invoice' AND reference_id = $1`,
                [debt.id, document.payment_status, document.total_amount],
              );
        debt.total_amount = Number(document.total_amount);
        debt.paid_amount = Number(paid.rows[0].total);
        debt.remaining = roundMoney(Math.max(0, debt.total_amount - debt.paid_amount));
        if (debt.remaining <= 0) continue;
      }

      const paidForDebt = roundMoney(Math.min(remainingPayment, debt.remaining));
      const newPaid = Number(debt.paid_amount || 0) + paidForDebt;
      const newStatus =
        roundMoney(newPaid) >= roundMoney(Number(debt.total_amount)) ? 'paid' : 'partial';

      if (debt.entry_type === 'opening_balance') {
        const payNum = `PAY-OB${debt.id}-${stamp}-${allocations.length + 1}`;
        receiptNumbers.push(payNum);
        await client.query(
          `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
           VALUES ($1, 'customer_opening', $2, $3, $4, $5, $6)`,
          [
            payNum,
            customerId,
            paidForDebt,
            data.payment_method || 'cash',
            data.notes || 'سداد من الرصيد الافتتاحي',
            data.user_id || null,
          ],
        );
        allocations.push({
          entry_type: 'opening_balance',
          id: customerId,
          entry_number: 'رصيد افتتاحي',
          amount: paidForDebt,
        });
      } else if (debt.entry_type === 'sale') {
        const payNum = `PAY-S${debt.id}-${stamp}-${allocations.length + 1}`;
        receiptNumbers.push(payNum);
        await client.query(
          `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
           VALUES ($1, 'sale', $2, $3, $4, $5, $6)`,
          [
            payNum,
            debt.id,
            paidForDebt,
            data.payment_method || 'cash',
            data.notes || null,
            data.user_id || null,
          ],
        );
        await client.query(`UPDATE sales SET payment_status = $1 WHERE id = $2`, [
          newStatus,
          debt.id,
        ]);
        await client.query(`UPDATE invoices SET payment_status = $1 WHERE sale_id = $2`, [
          newStatus,
          debt.id,
        ]);
        allocations.push({
          entry_type: 'sale',
          id: debt.id,
          entry_number: debt.entry_number,
          amount: paidForDebt,
        });
      } else {
        const payNum = `PAY-INV${debt.id}-${stamp}-${allocations.length + 1}`;
        receiptNumbers.push(payNum);
        await client.query(
          `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
           VALUES ($1, 'invoice', $2, $3, $4, $5, $6)`,
          [
            payNum,
            debt.id,
            paidForDebt,
            data.payment_method || 'cash',
            data.notes || null,
            data.user_id || null,
          ],
        );
        await client.query(`UPDATE invoices SET payment_status = $1 WHERE id = $2`, [
          newStatus,
          debt.id,
        ]);
        allocations.push({
          entry_type: 'invoice',
          id: debt.id,
          entry_number: debt.entry_number,
          amount: paidForDebt,
        });
      }

      remainingPayment = Math.round((remainingPayment - paidForDebt) * 100) / 100;
    }

    // قبول الدفعات المقدمة في حال زاد المبلغ عن إجمالي الديون القائمة
    if (remainingPayment > 0.001) {
      const payNum = `PAY-ADV${customerId}-${stamp}-${allocations.length + 1}`;
      receiptNumbers.push(payNum);
      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'customer_advance', $2, $3, $4, $5, $6)`,
        [
          payNum,
          customerId,
          remainingPayment,
          data.payment_method || 'cash',
          data.notes ? `${data.notes} (دفعة مقدمة / رصيد دائن)` : 'دفعة مقدمة على الحساب',
          data.user_id || null,
        ],
      );
      allocations.push({
        entry_type: 'customer_advance',
        id: customerId,
        entry_number: 'دفعة مقدمة',
        amount: remainingPayment,
      });
      remainingPayment = 0;
    }

    await recalculateCustomerBalance((text, params) => client.query(text, params), customerId);

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'customers', $2, $3)`,
      [
        data.user_id || null,
        `تسجيل دفعة من العميل ${customer.name_ar}: ${amount} ج.م`,
        JSON.stringify({ customer_id: customerId, amount, allocations }),
      ],
    );

    const { accountingService } = await import('./accountingService.ts');
    const journal = await accountingService.postCustomerPaymentJournalEntry(client, {
      id: customerId,
      payment_number: `PAY-CUST-${customerId}-${stamp}`,
      customer_id: customerId,
      amount,
      payment_method: data.payment_method || 'cash',
      notes: data.notes || `تحصيل دفعة حساب عميل ${customer.name_ar}`,
      user_id: data.user_id,
      payment_date: data.payment_date || data.date,
    });

    if (!journal) throw new AppError('تعذر ترحيل التحصيل', 409);
    await linkPaymentJournalSources(client, receiptNumbers, journal.id);

    await client.query('COMMIT');
    return { success: true, amount, customer_name: customer.name_ar, allocations };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * تسجيل دفعة على فاتورة بيع.
 * @param {number} saleId معرف البيع
 * @param {Record<string, any>} data بيانات الدفعة
 * @returns {Promise<any>}
 */
export const recordSalePayment = async (saleId: number, data: Record<string, any>) => {
  data = { ...data, payment_method: requireReceiptMethod(data.payment_method) };
  return await withTransaction(async (client) => {
    const sale = (
      await client.query(
        `SELECT s.*, c.name_ar as customer_name
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1 AND s.deleted_at IS NULL FOR UPDATE OF s`,
        [saleId],
      )
    ).rows[0];
    if (!sale) throw new AppError('العملية غير موجودة', 404);

    if (sale.status !== 'completed' || sale.payment_status === 'refunded') {
      throw new AppError('لا يمكن تحصيل دفعة على بيع مرتجع أو ملغى أو غير مكتمل', 409);
    }
    const allowedWarehouses = await getInvoiceWarehouseScope(client, Number(data.user_id));
    if (
      allowedWarehouses &&
      (!sale.warehouse_id || !allowedWarehouses.includes(Number(sale.warehouse_id)))
    ) {
      throw new AppError('غير مصرح لك بتحصيل دفعات مبيعات هذا المخزن', 403);
    }

    const amount = roundMoney(Number(data.amount));
    if (!Number.isFinite(amount) || amount <= 0)
      throw new AppError('المبلغ يجب أن يكون رقمًا صحيحًا أكبر من صفر');

    const paidSummary = (
      await client.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'),0) AS total,
          COUNT(*)::int AS count FROM payments WHERE (reference_type='sale' AND reference_id=$1) OR (reference_type='invoice' AND reference_id IN (SELECT id FROM invoices WHERE sale_id = $1))`,
        [saleId],
      )
    ).rows[0];
    const paidSoFar =
      sale.payment_status === 'paid' && Number(paidSummary.count) === 0
        ? Number(sale.total_amount)
        : Number(paidSummary.total);

    const remaining = roundMoney(Number(sale.total_amount) - Number(paidSoFar));
    if (amount > remaining) {
      throw new AppError(`المبلغ (${amount}) أكبر من المتبقي (${remaining.toFixed(2)})`);
    }

    const payNum = `PAY-S${saleId}-${Date.now()}`;
    await client.query(
      `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
       VALUES ($1,'sale',$2,$3,$4,$5,$6)`,
      [
        payNum,
        saleId,
        amount,
        data.payment_method || 'cash',
        data.notes || null,
        data.user_id || null,
      ],
    );

    const newPaid = roundMoney(Number(paidSoFar) + amount);
    const newStatus = newPaid >= roundMoney(Number(sale.total_amount)) ? 'paid' : 'partial';
    await client.query(`UPDATE sales SET payment_status=$1 WHERE id=$2`, [newStatus, saleId]);
    await client.query(`UPDATE invoices SET payment_status=$1 WHERE sale_id=$2`, [
      newStatus,
      saleId,
    ]);

    if (sale.customer_id) {
      await recalculateCustomerBalance(client, sale.customer_id);
    }

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
      [
        data.user_id || null,
        `تسجيل دفعة على المبيعات ${sale.sale_number}: ${amount} ج.م`,
        JSON.stringify({ sale_id: saleId, amount }),
      ],
    );

    const { accountingService } = await import('./accountingService.ts');
    const journal = await accountingService.postCustomerPaymentJournalEntry(client, {
      id: saleId,
      payment_number: payNum,
      customer_id: sale.customer_id,
      amount,
      payment_method: data.payment_method || 'cash',
      notes: data.notes || `تحصيل دفعة مبيعات ${sale.sale_number}`,
      user_id: data.user_id,
      payment_date: data.payment_date || data.date,
    });

    if (!journal) throw new AppError('تعذر ترحيل التحصيل', 409);
    await linkPaymentJournalSources(client, [payNum], journal.id);
    return {
      success: true,
      amount,
      new_status: newStatus,
      remaining: Math.max(0, remaining - amount),
    };
  });
};

/**
 * جلب كشف حساب عميل (حركات المبيعات والمدفوعات).
 * @param {number} id معرف العميل
 * @returns {Promise<any>}
 */
export const getCustomerStatement = async (id: number) => {
  const customer = (
    await query(
      `SELECT id, code, name_ar, phone, balance, credit_limit, customer_type, opening_balance, created_at
     FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )
  ).rows[0];
  if (!customer) throw new AppError('العميل غير موجود', 404);

  const sales = await query(
    `SELECT
       'sale' AS entry_type,
       s.id,
       s.sale_number,
       NULL::text AS invoice_number,
       s.sale_number AS entry_number,
       s.sale_date AS entry_date,
       s.total_amount,
       s.payment_status,
       s.status,
       s.notes,
       s.created_at,
       CASE WHEN s.payment_status = 'paid' AND NOT EXISTS (SELECT 1 FROM payments WHERE (reference_type='sale' AND reference_id=s.id) OR (reference_type='invoice' AND reference_id=(SELECT id FROM invoices WHERE sale_id=s.id LIMIT 1))) THEN s.total_amount ELSE COALESCE((SELECT SUM(amount) FROM payments WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit' AND ((reference_type = 'sale' AND reference_id = s.id) OR (reference_type = 'invoice' AND reference_id = (SELECT id FROM invoices WHERE sale_id = s.id LIMIT 1)))), 0) END AS paid_amount,
         (SELECT payment_method FROM payments
          WHERE LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'
            AND ((reference_type = 'sale' AND reference_id = s.id) OR (reference_type = 'invoice' AND reference_id = (SELECT id FROM invoices WHERE sale_id = s.id LIMIT 1)))
        ORDER BY created_at DESC LIMIT 1) AS payment_method
      FROM sales s
      WHERE s.customer_id = $1
        AND s.deleted_at IS NULL
        AND s.sale_type = 'wholesale'
        AND s.status = 'completed'`,
    [id],
  );

  const invoices = await query(
    `SELECT
       'invoice' AS entry_type,
       i.id,
       NULL::text AS sale_number,
       i.invoice_number,
       i.invoice_number AS entry_number,
       i.issued_at AS entry_date,
       i.total_amount,
       i.payment_status,
       'completed'::text AS status,
       i.notes,
       i.created_at,
       CASE WHEN i.payment_status = 'paid' AND NOT EXISTS (SELECT 1 FROM payments WHERE reference_type='invoice' AND reference_id=i.id) THEN i.total_amount ELSE COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type='invoice' AND reference_id=i.id AND LOWER(TRIM(COALESCE(payment_method,'cash'))) <> 'credit'), 0) END AS paid_amount,
       (SELECT payment_method FROM payments
        WHERE reference_type = 'invoice' AND reference_id = i.id
          AND LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'
        ORDER BY created_at DESC LIMIT 1) AS payment_method
      FROM invoices i
      WHERE i.customer_id = $1
        AND i.sale_id IS NULL
        AND i.deleted_at IS NULL`,
    [id],
  );

  let rows = [...sales.rows, ...invoices.rows];

  const openingBalance = Number(customer.opening_balance || 0);
  if (openingBalance > 0) {
    const openingPaid = Number(
      (
        await query(
          `SELECT COALESCE(SUM(amount), 0) AS paid
           FROM payments
           WHERE reference_type = 'customer_opening' AND reference_id = $1
             AND LOWER(TRIM(COALESCE(payment_method, 'cash'))) <> 'credit'`,
          [id],
        )
      ).rows[0]?.paid || 0,
    );
    rows.push({
      entry_type: 'opening_balance',
      id: 'opening',
      sale_number: null,
      invoice_number: null,
      entry_number: 'رصيد افتتاحي',
      entry_date: customer.created_at,
      total_amount: openingBalance,
      payment_status:
        openingPaid >= openingBalance ? 'paid' : openingPaid > 0 ? 'partial' : 'unpaid',
      status: 'completed',
      notes: 'رصيد بداية المدة / مديونية سابقة',
      created_at: customer.created_at,
      paid_amount: openingPaid,
      payment_method: null,
    });
  }

  rows = rows.sort((a, b) => {
    const dateA = new Date(a.entry_date || a.created_at || 0).getTime();
    const dateB = new Date(b.entry_date || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  const totalPurchased = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const totalPaid = rows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);
  const totalBalance = roundMoney(totalPurchased - totalPaid);

  return {
    customer,
    summary: {
      total_purchased: totalPurchased,
      total_paid: totalPaid,
      total_balance: totalBalance,
      sales_count: sales.rows.length,
      invoices_count: invoices.rows.length,
      total_entries: rows.length,
    },
    transactions: rows,
  };
};
