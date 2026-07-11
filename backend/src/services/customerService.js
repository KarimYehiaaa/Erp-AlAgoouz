import { getClient, query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { recalculateCustomerBalance } from './customerBalanceService.js';

const sanitizeLimit = (value, fallback = 100, max = 500) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

const generateCustomerCode = async () => {
  const res = await query(
    `SELECT COALESCE(MAX(
       CASE WHEN code ~ '^C-[0-9]+$'
       THEN CAST(SUBSTRING(code FROM 3) AS INT)
       ELSE 0 END
     ), 0) + 1 AS next_num
     FROM customers`
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
      COALESCE(cs.total_purchased, 0) - COALESCE(cs.total_paid, 0) AS total_balance
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
      ) source
      GROUP BY customer_id
    ) cs ON cs.customer_id = c.id
    WHERE c.deleted_at IS NULL`;
  const params = [];
  let i = 1;
  if (filters.customer_type) { sql += ` AND c.customer_type = $${i++}`; params.push(filters.customer_type); }
  if (filters.search) { sql += ` AND (c.name_ar ILIKE $${i} OR c.phone ILIKE $${i} OR c.code ILIKE $${i})`; params.push(`%${filters.search}%`); i++; }
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
  const customer = (await query(`SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0];
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
     ORDER BY s.created_at DESC
     LIMIT 20`,
    [id]
  );
  return { ...customer, sales: transactions.rows, transactions: transactions.rows };
};

export const createCustomer = async (data) => {
  const customerCode = String(data.code || '').trim() || await generateCustomerCode();
  const result = await query(
    `INSERT INTO customers (code, name_ar, phone, email, address, customer_type, credit_limit, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [customerCode, data.name_ar, data.phone, data.email, data.address, data.customer_type || 'retail', data.credit_limit || 0, data.notes]
  );
  return result.rows[0];
};

export const updateCustomer = async (id, data) => {
  const result = await query(
    `UPDATE customers SET name_ar=COALESCE($1,name_ar), phone=COALESCE($2,phone), email=COALESCE($3,email),
     address=COALESCE($4,address), customer_type=COALESCE($5,customer_type), credit_limit=COALESCE($6,credit_limit),
     loyalty_points=COALESCE($7,loyalty_points), notes=COALESCE($8,notes), is_active=COALESCE($9,is_active)
     WHERE id=$10 AND deleted_at IS NULL RETURNING *`,
    [data.name_ar, data.phone, data.email, data.address, data.customer_type, data.credit_limit, data.loyalty_points, data.notes, data.is_active, id]
  );
  if (!result.rows[0]) throw new AppError('العميل غير موجود', 404);
  return result.rows[0];
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

    const customer = (await client.query(
      `SELECT id, name_ar, balance FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [customerId]
    )).rows[0];
    if (!customer) throw new AppError('العميل غير موجود', 404);

    const sales = (await client.query(
      `SELECT
         s.id, s.sale_number, s.total_amount,
         COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'sale' AND reference_id = s.id), 0) AS paid_amount
       FROM sales s
       WHERE s.customer_id = $1
        AND s.deleted_at IS NULL
        AND s.status = 'completed'
       ORDER BY COALESCE(s.sale_date, DATE(s.created_at)), s.created_at, s.id
       FOR UPDATE`,
      [customerId]
    )).rows;

    const openSales = sales
      .map((sale) => ({
        ...sale,
        remaining: Math.max(0, Number(sale.total_amount || 0) - Number(sale.paid_amount || 0)),
      }))
      .filter((sale) => sale.remaining > 0.01);

    const totalRemaining = openSales.reduce((sum, sale) => sum + sale.remaining, 0);
    if (totalRemaining <= 0.01) {
      throw new AppError('لا توجد مبيعات مستحقة لهذا العميل');
    }
    if (amount > totalRemaining + 0.01) {
      throw new AppError(`المبلغ (${amount}) أكبر من إجمالي المستحق (${totalRemaining.toFixed(2)})`);
    }

    let remainingPayment = amount;
    const allocations = [];
    const stamp = Date.now();

    for (const sale of openSales) {
      if (remainingPayment <= 0.001) break;

      const paidForSale = Math.min(remainingPayment, sale.remaining);
      const newPaid = Number(sale.paid_amount || 0) + paidForSale;
      const newStatus = newPaid >= Number(sale.total_amount) - 0.01 ? 'paid' : 'partial';
      const payNum = `PAY-S${sale.id}-${stamp}-${allocations.length + 1}`;

      await client.query(
        `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
         VALUES ($1, 'sale', $2, $3, $4, $5, $6)`,
        [payNum, sale.id, paidForSale, data.payment_method || 'cash', data.notes || null, data.user_id || null]
      );
      await client.query(`UPDATE sales SET payment_status = $1 WHERE id = $2`, [newStatus, sale.id]);
      await client.query(`UPDATE invoices SET payment_status = $1 WHERE sale_id = $2`, [newStatus, sale.id]);

      allocations.push({
        sale_id: sale.id,
        sale_number: sale.sale_number,
        amount: paidForSale,
        new_status: newStatus,
      });
      remainingPayment -= paidForSale;
    }

    await recalculateCustomerBalance((text, params) => client.query(text, params), customerId);

    await client.query(
      `INSERT INTO activity_logs (user_id, module, action_ar, details)
       VALUES ($1, 'customers', $2, $3)`,
      [data.user_id || null, `تسجيل دفعة من العميل ${customer.name_ar}: ${amount} ج.م`, JSON.stringify({ customer_id: customerId, amount, allocations })]
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
  const sale = (await query(
    `SELECT s.*, c.name_ar as customer_name
     FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = $1 AND s.deleted_at IS NULL`, [saleId]
  )).rows[0];
  if (!sale) throw new AppError('العملية غير موجودة', 404);

  const amount = parseFloat(data.amount);
  if (!amount || amount <= 0) throw new AppError('المبلغ يجب أن يكون أكبر من صفر');

  const paidSoFar = (await query(
    `SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE reference_type='sale' AND reference_id=$1`, [saleId]
  )).rows[0].total;

  const remaining = Number(sale.total_amount) - Number(paidSoFar);
  if (amount > remaining + 0.01) {
    throw new AppError(`المبلغ (${amount}) أكبر من المتبقي (${remaining.toFixed(2)})`);
  }

  const payNum = `PAY-S${saleId}-${Date.now()}`;
  await query(
    `INSERT INTO payments (payment_number, reference_type, reference_id, amount, payment_method, notes, user_id)
     VALUES ($1,'sale',$2,$3,$4,$5,$6)`,
    [payNum, saleId, amount, data.payment_method || 'cash', data.notes || null, data.user_id || null]
  );

  const newPaid = Number(paidSoFar) + amount;
  const newStatus = newPaid >= Number(sale.total_amount) - 0.01 ? 'paid' : 'partial';
  await query(`UPDATE sales SET payment_status=$1 WHERE id=$2`, [newStatus, saleId]);
  await query(`UPDATE invoices SET payment_status=$1 WHERE sale_id=$2`, [newStatus, saleId]);

  if (sale.customer_id) {
    await recalculateCustomerBalance(query, sale.customer_id);
  }

  await query(
    `INSERT INTO activity_logs (user_id, module, action_ar, details) VALUES ($1,'sales',$2,$3)`,
    [data.user_id || null, `تسجيل دفعة على المبيعات ${sale.sale_number}: ${amount} ج.م`, JSON.stringify({ sale_id: saleId, amount })]
  );

  return { success: true, amount, new_status: newStatus, remaining: Math.max(0, remaining - amount) };
};

export const getCustomerStatement = async (id) => {
  const customer = (await query(
    `SELECT id, code, name_ar, phone, balance, credit_limit, customer_type
     FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id]
  )).rows[0];
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
    [id]
  );

  const invoices = { rows: [] };

  const rows = [...sales.rows, ...invoices.rows].sort((a, b) => {
    const dateA = new Date(a.entry_date || a.created_at || 0).getTime();
    const dateB = new Date(b.entry_date || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  const salesRows = rows.filter((r) => r.entry_type === 'sale');

  const totalPurchased = salesRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

  const totalPaid = salesRows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0);

  const totalBalance = Math.max(0, totalPurchased - totalPaid);

  return {
    customer,
    summary: {
      total_purchased: totalPurchased,
      total_paid: totalPaid,
      total_balance: totalBalance,
      sales_count: rows.filter((r) => r.entry_type === 'sale').length,
    },
    transactions: rows,
  };
};

