import * as plService from '../services/plService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ok } from './helper.js';

export const pl = {
  /**
   * GET /reports/pl/monthly?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
   * تقرير الربح والخسارة لفترة محددة
   */
  report: async (req, res, next) => {
    try {
      const { from_date, to_date } = req.query;
      if (!from_date || !to_date) {
        throw new AppError('from_date و to_date مطلوبان', 400);
      }
      ok(res, await plService.getProfitAndLoss(from_date, to_date));
    } catch (e) { next(e); }
  },

  /**
   * GET /reports/pl/trend?months=6
   * ملخص شهري لآخر N شهور (للرسم البياني)
   */
  trend: async (req, res, next) => {
    try {
      const months = Math.min(Number(req.query.months) || 6, 24);
      ok(res, await plService.getMonthlyPLSummary(months));
    } catch (e) { next(e); }
  },
};
