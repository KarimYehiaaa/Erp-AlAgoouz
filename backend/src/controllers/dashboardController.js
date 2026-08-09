import * as dashboardService from '../services/dashboardService.js';
import * as operationsService from '../services/operationsService.js';
import { ok } from './helper.js';

export const dashboard = async (req, res, next) => {
  try {
    ok(res, await dashboardService.getDashboardStats(req.query));
  } catch (e) {
    next(e);
  }
};

export const operations = {
  alerts: async (req, res, next) => {
    try {
      ok(res, await operationsService.getOperationAlerts());
    } catch (e) {
      next(e);
    }
  },
  auditLogs: async (req, res, next) => {
    try {
      ok(res, await operationsService.getAuditLogs(req.query));
    } catch (e) {
      next(e);
    }
  },
};
