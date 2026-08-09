// @ts-nocheck
import * as inventoryService from '../services/inventoryService.js';
import * as inventoryExcelService from '../services/inventoryExcelService.js';
import { AppError } from '../types/errors.js';
import { ok } from './helper.js';

export const inventory = {
  list: async (req: any, res: any, next: any) => { try { ok(res, await inventoryService.getInventory(req.query.warehouse_id)); } catch (e) { next(e); } },
  movements: async (req: any, res: any, next: any) => { try { ok(res, await inventoryService.getStockMovements(req.query)); } catch (e) { next(e); } },
  transfer: async (req: any, res: any, next: any) => { try { ok(res, await inventoryService.transferStock(req.body, req.user.id)); } catch (e) { next(e); } },
  adjust: async (req: any, res: any, next: any) => { try { ok(res, await inventoryService.adjustStock(req.body, req.user.id)); } catch (e) { next(e); } },
  clearAll: async (req: any, res: any, next: any) => {
    try {
      const data = await inventoryService.clearAllInventoryData(req.user.id);
      ok(res, data, 'تم حذف بيانات المخزون بالكامل');
    } catch (e) { next(e); }
  },
  warehouses: async (req: any, res: any, next: any) => { try { ok(res, await inventoryService.getWarehouses()); } catch (e) { next(e); } },
  returnTemplate: async (req: any, res: any, next: any) => {
    try {
      const buf = await inventoryExcelService.buildReturnTemplate(req.query.warehouse_id || null);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-return-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  validateReturnExcel: async (req: any, res: any, next: any) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, await inventoryExcelService.validateReturnExcel(req.file.buffer), 'تم فحص الملف');
    } catch (e) { next(e); }
  },
  importReturnExcel: async (req: any, res: any, next: any) => {
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
