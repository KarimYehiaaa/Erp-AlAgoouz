import * as expenseService from '../services/expenseService.js';
import { ok } from './helper.js';

export const expenses = {
  list: async (req, res, next) => {
    try {
      ok(res, await expenseService.getExpenses(req.query));
    } catch (e) {
      next(e);
    }
  },
  create: async (req, res, next) => {
    try {
      ok(res, await expenseService.createExpense(req.body, req.user.id));
    } catch (e) {
      next(e);
    }
  },
  update: async (req, res, next) => {
    try {
      ok(res, await expenseService.updateExpense(req.params.id, req.body));
    } catch (e) {
      next(e);
    }
  },
  categories: async (req, res, next) => {
    try {
      ok(res, await expenseService.getCategories());
    } catch (e) {
      next(e);
    }
  },
  report: async (req, res, next) => {
    try {
      ok(res, await expenseService.getExpenseReport(req.query.year, req.query.month));
    } catch (e) {
      next(e);
    }
  },
  delete: async (req, res, next) => {
    try {
      await expenseService.deleteExpense(req.params.id);
      ok(res, null);
    } catch (e) {
      next(e);
    }
  },
};
