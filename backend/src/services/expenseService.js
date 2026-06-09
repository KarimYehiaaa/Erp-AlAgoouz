import { query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';
const sanitizeLimit = (value, fallback = 100, max = 500) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
};

export const getExpenses = async (filters = {}) => {
  let sql = `SELECT e.*, ec.name_ar as category_name, u.full_name as user_name
    FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
    LEFT JOIN users u ON e.user_id = u.id WHERE e.deleted_at IS NULL`;
  const params = [];
  let i = 1;
  if (filters.from_date) { sql += ` AND e.expense_date >= $${i++}`; params.push(filters.from_date); }
  if (filters.to_date) { sql += ` AND e.expense_date <= $${i++}`; params.push(filters.to_date); }
  if (filters.category_id) { sql += ` AND e.category_id = $${i++}`; params.push(filters.category_id); }
  sql += ` ORDER BY e.expense_date DESC LIMIT ${sanitizeLimit(filters.limit)}`;
  return (await query(sql, params)).rows;
};

export const createExpense = async (data, userId) => {
  const num = `EXP-${Date.now()}`;
  const result = await query(
    `INSERT INTO expenses (expense_number, category_id, title, amount, expense_date, payment_method, recurring, notes, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [num, data.category_id, data.title, data.amount, data.expense_date || new Date(), data.payment_method || 'cash', data.recurring || false, data.notes, userId]
  );
  return result.rows[0];
};

export const updateExpense = async (id, data) => {
  const result = await query(
    `UPDATE expenses
     SET category_id = COALESCE($1, category_id),
         title = COALESCE($2, title),
         amount = COALESCE($3, amount),
         expense_date = COALESCE($4, expense_date),
         payment_method = COALESCE($5, payment_method),
         recurring = COALESCE($6, recurring),
         notes = COALESCE($7, notes)
     WHERE id = $8 AND deleted_at IS NULL
     RETURNING *`,
    [data.category_id, data.title, data.amount, data.expense_date, data.payment_method, data.recurring, data.notes, id]
  );
  if (!result.rows[0]) throw new AppError('المصروف غير موجود', 404);
  return result.rows[0];
};

export const getCategories = async () => (await query(`SELECT * FROM expense_categories WHERE is_active = TRUE`)).rows;

export const getExpenseReport = async (year, month) => {
  const params = [year];
  let dateFilter = `EXTRACT(YEAR FROM expense_date) = $1`;
  if (month) { dateFilter += ` AND EXTRACT(MONTH FROM expense_date) = $2`; params.push(month); }

  const byCategory = await query(
    `SELECT ec.name_ar, SUM(e.amount) as total, COUNT(*) as count
     FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id
     WHERE ${dateFilter} AND e.deleted_at IS NULL GROUP BY ec.id, ec.name_ar ORDER BY total DESC`,
    params
  );
  const monthly = await query(
    `SELECT EXTRACT(MONTH FROM expense_date) as month, SUM(amount) as total
     FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = $1 AND deleted_at IS NULL
     GROUP BY EXTRACT(MONTH FROM expense_date) ORDER BY month`,
    [year]
  );
  return { byCategory: byCategory.rows, monthly: monthly.rows };
};

export const deleteExpense = async (id) => {
  await query(`UPDATE expenses SET deleted_at = NOW() WHERE id = $1`, [id]);
};

