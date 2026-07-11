import * as quotePdfService from '../services/quotePdfService.js';
import * as userService from '../services/userService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ok } from './helper.js';

export const quotes = {
  template: async (req, res, next) => {
    try {
      if (req.method === 'GET') {
        ok(res, await userService.getSetting('quote_template') || { items: [] });
        return;
      }
      const template = {
        items: Array.isArray(req.body?.items) ? req.body.items : [],
      };
      await userService.upsertSetting('quote_template', template, req.user.id, 'قالب البنود الثابتة لعرض السعر');
      ok(res, template, 'تم حفظ قالب عرض السعر');
    } catch (e) {
      next(e);
    }
  },
  pdf: async (req, res, next) => {
    try {
      const { buffer, quoteNumber } = await quotePdfService.generateQuotePdf(req.body);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="quote-${quoteNumber}.pdf"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
};
