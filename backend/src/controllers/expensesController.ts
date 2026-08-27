import * as expenseService from '../services/expenseService.ts';
import { ok, wrap } from './helper.ts';

export const expenses = {
  /**
   * قائمة المصروفات مع التصفية حسب الفترة والتصنيف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await expenseService.getExpenses(req.query));
  }),
  /**
   * إنشاء مصروف جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await expenseService.createExpense(req.body, req.user.id));
  }),
  /**
   * تحديث مصروف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  update: wrap(async (req, res) => {
    ok(res, await expenseService.updateExpense(req.params.id, req.body));
  }),
  /**
   * قائمة تصنيفات المصروفات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  categories: wrap(async (req, res) => {
    ok(res, await expenseService.getCategories());
  }),
  /**
   * تقرير مصروفات مجمّع حسب التصنيف والفترة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  report: wrap(async (req, res) => {
    ok(res, await expenseService.getExpenseReport(req.query.year, req.query.month));
  }),
  /**
   * حذف مصروف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  delete: wrap(async (req, res) => {
    await expenseService.deleteExpense(req.params.id);
    ok(res, null);
  }),
};
