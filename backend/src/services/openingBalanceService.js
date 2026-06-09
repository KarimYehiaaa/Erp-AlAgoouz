import { query } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeDate = (value, fieldName) => {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(`${fieldName} :J1 5-J-`, 400);
  }
  return date;
};

const monthKey = (date) => String(date || '').slice(0, 7);
const settingKey = (fromDate) => `sales_opening_balance:${monthKey(fromDate)}`;
const monthSettingKey = (dateLike) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return `sales_opening_balance:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const legacyKeys = (fromDate, toDate) => [
  `sales_opening_balance:${fromDate}:${toDate}`,
  `sales-opening-balance:${fromDate}:${toDate}`,
  `sales-opening-balance:branch:${fromDate}:${toDate}`,
  `sales-opening-balance:wholesale:${fromDate}:${toDate}`,
  `sales_opening_balance:${fromDate}:${toDate}`,
  `sales-opening-balance:${fromDate}:${toDate}`,
];

export const getOpeningBalance = async (fromDate, toDate) => {
  const from = normalizeDate(fromDate, 'تاريخ البداية');
  const to = normalizeDate(toDate, 'تاريخ النهاية');
  const key = settingKey(from);
  const result = await query(
    `SELECT value
     FROM settings
     WHERE key = ANY($1::text[]) OR key LIKE $2
     ORDER BY CASE WHEN key = $3 THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [[key, ...legacyKeys(from, to)], `${key}%`, key]
  );
  const value = result.rows[0]?.value || {};
  return {
    from_date: from,
    to_date: to,
    amount: roundMoney(value.amount),
  };
};

export const getOpeningBalanceForDate = async (dateLike) => {
  const key = monthSettingKey(dateLike);
  if (!key) return { amount: 0 };
  const result = await query(
    `SELECT value
     FROM settings
     WHERE key = $1 OR key LIKE $2
     ORDER BY CASE WHEN key = $1 THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [key, `${key}%`]
  );
  const value = result.rows[0]?.value || {};
  return {
    amount: roundMoney(value.amount),
  };
};

export const saveOpeningBalance = async ({ from_date, to_date, amount }, userId) => {
  const from = normalizeDate(from_date, 'تاريخ البداية');
  const to = normalizeDate(to_date, 'تاريخ النهاية');
  const value = {
    from_date: from,
    to_date: to,
    amount: roundMoney(amount),
  };

  await query(
    `INSERT INTO settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key)
     DO UPDATE SET
       value = EXCLUDED.value,
       description = EXCLUDED.description,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [settingKey(from), JSON.stringify(value), 'بداية المدة الخاصة بمبيعات الفترة', userId || null]
  );

  return value;
};
