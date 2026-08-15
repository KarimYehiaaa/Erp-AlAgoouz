import * as productService from '../services/productService.ts';
import * as productsExcelService from '../services/productsExcelService.ts';
import * as inventoryService from '../services/inventoryService.ts';
import { AppError } from '../types/errors.ts';
import { ok } from './helper.ts';

export const products = {
  /**
   * قائمة المنتجات مع التصفية والبحث.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await productService.getProducts(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة منتجات فرع/مخزن محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  branchProducts: async (req, res, next) => {
    try {
      ok(res, await productService.getBranchProducts(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تقرير تكاليف المنتجات الفعلية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  costsReport: async (req, res, next) => {
    try {
      ok(res, await productService.getCostsReport(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب منتج حسب معرفه.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  get: async (req, res, next) => {
    try {
      ok(res, await productService.getProductById(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * اقتراح كود SKU التالي للمنتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  nextSku: async (_req, res, next) => {
    try {
      ok(res, await productService.getNextProductSku());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء منتج جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(res, await productService.createProduct(req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث منتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(res, await productService.updateProduct(req.params.id, req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تعديل أسعار جماعي (نسبة أو مبلغ).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  bulkPriceAdjust: async (req, res, next) => {
    try {
      ok(
        res,
        await productService.bulkAdjustPrices(req.body, req.user.id),
        'تم تعديل الأسعار بنجاح',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * ضبط بيانات المنتج داخل مخزن محدد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  setWarehouse: async (req, res, next) => {
    try {
      ok(
        res,
        await productService.setProductWarehouse(req.params.id, req.body?.warehouse_id),
        'Warehouse updated',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف منتج.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      await productService.deleteProduct(req.params.id);
      ok(res, null, 'تم حذف المنتج');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * مسح جميع المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAll: async (req, res, next) => {
    try {
      const data = await productService.deleteAllProducts();
      ok(res, data, `تم حذف ${data.deletedCount} منتجات بنجاح`);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة تصنيفات المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  categories: async (req, res, next) => {
    try {
      ok(res, await productService.getCategories());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء تصنيف جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createCategory: async (req, res, next) => {
    try {
      ok(res, await productService.createCategory(req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث تصنيف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateCategory: async (req, res, next) => {
    try {
      ok(res, await productService.updateCategory(req.params.id, req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف تصنيف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteCategory: async (req, res, next) => {
    try {
      ok(res, await productService.deleteCategory(req.params.id), 'تم حذف التصنيف');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة وحدات القياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  units: async (req, res, next) => {
    try {
      ok(res, await productService.getUnits());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء وحدة قياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createUnit: async (req, res, next) => {
    try {
      ok(res, await productService.createUnit(req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث وحدة قياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateUnit: async (req, res, next) => {
    try {
      ok(res, await productService.updateUnit(req.params.id, req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف وحدة قياس.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteUnit: async (req, res, next) => {
    try {
      ok(res, await productService.deleteUnit(req.params.id), 'تم حذف الوحدة');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إرجاع كمية منتج إلى المخزون.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  returnStock: async (req, res, next) => {
    try {
      ok(
        res,
        await inventoryService.returnProductToStock(req.body, req.user.id),
        'تمت عملية إرجاع المنتج للمخزن',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة مرتجعات المنتجات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  returns: async (req, res, next) => {
    try {
      ok(res, await inventoryService.getProductReturns(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تنزيل قالب استيراد المنتجات (Excel).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  template: async (_req, res, next) => {
    try {
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
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تصدير قائمة المنتجات إلى ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  export: async (_req, res, next) => {
    try {
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
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * استيراد المنتجات من ملف Excel.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  importExcel: async (req, res, next) => {
    try {
      if (!req.file?.buffer) throw new AppError('يجب رفع ملف Excel', 400);
      const result = await productsExcelService.importProductsFromExcel(req.file.buffer);
      ok(
        res,
        result,
        `تم استيراد المنتجات بنجاح: تم إنشاء ${result.created} وتحديث ${result.updated}`,
      );
    } catch (e: any) {
      next(e);
    }
  },
};
