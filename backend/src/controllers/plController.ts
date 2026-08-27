import * as plService from '../services/plService.ts';
import { AppError } from '../types/errors.ts';
import { ok, wrap } from './helper.ts';

export const pl = {
  /**
   * GET /reports/pl/monthly?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
   * تقرير الربح والخسارة لفترة محددة
   */
  report: wrap(async (req, res) => {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) {
      throw new AppError('from_date و to_date مطلوبان', 400);
    }
    ok(res, await plService.getProfitAndLoss(from_date, to_date));
  }),

  /**
   * GET /reports/pl/trend?months=6
   * ملخص شهري لآخر N شهور (للرسم البياني)
   */
  trend: wrap(async (req, res) => {
    const months = Math.min(Number(req.query.months) || 6, 24);
    ok(res, await plService.getMonthlyPLSummary(months));
  }),
};
