import { query } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { invalidateDashboardCache } from './dashboardService.ts';
import { broadcast } from './websocketService.ts';
import { sanitizeLimit } from '../utils/money.ts';

/**
 * جلب المصاريف مع فلترة وترقيم.
 * @param {Record<string, any>} [filters] خيارات الفلترة (from_date, to_date, category_id...)
 * @returns {Promise<{ rows: any[], total: number }>}
 */
export const getExpenses = async (filters: Record<string, any> = {}) => {
  let sql = `SELECT e.*, COALESCE(e.is_fixed, ec.is_fixed, FALSE) AS is_fixed, ec.name_ar as category_name, u.full_name as user_name
    FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
    LEFT JOIN users u ON e.user_id = u.id WHERE e.deleted_at IS NULL`;
  const params: any[] = [];
  let i = 1;
  if (filters.from_date) {
    sql += ` AND e.expense_date >= $${i++}`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND e.expense_date <= $${i++}`;
    params.push(filters.to_date);
  }
  if (filters.category_id) {
    sql += ` AND e.category_id = $${i++}`;
    params.push(filters.category_id);
  }
  if (filters.is_fixed !== undefined && filters.is_fixed !== null && filters.is_fixed !== '') {
    sql += ` AND COALESCE(e.is_fixed, ec.is_fixed, FALSE) = $${i}`;
    params.push(filters.is_fixed === 'true' || filters.is_fixed === true);
  }
  sql += ` ORDER BY e.expense_date DESC LIMIT ${sanitizeLimit(filters.limit)}`;
  return (await query(sql, params)).rows;
};

/**
 * تسجيل مصروف جديد.
 * @param {Record<string, any>} data بيانات المصروف
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const createExpense = async (data: Record<string, any>, userId: number) => {
  const amount = parseFloat(data.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new AppError('مبلغ المصروف يجب أن يكون رقماً موجباً أكبر من الصفر');
  }
  const resSeq = await query(`SELECT nextval('seq_expenses_number') AS next_val`);
  const num = `EXP-${resSeq.rows[0].next_val}`;
  const isFixed = data.is_fixed === true || String(data.is_fixed) === 'true';
  const result = await query(
    `INSERT INTO expenses (expense_number, category_id, title, amount, expense_date, payment_method, recurring, is_fixed, notes, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      num,
      data.category_id,
      data.title,
      data.amount,
      data.expense_date || new Date(),
      data.payment_method || 'cash',
      data.recurring || false,
      isFixed,
      data.notes,
      userId,
    ],
  );
  invalidateDashboardCache();
  broadcast('expenses_changed', result.rows[0]);
  return result.rows[0];
};

/**
 * تحديث مصروف.
 * @param {number} id معرف المصروف
 * @param {Record<string, any>} data الحقول الجديدة
 * @returns {Promise<any>}
 */
export const updateExpense = async (id: number, data: Record<string, any>) => {
  if (data.amount !== undefined) {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new AppError('مبلغ المصروف يجب أن يكون رقماً موجباً أكبر من الصفر');
    }
  }
  const isFixed =
    data.is_fixed !== undefined && data.is_fixed !== null
      ? data.is_fixed === true || String(data.is_fixed) === 'true'
      : null;

  const result = await query(
    `UPDATE expenses
     SET category_id = COALESCE($1, category_id),
         title = COALESCE($2, title),
         amount = COALESCE($3, amount),
         expense_date = COALESCE($4, expense_date),
         payment_method = COALESCE($5, payment_method),
         recurring = COALESCE($6, recurring),
         is_fixed = CASE WHEN $7::boolean IS NOT NULL THEN $7::boolean ELSE is_fixed END,
         notes = COALESCE($8, notes)
     WHERE id = $9 AND deleted_at IS NULL
     RETURNING *`,
    [
      data.category_id,
      data.title,
      data.amount,
      data.expense_date,
      data.payment_method,
      data.recurring,
      isFixed,
      data.notes,
      id,
    ],
  );
  if (!result.rows[0]) throw new AppError('المصروف غير موجود', 404);
  invalidateDashboardCache();
  broadcast('expenses_changed', result.rows[0]);
  return result.rows[0];
};

/**
 * جلب تصنيفات المصاريف.
 * @returns {Promise<any[]>}
 */
export const getCategories = async () =>
  (
    await query(
      `SELECT id, name_ar, slug, is_fixed, is_active FROM expense_categories WHERE is_active = TRUE ORDER BY id ASC`,
    )
  ).rows;

/**
 * تقرير مصاريف شهر/سنة.
 * @param {number|string} year السنة
 * @param {number|string} month الشهر
 * @returns {Promise<any>}
 */
export const getExpenseReport = async (year: number | string, month: number | string) => {
  let dateFilter = 'EXTRACT(YEAR FROM e.expense_date) = $1';
  const params = [year];
  if (month) {
    dateFilter += ' AND EXTRACT(MONTH FROM e.expense_date) = $2';
    params.push(month);
  }
  const byCategory = await query(
    `SELECT ec.name_ar, SUM(e.amount) as total, COUNT(*) as count
     FROM expenses e JOIN expense_categories ec ON e.category_id = ec.id
     WHERE ${dateFilter} AND e.deleted_at IS NULL GROUP BY ec.id, ec.name_ar ORDER BY total DESC`,
    params,
  );
  const monthly = await query(
    `SELECT EXTRACT(MONTH FROM expense_date) as month, SUM(amount) as total
     FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = $1 AND deleted_at IS NULL
     GROUP BY EXTRACT(MONTH FROM expense_date) ORDER BY month`,
    [year],
  );
  return { byCategory: byCategory.rows, monthly: monthly.rows };
};

/** حذف مصروف. */
export const deleteExpense = async (id: number) => {
  await query(`UPDATE expenses SET deleted_at = NOW() WHERE id = $1`, [id]);
  invalidateDashboardCache();
  broadcast('expenses_changed', { id });
};

/**
 * اقتراح تصنيف لمصروف حسب العنوان.
 * @param {string} [title] عنوان المصروف
 * @returns {Promise<string | null>}
 */
export const suggestCategory = async (title: string = '') => {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return null;

  // 1. محاولة مطابقة العنوان مع فواتير سابقة لمعرفة الفئة الأكثر تكراراً
  const dbMatch = await query(
    `SELECT category_id, COUNT(*) as cnt
     FROM expenses
     WHERE deleted_at IS NULL AND title ILIKE $1
     GROUP BY category_id
     ORDER BY cnt DESC
     LIMIT 1`,
    [`%${cleanTitle}%`],
  );

  if (dbMatch.rows.length > 0) {
    return { category_id: dbMatch.rows[0].category_id };
  }

  // 2. استخدام معجم الكلمات المفتاحية في حال عدم وجود سجلات سابقة
  const KEYWORD_MAP = [
    { keywords: ['كهرباء', 'نور', 'إنارة'], slug: 'electricity' },
    { keywords: ['إيجار', 'ايجار', 'محل', 'إيجار السكن'], slug: 'rent' },
    { keywords: ['مرتب', 'راتب', 'رواتب', 'سلفة', 'مرتبات'], slug: 'salaries' },
    { keywords: ['صيانة', 'تصليح', 'ترميم', 'سباكة', 'أعطال'], slug: 'maintenance' },
    { keywords: ['بن', 'حبوب', 'كوب', 'أكواب', 'حليب', 'سكر', 'خامات'], slug: 'raw-materials' },
    { keywords: ['مياه', 'ماء', 'انترنت', 'نت', 'فاتورة', 'فواتير', 'غاز', 'هاتف'], slug: 'bills' },
    { keywords: ['يومية', 'شاي', 'ضيافة', 'مناديل', 'صابون', 'نظافة', 'غداء'], slug: 'daily' },
  ];

  const words = cleanTitle.split(/\s+/);
  let matchedSlug: string | null = null;

  for (const word of words) {
    const match = KEYWORD_MAP.find((k) =>
      k.keywords.some((kw) => word.includes(kw) || kw.includes(word)),
    );
    if (match) {
      matchedSlug = match.slug;
      break;
    }
  }

  if (matchedSlug) {
    const catRes = await query(
      'SELECT id FROM expense_categories WHERE slug = $1 AND is_active = TRUE',
      [matchedSlug],
    );
    if (catRes.rows.length > 0) {
      return { category_id: catRes.rows[0].id };
    }
  }

  // 3. السقوط الافتراضي على فئة "أخرى"
  const otherRes = await query("SELECT id FROM expense_categories WHERE slug = 'other'");
  return otherRes.rows.length > 0 ? { category_id: otherRes.rows[0].id } : null;
};
