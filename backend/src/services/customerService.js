import { getClient, query, withTransaction } from '../database/pool.js';
import { AppError } from '../types/errors.js';
import { recalculateCustomerBalance } from './customerBalanceService.js';
import { sanitizeLimit } from '../utils/money.js';

const generateCustomerCode = async () => {
  const res = await query(
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

export const getCustomers = async (filters = {}) => {
  let sql = `
    SELECT
      c.*,
      COALESCE(cs.total_purchased, 0) AS total_purchased,
      COALESCE(cs.total_paid, 0) AS total_paid,
      COALESCE(c.opening_balance, 0) + COALESCE(cs.total_purchased, 0) - COALESCE(cs.total_paid, 0) AS total_balance
    FROM customers c
    LEFT JOIN (
      SELECT customer_id,
             SUM(total_purchased) AS total_purchased,
             SUM(total_paid) AS total_paid
      FROM (
        SELECT s.customer_id,
               COALESCE(s.total_amount, 0) AS total_purchased,
               COALESCE(p.total_paid, 0) AS total_paid
        FROM sales s
        LEFT JOIN (
          SELECT reference_id, SUM(amount) AS total_paid
          FROM payments
          WHERE reference_type = 'sale'
          GROUP BY reference_id
        ) p ON p.reference_id = s.id
        WHERE s.deleted_at IS NULL
          AND s.sale_type = 'wholesale'
          AND s.status = 'completed'

        UNION ALL

        SELECT i.customer_id,
               COALESCE(i.total_amount, 0) AS total_purchased,
               COALESCE(p.total_paid, 0) AS total_paid
        FROM invoices i
        LEFT JOIN (
          SELECT reference_id, SUM(amount) AS total_paid
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
  const params = [];
  let i = 1;
  if (filters.customer_type) {
    sql += ` AND c.customer_type = $${i++}`;
    params.push(filters.customer_type);
  }
  if (filters.search) {
    sql += ` AND (c.name_ar ILIKE $${i} OR c.phone ILIKE $${i} OR c.code ILIKE $${i})`;
    params.push(`%${filters.search}%`);
    i++;
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

export const getCustomerById = async (id) => {
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
       AND s.sale_type = 'wholesale'
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

export const createCustomer = async (data) => {
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

export const updateCustomer = async (id, data) => {
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

export const deleteCustomer = async (id) => {
  await query(`UPDATE customers SET deleted_at = NOW() WHERE id = $1`, [id]);
};

export const recordPayment = async (customerId, data) => {
  const amount = parseFloat(data.amount);
  if (!amount || amount <= 0) throw new AppError('المبلغ يجب أن يكون أكبر من صفر');

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const customer = (
      await client.query(
        `SELECT id, name_ar, balance FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
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
         COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'sale' AND reference_id = s.id), 0) AS paid_amount,
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
         COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'invoice' AND reference_id = i.id), 0) AS paid_amount,
         COALESCE(i.due_date, DATE(i.issued_at)) AS entry_date,
         i.created_at
       FROM invoices i
       WHERE i.customer_id = $1
        AND i.sale_id IS NULL
        AND i.deleted_at IS NULL

       ORDER BY entry_date, created_at, id
       FOR UPDATE`,
        [customerId],
      )
    ).rows;

    const openDebts = debts
      .map((debt) => ({
        ...debt,
        remaining: Math.max(0, Number(debt.total_amount || 0) - Number(debt.paid_amount || 0)),
      }))
      .filter((debt) => debt.remaining > 0.01);

    const totalRemaining = openDebts.reduce((sum, debt) => sum + debt.remaining, 0);
    if (totalRemaining <= 0.01) {
      throw new AppError('لا توجد مبيعات أو فواتير مستحقة لهذا العميل');
    }
    if (amount > totalRemaining + 0.01) {
      throw new AppError(
        `المبلغ (${amount}) أكبر من إجمالي المستحق (${totalRemaining.toFixed(2)})`,
      );
    }

    let remainingPayment = amount;
    const allocations = [];
    const stamp = Date.now();

    for (const debt of openDebts) {
      if (remainingPayment <= 0.001) break;

      const paidForDebt = Math.min(remainingPayment, debt.remaining);
      const newPaid = Number(debt.paid_amount || 0) + paidForDebt;
      const newStatus = newPaid >= Number(debt.total_amount) - 0.01 ? 'paid' : 'partial';

      if (debt.entry_type === 'sale') {
        const payNum = `PAY-S${debt.id}-${stamp}-${allocations.length + 1}`;
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
      } else {
        const payNum = `PAY-INV${debt.id}-${stamp}-${allocations.length + 1}`;
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
      }

      allocations.push({
        type: debt.entry_type,
        id: debt.id,
        number: debt.entry_number,
        amount: paidForDebt,
        new_status: newStatus,
      });
      remainingPayment -= paidForDebt;
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

    await client.query('COMMIT');
    return { success: true, amount, customer_name: customer.name_ar, allocations };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const recordSalePayment = async (saleId, data) => {
  return await withTransaction(async (client) => {
    const sale = (
      await client.query(
        `SELECT s.*, c.name_ar as customer_name
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1 AND s.deleted_at IS NULL FOR UPDATE`,
        [saleId],
      )
    ).rows[0];
    if (!sale) throw new AppError('العملية غير موجودة', 404);

    const amount = parseFloat(data.amount);
    if (!amount || amount <= 0) throw new AppError('المبلغ يجب أن يكون أكبر من صفر');

    const paidSoFar = (
      await client.query(
        `SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE reference_type='sale' AND reference_id=$1`,
        [saleId],
      )
    ).rows[0].total;

    const remaining = Number(sale.total_amount) - Number(paidSoFar);
    if (amount > remaining + 0.01) {
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

    const newPaid = Number(paidSoFar) + amount;
    const newStatus = newPaid >= Number(sale.total_amount) - 0.01 ? 'paid' : 'partial';
    await client.query(`UPDATE sales SET payment_status=$1 WHERE id=$2`, [newStatus, saleId]);
    await client.query(`UPDATE invoices SET payment_status=$1 WHERE sale_id=$2`, [newStatus, saleId]);

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

    return {
      success: true,
      amount,
      new_status: newStatus,
      remaining: Math.max(0, remaining - amount),
    };
  });
};

export const getCustomerStatement = async (id) => {
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
       COALESCE(
         (SELECT SUM(amount) FROM payments
          WHERE reference_type = 'sale' AND reference_id = s.id), 0
       ) AS paid_amount,
       (SELECT payment_method FROM payments
        WHERE reference_type = 'sale' AND reference_id = s.id
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
       COALESCE(
         (SELECT SUM(amount) FROM payments
          WHERE reference_type = 'invoice' AND reference_id = i.id), 0
       ) AS paid_amount,
       (SELECT payment_method FROM payments
        WHERE reference_type = 'invoice' AND reference_id = i.id
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
    rows.push({
      entry_type: 'opening_balance',
      id: 'opening',
      sale_number: null,
      invoice_number: null,
      entry_number: 'رصيد افتتاحي',
      entry_date: customer.created_at,
      total_amount: openingBalance,
      payment_status: 'unpaid',
      status: 'completed',
      notes: 'رصيد بداية المدة / مديونية سابقة',
      created_at: customer.created_at,
      paid_amount: 0,
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
  const totalBalance = Math.max(0, totalPurchased - totalPaid);

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
