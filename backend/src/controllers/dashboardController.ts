import * as dashboardService from '../services/dashboardService.ts';
import * as operationsService from '../services/operationsService.ts';
import { ok } from './helper.ts';

/**
 * إحصائيات لوحة التحكم الرئيسية (مبيعات، أرباح، مخزون...).
 * @param {import('express').Request} req طلب HTTP
 * @param {import('express').Response} res استجابة HTTP
 * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
 */
export const dashboard = async (req, res, next) => {
  try {
    ok(res, await dashboardService.getDashboardStats(req.query));
  } catch (e: any) {
    next(e);
  }
};

export const operations = {
  /**
   * تنبيهات العمليات التشغيلية.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  alerts: async (req, res, next) => {
    try {
      ok(res, await operationsService.getOperationAlerts());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * سجل التدقيق مع التصفية والترقيم.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  auditLogs: async (req, res, next) => {
    try {
      ok(res, await operationsService.getAuditLogs(req.query));
    } catch (e: any) {
      next(e);
    }
  },
};
