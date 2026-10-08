import { query, withReadOnlySnapshot } from '../database/pool.ts';
import { getTreasuryMovementNet } from './treasuryMovementService.ts';
import { isCalendarDate } from '../utils/localDate.ts';
import { businessCalendarDate } from '../../../shared/businessDate.ts';
import { runSharedMaintenanceTask } from '../database/maintenanceBarrier.ts';
import { AppError } from '../types/errors.ts';
import { roundMoney } from '../utils/money.ts';

const normalizeDate = (value, fieldName) => {
  const date = String(value || '').trim();
  if (!isCalendarDate(date)) {
    throw new AppError(`${fieldName} غير صالح`, 400);
  }
  return date;
};

const monthKey = (date) => String(date || '').slice(0, 7);
const settingKey = (fromDate) => `sales_opening_balance:${monthKey(fromDate)}`;
const calendarDateOf = (value: Date | string): string | null => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return isCalendarDate(value) ? value : null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? businessCalendarDate(date) : null;
};
const monthSettingKey = (dateLike: Date | string) => {
  const calendar = calendarDateOf(dateLike);
  return calendar ? `sales_opening_balance:${calendar.slice(0, 7)}` : null;
};
/**
 * حساب رصيد الافتتاح الديناميكي (نقدية الخزنة) لتاريخ محدد.
 * @param {Date|string} date التاريخ
 * @returns {Promise<number>}
 */
export const calculateDynamicOpeningBalance = async (
  date: Date | string,
  depth = 0,
  db?: typeof query,
) =>
  runSharedMaintenanceTask(async () => {
    const work = async (read: typeof query) => {
      if (depth >= 60) return 0;
      const calendar = calendarDateOf(date);
      if (!calendar) throw new AppError('تاريخ رصيد الافتتاح غير صالح', 400);
      const yyyy = Number(calendar.slice(0, 4));
      const month = Number(calendar.slice(5, 7)) - 1;
      const limit = 60 - depth;
      const keys = Array.from(
        { length: limit },
        (_, index) =>
          `sales_opening_balance:${new Date(Date.UTC(yyyy, month - index, 1)).toISOString().slice(0, 7)}`,
      );
      const settings = new Map(
        (await read('SELECT key,value FROM settings WHERE key=ANY($1::text[])', [keys])).rows.map(
          (row) => [row.key, row.value],
        ),
      );
      const nearest = keys.findIndex((key) => Boolean(settings.get(key)));
      const opening = nearest >= 0 ? Number(settings.get(keys[nearest]).amount) || 0 : 0;
      if (nearest === 0) return opening;
      const monthsBack = nearest >= 0 ? nearest : limit;
      const first = new Date(Date.UTC(yyyy, month - monthsBack, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(yyyy, month, 0)).toISOString().slice(0, 10);
      return roundMoney(opening + (await getTreasuryMovementNet(first, last, read)));
    };
    return db
      ? work(db)
      : withReadOnlySnapshot((client) => work((sql, params) => client.query(sql, params)));
  });
/**
 * جلب أرصدة الافتتاح بين تاريخين.
 * @param {string} fromDate تاريخ البداية
 * @param {string} toDate تاريخ النهاية
 * @returns {Promise<any[]>}
 */
export const getOpeningBalance = async (fromDate: string, toDate: string) => {
  const from = normalizeDate(fromDate, 'تاريخ البداية');
  const to = normalizeDate(toDate, 'تاريخ النهاية');
  const opening = await getOpeningBalanceForDate(from);
  return { from_date: from, to_date: to, amount: opening.amount };
};
/**
 * جلب رصيد الافتتاح لتاريخ محدد (أقرب سجل سابق).
 * @param {Date|string} dateLike التاريخ
 * @returns {Promise<{ amount: number }>}
 */
export const getOpeningBalanceForDate = async (dateLike: Date | string, db?: typeof query) => {
  const work = async (read: typeof query) => {
    const key = monthSettingKey(dateLike);
    if (!key) return { amount: 0 };
    const result = await read('SELECT value FROM settings WHERE key=$1 LIMIT 1', [key]);
    if (result.rows[0]) return { amount: roundMoney(result.rows[0].value?.amount) };
    return { amount: roundMoney(await calculateDynamicOpeningBalance(dateLike, 0, read)) };
  };
  return db
    ? work(db)
    : withReadOnlySnapshot((client) => work((sql, params) => client.query(sql, params)));
};
/**
 * حفظ رصيد افتتاح (مع إعادة احتساب اللاحق).
 * @param {{ from_date: string, to_date: string, amount: number }} params نطاق الرصيد والمبلغ
 * @param {number} userId معرف المستخدم المنفّذ
 * @returns {Promise<any>}
 */
export const saveOpeningBalance = async (
  { from_date, to_date, amount }: { from_date: string; to_date: string; amount: number },
  userId: number,
) => {
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
    [settingKey(from), JSON.stringify(value), 'بداية المدة الخاصة بمبيعات الفترة', userId || null],
  );

  return value;
};
