/**
 * analyticsCompanionService.ts — عميل الربط مع خدمة التحليلات المرافقة (Python Companion Layer)
 *
 * يرسل الحسابات الإحصائية ونماذج التنبؤ المعقدة إلى microservice بايثون عند توفره،
 * مع التحقق الصارم من صحة الاستجابات أثناء التشغيل (Runtime Validation) عبر مكتبة Zod.
 * يعيد null عند عدم توفر الخدمة أو فشل التحقق ليختار المستدعي بديله المحلي.
 * هذا عميل اختياري؛ مسارات ERP الحالية لا تستدعيه تلقائيًا.
 */
import { z } from 'zod';
import { logger } from './loggerService.ts';

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:8001';
const DEFAULT_TIMEOUT_MS = 2000;

export interface RequestOptions {
  timeoutMs?: number;
}

export const parseTimeout = (raw: string | undefined): number => {
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(parsed);
};

export const getAnalyticsTimeoutMs = (): number => {
  return parseTimeout(process.env.ANALYTICS_TIMEOUT_MS);
};

// Zod Runtime Validation Schemas

export const HistoricalSalesPointSchema = z.object({
  date: z.string(),
  quantity: z.number().finite(),
});

export const ProductForecastInputSchema = z.object({
  product_id: z.number().finite(),
  name_ar: z.string(),
  category_name: z.string().nullable().optional(),
  historical_sales: z.array(HistoricalSalesPointSchema),
  current_stock: z.number().finite().optional(),
});

export const ProductForecastOutputSchema = z.object({
  product_id: z.number().finite(),
  name_ar: z.string(),
  forecast_7d: z.number().finite(),
  forecast_30d: z.number().finite(),
  daily_forecast: z.array(z.number().finite()),
  trend_slope: z.number().finite(),
  confidence_score: z.number().finite().min(0).max(1),
  quality: z.string(),
  mae: z.number().finite().nullable().optional(),
  mape: z.number().finite().nullable().optional(),
  data_points: z.number().finite().nonnegative(),
});

export const DemandForecastRequestSchema = z.object({
  forecast_days: z.number().finite().int().min(1).max(365),
  products: z.array(ProductForecastInputSchema),
});

export const DemandForecastResponseSchema = z.object({
  status: z.string(),
  forecast_days: z.number().finite().int().min(1).max(365),
  results: z.array(ProductForecastOutputSchema),
});

export const CustomerActivityInputSchema = z.object({
  customer_id: z.number().finite(),
  name_ar: z.string(),
  days_since_last_order: z.number().finite(),
  total_orders: z.number().finite(),
  total_spent: z.number().finite(),
  average_order_value: z.number().finite(),
});

export const CustomerChurnOutputSchema = z.object({
  customer_id: z.number().finite(),
  name_ar: z.string(),
  churn_risk_estimate: z.number().finite().min(0).max(1).optional(),
  churn_probability: z.number().finite().min(0).max(1).optional(),
  churn_risk_score: z.number().finite().min(0).max(100),
  risk_level: z.string(),
  recommended_action: z.string(),
});

export const ChurnRiskRequestSchema = z.object({
  customers: z.array(CustomerActivityInputSchema),
});

export const ChurnRiskResponseSchema = z.object({
  status: z.string(),
  total_analyzed: z.number().finite().nonnegative(),
  high_risk_count: z.number().finite().nonnegative(),
  results: z.array(CustomerChurnOutputSchema),
});

export const MenuItemInputSchema = z.object({
  product_id: z.number().finite(),
  name_ar: z.string(),
  category_name: z.string().nullable().optional(),
  units_sold: z.number().finite(),
  unit_cost: z.number().finite(),
  unit_price: z.number().finite(),
});

export const MenuItemOutputSchema = z.object({
  product_id: z.number().finite(),
  name_ar: z.string(),
  category_name: z.string().nullable().optional(),
  units_sold: z.number().finite(),
  profit_margin_unit: z.number().finite(),
  total_profit: z.number().finite(),
  quadrant: z.string(),
  recommendation: z.string(),
});

export const MenuMatrixRequestSchema = z.object({
  items: z.array(MenuItemInputSchema),
});

export const MenuMatrixResponseSchema = z.object({
  status: z.string(),
  total_items: z.number().finite().nonnegative(),
  benchmark_popularity: z.number().finite(),
  benchmark_profitability: z.number().finite(),
  items: z.array(MenuItemOutputSchema),
});

export const MetricDataPointSchema = z.object({
  timestamp: z.string(),
  entity_id: z.string(),
  value: z.number().finite(),
  entity_type: z.string(),
});

export const AnomalyPointOutputSchema = z.object({
  timestamp: z.string(),
  entity_id: z.string(),
  entity_type: z.string(),
  value: z.number().finite(),
  z_score: z.number().finite(),
  is_anomaly: z.boolean(),
  explanation: z.string(),
  iqr_outlier: z.boolean().optional(),
  q1: z.number().finite().nullable().optional(),
  q3: z.number().finite().nullable().optional(),
  lower_bound: z.number().finite().nullable().optional(),
  upper_bound: z.number().finite().nullable().optional(),
  quality: z.string().optional(),
});

export const AnomalyDetectionRequestSchema = z.object({
  points: z.array(MetricDataPointSchema),
  sensitivity: z.number().finite().positive().optional(),
});

export const AnomalyDetectionResponseSchema = z.object({
  status: z.string(),
  anomalies_found: z.number().finite().nonnegative(),
  results: z.array(AnomalyPointOutputSchema),
});

// Inferred TypeScript types derived from Zod schemas
export type HistoricalSalesPoint = z.infer<typeof HistoricalSalesPointSchema>;
export type ProductForecastInput = z.infer<typeof ProductForecastInputSchema>;
export type ProductForecastOutput = z.infer<typeof ProductForecastOutputSchema>;
export type DemandForecastRequest = z.infer<typeof DemandForecastRequestSchema>;
export type DemandForecastResponse = z.infer<typeof DemandForecastResponseSchema>;

export type CustomerActivityInput = z.infer<typeof CustomerActivityInputSchema>;
export type CustomerChurnOutput = z.infer<typeof CustomerChurnOutputSchema>;
export type ChurnRiskRequest = z.infer<typeof ChurnRiskRequestSchema>;
export type ChurnRiskResponse = z.infer<typeof ChurnRiskResponseSchema>;

export type MenuItemInput = z.infer<typeof MenuItemInputSchema>;
export type MenuItemOutput = z.infer<typeof MenuItemOutputSchema>;
export type MenuMatrixRequest = z.infer<typeof MenuMatrixRequestSchema>;
export type MenuMatrixResponse = z.infer<typeof MenuMatrixResponseSchema>;

export type MetricDataPoint = z.infer<typeof MetricDataPointSchema>;
export type AnomalyPointOutput = z.infer<typeof AnomalyPointOutputSchema>;
export type AnomalyDetectionRequest = z.infer<typeof AnomalyDetectionRequestSchema>;
export type AnomalyDetectionResponse = z.infer<typeof AnomalyDetectionResponseSchema>;

// Service Client Execution

const callService = async <T>(
  endpoint: string,
  payload: unknown,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T | null> => {
  const timeoutMs = options.timeoutMs || getAnalyticsTimeoutMs();
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = process.env.ANALYTICS_API_KEY;
  if (apiKey) {
    headers['X-Analytics-Service-Key'] = apiKey;
  }

  try {
    const url = `${ANALYTICS_SERVICE_URL.replace(/\/+$/, '')}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        `[Analytics Companion] Service responded with HTTP ${response.status} on ${endpoint}`,
      );
      return null;
    }

    let rawData: unknown;
    try {
      rawData = await response.json();
    } catch {
      logger.warn(`[Analytics Companion] Failed to parse JSON response on ${endpoint}`);
      return null;
    }

    const validation = schema.safeParse(rawData);
    if (!validation.success) {
      const durationMs = Date.now() - startTime;
      const issuesSummary = validation.error.issues
        .map((iss) => `${iss.path.join('.') || 'root'}: ${iss.message}`)
        .join('; ');
      logger.warn(
        `[Analytics Companion] ANALYTICS_RESPONSE_VALIDATION_FAILED on ${endpoint} (${durationMs}ms): ${issuesSummary}`,
      );
      return null;
    }

    return validation.data;
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const message = err instanceof Error ? err.message : String(err);
    if (isAbort) {
      logger.debug(
        `[Analytics Companion] Request timeout after ${durationMs}ms (limit ${timeoutMs}ms) on ${endpoint}`,
      );
    } else {
      logger.debug(`[Analytics Companion] Service unavailable on ${endpoint}: ${message}`);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * فحص هل خدمة التحليلات المرافقة نشطة
 */
export const checkAnalyticsServiceHealth = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000);

  const headers: Record<string, string> = {};
  const apiKey = process.env.ANALYTICS_API_KEY;
  if (apiKey) {
    headers['X-Analytics-Service-Key'] = apiKey;
  }

  try {
    const url = `${ANALYTICS_SERVICE_URL.replace(/\/+$/, '')}/health`;
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    return response.ok;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`[Analytics Companion] Health check failed: ${message}`);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * طلب تنبؤ متقدم للطلب عبر بايثون مع التحقق الصارم من صحة الاستجابة
 */
export const fetchPythonDemandForecast = async (
  payload: DemandForecastRequest,
): Promise<DemandForecastResponse | null> => {
  return await callService<DemandForecastResponse>(
    '/forecast/demand',
    payload,
    DemandForecastResponseSchema,
  );
};

/**
 * طلب تقييم مخاطر انقطاع العملاء عبر بايثون مع التحقق الصارم من صحة الاستجابة
 */
export const fetchPythonChurnRisk = async (
  customers: CustomerActivityInput[],
): Promise<ChurnRiskResponse | null> => {
  return await callService<ChurnRiskResponse>(
    '/analytics/churn-risk',
    { customers },
    ChurnRiskResponseSchema,
  );
};

/**
 * طلب تحليل مصفوفة هندسة قائمة الطعام عبر بايثون مع التحقق الصارم من صحة الاستجابة
 */
export const fetchPythonMenuMatrix = async (
  items: MenuItemInput[],
): Promise<MenuMatrixResponse | null> => {
  return await callService<MenuMatrixResponse>(
    '/analytics/menu-matrix',
    { items },
    MenuMatrixResponseSchema,
  );
};

/**
 * طلب فحص الشذوذ الإحصائي للعمليات مع التحقق الصارم من صحة الاستجابة
 */
export const fetchPythonAnomalies = async (
  points: MetricDataPoint[],
  sensitivity = 2.5,
): Promise<AnomalyDetectionResponse | null> => {
  return await callService<AnomalyDetectionResponse>(
    '/analytics/anomalies',
    { points, sensitivity },
    AnomalyDetectionResponseSchema,
  );
};
