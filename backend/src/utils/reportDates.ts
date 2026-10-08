import { z } from 'zod';
import { AppError } from '../types/errors.ts';
import { businessToday, isCalendarDate } from './localDate.ts';

export const reportCalendarDate = z
  .string()
  .refine((value) => isCalendarDate(value) && value.slice(0, 4) !== '0000');
const period = z
  .object({
    from_date: reportCalendarDate.optional(),
    to_date: reportCalendarDate.optional(),
  })
  .strict();
const asOfQuery = z.object({ as_of_date: reportCalendarDate.optional() }).strict();
const invalidDates = () =>
  new AppError('تواريخ التقرير غير صالحة: تحقق من بداية الفترة ونهايتها', 400, 'VALIDATION_ERROR');

export function parseReportAsOfDate(input: unknown): string {
  const result = reportCalendarDate.safeParse(input === undefined ? businessToday() : input);
  if (!result.success) throw invalidDates();
  return result.data;
}

export function parseReportAsOfQuery(input: unknown): string {
  const result = asOfQuery.safeParse(input);
  if (!result.success) throw invalidDates();
  return parseReportAsOfDate(result.data.as_of_date);
}

export function parseReportPeriod(input: unknown, mode: 'trial' | 'monthly') {
  const result = period.safeParse(input);
  if (!result.success) throw invalidDates();
  const toDate = result.data.to_date ?? (mode === 'trial' ? '2099-12-31' : businessToday());
  // Preserve the existing trial defaults while keeping historical end-only
  // reports within their cutoff. Their opening includes all earlier history.
  const fromDate =
    result.data.from_date ??
    (mode === 'trial'
      ? toDate < '2000-01-01'
        ? toDate
        : '2000-01-01'
      : `${toDate.slice(0, 8)}01`);
  if (fromDate > toDate) throw invalidDates();
  return { from_date: fromDate, to_date: toDate };
}
