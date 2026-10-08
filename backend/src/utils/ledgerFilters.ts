import { z } from 'zod';
import { AppError } from '../types/errors.ts';
import { parseReportPeriod, reportCalendarDate } from './reportDates.ts';

// Reject repeated query values, objects and coercions such as booleans before
// they reach PostgreSQL integer/date casts. Historical dates remain supported.
const id = z
  .union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().positive().max(2147483647));
const date = reportCalendarDate;
const filters = z
  .object({
    account_id: id.optional(),
    account_code: z.string().trim().min(1).max(50).optional(),
    warehouse_id: id.optional(),
    from_date: date.optional(),
    to_date: date.optional(),
  })
  .strict()
  .refine((value) => value.account_id !== undefined || value.account_code !== undefined, {
    message: 'يرجى تحديد حساب صالح لعرض دفتر الأستاذ',
  });

export const parseGeneralLedgerFilters = (input: unknown) => {
  const result = filters.safeParse(input);
  if (!result.success) {
    throw new AppError(
      'بيانات تصفية دفتر الأستاذ غير صالحة: تحقق من الحساب والمخزن والتواريخ',
      400,
      'VALIDATION_ERROR',
    );
  }
  return {
    ...result.data,
    ...parseReportPeriod(
      { from_date: result.data.from_date, to_date: result.data.to_date },
      'trial',
    ),
  };
};
