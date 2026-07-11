import * as forecastingService from '../services/forecastingService.js';
import * as marketBasketService from '../services/marketBasketService.js';
import * as aiCopilotService from '../services/aiCopilotService.js';
import * as staffingForecastService from '../services/staffingForecastService.js';
import * as dynamicPricingService from '../services/dynamicPricingService.js';
import * as expenseService from '../services/expenseService.js';
import * as cashFlowProjectionService from '../services/cashFlowProjectionService.js';
import { ok } from './helper.js';

export const forecasting = {
  getDemandForecast: async (req, res, next) => {
    try {
      const data = await forecastingService.getDemandForecast(req.query);
      ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getBasketAssociations: async (req, res, next) => {
    try {
      const data = await marketBasketService.getMarketBasketRecommendations(req.query);
      ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  askCopilot: async (req, res, next) => {
    try {
      const { prompt, history } = req.body;
      const data = await aiCopilotService.askCopilot(prompt, history || []);
      ok(res, { reply: data });
    } catch (e) {
      next(e);
    }
  },

  getStaffingForecast: async (req, res, next) => {
    try {
      const data = await staffingForecastService.getStaffingForecast(req.query);
      ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getSmartPricingAlerts: async (req, res, next) => {
    try {
      const data = await dynamicPricingService.getSmartPricingAlerts();
      ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  getCashFlowProjection: async (req, res, next) => {
    try {
      const data = await cashFlowProjectionService.getCashFlowProjection(req.query);
      ok(res, data);
    } catch (e) {
      next(e);
    }
  },

  suggestExpenseCategory: async (req, res, next) => {
    try {
      const { title } = req.query;
      const data = await expenseService.suggestCategory(title);
      ok(res, data);
    } catch (e) {
      next(e);
    }
  }
};
