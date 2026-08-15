import * as expenseService from '../services/expenseService.ts';
import { ok } from './helper.ts';

export const expenses = {
  /**
   * قائمة المصروفات مع التصفية حسب الفترة والتصنيف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await expenseService.getExpenses(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء مصروف جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(res, await expenseService.createExpense(req.body, req.user.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث مصروف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: async (req, res, next) => {
    try {
      ok(res, await expenseService.updateExpense(req.params.id, req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة تصنيفات المصروفات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  categories: async (req, res, next) => {
    try {
      ok(res, await expenseService.getCategories());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تقرير مصروفات مجمّع حسب التصنيف والفترة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  report: async (req, res, next) => {
    try {
      ok(res, await expenseService.getExpenseReport(req.query.year, req.query.month));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف مصروف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: async (req, res, next) => {
    try {
      await expenseService.deleteExpense(req.params.id);
      ok(res, null);
    } catch (e: any) {
      next(e);
    }
  },
};
