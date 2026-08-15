import * as hrService from '../services/hrService.ts';
import { ok } from './helper.ts';

export const hr = {
  /**
   * ملخص شامل للموارد البشرية (الموظفون، الحضور، الرواتب...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  summary: async (req, res, next) => {
    try {
      ok(res, await hrService.getHrSummary(req.query.period_month));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة الورديات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  shifts: async (_req, res, next) => {
    try {
      ok(res, await hrService.listShifts());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء وردية جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createShift: async (req, res, next) => {
    try {
      ok(res, await hrService.createShift(req.body), 'تم إنشاء الشيفت');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة الموظفين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  employees: async (req, res, next) => {
    try {
      ok(res, await hrService.listEmployees(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء موظف جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createEmployee: async (req, res, next) => {
    try {
      ok(res, await hrService.createEmployee(req.body), 'تم إنشاء الموظف');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تحديث بيانات موظف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateEmployee: async (req, res, next) => {
    try {
      ok(res, await hrService.updateEmployee(req.params.id, req.body), 'تم تحديث الموظف');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف موظف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteEmployee: async (req, res, next) => {
    try {
      ok(res, await hrService.deleteEmployee(req.params.id), 'تم إيقاف الموظف');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * سجل الحضور والانصراف مع التصفية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  attendance: async (req, res, next) => {
    try {
      ok(res, await hrService.listAttendance(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حفظ سجلات الحضور والانصراف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  saveAttendance: async (req, res, next) => {
    try {
      const result =
        req.body?.to_date || req.body?.from_date
          ? await hrService.saveAttendanceRange(req.body, req.user.id)
          : await hrService.saveAttendance(req.body, req.user.id);
      ok(res, result, 'تم حفظ الحضور');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف سجل حضور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAttendance: async (req, res, next) => {
    try {
      ok(res, await hrService.deleteAttendance(req.params.id), 'تم حذف سجل الحضور');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة سلف الموظفين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  advances: async (req, res, next) => {
    try {
      ok(res, await hrService.listAdvances(req.query));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء سلفة لموظف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createAdvance: async (req, res, next) => {
    try {
      ok(res, await hrService.createAdvance(req.body, req.user.id), 'تم صرف السلفة');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * حذف سلفة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAdvance: async (req, res, next) => {
    try {
      ok(res, await hrService.deleteAdvance(req.params.id), 'تم حذف السلفة');
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة دورات الرواتب المنفذة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  payrollRuns: async (_req, res, next) => {
    try {
      ok(res, await hrService.listPayrollRuns());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * معاينة كشف رواتب قبل الاعتماد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  previewPayroll: async (req, res, next) => {
    try {
      ok(res, await hrService.previewPayroll(req.query.period_month));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * إنشاء دورة رواتب جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createPayroll: async (req, res, next) => {
    try {
      ok(
        res,
        await hrService.createOrRecalculatePayroll(req.body.period_month, req.user.id),
        'تم حساب مسير المرتبات',
      );
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * جلب كشف رواتب دورة محددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getPayroll: async (req, res, next) => {
    try {
      ok(res, await hrService.getPayrollRun(req.params.id));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تسجيل صرف رواتب دورة محددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  payPayroll: async (req, res, next) => {
    try {
      ok(
        res,
        await hrService.payPayrollRun(req.params.id, req.user.id, req.body?.payment_method),
        'تم صرف المرتبات',
      );
    } catch (e: any) {
      next(e);
    }
  },
};
