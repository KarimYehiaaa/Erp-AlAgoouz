import * as productService from '../services/productService.ts';
import * as productsExcelService from '../services/productsExcelService.ts';
import * as inventoryService from '../services/inventoryService.ts';
import { AppError } from '../types/errors.ts';
import { ok, wrap } from './helper.ts';

export const products = {
  /**
   * قائمة المنتجات مع التصفية والبحث.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await productService.getProducts(req.query));
  }),
  /**
   * قائمة منتجات مخزن البيع بالمحل.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  shopProducts: wrap(async (req, res) => {
    ok(res, await productService.getShopProducts(req.query));
  }),
  /**
   * تقرير تكاليف المنتجات الفعلية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  costsReport: wrap(async (req, res) => {
    ok(res, await productService.getCostsReport(req.query));
  }),
  /**
   * جلب منتج حسب معرفه.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: wrap(async (req, res) => {
    ok(res, await productService.getProductById(req.params.id));
  }),
  /**
   * اقتراح كود SKU التالي للمنتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  nextSku: wrap(async (_req, res) => {
    ok(res, await productService.getNextProductSku());
  }),
  /**
   * إنشاء منتج جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await productService.createProduct(req.body));
  }),
  /**
   * تحديث منتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(res, await productService.updateProduct(req.params.id, req.body));
  }),
  /**
   * تعديل أسعار جماعي (نسبة أو مبلغ).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  bulkPriceAdjust: wrap(async (req, res) => {
    ok(res, await productService.bulkAdjustPrices(req.body, req.user.id), 'تم تعديل الأسعار بنجاح');
  }),
  /**
   * ضبط بيانات المنتج داخل مخزن محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  setWarehouse: wrap(async (req, res) => {
    ok(
      res,
      await productService.setProductWarehouse(req.params.id, req.body?.warehouse_id),
      'Warehouse updated',
    );
  }),
  /**
   * حذف منتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    await productService.deleteProduct(req.params.id);
    ok(res, null, 'تم حذف المنتج');
  }),
  /**
   * مسح جميع المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAll: wrap(async (req, res) => {
    const data = await productService.deleteAllProducts();
    ok(res, data, `تم حذف ${data.deletedCount} منتجات بنجاح`);
  }),
  /**
   * قائمة تصنيفات المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  categories: wrap(async (req, res) => {
    ok(res, await productService.getCategories());
  }),
  /**
   * إنشاء تصنيف جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createCategory: wrap(async (req, res) => {
    ok(res, await productService.createCategory(req.body));
  }),
  /**
   * تحديث تصنيف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateCategory: wrap(async (req, res) => {
    ok(res, await productService.updateCategory(req.params.id, req.body));
  }),
  /**
   * حذف تصنيف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteCategory: wrap(async (req, res) => {
    ok(res, await productService.deleteCategory(req.params.id), 'تم حذف التصنيف');
  }),
  /**
   * قائمة وحدات القياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  units: wrap(async (req, res) => {
    ok(res, await productService.getUnits());
  }),
  /**
   * إنشاء وحدة قياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createUnit: wrap(async (req, res) => {
    ok(res, await productService.createUnit(req.body));
  }),
  /**
   * تحديث وحدة قياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateUnit: wrap(async (req, res) => {
    ok(res, await productService.updateUnit(req.params.id, req.body));
  }),
  /**
   * حذف وحدة قياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteUnit: wrap(async (req, res) => {
    ok(res, await productService.deleteUnit(req.params.id), 'تم حذف الوحدة');
  }),
  /**
   * إرجاع كمية منتج إلى المخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  returnStock: wrap(async (req, res) => {
    ok(
      res,
      await inventoryService.returnProductToStock(req.body, req.user.id),
      'تمت عملية إرجاع المنتج للمخزن',
    );
  }),
  /**
   * قائمة مرتجعات المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  returns: wrap(async (req, res) => {
    ok(res, await inventoryService.getProductReturns(req.query));
  }),
  /**
   * تنزيل قالب استيراد المنتجات (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  template: wrap(async (_req, res) => {
    const buf = productsExcelService.buildProductsTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="bin-al-ajouz-products-template.xlsx"',
    );
    res.send(buf);
  }),
  /**
   * تصدير قائمة المنتجات إلى ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  export: wrap(async (_req, res) => {
    const buf = await productsExcelService.exportProductsToExcel();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="bin-al-ajouz-products-export.xlsx"',
    );
    res.send(buf);
  }),
  /**
   * استيراد المنتجات من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  importExcel: wrap(async (req, res) => {
    if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
    const result = await productsExcelService.importProductsFromExcel(req.file.buffer);
    ok(
      res,
      result,
      `تم استيراد المنتجات بنجاح: تم إنشاء ${result.created} وتحديث ${result.updated}`,
    );
  }),
};
