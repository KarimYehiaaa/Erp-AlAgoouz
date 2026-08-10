import * as salesService from "../services/salesService.js";
import * as openingBalanceService from "../services/openingBalanceService.js";
import * as salesExcelService from "../services/salesExcelService.js";
import * as branchSalesExcelService from "../services/branchSalesExcelService.js";
import { AppError } from "../types/errors.js";
import { ok } from "./helper.js";
const sales = {
  list: async (req, res, next) => {
    try {
      const result = await salesService.getSales(req.query);
      ok(res, result.data, void 0, result.meta);
    } catch (e) {
      next(e);
    }
  },
  summary: async (req, res, next) => {
    try {
      ok(res, await salesService.getSalesSummary(req.query));
    } catch (e) {
      next(e);
    }
  },
  openingBalance: async (req, res, next) => {
    try {
      ok(res, await openingBalanceService.getOpeningBalance(req.query.from_date, req.query.to_date));
    } catch (e) {
      next(e);
    }
  },
  saveOpeningBalance: async (req, res, next) => {
    try {
      ok(res, await openingBalanceService.saveOpeningBalance(req.body, req.user.id), "\u062A\u0645 \u062D\u0641\u0638 \u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0645\u062F\u0629 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  get: async (req, res, next) => {
    try {
      ok(res, await salesService.getSaleById(req.params.id));
    } catch (e) {
      next(e);
    }
  },
  create: async (req, res, next) => {
    try {
      ok(res, await salesService.createDailySale(req.body, req.user.id), "\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  update: async (req, res, next) => {
    try {
      ok(res, await salesService.updateSale(req.params.id, req.body, req.user.id), "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  return: async (req, res, next) => {
    try {
      ok(res, await salesService.returnSale(req.params.id, req.user.id, req.body.notes), "\u062A\u0645\u062A \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0645\u0631\u062A\u062C\u0639 \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  },
  deleteAll: async (req, res, next) => {
    try {
      const data = await salesService.deleteAllSales(req.user.id);
      ok(res, data, `\u062A\u0645 \u062D\u0630\u0641 ${data.deletedCount} \u0633\u062C\u0644\u0627\u062A \u0628\u0646\u062C\u0627\u062D`);
    } catch (e) {
      next(e);
    }
  },
  deleteByDate: async (req, res, next) => {
    try {
      const saleDate = req.params.saleDate;
      const data = await salesService.deleteSalesByDate(saleDate, req.user.id);
      ok(res, data, `\u062A\u0645 \u062D\u0630\u0641 ${data.deletedCount} \u0633\u062C\u0644\u0627\u062A \u0645\u0646 \u062A\u0627\u0631\u064A\u062E ${saleDate} \u0628\u0646\u062C\u0627\u062D`);
    } catch (e) {
      next(e);
    }
  },
  deleteByType: async (req, res, next) => {
    try {
      const data = await salesService.deleteSalesByType(req.params.saleType, req.user.id);
      const label = data.saleType === "branch" ? "\u0627\u0644\u0641\u0631\u0639" : "\u0627\u0644\u062C\u0645\u0644\u0629";
      ok(res, data, `\u062A\u0645 \u062D\u0630\u0641 ${data.deletedCount} \u0633\u062C\u0644 \u0645\u0646 \u0645\u0628\u064A\u0639\u0627\u062A ${label} \u0628\u0646\u062C\u0627\u062D`);
    } catch (e) {
      next(e);
    }
  },
  template: async (_req, res, next) => {
    try {
      const buf = salesExcelService.buildImportTemplate();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="bin-al-ajouz-sales-template.xlsx"');
      res.send(buf);
    } catch (e) {
      next(e);
    }
  },
  branchTemplate: async (_req, res, next) => {
    try {
      const buf = await branchSalesExcelService.buildBranchTemplate();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="branch-sales-template.xlsx"');
      res.send(buf);
    } catch (e) {
      next(e);
    }
  },
  branchValidateExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError("\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel", 400);
      ok(res, await branchSalesExcelService.validateBranchExcel(req.file.buffer), "\u062A\u0645 \u0641\u062D\u0635 \u0627\u0644\u0645\u0644\u0641");
    } catch (e) {
      next(e);
    }
  },
  branchImportExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError("\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel", 400);
      ok(res, await branchSalesExcelService.importBranchExcel(req.file.buffer, req.user.id), "\u062A\u0645 \u0627\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F");
    } catch (e) {
      next(e);
    }
  },
  importExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError("\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel", 400);
      const result = await salesExcelService.importFromExcel(req.file.buffer, req.user.id, { confirm: req.body?.confirm });
      ok(res, result, `\u062A\u0645 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0628\u0646\u062C\u0627\u062D`);
    } catch (e) {
      next(e);
    }
  },
  validateExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError("\u064A\u062C\u0628 \u0631\u0641\u0639 \u0645\u0644\u0641 Excel", 400);
      ok(res, salesExcelService.validateSalesExcel(req.file.buffer), "\u062A\u0645 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0645\u0644\u0641 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0628\u0646\u062C\u0627\u062D");
    } catch (e) {
      next(e);
    }
  }
};
export {
  sales
};
