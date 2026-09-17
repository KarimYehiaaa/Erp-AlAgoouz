/**
 * analyticsCompanionService.ts — عميل الربط مع خدمة التحليلات المرافقة (Python Companion Layer)
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * يقوم بإرسال الحسابات الإحصائية ونماذج التنبؤ المعقدة إلى microservice بايثون عند توفره،
 * مع وجود Fallback تلقائي وفوري للخوارزميات المحلية في Node.js عند عدم توفر الخدمة
 * لضمان عدم توقف النظام نهائياً.
 */
import { logger } from './loggerService.ts';

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:8001';
const REQUEST_TIMEOUT_MS = 2000;

export interface RequestOptions {
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Transfer Objects (DTOs)
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoricalSalesPoint {
  date: string;
  quantity: number;
}

export interface ProductForecastInput {
  product_id: number;
  name_ar: string;
  category_name?: string | null;
  historical_sales: HistoricalSalesPoint[];
  current_stock?: number;
}

export interface ProductForecastOutput {
  product_id: number;
  name_ar: string;
  forecast_7d: number;
  forecast_30d: number;
  daily_forecast: number[];
  trend_slope: number;
  confidence_score: number;
  quality: string;
  mae?: number | null;
  mape?: number | null;
  data_points: number;
}

export interface DemandForecastRequest {
  forecast_days: number;
  products: ProductForecastInput[];
}

export interface DemandForecastResponse {
  status: string;
  forecast_days: number;
  results: ProductForecastOutput[];
}

export interface CustomerActivityInput {
  customer_id: number;
  name_ar: string;
  days_since_last_order: number;
  total_orders: number;
  total_spent: number;
  average_order_value: number;
}

export interface CustomerChurnOutput {
  customer_id: number;
  name_ar: string;
  churn_probability: number;
  churn_risk_score: number;
  risk_level: string;
  recommended_action: string;
}

export interface ChurnRiskRequest {
  customers: CustomerActivityInput[];
}

export interface ChurnRiskResponse {
  status: string;
  total_analyzed: number;
  high_risk_count: number;
  results: CustomerChurnOutput[];
}

export interface MenuItemInput {
  product_id: number;
  name_ar: string;
  category_name?: string | null;
  units_sold: number;
  unit_cost: number;
  unit_price: number;
}

export interface MenuItemOutput {
  product_id: number;
  name_ar: string;
  category_name?: string | null;
  units_sold: number;
  profit_margin_unit: number;
  total_profit: number;
  quadrant: string;
  recommendation: string;
}

export interface MenuMatrixRequest {
  items: MenuItemInput[];
}

export interface MenuMatrixResponse {
  status: string;
  total_items: number;
  benchmark_popularity: number;
  benchmark_profitability: number;
  items: MenuItemOutput[];
}

export interface MetricDataPoint {
  timestamp: string;
  entity_id: string;
  value: number;
  entity_type: string;
}

export interface AnomalyPointOutput {
  timestamp: string;
  entity_id: string;
  entity_type: string;
  value: number;
  z_score: number;
  is_anomaly: boolean;
  explanation: string;
  iqr_outlier?: boolean;
  q1?: number | null;
  q3?: number | null;
  lower_bound?: number | null;
  upper_bound?: number | null;
  quality?: string;
}

export interface AnomalyDetectionRequest {
  points: MetricDataPoint[];
  sensitivity?: number;
}

export interface AnomalyDetectionResponse {
  status: string;
  anomalies_found: number;
  results: AnomalyPointOutput[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Client Execution
// ─────────────────────────────────────────────────────────────────────────────

const callService = async <T>(
  endpoint: string,
  payload: unknown,
  options: RequestOptions = {},
): Promise<T | null> => {
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
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

    const data = (await response.json()) as T;
    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.debug(`[Analytics Companion] Request timeout (${timeoutMs}ms) on ${endpoint}`);
    } else {
      logger.debug(`[Analytics Companion] Service unavailable: ${err.message}`);
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
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * طلب تنبؤ متقدم للطلب عبر بايثون
 */
export const fetchPythonDemandForecast = async (
  payload: DemandForecastRequest,
): Promise<DemandForecastResponse | null> => {
  return await callService<DemandForecastResponse>('/forecast/demand', payload);
};

/**
 * طلب تقييم مخاطر انقطاع العملاء عبر بايثون
 */
export const fetchPythonChurnRisk = async (
  customers: CustomerActivityInput[],
): Promise<ChurnRiskResponse | null> => {
  return await callService<ChurnRiskResponse>('/analytics/churn-risk', { customers });
};

/**
 * طلب تحليل مصفوفة هندسة قائمة الطعام عبر بايثون
 */
export const fetchPythonMenuMatrix = async (
  items: MenuItemInput[],
): Promise<MenuMatrixResponse | null> => {
  return await callService<MenuMatrixResponse>('/analytics/menu-matrix', { items });
};

/**
 * طلب فحص الشذوذ الإحصائي للعمليات
 */
export const fetchPythonAnomalies = async (
  points: MetricDataPoint[],
  sensitivity = 2.5,
): Promise<AnomalyDetectionResponse | null> => {
  return await callService<AnomalyDetectionResponse>('/analytics/anomalies', {
    points,
    sensitivity,
  });
};
