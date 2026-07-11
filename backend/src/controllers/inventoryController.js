import * as inventoryService from '../services/inventoryService.js';
import * as inventoryExcelService from '../services/inventoryExcelService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ok } from './helper.js';

export const inventory = {
  list: async (req, res, next) => { try { ok(res, await inventoryService.getInventory(req.query.warehouse_id)); } catch (e) { next(e); } },
  movements: async (req, res, next) => { try { ok(res, await inventoryService.getStockMovements(req.query)); } catch (e) { next(e); } },
  transfer: async (req, res, next) => { try { ok(res, await inventoryService.transferStock(req.body, req.user.id)); } catch (e) { next(e); } },
  adjust: async (req, res, next) => { try { ok(res, await inventoryService.adjustStock(req.body, req.user.id)); } catch (e) { next(e); } },
  clearAll: async (req, res, next) => {
    try {
      const data = await inventoryService.clearAllInventoryData(req.user.id);
      ok(res, data, 'تم حذف بيانات المخزون بالكامل');
    } catch (e) { next(e); }
  },
  warehouses: async (req, res, next) => { try { ok(res, await inventoryService.getWarehouses()); } catch (e) { next(e); } },
  returnTemplate: async (req, res, next) => {
    try {
      const buf = await inventoryExcelService.buildReturnTemplate(req.query.warehouse_id || null);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-return-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  validateReturnExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, await inventoryExcelService.validateReturnExcel(req.file.buffer), 'تم فحص الملف');
    } catch (e) { next(e); }
  },
  importReturnExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id || null;
      const result = await inventoryExcelService.importReturnFromExcel(req.file.buffer, req.user.id, warehouseId);
      if (!result.success) {
        throw new AppError(result.failed?.[0]?.message || 'لم يتم تطبيق أي صف صالح من ملف الاسترداد', 400);
      }
      ok(res, result, `تم استرداد ${result.success} منتج بنجاح`);
    } catch (e) { next(e); }
  },
};
