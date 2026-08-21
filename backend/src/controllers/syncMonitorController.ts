/**
 * controllers/syncMonitorController.ts — فحص ومراقبة حالة التزامن وصحة الشبكة
 * ══════════════════════════════════════════════════════════════════════════
 */
import type { Request, Response } from 'express';
import { query, checkHealth } from '../database/pool.ts';

export const syncMonitorController = {
  /**
   * فحص حالة التزامن الشاملة (Latency, Database, Idempotency records, Recent transactions)
   */
  getStatus: async (req: Request, res: Response): Promise<void> => {
    const start = Date.now();

    try {
      const dbHealth = await checkHealth();
      const clientTimestamp = req.query.timestamp ? Number(req.query.timestamp) : null;
      const clockDriftMs = clientTimestamp ? Math.abs(Date.now() - clientTimestamp) : null;

      // إحصائيات المبيعات الحديثة لتقدير حجم العمليات
      let recentSalesCount = 0;
      let lastSaleTime: string | null = null;
      let activeIdempotencyKeys = 0;

      if (dbHealth.ok) {
        const statsRes = await query(`
          SELECT 
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS recent_sales,
            MAX(created_at) AS last_sale
          FROM sales
        `);

        recentSalesCount = parseInt(statsRes.rows[0]?.recent_sales || '0', 10);
        lastSaleTime = statsRes.rows[0]?.last_sale || null;

        // فحص عدد مفاتيح الـ Idempotency النشطة
        try {
          const idempRes = await query(
            `SELECT COUNT(*) AS count FROM idempotency_records WHERE expires_at > NOW()`,
          );
          activeIdempotencyKeys = parseInt(idempRes.rows[0]?.count || '0', 10);
        } catch {
          // تجاهل في حال عدم توفر الجدول
        }
      }

      res.status(dbHealth.ok ? 200 : 503).json({
        success: dbHealth.ok,
        status: dbHealth.ok ? 'HEALTHY' : 'DEGRADED',
        serverTimestamp: Date.now(),
        clockDriftMs,
        network: {
          roundTripLatencyMs: Date.now() - start,
          dbLatencyMs: dbHealth.latencyMs,
        },
        database: {
          connected: dbHealth.ok,
          pool: dbHealth.poolStats,
        },
        syncMetrics: {
          recentSalesPastHour: recentSalesCount,
          lastSaleRecordedAt: lastSaleTime,
          activeIdempotencyRecords: activeIdempotencyKeys,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        status: 'UNHEALTHY',
        error: err.message,
        roundTripLatencyMs: Date.now() - start,
      });
    }
  },
};
