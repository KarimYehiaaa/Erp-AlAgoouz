import * as inventoryService from "../services/inventoryService.js";
import * as inventoryExcelService from "../services/inventoryExcelService.js";
import { AppError } from "../types/errors.js";
import { ok } from "./helper.js";
const inventory = {
  list: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getInventory(req.query.warehouse_id));
    } catch (e) {
      next(e);
    }
  },
  movements: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getStockMovements(req.query));
    } catch (e) {
      next(e);
    }
  },
  transfer: async (req, res, next) => {
    try {
      ok(res, await inventoryService.transferStock(req.body, req.user.id));
    } catch (e) {
      next(e);
    }
  },
  adjust: async (req, res, next) => {
    try {
      ok(res, await inventoryService.adjustStock(req.body, req.user.id));
    } catch (e) {
      next(e);
    }
  },
  clearAll: async (req, res, next) => {
    try {
      const data = await inventoryService.clearAllInventoryData(req.user.id);
      ok(res, data, "\u062A\u0645 \u062D\u0630\u0641 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0628\u0627\u0644\u0643\u0627\u0645\u0644");
    } catch (e) {
      next(e);
    }
  },
  warehouses: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getWarehouses());
    } catch (e) {
      next(e);
    }
  },
  returnTemplate: async (req, res, next) => {
    try {
      const buf = await inventoryExcelService.buildReturnTemplate(req.query.warehouse_id || null);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="inventory-return-template.xlsx"');
      res.send(buf);
    } catch (e) {
      next(e);
    }
  },
  validateReturnExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError("\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel", 400);
      ok(res, await inventoryExcelService.validateReturnExcel(req.file.buffer), "\u062A\u0645 \u0641\u062D\u0635 \u0627\u0644\u0645\u0644\u0641");
    } catch (e) {
      next(e);
    }
  },
  importReturnExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError("\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel", 400);
      const warehouseId = req.body?.warehouse_id || req.query?.warehouse_id || null;
      const result = await inventoryExcelService.importReturnFromExcel(req.file.buffer, req.user.id, warehouseId);
      if (!result.success) {
        throw new AppError(result.failed?.[0]?.message || "\u0644\u0645 \u064A\u062A\u0645 \u062A\u0637\u0628\u064A\u0642 \u0623\u064A \u0635\u0641 \u0635\u0627\u0644\u062D \u0645\u0646 \u0645\u0644\u0641 \u0627\u0644\u0627\u0633\u062A\u0631\u062F\u0627\u062F", 400);
      }
      ok(res, result, `\u062A\u0645 \u0627\u0633\u062A\u0631\u062F\u0627\u062F ${result.success} \u0645\u0646\u062A\u062C \u0628\u0646\u062C\u0627\u062D`);
    } catch (e) {
      next(e);
    }
  }
};
export {
  inventory
};
