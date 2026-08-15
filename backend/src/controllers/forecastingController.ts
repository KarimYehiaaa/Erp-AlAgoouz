import * as forecastingService from '../services/forecastingService.ts';
import * as marketBasketService from '../services/marketBasketService.ts';
import * as aiCopilotService from '../services/aiCopilotService.ts';
import * as staffingForecastService from '../services/staffingForecastService.ts';
import * as dynamicPricingService from '../services/dynamicPricingService.ts';
import * as expenseService from '../services/expenseService.ts';
import * as cashFlowProjectionService from '../services/cashFlowProjectionService.ts';
import { ok } from './helper.ts';

export const forecasting = {
  /**
   * توقع الطلب المستقبلي على المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getDemandForecast: async (req, res, next) => {
    try {
      const data = await forecastingService.getDemandForecast(req.query);
      ok(res, data);
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * تحليل ارتباطات سلة المشتريات (منتجات تُشترى معًا).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getBasketAssociations: async (req, res, next) => {
    try {
      const data = await marketBasketService.getMarketBasketRecommendations(req.query);
      ok(res, data);
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * سؤال المساعد الذكي (AI) مع سياق المحادثة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  askCopilot: async (req, res, next) => {
    try {
      const { prompt, history } = req.body;
      const data = await aiCopilotService.askCopilot(prompt, history || []);
      ok(res, { reply: data });
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * توقع احتياج الموظفين حسب حجم العمل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getStaffingForecast: async (req, res, next) => {
    try {
      const data = await staffingForecastService.getStaffingForecast(req.query);
      ok(res, data);
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * تنبيهات التسعير الذكي للمنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getSmartPricingAlerts: async (req, res, next) => {
    try {
      const data = await dynamicPricingService.getSmartPricingAlerts();
      ok(res, data);
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * توقع التدفق النقدي المستقبلي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getCashFlowProjection: async (req, res, next) => {
    try {
      const data = await cashFlowProjectionService.getCashFlowProjection(req.query);
      ok(res, data);
    } catch (e: any) {
      next(e);
    }
  },

  /**
   * اقتراح تصنيف مصروف بناءً على الوصف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  suggestExpenseCategory: async (req, res, next) => {
    try {
      const { title } = req.query;
      const data = await expenseService.suggestCategory(title);
      ok(res, data);
    } catch (e: any) {
      next(e);
    }
  },
};
