import * as productService from '../services/productService.js';
import * as productsExcelService from '../services/productsExcelService.js';
import * as inventoryService from '../services/inventoryService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ok } from './helper.js';

export const products = {
  list: async (req, res, next) => { try { ok(res, await productService.getProducts(req.query)); } catch (e) { next(e); } },
  branchProducts: async (req, res, next) => { try { ok(res, await productService.getBranchProducts(req.query)); } catch (e) { next(e); } },
  costsReport: async (req, res, next) => { try { ok(res, await productService.getCostsReport(req.query)); } catch (e) { next(e); } },
  get: async (req, res, next) => { try { ok(res, await productService.getProductById(req.params.id)); } catch (e) { next(e); } },
  nextSku: async (_req, res, next) => { try { ok(res, await productService.getNextProductSku()); } catch (e) { next(e); } },
  create: async (req, res, next) => { try { ok(res, await productService.createProduct(req.body)); } catch (e) { next(e); } },
  update: async (req, res, next) => { try { ok(res, await productService.updateProduct(req.params.id, req.body)); } catch (e) { next(e); } },
  bulkPriceAdjust: async (req, res, next) => {
    try {
      ok(res, await productService.bulkAdjustPrices(req.body, req.user.id), 'تم تعديل الأسعار بنجاح');
    } catch (e) { next(e); }
  },
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
