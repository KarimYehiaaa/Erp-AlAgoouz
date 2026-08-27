import * as quotePdfService from '../services/quotePdfService.ts';
import * as userService from '../services/userService.ts';
import { ok, wrap } from './helper.ts';

export const quotes = {
  /**
   * جلب أو حفظ قالب البنود الثابتة لعرض السعر.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  template: wrap(async (req, res) => {
    if (req.method === 'GET') {
      ok(res, (await userService.getSetting('quote_template')) || { items: [] });
      return;
    }
    const template = {
      items: Array.isArray(req.body?.items) ? req.body.items : [],
    };
    await userService.upsertSetting(
      'quote_template',
      template,
      req.user.id,
      'قالب البنود الثابتة لعرض السعر',
    );
    ok(res, template, 'تم حفظ قالب عرض السعر');
  }),
  /**
   * توليد وتنزيل PDF لعرض السعر.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  pdf: wrap(async (req, res) => {
    const { buffer, quoteNumber } = await quotePdfService.generateQuotePdf(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${quoteNumber}.pdf"`);
    res.send(buffer);
  }),
};
