import type { Request, Response, NextFunction } from 'express';
import { scanRiskAlerts } from '../services/riskEngineService.ts';

export const riskController = {
  getAlerts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const warehouseId = req.query.warehouse_id ? Number(req.query.warehouse_id) : undefined;
      const minSeverity = req.query.min_severity as any;
      const startDate = req.query.start_date as string | undefined;
      const endDate = req.query.end_date as string | undefined;

      const result = await scanRiskAlerts({
        warehouseId,
        minSeverity,
        startDate,
        endDate,
      });

      res.json({
        success: true,
        message: 'تم جلب تنبيهات المخاطر بنجاح',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
