import * as forecastingService from '../services/forecastingService.ts';
import * as marketBasketService from '../services/marketBasketService.ts';
import * as aiCopilotService from '../services/aiCopilotService.ts';
import * as staffingForecastService from '../services/staffingForecastService.ts';
import * as dynamicPricingService from '../services/dynamicPricingService.ts';
import * as expenseService from '../services/expenseService.ts';
import * as cashFlowProjectionService from '../services/cashFlowProjectionService.ts';
import { ok, wrap } from './helper.ts';

export const forecasting = {
  /**
   * توقع الطلب المستقبلي على المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getDemandForecast: wrap(async (req, res) => {
    const data = await forecastingService.getDemandForecast(req.query);
    ok(res, data);
  }),

  /**
   * تحليل ارتباطات سلة المشتريات (منتجات تُشترى معًا).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getBasketAssociations: wrap(async (req, res) => {
    const data = await marketBasketService.getMarketBasketRecommendations(req.query);
    ok(res, data);
  }),

  /**
   * سؤال المساعد الذكي (AI) مع سياق المحادثة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  askCopilot: wrap(async (req, res) => {
    const { prompt, history } = req.body;
    const data = await aiCopilotService.askCopilot(prompt, history || []);
    ok(res, { reply: data });
  }),

  /**
   * توقع احتياج الموظفين حسب حجم العمل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getStaffingForecast: wrap(async (req, res) => {
    const data = await staffingForecastService.getStaffingForecast(req.query);
    ok(res, data);
  }),

  /**
   * تنبيهات التسعير الذكي للمنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getSmartPricingAlerts: wrap(async (req, res) => {
    const data = await dynamicPricingService.getSmartPricingAlerts();
    ok(res, data);
  }),

  /**
   * توقع التدفق النقدي المستقبلي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getCashFlowProjection: wrap(async (req, res) => {
    const data = await cashFlowProjectionService.getCashFlowProjection(req.query);
    ok(res, data);
  }),

  /**
   * اقتراح تصنيف مصروف بناءً على الوصف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  suggestExpenseCategory: wrap(async (req, res) => {
    const { title } = req.query;
    const data = await expenseService.suggestCategory(title);
    ok(res, data);
  }),
};
