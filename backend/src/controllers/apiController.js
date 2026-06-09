import * as dashboardService from '../services/dashboardService.js';
import * as salesService from '../services/salesService.js';
import * as productService from '../services/productService.js';
import * as inventoryService from '../services/inventoryService.js';
import * as inventoryExcelService from '../services/inventoryExcelService.js';
import * as customerService from '../services/customerService.js';
import * as expenseService from '../services/expenseService.js';
import * as supplierService from '../services/supplierService.js';
import * as invoiceService from '../services/invoiceService.js';
import * as purchaseService from '../services/purchaseService.js';
import * as costsService from '../services/costsService.js';
import * as recipesService from '../services/recipesService.js';
import * as invoicePdfService from '../services/invoicePdfService.js';
import * as quotePdfService from '../services/quotePdfService.js';
import * as userService from '../services/userService.js';
import * as salesExcelService from '../services/salesExcelService.js';
import * as branchSalesExcelService from '../services/branchSalesExcelService.js';
import * as productsExcelService from '../services/productsExcelService.js';
import * as backupService from '../services/backupService.js';
import * as openingBalanceService from '../services/openingBalanceService.js';
import * as plService from '../services/plService.js';
import { AppError } from '../middleware/errorHandler.js';
import fs from 'fs/promises';
import path from 'path';

const ok = (res, data, message) => res.json({ success: true, data, message });

export const dashboard = async (req, res, next) => {
  try { ok(res, await dashboardService.getDashboardStats(req.query)); } catch (e) { next(e); }
};

export const sales = {
  list: async (req, res, next) => { try { ok(res, await salesService.getSales(req.query)); } catch (e) { next(e); } },
  summary: async (req, res, next) => { try { ok(res, await salesService.getSalesSummary(req.query)); } catch (e) { next(e); } },
  openingBalance: async (req, res, next) => {
    try { ok(res, await openingBalanceService.getOpeningBalance(req.query.from_date, req.query.to_date)); } catch (e) { next(e); }
  },
  saveOpeningBalance: async (req, res, next) => {
    try { ok(res, await openingBalanceService.saveOpeningBalance(req.body, req.user.id), 'تم حفظ بداية المدة بنجاح'); } catch (e) { next(e); }
  },
  get: async (req, res, next) => { try { ok(res, await salesService.getSaleById(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => {
    try { ok(res, await salesService.createDailySale(req.body, req.user.id), 'تم إنشاء عملية البيع بنجاح'); } catch (e) { next(e); }
  },
  update: async (req, res, next) => {
    try { ok(res, await salesService.updateSale(req.params.id, req.body, req.user.id), 'تم تحديث الفاتورة بنجاح'); } catch (e) { next(e); }
  },
  return: async (req, res, next) => {
    try { ok(res, await salesService.returnSale(req.params.id, req.user.id, req.body.notes), 'تمت عملية المرتجع بنجاح'); } catch (e) { next(e); }
  },
  deleteAll: async (req, res, next) => {
    try {
      const data = await salesService.deleteAllSales(req.user.id);
      ok(res, data, `تم حذف ${data.deletedCount} سجلات بنجاح`);
    } catch (e) { next(e); }
  },
  deleteByDate: async (req, res, next) => {
    try {
      const saleDate = req.params.saleDate;
      const data = await salesService.deleteSalesByDate(saleDate, req.user.id);
      ok(res, data, `تم حذف ${data.deletedCount} سجلات من تاريخ ${saleDate} بنجاح`);
    } catch (e) { next(e); }
  },
  deleteByType: async (req, res, next) => {
    try {
      const data = await salesService.deleteSalesByType(req.params.saleType, req.user.id);
      const label = data.saleType === 'branch' ? 'الفرع' : 'الجملة';
      ok(res, data, `تم حذف ${data.deletedCount} سجل من مبيعات ${label} بنجاح`);
    } catch (e) { next(e); }
  },
  template: async (_req, res, next) => {
    try {
      const buf = salesExcelService.buildImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="bin-al-ajouz-sales-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  branchTemplate: async (_req, res, next) => {
    try {
      const buf = await branchSalesExcelService.buildBranchTemplate(2);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="branch-sales-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  branchValidateExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, await branchSalesExcelService.validateBranchExcel(req.file.buffer), 'تم فحص الملف');
    } catch (e) { next(e); }
  },
  branchImportExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, await branchSalesExcelService.importBranchExcel(req.file.buffer, req.user.id), 'تم الاستيراد');
    } catch (e) { next(e); }
  },
  importExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      const result = await salesExcelService.importFromExcel(req.file.buffer, req.user.id, { confirm: req.body?.confirm });
      ok(res, result, `تم استيراد المبيعات بنجاح`);
    } catch (e) { next(e); }
  },
  validateExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      ok(res, salesExcelService.validateSalesExcel(req.file.buffer), 'تم التحقق من ملف المبيعات بنجاح');
    } catch (e) { next(e); }
  },
};

export const products = {
  list: async (req, res, next) => { try { ok(res, await productService.getProducts(req.query)); } catch (e) { next(e); } },
  branchProducts: async (req, res, next) => { try { ok(res, await productService.getBranchProducts(req.query)); } catch (e) { next(e); } },
  costsReport: async (req, res, next) => { try { ok(res, await productService.getCostsReport(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { ok(res, await productService.getProductById(req.params.id)); } catch (e) { next(e); } },
  nextSku: async (_req, res, next) => { try { ok(res, await productService.getNextProductSku()); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await productService.createProduct(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await productService.updateProduct(req.params.id, req.body)); } catch (e) { next(e); } },
  setWarehouse: async (req, res, next) => {
    try { ok(res, await productService.setProductWarehouse(req.params.id, req.body?.warehouse_id), 'Warehouse updated'); } catch (e) { next(e); }
  },
  delete: async (req, res, next) => { try { await productService.deleteProduct(req.params.id); ok(res, null, 'تم حذف المنتج'); } catch (e) { next(e); } },
  deleteAll: async (req, res, next) => {
    try {
      const data = await productService.deleteAllProducts();
      ok(res, data, `تم حذف ${data.deletedCount} منتجات بنجاح`);
    } catch (e) { next(e); }
  },
  categories: async (req, res, next) => { try { ok(res, await productService.getCategories()); } catch (e) { next(e); } },
  createCategory: async (req, res, next) => { try { ok(res, await productService.createCategory(req.body)); } catch (e) { next(e); } },
  updateCategory: async (req, res, next) => { try { ok(res, await productService.updateCategory(req.params.id, req.body)); } catch (e) { next(e); } },
  deleteCategory: async (req, res, next) => { try { ok(res, await productService.deleteCategory(req.params.id), 'تم حذف التصنيف'); } catch (e) { next(e); } },
  units: async (req, res, next) => { try { ok(res, await productService.getUnits()); } catch (e) { next(e); } },
  createUnit: async (req, res, next) => { try { ok(res, await productService.createUnit(req.body)); } catch (e) { next(e); } },
  updateUnit: async (req, res, next) => { try { ok(res, await productService.updateUnit(req.params.id, req.body)); } catch (e) { next(e); } },
  deleteUnit: async (req, res, next) => { try { ok(res, await productService.deleteUnit(req.params.id), 'تم حذف الوحدة'); } catch (e) { next(e); } },
  returnStock: async (req, res, next) => {
    try { ok(res, await inventoryService.returnProductToStock(req.body, req.user.id), 'تمت عملية إرجاع المنتج للمخزن'); } catch (e) { next(e); }
  },
  returns: async (req, res, next) => {
    try { ok(res, await inventoryService.getProductReturns(req.query)); } catch (e) { next(e); }
  },
  template: async (_req, res, next) => {
    try {
      const buf = productsExcelService.buildProductsTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="bin-al-ajouz-products-template.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  export: async (_req, res, next) => {
    try {
      const buf = await productsExcelService.exportProductsToExcel();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="bin-al-ajouz-products-export.xlsx"');
      res.send(buf);
    } catch (e) { next(e); }
  },
  importExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      const result = await productsExcelService.importProductsFromExcel(req.file.buffer);
      ok(res, result, `تم استيراد المنتجات بنجاح: تم إنشاء ${result.created} وتحديث ${result.updated}`);
    } catch (e) { next(e); }
  },
};

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

export const costs = {
  listRecipes: async (_req, res, next) => { try { ok(res, await costsService.getRecipes()); } catch (e) { next(e); } },
  getRecipe: async (req, res, next) => { try { ok(res, await costsService.getRecipeById(req.params.id)); } catch (e) { next(e); } },
  createRecipe: async (req, res, next) => { try { ok(res, await costsService.createRecipe(req.body, req.user.id), 'تم إنشاء الوصفة بنجاح'); } catch (e) { next(e); } },
  updateRecipe: async (req, res, next) => { try { ok(res, await costsService.updateRecipe(req.params.id, req.body), 'تم تحديث الوصفة بنجاح'); } catch (e) { next(e); } },
  deleteRecipe: async (req, res, next) => { try { await costsService.deleteRecipe(req.params.id); ok(res, null, 'تم حذف الوصفة بنجاح'); } catch (e) { next(e); } },
  produceRecipe: async (req, res, next) => {
    try {
      ok(
        res,
        await recipesService.produceRecipeBatch(
          {
            recipeId: req.params.id,
            quantity: req.body?.quantity,
            warehouseId: req.body?.warehouse_id,
            notes: req.body?.notes,
            mode: req.body?.mode,
          },
          req.user.id
        ),
        'تم إنتاج الدفعة بنجاح'
      );
    } catch (e) { next(e); }
  },
  listProductions: async (req, res, next) => {
    try { ok(res, await recipesService.listProductionBatches(req.query)); } catch (e) { next(e); }
  },
  reverseProduction: async (req, res, next) => {
    try {
      const movementId = Number(req.params.movementId);
      const reverseQty = req.body?.reverse_qty ? Number(req.body.reverse_qty) : undefined;
      ok(
        res,
        await recipesService.reverseProductionBatch(movementId, req.user.id, { reverseQty }),
        'تم عكس عملية الإنتاج بنجاح'
      );
    } catch (e) { next(e); }
  },
};

export const customers = {
  list: async (req, res, next) => { try { ok(res, await customerService.getCustomers(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { ok(res, await customerService.getCustomerById(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await customerService.createCustomer(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await customerService.updateCustomer(req.params.id, req.body)); } catch (e) { next(e); } },
  delete: async (req, res, next) => { try { await customerService.deleteCustomer(req.params.id); ok(res, null); } catch (e) { next(e); } },
  statement: async (req, res, next) => { try { ok(res, await customerService.getCustomerStatement(req.params.id)); } catch (e) { next(e); } },
  recordPayment: async (req, res, next) => {
    try {
      ok(res, await customerService.recordPayment(req.params.id, { ...req.body, user_id: req.user.id }), 'تم تسجيل الدفعة بنجاح');
    } catch (e) { next(e); }
  },
  recordSalePayment: async (req, res, next) => {
    try {
      ok(res, await customerService.recordSalePayment(req.params.saleId, { ...req.body, user_id: req.user.id }), 'تم تسجيل الدفعة بنجاح');
    } catch (e) { next(e); }
  },
};

export const expenses = {
  list: async (req, res, next) => { try { ok(res, await expenseService.getExpenses(req.query)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await expenseService.createExpense(req.body, req.user.id)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await expenseService.updateExpense(req.params.id, req.body)); } catch (e) { next(e); } },
  categories: async (req, res, next) => { try { ok(res, await expenseService.getCategories()); } catch (e) { next(e); } },
  report: async (req, res, next) => { try { ok(res, await expenseService.getExpenseReport(req.query.year, req.query.month)); } catch (e) { next(e); } },
  delete: async (req, res, next) => { try { await expenseService.deleteExpense(req.params.id); ok(res, null); } catch (e) { next(e); } },
};

export const suppliers = {
  list: async (req, res, next) => { try { ok(res, await supplierService.getSuppliers()); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { ok(res, await supplierService.getSupplierById(req.params.id)); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await supplierService.createSupplier(req.body, req.user.id)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await supplierService.updateSupplier(req.params.id, req.body, req.user.id)); } catch (e) { next(e); } },
  delete: async (req, res, next) => { try { ok(res, await supplierService.deleteSupplier(req.params.id, req.user.id), 'تم الحذف'); } catch (e) { next(e); } },
  invoices: async (req, res, next) => { try { ok(res, await supplierService.getSupplierInvoices(req.params.id)); } catch (e) { next(e); } },
};

export const invoices = {
  list: async (req, res, next) => { try { ok(res, await invoiceService.getInvoices(req.query)); } catch (e) { next(e); } },
  create: async (req, res, next) => {
    try { ok(res, await invoiceService.createInvoice(req.body, req.user.id), 'تم إنشاء الفاتورة بنجاح'); } catch (e) { next(e); }
  },
  get: async (req, res, next) => { try { ok(res, await invoiceService.getInvoiceById(req.params.id)); } catch (e) { next(e); } },
  update: async (req, res, next) => {
    try { ok(res, await invoiceService.updateInvoice(req.params.id, req.body, req.user.id), 'تم تحديث الفاتورة بنجاح'); } catch (e) { next(e); }
  },
  pdf: async (req, res, next) => {
    try {
      const buf = await invoicePdfService.generateInvoicePdf(req.params.id);
      const inv = await invoiceService.getInvoiceById(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${inv.invoice_number}.pdf"`);
      res.send(buf);
    } catch (e) { next(e); }
  },
  delete: async (req, res, next) => { try { await invoiceService.deleteInvoice(req.params.id, req.user.id); ok(res, null, 'تم حذف الفاتورة'); } catch (e) { next(e); } },
};

export const quotes = {
  template: async (req, res, next) => {
    try {
      if (req.method === 'GET') {
        ok(res, await userService.getSetting('quote_template') || { items: [] });
        return;
      }
      const template = {
        items: Array.isArray(req.body?.items) ? req.body.items : [],
      };
      await userService.upsertSetting('quote_template', template, req.user.id, 'قالب البنود الثابتة لعرض السعر');
      ok(res, template, 'تم حفظ قالب عرض السعر');
    } catch (e) {
      next(e);
    }
  },
  pdf: async (req, res, next) => {
    try {
      const { buffer, quoteNumber } = await quotePdfService.generateQuotePdf(req.body);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="quote-${quoteNumber}.pdf"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
};

export const purchases = {
  list: async (req, res, next) => {
    try { ok(res, await purchaseService.listPurchaseInvoices(req.query.limit)); } catch (e) { next(e); }
  },
  create: async (req, res, next) => {
    try { ok(res, await purchaseService.createPurchaseInvoice(req.body, req.user.id), 'تم إنشاء فاتورة المشتريات'); } catch (e) { next(e); }
  },
  update: async (req, res, next) => {
    try { ok(res, await purchaseService.updatePurchaseInvoice(req.params.id, req.body, req.user.id), 'تم تعديل فاتورة المشتريات بنجاح'); } catch (e) { next(e); }
  },
  delete: async (req, res, next) => {
    try {
      const data = await purchaseService.deletePurchaseInvoice(req.params.id, req.user.id);
      ok(res, data, 'تم حذف فاتورة المشتريات بنجاح');
    } catch (e) {
      next(e);
    }
  },
};

export const users = {
  list: async (req, res, next) => { try { ok(res, await userService.getUsers()); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await userService.createUser(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await userService.updateUser(req.params.id, req.body)); } catch (e) { next(e); } },
  roles: async (req, res, next) => { try { ok(res, await userService.getRoles()); } catch (e) { next(e); } },
  notifications: async (req, res, next) => { try { ok(res, await userService.getNotifications(req.user.id)); } catch (e) { next(e); } },
  settings: async (req, res, next) => { try { ok(res, await userService.getSettings()); } catch (e) { next(e); } },
  updateSetting: async (req, res, next) => { try { await userService.updateSetting(req.params.key, req.body.value, req.user.id); ok(res, null); } catch (e) { next(e); } },
  reports: async (req, res, next) => { try { ok(res, await userService.getReports(req.params.type, req.query)); } catch (e) { next(e); } },
};

export const backup = {
  create: async (req, res, next) => {
    try { ok(res, await backupService.createBackup()); } catch (e) { next(e); }
  },
  list: async (req, res, next) => {
    try { ok(res, await backupService.listBackups()); } catch (e) { next(e); }
  },
  download: async (req, res, next) => {
    try {
      const p = await backupService.downloadBackupPath(req.params.name);
      return res.download(p);
    } catch (e) { next(e); }
  },
  restore: async (req, res, next) => {
    try { ok(res, await backupService.restoreBackup(req.body.name)); } catch (e) { next(e); }
  },
  restoreFile: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('لم يتم رفع ملف النسخة', 400);
      await fs.mkdir(path.join(process.cwd(), 'backups'), { recursive: true });
      const fileName = `uploaded-restore-${Date.now()}.json`;
      const filePath = path.join(process.cwd(), 'backups', fileName);
      await fs.writeFile(filePath, req.file.buffer);
      ok(res, await backupService.restoreBackup(fileName));
    } catch (e) { next(e); }
  },
  clear: async (req, res, next) => {
    try {
      if (req.body?.confirm !== 'CONFIRM_CLEAR') throw new AppError('تأكيد التصفير مفقود', 400);
      ok(res, await backupService.clearAllData());
    } catch (e) { next(e); }
  },
};

// ── P&L Controller ──
export const pl = {
  /**
   * GET /reports/pl/monthly?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
   * تقرير الربح والخسارة لفترة محددة
   */
  report: async (req, res, next) => {
    try {
      const { from_date, to_date } = req.query;
      if (!from_date || !to_date) {
        throw new AppError('from_date و to_date مطلوبان', 400);
      }
      ok(res, await plService.getProfitAndLoss(from_date, to_date));
    } catch (e) { next(e); }
  },

  /**
   * GET /reports/pl/trend?months=6
   * ملخص شهري لآخر N شهور (للرسم البياني)
   */
  trend: async (req, res, next) => {
    try {
      const months = Math.min(Number(req.query.months) || 6, 24);
      ok(res, await plService.getMonthlyPLSummary(months));
    } catch (e) { next(e); }
  },
};
