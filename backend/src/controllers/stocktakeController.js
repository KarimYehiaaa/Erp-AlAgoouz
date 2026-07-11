import * as stocktakeService from '../services/stocktakeService.js';
import { ok } from './helper.js';

export const stocktake = {
  list: async (_req, res, next) => {
    try {
      ok(res, await stocktakeService.getStocktakeList());
    } catch (e) { next(e); }
  },
  get: async (req, res, next) => {
    try {
      ok(res, await stocktakeService.getStocktakeDetails(req.params.id));
    } catch (e) { next(e); }
  },
  create: async (req, res, next) => {
    try {
      const { warehouse_id, notes } = req.body;
      ok(res, await stocktakeService.createStocktake(warehouse_id, req.user.id, notes), 'تم بدء مسودة جرد جديدة');
    } catch (e) { next(e); }
  },
  updateItems: async (req, res, next) => {
    try {
      ok(res, await stocktakeService.updateStocktakeItems(req.params.id, req.body), 'تم حفظ مسودة الجرد');
    } catch (e) { next(e); }
  },
  complete: async (req, res, next) => {
    try {
      ok(res, await stocktakeService.completeStocktake(req.params.id, req.user.id), 'تم اعتماد الجرد وتسوية الفروقات');
    } catch (e) { next(e); }
  },
  delete: async (req, res, next) => {
    try {
      ok(res, await stocktakeService.deleteStocktake(req.params.id), 'تم حذف مسودة الجرد بنجاح');
    } catch (e) { next(e); }
  }
};
