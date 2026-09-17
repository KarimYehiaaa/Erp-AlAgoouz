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

interface RequestOptions {
  timeoutMs?: number;
}

const callService = async <T>(
  endpoint: string,
  payload: any,
  options: RequestOptions = {},
): Promise<T | null> => {
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${ANALYTICS_SERVICE_URL.replace(/\/+$/, '')}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

  try {
    const url = `${ANALYTICS_SERVICE_URL.replace(/\/+$/, '')}/health`;
    const response = await fetch(url, { signal: controller.signal });
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
export const fetchPythonDemandForecast = async (payload: {
  forecast_days: number;
  products: any[];
}) => {
  return await callService<{ status: string; forecast_days: number; results: any[] }>(
    '/forecast/demand',
    payload,
  );
};

/**
 * طلب تقييم مخاطر انقطاع العملاء عبر بايثون
 */
export const fetchPythonChurnRisk = async (customers: any[]) => {
  return await callService<{
    status: string;
    total_analyzed: number;
    high_risk_count: number;
    results: any[];
  }>('/analytics/churn-risk', { customers });
};

/**
 * طلب تحليل مصفوفة هندسة قائمة الطعام عبر بايثون
 */
export const fetchPythonMenuMatrix = async (items: any[]) => {
  return await callService<{
    status: string;
    total_items: number;
    benchmark_popularity: number;
    benchmark_profitability: number;
    items: any[];
  }>('/analytics/menu-matrix', { items });
};

/**
 * طلب فحص الشذوذ الإحصائي للعمليات
 */
export const fetchPythonAnomalies = async (points: any[], sensitivity = 2.5) => {
  return await callService<{
    status: string;
    anomalies_found: number;
    results: any[];
  }>('/analytics/anomalies', { points, sensitivity });
};
