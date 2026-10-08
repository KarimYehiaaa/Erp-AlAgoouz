/**
 * localDate.ts — أدوات التاريخ المحلي بتوقيت الشركة
 * تُستخدم بدلاً من toISOString().split('T')[0] الذي يعتمد على UTC
 * ويسجل المبيعات بعد منتصف الليل (بتوقيت القاهرة) على اليوم السابق.
 */

/** المنطقة الزمنية الرسمية للشركة */
import { businessCalendarDate } from '../../../shared/businessDate.ts';
export { BUSINESS_TIMEZONE } from '../../../shared/businessDate.ts';

/** تاريخ اليوم بتوقيت الشركة بصيغة YYYY-MM-DD */
export const businessToday = () => businessCalendarDate();

/** Validate a date-only value without accepting JS date rollover (e.g. February 30). */
export const isCalendarDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Calendar arithmetic only: independent of host timezone and daylight-saving shifts. */
export const shiftCalendarDate = (value: string, days: number): string => {
  if (!isCalendarDate(value) || !Number.isInteger(days))
    throw new RangeError('Invalid calendar date');
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
