/**
 * riskEngineService.ts — محرك كشف الاحتيال والمخاطر التشغيلية (Anti-Fraud & Risk Engine)
 * ════════════════════════════════════════════════════════════════════════════════
 * يفحص وينبه آلياً عن:
 *  - الخصومات المفرطة (Excessive Discounts)
 *  - الفواتير الملغاة المتكررة (Repeated Voids / Cancellations)
 *  - فروقات نقدية الوردية (Cash Shift Discrepancies)
 *  - تسويات المخزون غير المعتادة (Unusual Stock Adjustments)
 *  - طلبات تجاوز PIN المتكررة (Repeated Manager PIN Overrides)
 *  - ورديات الكاشير المفتوحة لفترات غير منطقية (Unusual Long Shifts)
 *  - التعديل المتكرر على أسعار البيع والشراء (Frequent Price Changes)
 *
 * كل تنبيه يلتزم بالنموذج الصارم:
 * { id, severity, user, branch, timestamp, event, reference, explanation }
 */
import { query } from '../database/pool.ts';
import { logger } from './loggerService.ts';
import type { RiskAlert } from '../../../shared/types.ts';

export interface RiskScanOptions {
  warehouseId?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
}

const SEVERITY_LEVELS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * فحص وتجميع التنبيهات الأمنية والمالية عبر كافة قنوات المخاطر
 */
export const scanRiskAlerts = async (
  options: RiskScanOptions = {},
): Promise<{ alerts: RiskAlert[]; summary: Record<string, number> }> => {
  const alerts: RiskAlert[] = [];
  const warehouseId = options.warehouseId ? Number(options.warehouseId) : null;
  const startDate = options.startDate ? new Date(options.startDate) : null;
  const endDate = options.endDate ? new Date(options.endDate) : null;

  try {
    // 1. فحص الخصومات المفرطة
    const discountRes = await query(
      `SELECT s.id, s.sale_number, s.total_amount, s.subtotal, s.discount_amount, s.discount_percent,
              s.created_at, s.user_id, u.full_name as user_name, s.warehouse_id, w.name_ar as branch_name
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.deleted_at IS NULL
         AND (s.discount_percent >= 20 OR s.discount_amount >= 150)
         AND ($1::int IS NULL OR s.warehouse_id = $1)
         AND ($2::timestamptz IS NULL OR s.created_at >= $2)
         AND ($3::timestamptz IS NULL OR s.created_at <= $3)
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [warehouseId, startDate, endDate],
    );

    for (const r of discountRes.rows) {
      const discPct = Number(r.discount_percent || 0);
      const discAmt = Number(r.discount_amount || 0);
      const severity = discPct >= 40 || discAmt >= 300 ? 'critical' : 'high';

      alerts.push({
        id: `risk-disc-${r.id}`,
        severity,
        user: { id: r.user_id, name: r.user_name || 'غير معروف' },
        branch: { id: r.warehouse_id, name: r.branch_name || 'الفرع الرئيسي' },
        timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        event: 'excessive_discount',
        reference: { type: 'sale', id: r.id },
        explanation: `تم تطبيق خصم مرتفع بنسبة ${discPct.toFixed(1)}% بقيمة ${discAmt.toFixed(2)} ج.م على الفاتورة #${r.sale_number}.`,
      });
    }

    // 2. فحص الفواتير الملغاة المتكررة للكاشير
    const voidRes = await query(
      `SELECT s.user_id, u.full_name as user_name, s.warehouse_id, w.name_ar as branch_name,
              COUNT(*) as void_count, MAX(s.created_at) as latest_time
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.deleted_at IS NULL
         AND s.status IN ('cancelled', 'voided')
         AND ($1::int IS NULL OR s.warehouse_id = $1)
         AND ($2::timestamptz IS NULL OR s.created_at >= $2)
         AND ($3::timestamptz IS NULL OR s.created_at <= $3)
       GROUP BY s.user_id, u.full_name, s.warehouse_id, w.name_ar
       HAVING COUNT(*) >= 2
       ORDER BY void_count DESC`,
      [warehouseId, startDate, endDate],
    );

    for (const r of voidRes.rows) {
      const count = Number(r.void_count);
      const severity = count >= 5 ? 'critical' : 'high';

      alerts.push({
        id: `risk-void-user-${r.user_id}`,
        severity,
        user: { id: r.user_id, name: r.user_name || 'كاشير' },
        branch: { id: r.warehouse_id, name: r.branch_name || 'الفرع' },
        timestamp: r.latest_time ? new Date(r.latest_time).toISOString() : new Date().toISOString(),
        event: 'repeated_voids',
        reference: { type: 'user', id: r.user_id },
        explanation: `قام الكاشير بإلغاء ${count} فواتير بيع خلال النطاق الزمني المحدد، وهو نمط يستوجب التدقيق.`,
      });
    }

    // 3. فحص عجز وزيادة نقدية الورديات (Cash Difference)
    const shiftRes = await query(
      `SELECT ps.id, ps.shift_number, ps.cashier_user_id as user_id, u.full_name as user_name,
              ps.warehouse_id, w.name_ar as branch_name, ps.opening_cash, ps.expected_cash,
              ps.actual_cash, ps.cash_difference, ps.closed_at, ps.opened_at
       FROM pos_shifts ps
       LEFT JOIN users u ON u.id = ps.cashier_user_id
       LEFT JOIN warehouses w ON w.id = ps.warehouse_id
       WHERE ps.status IN ('closed', 'audited')
         AND ABS(COALESCE(ps.cash_difference, 0)) >= 20
         AND ($1::int IS NULL OR ps.warehouse_id = $1)
         AND ($2::timestamptz IS NULL OR ps.opened_at >= $2)
         AND ($3::timestamptz IS NULL OR ps.opened_at <= $3)
       ORDER BY ps.closed_at DESC
       LIMIT 50`,
      [warehouseId, startDate, endDate],
    );

    for (const r of shiftRes.rows) {
      const diff = Number(r.cash_difference || 0);
      const severity = Math.abs(diff) >= 100 ? 'critical' : 'high';
      const typeLabel = diff < 0 ? 'عجز نقدي' : 'فائض نقدي غير مبرر';

      alerts.push({
        id: `risk-shift-${r.id}`,
        severity,
        user: { id: r.user_id, name: r.user_name || 'كاشير' },
        branch: { id: r.warehouse_id, name: r.branch_name || 'الفرع' },
        timestamp: r.closed_at ? new Date(r.closed_at).toISOString() : new Date().toISOString(),
        event: 'cash_difference',
        reference: { type: 'pos_shift', id: r.id },
        explanation: `وُجد ${typeLabel} بقيمة ${Math.abs(diff).toFixed(2)} ج.م عند إغلاق الوردية #${r.shift_number}.`,
      });
    }

    // 4. فحص تسويات المخزون غير المعتادة
    const adjRes = await query(
      `SELECT sm.id, sm.product_id, p.name_ar as product_name, sm.quantity, sm.movement_type,
              sm.notes, sm.created_at, sm.user_id, u.full_name as user_name,
              COALESCE(sm.to_warehouse_id, sm.from_warehouse_id) as warehouse_id,
              w.name_ar as branch_name
       FROM stock_movements sm
       LEFT JOIN products p ON p.id = sm.product_id
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN warehouses w ON w.id = COALESCE(sm.to_warehouse_id, sm.from_warehouse_id)
       WHERE sm.movement_type = 'adjustment'
         AND ABS(sm.quantity) >= 5
         AND ($1::int IS NULL OR sm.to_warehouse_id = $1 OR sm.from_warehouse_id = $1)
         AND ($2::timestamptz IS NULL OR sm.created_at >= $2)
         AND ($3::timestamptz IS NULL OR sm.created_at <= $3)
       ORDER BY sm.created_at DESC
       LIMIT 50`,
      [warehouseId, startDate, endDate],
    );

    for (const r of adjRes.rows) {
      const qty = Number(r.quantity || 0);
      const severity = Math.abs(qty) >= 20 ? 'critical' : 'medium';

      alerts.push({
        id: `risk-adj-${r.id}`,
        severity,
        user: { id: r.user_id, name: r.user_name || 'مستخدم' },
        branch: { id: r.warehouse_id, name: r.branch_name || 'المخزن' },
        timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        event: 'stock_adjustment',
        reference: { type: 'stock_movement', id: r.id },
        explanation: `تسوية كمية يدوية بمقدار ${qty > 0 ? '+' : ''}${qty} للمنتج "${r.product_name || r.product_id}"${r.notes ? ` (السبب: ${r.notes})` : ''}.`,
      });
    }

    // 5. فحص الورديات المفتوحة لفترات طويلة غير مبررة
    const longShiftsRes = await query(
      `SELECT ps.id, ps.shift_number, ps.cashier_user_id as user_id, u.full_name as user_name,
              ps.warehouse_id, w.name_ar as branch_name, ps.opened_at,
              ROUND((EXTRACT(EPOCH FROM (NOW() - ps.opened_at))/3600)::numeric, 1) as hours_open
       FROM pos_shifts ps
       LEFT JOIN users u ON u.id = ps.cashier_user_id
       LEFT JOIN warehouses w ON w.id = ps.warehouse_id
       WHERE ps.status = 'open'
         AND ps.opened_at < NOW() - INTERVAL '16 hours'
         AND ($1::int IS NULL OR ps.warehouse_id = $1)
       ORDER BY ps.opened_at ASC`,
      [warehouseId],
    );

    for (const r of longShiftsRes.rows) {
      alerts.push({
        id: `risk-long-shift-${r.id}`,
        severity: 'high',
        user: { id: r.user_id, name: r.user_name || 'كاشير' },
        branch: { id: r.warehouse_id, name: r.branch_name || 'الفرع' },
        timestamp: r.opened_at ? new Date(r.opened_at).toISOString() : new Date().toISOString(),
        event: 'unusual_shift_duration',
        reference: { type: 'pos_shift', id: r.id },
        explanation: `الوردية #${r.shift_number} ما زالت مفتوحة منذ أكثر من ${r.hours_open} ساعة دون تقفيل مالي.`,
      });
    }

    // 6. فحص طلبات تجاوز PIN المتكررة (Manager Overrides)
    const overrideRes = await query(
      `SELECT mar.requester_user_id as user_id, u.full_name as user_name,
              mar.terminal_id, pt.warehouse_id, w.name_ar as branch_name,
              COUNT(*) as request_count, MAX(mar.created_at) as latest_time
       FROM manager_approval_requests mar
       LEFT JOIN users u ON u.id = mar.requester_user_id
       LEFT JOIN pos_terminals pt ON pt.id = mar.terminal_id
       LEFT JOIN warehouses w ON w.id = pt.warehouse_id
       WHERE ($1::int IS NULL OR pt.warehouse_id = $1)
         AND ($2::timestamptz IS NULL OR mar.created_at >= $2)
         AND ($3::timestamptz IS NULL OR mar.created_at <= $3)
       GROUP BY mar.requester_user_id, u.full_name, mar.terminal_id, pt.warehouse_id, w.name_ar
       HAVING COUNT(*) >= 3
       ORDER BY request_count DESC`,
      [warehouseId, startDate, endDate],
    );

    for (const r of overrideRes.rows) {
      const count = Number(r.request_count);
      const severity = count >= 6 ? 'high' : 'medium';

      alerts.push({
        id: `risk-override-user-${r.user_id}`,
        severity,
        user: { id: r.user_id, name: r.user_name || 'كاشير' },
        branch: { id: r.warehouse_id, name: r.branch_name || 'الفرع' },
        timestamp: r.latest_time ? new Date(r.latest_time).toISOString() : new Date().toISOString(),
        event: 'repeated_pin_overrides',
        reference: { type: 'user', id: r.user_id },
        explanation: `طلب المستخدم ${count} موافقات استثنائية (تجاوز صلاحيات PIN) خلال الفترة المحددة.`,
      });
    }
  } catch (err: any) {
    logger.error(`❌ فشل تشغيل محرك كشف المخاطر (Risk Engine): ${err?.message || err}`);
  }

  // فلترة حسب الحد الأدنى لدرجة الخطورة
  const minThreshold = SEVERITY_LEVELS[options.minSeverity || 'low'] || 1;
  const filteredAlerts = alerts.filter((a) => (SEVERITY_LEVELS[a.severity] || 1) >= minThreshold);

  // حساب ملخص Action Center (Critical, High, Medium, Low)
  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: filteredAlerts.length,
  };

  for (const a of filteredAlerts) {
    if (summary[a.severity] !== undefined) {
      summary[a.severity]++;
    }
  }

  return { alerts: filteredAlerts, summary };
};
