/**
 * riskEngineService.ts — محرك كشف الاحتيال والمخاطر التشغيلية (Anti-Fraud & Risk Engine)
 *
 * يفحص وينبه آلياً عن:
 *  - الخصومات المفرطة (Excessive Discounts)
 *  - الفواتير الملغاة المتكررة (Repeated Voids / Cancellations)
 *  - فروقات نقدية الوردية (Cash Shift Discrepancies)
 *  - تسويات المخزون غير المعتادة (Unusual Stock Adjustments)
 *  - طلبات تجاوز PIN المتكررة (Repeated Manager PIN Overrides)
 *  - ورديات الكاشير المفتوحة لفترات غير منطقية (Unusual Long Shifts)
 *
 * كل تنبيه يلتزم بالنموذج الصارم:
 * { id, severity, user, warehouse, timestamp, event, reference, explanation, fingerprint }
 */
import { query } from '../database/pool.ts';
import { logger } from './loggerService.ts';
import type {
  RiskAlert,
  RiskSummary,
  RiskRuleConfig,
  DetectorExecutionResult,
  RiskScanResult,
} from '../../../shared/types.ts';

export interface RiskScanOptions {
  warehouseId?: number | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  minSeverity?: 'low' | 'medium' | 'high' | 'critical';
  rules?: Partial<RiskRuleConfig>;
}

export const DEFAULT_RISK_RULES: RiskRuleConfig = {
  discountPctThreshold: 20,
  discountAmtThreshold: 150,
  discountCriticalPct: 40,
  discountCriticalAmt: 300,
  voidCountThreshold: 2,
  voidCountCritical: 5,
  cashDiffThreshold: 20,
  cashDiffCritical: 100,
  stockAdjThreshold: 5,
  stockAdjCritical: 20,
  longShiftHours: 16,
  pinOverrideCount: 3,
  pinOverrideCritical: 6,
  dedupWindowMinutes: 60,
};

const SEVERITY_LEVELS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// Detectors (كواشف المخاطر المستقلة)

/**
 * 1. فحص الخصومات المفرطة
 */
export async function detectExcessiveDiscounts(
  warehouseId: number | null,
  startDate: Date | null,
  endDate: Date | null,
  rules: RiskRuleConfig,
): Promise<RiskAlert[]> {
  const alerts: RiskAlert[] = [];
  const res = await query(
    `SELECT s.id, s.sale_number, s.total_amount, s.subtotal, s.discount_amount, s.discount_percent,
            s.created_at, s.user_id, u.full_name as user_name, s.warehouse_id, w.name_ar as warehouse_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN warehouses w ON w.id = s.warehouse_id
     WHERE s.deleted_at IS NULL
       AND (s.discount_percent >= $1 OR s.discount_amount >= $2)
       AND ($3::int IS NULL OR s.warehouse_id = $3)
       AND ($4::timestamptz IS NULL OR s.created_at >= $4)
       AND ($5::timestamptz IS NULL OR s.created_at <= $5)
     ORDER BY s.created_at DESC
     LIMIT 50`,
    [rules.discountPctThreshold, rules.discountAmtThreshold, warehouseId, startDate, endDate],
  );

  for (const r of res.rows) {
    const discPct = Number(r.discount_percent || 0);
    const discAmt = Number(r.discount_amount || 0);
    const severity =
      discPct >= rules.discountCriticalPct || discAmt >= rules.discountCriticalAmt
        ? 'critical'
        : 'high';

    alerts.push({
      id: `risk-disc-${r.id}`,
      severity,
      user: { id: r.user_id, name: r.user_name || 'غير معروف' },
      warehouse: { id: r.warehouse_id, name: r.warehouse_name || 'المخزن الرئيسي' },
      timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      event: 'excessive_discount',
      reference: { type: 'sale', id: r.id },
      explanation: `تم تطبيق خصم مرتفع بنسبة ${discPct.toFixed(1)}% بقيمة ${discAmt.toFixed(2)} ج.م على الفاتورة #${r.sale_number}.`,
    });
  }

  return alerts;
}

/**
 * 2. فحص الفواتير الملغاة المتكررة للكاشير
 * ملاحظة هامة: لا يتم فحص s.deleted_at IS NULL لأن عمليات الإلغاء تضع deleted_at = NOW()
 * مع حالة status = 'cancelled'، لذا يتم تضمين كافة الفواتير الملغاة.
 */
export async function detectRepeatedVoids(
  warehouseId: number | null,
  startDate: Date | null,
  endDate: Date | null,
  rules: RiskRuleConfig,
): Promise<RiskAlert[]> {
  const alerts: RiskAlert[] = [];
  const res = await query(
    `SELECT s.user_id, u.full_name as user_name, s.warehouse_id, w.name_ar as warehouse_name,
            COUNT(*) as void_count, MAX(COALESCE(s.deleted_at, s.created_at)) as latest_time
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN warehouses w ON w.id = s.warehouse_id
     WHERE s.status IN ('cancelled', 'voided')
       AND ($1::int IS NULL OR s.warehouse_id = $1)
       AND ($2::timestamptz IS NULL OR COALESCE(s.deleted_at, s.created_at) >= $2)
       AND ($3::timestamptz IS NULL OR COALESCE(s.deleted_at, s.created_at) <= $3)
     GROUP BY s.user_id, u.full_name, s.warehouse_id, w.name_ar
     HAVING COUNT(*) >= $4
     ORDER BY void_count DESC`,
    [warehouseId, startDate, endDate, rules.voidCountThreshold],
  );

  for (const r of res.rows) {
    const count = Number(r.void_count);
    const severity = count >= rules.voidCountCritical ? 'critical' : 'high';

    alerts.push({
      id: `risk-void-user-${r.user_id}`,
      severity,
      user: { id: r.user_id, name: r.user_name || 'كاشير' },
      warehouse: { id: r.warehouse_id, name: r.warehouse_name || 'المخزن' },
      timestamp: r.latest_time ? new Date(r.latest_time).toISOString() : new Date().toISOString(),
      event: 'repeated_voids',
      reference: { type: 'user', id: r.user_id },
      explanation: `قام الكاشير بإلغاء ${count} فواتير بيع خلال النطاق الزمني المحدد، وهو نمط يستوجب التدقيق.`,
    });
  }

  return alerts;
}

/**
 * 3. فحص عجز وزيادة نقدية الورديات (Cash Difference)
 */
export async function detectCashDifferences(
  warehouseId: number | null,
  startDate: Date | null,
  endDate: Date | null,
  rules: RiskRuleConfig,
): Promise<RiskAlert[]> {
  const alerts: RiskAlert[] = [];
  const res = await query(
    `SELECT ps.id, ps.shift_number, ps.cashier_user_id as user_id, u.full_name as user_name,
            ps.warehouse_id, w.name_ar as warehouse_name, ps.opening_cash, ps.expected_cash,
            ps.actual_cash, ps.cash_difference, ps.closed_at, ps.opened_at
     FROM pos_shifts ps
     LEFT JOIN users u ON u.id = ps.cashier_user_id
     LEFT JOIN warehouses w ON w.id = ps.warehouse_id
     WHERE ps.status IN ('closed', 'audited')
       AND ABS(COALESCE(ps.cash_difference, 0)) >= $1
       AND ($2::int IS NULL OR ps.warehouse_id = $2)
       AND ($3::timestamptz IS NULL OR ps.opened_at >= $3)
       AND ($4::timestamptz IS NULL OR ps.opened_at <= $4)
     ORDER BY ps.closed_at DESC
     LIMIT 50`,
    [rules.cashDiffThreshold, warehouseId, startDate, endDate],
  );

  for (const r of res.rows) {
    const diff = Number(r.cash_difference || 0);
    const severity = Math.abs(diff) >= rules.cashDiffCritical ? 'critical' : 'high';
    const typeLabel = diff < 0 ? 'عجز نقدي' : 'فائض نقدي غير مبرر';

    alerts.push({
      id: `risk-shift-${r.id}`,
      severity,
      user: { id: r.user_id, name: r.user_name || 'كاشير' },
      warehouse: { id: r.warehouse_id, name: r.warehouse_name || 'المخزن' },
      timestamp: r.closed_at ? new Date(r.closed_at).toISOString() : new Date().toISOString(),
      event: 'cash_difference',
      reference: { type: 'pos_shift', id: r.id },
      explanation: `وُجد ${typeLabel} بقيمة ${Math.abs(diff).toFixed(2)} ج.م عند إغلاق الوردية #${r.shift_number}.`,
    });
  }

  return alerts;
}

/**
 * 4. فحص تسويات المخزون غير المعتادة
 */
export async function detectStockAdjustments(
  warehouseId: number | null,
  startDate: Date | null,
  endDate: Date | null,
  rules: RiskRuleConfig,
): Promise<RiskAlert[]> {
  const alerts: RiskAlert[] = [];
  const res = await query(
    `SELECT sm.id, sm.product_id, p.name_ar as product_name, sm.quantity, sm.movement_type,
            sm.notes, sm.created_at, sm.user_id, u.full_name as user_name,
            COALESCE(sm.to_warehouse_id, sm.from_warehouse_id) as warehouse_id,
            w.name_ar as warehouse_name
     FROM stock_movements sm
     LEFT JOIN products p ON p.id = sm.product_id
     LEFT JOIN users u ON u.id = sm.user_id
     LEFT JOIN warehouses w ON w.id = COALESCE(sm.to_warehouse_id, sm.from_warehouse_id)
     WHERE sm.movement_type = 'adjustment'
       AND ABS(sm.quantity) >= $1
       AND ($2::int IS NULL OR sm.to_warehouse_id = $2 OR sm.from_warehouse_id = $2)
       AND ($3::timestamptz IS NULL OR sm.created_at >= $3)
       AND ($4::timestamptz IS NULL OR sm.created_at <= $4)
     ORDER BY sm.created_at DESC
     LIMIT 50`,
    [rules.stockAdjThreshold, warehouseId, startDate, endDate],
  );

  for (const r of res.rows) {
    const qty = Number(r.quantity || 0);
    const severity = Math.abs(qty) >= rules.stockAdjCritical ? 'critical' : 'medium';

    alerts.push({
      id: `risk-adj-${r.id}`,
      severity,
      user: { id: r.user_id, name: r.user_name || 'مستخدم' },
      warehouse: { id: r.warehouse_id, name: r.warehouse_name || 'المخزن' },
      timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      event: 'stock_adjustment',
      reference: { type: 'stock_movement', id: r.id },
      explanation: `تسوية كمية يدوية بمقدار ${qty > 0 ? '+' : ''}${qty} للمنتج "${r.product_name || r.product_id}"${r.notes ? ` (السبب: ${r.notes})` : ''}.`,
    });
  }

  return alerts;
}

/**
 * 5. فحص الورديات المفتوحة لفترات طويلة غير مبررة
 */
export async function detectUnusualLongShifts(
  warehouseId: number | null,
  rules: RiskRuleConfig,
): Promise<RiskAlert[]> {
  const alerts: RiskAlert[] = [];
  const hoursInterval = `${Math.max(1, Math.floor(rules.longShiftHours))} hours`;
  const res = await query(
    `SELECT ps.id, ps.shift_number, ps.cashier_user_id as user_id, u.full_name as user_name,
            ps.warehouse_id, w.name_ar as warehouse_name, ps.opened_at,
            ROUND((EXTRACT(EPOCH FROM (NOW() - ps.opened_at))/3600)::numeric, 1) as hours_open
     FROM pos_shifts ps
     LEFT JOIN users u ON u.id = ps.cashier_user_id
     LEFT JOIN warehouses w ON w.id = ps.warehouse_id
     WHERE ps.status = 'open'
       AND ps.opened_at < NOW() - $1::interval
       AND ($2::int IS NULL OR ps.warehouse_id = $2)
     ORDER BY ps.opened_at ASC`,
    [hoursInterval, warehouseId],
  );

  for (const r of res.rows) {
    alerts.push({
      id: `risk-long-shift-${r.id}`,
      severity: 'high',
      user: { id: r.user_id, name: r.user_name || 'كاشير' },
      warehouse: { id: r.warehouse_id, name: r.warehouse_name || 'المخزن' },
      timestamp: r.opened_at ? new Date(r.opened_at).toISOString() : new Date().toISOString(),
      event: 'unusual_shift_duration',
      reference: { type: 'pos_shift', id: r.id },
      explanation: `الوردية #${r.shift_number} ما زالت مفتوحة منذ أكثر من ${r.hours_open} ساعة دون تقفيل مالي.`,
    });
  }

  return alerts;
}

/**
 * 6. فحص طلبات تجاوز PIN المتكررة (Manager Overrides)
 */
export async function detectRepeatedPinOverrides(
  warehouseId: number | null,
  startDate: Date | null,
  endDate: Date | null,
  rules: RiskRuleConfig,
): Promise<RiskAlert[]> {
  const alerts: RiskAlert[] = [];
  const res = await query(
    `SELECT mar.requester_user_id as user_id, u.full_name as user_name,
            mar.terminal_id, pt.warehouse_id, w.name_ar as warehouse_name,
            COUNT(*) as request_count, MAX(mar.created_at) as latest_time
     FROM manager_approval_requests mar
     LEFT JOIN users u ON u.id = mar.requester_user_id
     LEFT JOIN pos_terminals pt ON pt.id = mar.terminal_id
     LEFT JOIN warehouses w ON w.id = pt.warehouse_id
     WHERE ($1::int IS NULL OR pt.warehouse_id = $1)
       AND ($2::timestamptz IS NULL OR mar.created_at >= $2)
       AND ($3::timestamptz IS NULL OR mar.created_at <= $3)
     GROUP BY mar.requester_user_id, u.full_name, mar.terminal_id, pt.warehouse_id, w.name_ar
     HAVING COUNT(*) >= $4
     ORDER BY request_count DESC`,
    [warehouseId, startDate, endDate, rules.pinOverrideCount],
  );

  for (const r of res.rows) {
    const count = Number(r.request_count);
    const severity = count >= rules.pinOverrideCritical ? 'high' : 'medium';

    alerts.push({
      id: `risk-override-user-${r.user_id}`,
      severity,
      user: { id: r.user_id, name: r.user_name || 'كاشير' },
      warehouse: { id: r.warehouse_id, name: r.warehouse_name || 'المخزن' },
      timestamp: r.latest_time ? new Date(r.latest_time).toISOString() : new Date().toISOString(),
      event: 'repeated_pin_overrides',
      reference: { type: 'user', id: r.user_id },
      explanation: `طلب المستخدم ${count} موافقات استثنائية (تجاوز صلاحيات PIN) خلال الفترة المحددة.`,
    });
  }

  return alerts;
}

// Helper Functions: Deduplication & Fingerprinting

/**
 * حساب بصمة التنبيه لمنع الازدواجية خلال نافذة زمنية محددة
 */
export function generateAlertFingerprint(alert: RiskAlert, dedupWindowMinutes: number): string {
  const ts = new Date(alert.timestamp).getTime();
  const windowMs = Math.max(1, dedupWindowMinutes) * 60 * 1000;
  const timeBucket = Math.floor(ts / windowMs);

  const userId = alert.user?.id ?? '0';
  const warehouseId = alert.warehouse?.id ?? '0';
  const refType = alert.reference?.type ?? 'none';
  const refId = alert.reference?.id ?? '0';

  return `${alert.event}:${userId}:${warehouseId}:${refType}:${refId}:${timeBucket}`;
}

// Main Orchestrator: scanRiskAlerts

/**
 * فحص وتجميع التنبيهات الأمنية والمالية عبر كافة قنوات المخاطر بالتوازي (Promise.allSettled)
 */
export const scanRiskAlerts = async (options: RiskScanOptions = {}): Promise<RiskScanResult> => {
  const startTime = Date.now();
  const effectiveWarehouseId = options.warehouseId ?? null;
  const warehouseId = effectiveWarehouseId ? Number(effectiveWarehouseId) : null;
  const startDate = options.startDate ? new Date(options.startDate) : null;
  const endDate = options.endDate ? new Date(options.endDate) : null;

  const rules: RiskRuleConfig = {
    ...DEFAULT_RISK_RULES,
    ...(options.rules || {}),
  };

  // تعريف مهام الكشف المستقلة
  const detectors: Array<{
    name: string;
    run: () => Promise<RiskAlert[]>;
  }> = [
    {
      name: 'excessive_discounts',
      run: () => detectExcessiveDiscounts(warehouseId, startDate, endDate, rules),
    },
    {
      name: 'repeated_voids',
      run: () => detectRepeatedVoids(warehouseId, startDate, endDate, rules),
    },
    {
      name: 'cash_differences',
      run: () => detectCashDifferences(warehouseId, startDate, endDate, rules),
    },
    {
      name: 'stock_adjustments',
      run: () => detectStockAdjustments(warehouseId, startDate, endDate, rules),
    },
    {
      name: 'unusual_long_shifts',
      run: () => detectUnusualLongShifts(warehouseId, rules),
    },
    {
      name: 'repeated_pin_overrides',
      run: () => detectRepeatedPinOverrides(warehouseId, startDate, endDate, rules),
    },
  ];

  // تشغيل الكواشف بشكل متوازٍ ومستقل تماماً
  const detectorStartTimes = new Map<string, number>();
  const executionPromises = detectors.map(async (d) => {
    detectorStartTimes.set(d.name, Date.now());
    const res = await d.run();
    return { name: d.name, alerts: res };
  });

  const settledResults = await Promise.allSettled(executionPromises);

  const rawAlerts: RiskAlert[] = [];
  const detectorResults: DetectorExecutionResult[] = [];
  let successfulCount = 0;
  let failedCount = 0;

  settledResults.forEach((settled, idx) => {
    const detectorName = detectors[idx].name;
    const start = detectorStartTimes.get(detectorName) || startTime;
    const durationMs = Date.now() - start;

    if (settled.status === 'fulfilled') {
      successfulCount++;
      const { alerts } = settled.value;
      rawAlerts.push(...alerts);
      detectorResults.push({
        detector: detectorName,
        status: 'success',
        durationMs,
        alertsCount: alerts.length,
      });
    } else {
      failedCount++;
      const errorMsg = settled.reason?.message || String(settled.reason);
      logger.error(`❌ كاشف المخاطر [${detectorName}] فشل: ${errorMsg}`);
      detectorResults.push({
        detector: detectorName,
        status: 'failed',
        durationMs,
        alertsCount: 0,
        errorCode: 'DETECTOR_ERROR',
        errorMessage: errorMsg,
      });
    }
  });

  // تحديد الحالة العامة لتنفيذ المحرك
  let engineStatus: 'success' | 'degraded' | 'failed' = 'success';
  if (failedCount > 0) {
    engineStatus = successfulCount > 0 ? 'degraded' : 'failed';
  }

  // توليد البصمات ومنع التكرار (Deduplication)
  const seenFingerprints = new Set<string>();
  const deduplicatedAlerts: RiskAlert[] = [];

  for (const alert of rawAlerts) {
    const fingerprint = generateAlertFingerprint(alert, rules.dedupWindowMinutes);
    alert.fingerprint = fingerprint;

    if (!seenFingerprints.has(fingerprint)) {
      seenFingerprints.add(fingerprint);
      deduplicatedAlerts.push(alert);
    }
  }

  // فلترة بحسب الحد الأدنى لدرجة الخطورة (minSeverity)
  const minThreshold = SEVERITY_LEVELS[options.minSeverity || 'low'] || 1;
  const filteredAlerts = deduplicatedAlerts.filter(
    (a) => (SEVERITY_LEVELS[a.severity] || 1) >= minThreshold,
  );

  // حساب ملخص درجات الخطورة
  const summary: RiskSummary = {
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

  return {
    status: engineStatus,
    alerts: filteredAlerts,
    summary,
    detectorResults,
    scannedAt: new Date().toISOString(),
  };
};
