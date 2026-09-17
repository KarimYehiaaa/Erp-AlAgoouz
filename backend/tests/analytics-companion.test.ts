import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAnalyticsServiceHealth,
  fetchPythonDemandForecast,
  fetchPythonChurnRisk,
  fetchPythonMenuMatrix,
  fetchPythonAnomalies,
  parseTimeout,
  getAnalyticsTimeoutMs,
} from '../src/services/analyticsCompanionService.ts';

describe('Analytics Companion Service (Python AI/BI Client)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('يعيد false عند عدم توفر خادم البايثون دون رمي استثناءات غير متوقعة', async () => {
    const isHealthy = await checkAnalyticsServiceHealth();
    expect(typeof isHealthy).toBe('boolean');
  });

  it('يعيد null بأمان وسرعة عند استدعاء forecast مع عدم تشغيل الخادم الخارجي', async () => {
    const result = await fetchPythonDemandForecast({
      forecast_days: 30,
      products: [],
    });
    expect(result).toBeNull();
  });

  it('يتعامل بمرونة مع طلبات تقييم مخاطر العملاء churn-risk عند غياب الخدمة', async () => {
    const result = await fetchPythonChurnRisk([]);
    expect(result).toBeNull();
  });

  it('يتعامل بمرونة مع طلبات Menu Matrix عند غياب الخدمة', async () => {
    const result = await fetchPythonMenuMatrix([]);
    expect(result).toBeNull();
  });

  it('يتعامل بمرونة مع طلبات كشف الشذوذ anomalies عند غياب الخدمة', async () => {
    const result = await fetchPythonAnomalies([]);
    expect(result).toBeNull();
  });

  it('يدعم ضبط وقراءة مهلة الطلب ANALYTICS_TIMEOUT_MS بأمان', () => {
    expect(parseTimeout('3000')).toBe(3000);
    expect(parseTimeout('0')).toBe(2000);
    expect(parseTimeout('-500')).toBe(2000);
    expect(parseTimeout('not-a-number')).toBe(2000);
    expect(parseTimeout('60000')).toBe(2000); // ترفض القيم الكبيرة جداً لحماية النظام

    process.env.ANALYTICS_TIMEOUT_MS = '4500';
    try {
      expect(getAnalyticsTimeoutMs()).toBe(4500);
    } finally {
      delete process.env.ANALYTICS_TIMEOUT_MS;
    }
  });

  it('يدعم تمرير مفتاح المصادقة ANALYTICS_API_KEY بأمان في الترويسات', async () => {
    process.env.ANALYTICS_API_KEY = 'test-secret-key-123';
    let capturedHeaders: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedHeaders = opts?.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' }),
      };
    }) as any;

    try {
      const isHealthy = await checkAnalyticsServiceHealth();
      expect(isHealthy).toBe(true);
      expect(capturedHeaders['X-Analytics-Service-Key']).toBe('test-secret-key-123');
    } finally {
      delete process.env.ANALYTICS_API_KEY;
    }
  });

  describe('Runtime Contract Validation (Zod Schemas & Error Fallbacks)', () => {
    it('Case 1: استجابة صحيحة ومطابقة للـ Schema (HTTP 200) -> تُقبل وتعاد بنجاح', async () => {
      const validPayload = {
        status: 'success',
        forecast_days: 7,
        results: [
          {
            product_id: 1,
            name_ar: 'بن تركي',
            forecast_7d: 25.5,
            forecast_30d: 110.0,
            daily_forecast: [3.5, 4.0, 3.0, 4.0, 3.5, 3.5, 4.0],
            trend_slope: 0.15,
            confidence_score: 0.92,
            quality: 'sufficient',
            mae: 1.2,
            mape: 5.4,
            data_points: 14,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validPayload,
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe('success');
      expect(result?.results[0].product_id).toBe(1);
      expect(result?.results[0].confidence_score).toBe(0.92);
    });

    it('Case 2: استجابة ذات نوع غير صحيح (Invalid Type: string instead of number) -> تفشل الـ Schema ويعاد Fallback null', async () => {
      const invalidTypePayload = {
        status: 'success',
        forecast_days: 7,
        results: [
          {
            product_id: 1,
            name_ar: 'بن تركي',
            forecast_7d: 'wrong_not_a_number', // نوع خاطئ
            forecast_30d: 110.0,
            daily_forecast: [1, 2, 3],
            trend_slope: 0.15,
            confidence_score: 0.92,
            quality: 'sufficient',
            data_points: 14,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidTypePayload,
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });

    it('Case 3: حقل إجباري مفقود (Missing required field: product_id) -> تفشل الـ Schema ويعاد Fallback null', async () => {
      const missingFieldPayload = {
        status: 'success',
        forecast_days: 7,
        results: [
          {
            // product_id مفقود
            name_ar: 'بن تركي',
            forecast_7d: 20.0,
            forecast_30d: 80.0,
            daily_forecast: [2, 3],
            trend_slope: 0.1,
            confidence_score: 0.8,
            quality: 'sufficient',
            data_points: 7,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => missingFieldPayload,
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });

    it('Case 4: قيمة رقمية خارج النطاق المسموح (confidence_score > 1.0) -> تفشل الـ Schema ويعاد Fallback null', async () => {
      const outOfRangePayload = {
        status: 'success',
        forecast_days: 7,
        results: [
          {
            product_id: 1,
            name_ar: 'بن تركي',
            forecast_7d: 20.0,
            forecast_30d: 80.0,
            daily_forecast: [2, 3],
            trend_slope: 0.1,
            confidence_score: 1.85, // خارج النطاق [0, 1]
            quality: 'sufficient',
            data_points: 7,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => outOfRangePayload,
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });

    it('Case 5: استجابة JSON مشوهة (Malformed JSON) -> معالجة آمنة والعودة للـ Fallback دون انهيار النظام', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });

    it('Case 6: خطأ خادم داخلي (HTTP 500) -> عودة آمنة للـ Fallback دون انهيار النظام', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal error' }),
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });

    it('Case 7: فشل المصادقة (HTTP 401 Unauthorized) -> عودة آمنة للـ Fallback دون انهيار النظام', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Unauthorized' }),
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });

    it('Case 8: انتهاء المهلة الزمنية (Request Timeout / AbortError) -> عودة آمنة للـ Fallback دون انهيار النظام', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }) as any;

      const result = await fetchPythonDemandForecast({
        forecast_days: 7,
        products: [],
      });

      expect(result).toBeNull();
    });
  });
});

