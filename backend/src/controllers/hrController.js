import * as hrService from '../services/hrService.js';
import { ok } from './helper.js';

export const hr = {
  summary: async (req, res, next) => {
    try {
      ok(res, await hrService.getHrSummary(req.query.period_month));
    } catch (e) {
      next(e);
    }
  },
  shifts: async (_req, res, next) => {
    try {
      ok(res, await hrService.listShifts());
    } catch (e) {
      next(e);
    }
  },
  createShift: async (req, res, next) => {
    try {
      ok(res, await hrService.createShift(req.body), 'تم إنشاء الشيفت');
    } catch (e) {
      next(e);
    }
  },
  employees: async (req, res, next) => {
    try {
      ok(res, await hrService.listEmployees(req.query));
    } catch (e) {
      next(e);
    }
  },
  createEmployee: async (req, res, next) => {
    try {
      ok(res, await hrService.createEmployee(req.body), 'تم إنشاء الموظف');
    } catch (e) {
      next(e);
    }
  },
  updateEmployee: async (req, res, next) => {
    try {
      ok(res, await hrService.updateEmployee(req.params.id, req.body), 'تم تحديث الموظف');
    } catch (e) {
      next(e);
    }
  },
  deleteEmployee: async (req, res, next) => {
    try {
      ok(res, await hrService.deleteEmployee(req.params.id), 'تم إيقاف الموظف');
    } catch (e) {
      next(e);
    }
  },
  attendance: async (req, res, next) => {
    try {
      ok(res, await hrService.listAttendance(req.query));
    } catch (e) {
      next(e);
    }
  },
  saveAttendance: async (req, res, next) => {
    try {
      const result =
        req.body?.to_date || req.body?.from_date
          ? await hrService.saveAttendanceRange(req.body, req.user.id)
          : await hrService.saveAttendance(req.body, req.user.id);
      ok(res, result, 'تم حفظ الحضور');
    } catch (e) {
      next(e);
    }
  },
  deleteAttendance: async (req, res, next) => {
    try {
      ok(res, await hrService.deleteAttendance(req.params.id), 'تم حذف سجل الحضور');
    } catch (e) {
      next(e);
    }
  },
  advances: async (req, res, next) => {
    try {
      ok(res, await hrService.listAdvances(req.query));
    } catch (e) {
      next(e);
    }
  },
  createAdvance: async (req, res, next) => {
    try {
      ok(res, await hrService.createAdvance(req.body, req.user.id), 'تم صرف السلفة');
    } catch (e) {
      next(e);
    }
  },
  deleteAdvance: async (req, res, next) => {
    try {
      ok(res, await hrService.deleteAdvance(req.params.id), 'تم حذف السلفة');
    } catch (e) {
      next(e);
    }
  },
  payrollRuns: async (_req, res, next) => {
    try {
      ok(res, await hrService.listPayrollRuns());
    } catch (e) {
      next(e);
    }
  },
  previewPayroll: async (req, res, next) => {
    try {
      ok(res, await hrService.previewPayroll(req.query.period_month));
    } catch (e) {
      next(e);
    }
  },
  createPayroll: async (req, res, next) => {
    try {
      ok(
        res,
        await hrService.createOrRecalculatePayroll(req.body.period_month, req.user.id),
        'تم حساب مسير المرتبات',
      );
    } catch (e) {
      next(e);
    }
  },
  getPayroll: async (req, res, next) => {
    try {
      ok(res, await hrService.getPayrollRun(req.params.id));
    } catch (e) {
      next(e);
    }
  },
  payPayroll: async (req, res, next) => {
    try {
      ok(
        res,
        await hrService.payPayrollRun(req.params.id, req.user.id, req.body?.payment_method),
        'تم صرف المرتبات',
      );
    } catch (e) {
      next(e);
    }
  },
};
