import * as hrService from '../services/hrService.ts';
import { ok, wrap } from './helper.ts';

export const hr = {
  /**
   * ملخص شامل للموارد البشرية (الموظفون، الحضور، الرواتب...).
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  summary: wrap(async (req, res) => {
    ok(res, await hrService.getHrSummary(req.query.period_month));
  }),
  /**
   * قائمة الورديات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  shifts: wrap(async (_req, res) => {
    ok(res, await hrService.listShifts());
  }),
  /**
   * إنشاء وردية جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createShift: wrap(async (req, res) => {
    ok(res, await hrService.createShift(req.body), 'تم إنشاء الشيفت');
  }),
  /**
   * قائمة الموظفين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  employees: wrap(async (req, res) => {
    ok(res, await hrService.listEmployees(req.query));
  }),
  /**
   * إنشاء موظف جديد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createEmployee: wrap(async (req, res) => {
    ok(res, await hrService.createEmployee(req.body), 'تم إنشاء الموظف');
  }),
  /**
   * تحديث بيانات موظف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  updateEmployee: wrap(async (req, res) => {
    ok(res, await hrService.updateEmployee(req.params.id, req.body), 'تم تحديث الموظف');
  }),
  /**
   * حذف موظف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteEmployee: wrap(async (req, res) => {
    ok(res, await hrService.deleteEmployee(req.params.id), 'تم إيقاف الموظف');
  }),
  /**
   * سجل الحضور والانصراف مع التصفية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  attendance: wrap(async (req, res) => {
    ok(res, await hrService.listAttendance(req.query));
  }),
  /**
   * حفظ سجلات الحضور والانصراف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  saveAttendance: wrap(async (req, res) => {
    const result =
      req.body?.to_date || req.body?.from_date
        ? await hrService.saveAttendanceRange(req.body, req.user.id)
        : await hrService.saveAttendance(req.body, req.user.id);
    ok(res, result, 'تم حفظ الحضور');
  }),
  /**
   * حذف سجل حضور.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAttendance: wrap(async (req, res) => {
    ok(res, await hrService.deleteAttendance(req.params.id), 'تم حذف سجل الحضور');
  }),
  /**
   * قائمة سلف الموظفين.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  advances: wrap(async (req, res) => {
    ok(res, await hrService.listAdvances(req.query));
  }),
  /**
   * إنشاء سلفة لموظف.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createAdvance: wrap(async (req, res) => {
    ok(res, await hrService.createAdvance(req.body, req.user.id), 'تم صرف السلفة');
  }),
  /**
   * حذف سلفة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  deleteAdvance: wrap(async (req, res) => {
    ok(res, await hrService.deleteAdvance(req.params.id), 'تم حذف السلفة');
  }),
  /**
   * قائمة دورات الرواتب المنفذة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  payrollRuns: wrap(async (_req, res) => {
    ok(res, await hrService.listPayrollRuns());
  }),
  /**
   * معاينة كشف رواتب قبل الاعتماد.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  previewPayroll: wrap(async (req, res) => {
    ok(res, await hrService.previewPayroll(req.query.period_month));
  }),
  /**
   * إنشاء دورة رواتب جديدة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  createPayroll: wrap(async (req, res) => {
    ok(
      res,
      await hrService.createOrRecalculatePayroll(req.body.period_month, req.user.id),
      'تم حساب مسير المرتبات',
    );
  }),
  /**
   * جلب كشف رواتب دورة محددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getPayroll: wrap(async (req, res) => {
    ok(res, await hrService.getPayrollRun(req.params.id));
  }),
  /**
   * اعتماد مسير رواتب دورة محددة وترحيل قيد الاستحقاق.
   */
  approvePayroll: wrap(async (req, res) => {
    ok(
      res,
      await hrService.approvePayrollRun(Number(req.params.id), req.user.id),
      'تم اعتماد مسير المرتبات وإثبات قيد الاستحقاق',
    );
  }),
  /**
   * تسجيل صرف رواتب دورة محددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  payPayroll: wrap(async (req, res) => {
    ok(
      res,
      await hrService.payPayrollRun(Number(req.params.id), req.user.id, req.body?.payment_method),
      'تم صرف المرتبات',
    );
  }),
};
