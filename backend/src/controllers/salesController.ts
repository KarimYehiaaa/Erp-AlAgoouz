// @ts-nocheck
import * as salesService from '../services/salesService.js';
import * as openingBalanceService from '../services/openingBalanceService.js';
import * as salesExcelService from '../services/salesExcelService.js';
import * as branchSalesExcelService from '../services/branchSalesExcelService.js';
import { AppError } from '../types/errors.js';
import { ok } from './helper.js';

export const sales = {
  list: async (req: any, res: any, next: any) => { 
    try { 
      const result = await salesService.getSales(req.query);
      ok(res, result.data, undefined, result.meta); 
    } catch (e) { next(e); } 
  },
  summary: async (req: any, res: any, next: any) => { try { ok(res, await salesService.getSalesSummary(req.query)); } catch (e) { next(e); } },
  openingBalance: async (req: any, res: any, next: any) => {
    try { ok(res, await openingBalanceService.getOpeningBalance(req.query.from_date, req.query.to_date)); } catch (e) { next(e); }
  },
  saveOpeningBalance: async (req: any, res: any, next: any) => {
    try { ok(res, await openingBalanceService.saveOpeningBalance(req.body, req.user.id), 'تم حفظ بداية المدة بنجاح'); } catch (e) { next(e); }
  },
  get: async (req: any, res: any, next: any) => { try { ok(res, await salesService.getSaleById(req.params.id)); } catch (e) { next(e); } },
  create: async (req: any, res: any, next: any) => {
    try { ok(res, await salesService.createDailySale(req.body, req.user.id), 'تم إنشاء عملية البيع بنجاح'); } catch (e) { next(e); }
  },
  update: async (req: any, res: any, next: any) => {
    try { ok(res, await salesService.updateSale(req.params.id, req.body, req.user.id), 'تم تحديث الفاتورة بنجاح'); } catch (e) { next(e); }
  },
  return: async (req: any, res: any, next: any) => {
    try { ok(res, await salesService.returnSale(req.params.id, req.user.id, req.body.notes), 'تمت عملية المرتجع بنجاح'); } catch (e) { next(e); }
  },
  deleteAll: async (req: any, res: any, next: any) => {
    try {
      const data = await salesService.deleteAllSales(req.user.id);
      ok(res, data, `تم حذف ${data.deletedCount} سجلات بنجاح`);
    } catch (e) { next(e); }
  },
  deleteByDate: async (req: any, res: any, next: any) => {
    try {
      const saleDate = req.params.saleDate;
      const data = await salesService.deleteSalesByDate(saleDate, req.user.id);
      ok(res, data, `تم حذف ${data.deletedCount} سجلات من تاريخ ${saleDate} بنجاح`);
    } catch (e) { next(e); }
  },
  deleteByType: async (req: any, res: any, next: any) => {
    try {
      const data = await salesService.deleteSalesByType(req.params.saleType, req.user.id);
      const label = data.saleType === 'branch' ? 'الفرع' : 'الجملة';
      ok(res, data, `تم حذف ${data.deletedCount} سجل من مبيعات ${label} بنجاح`);
    } catch (e) { next(e); }
  },
  template: async (_req: any, res: any, next: any) => {
    try {
      const buf = salesExcelService.buildImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="bin-al-ajouz-sales-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  branchTemplate: async (_req: any, res: any, next: any) => {
    try {
      const buf = await branchSalesExcelService.buildBranchTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="branch-sales-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  branchValidateExcel: async (req: any, res: any, next: any) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, await branchSalesExcelService.validateBranchExcel(req.file.buffer), 'تم فحص الملف');
    } catch (e) { next(e); }
  },
  branchImportExcel: async (req: any, res: any, next: any) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, await branchSalesExcelService.importBranchExcel(req.file.buffer, req.user.id), 'تم الاستيراد');
    } catch (e) { next(e); }
  },
  importExcel: async (req: any, res: any, next: any) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      const result = await salesExcelService.importFromExcel(req.file.buffer, req.user.id, { confirm: req.body?.confirm });
      ok(res, result, `تم استيراد المبيعات بنجاح`);
    } catch (e) { next(e); }
  },
  validateExcel: async (req: any, res: any, next: any) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, salesExcelService.validateSalesExcel(req.file.buffer), 'تم التحقق من ملف المبيعات بنجاح');
    } catch (e) { next(e); }
  },
};
