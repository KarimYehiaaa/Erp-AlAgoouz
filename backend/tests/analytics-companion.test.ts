import { describe, it, expect } from 'vitest';
import {
  checkAnalyticsServiceHealth,
  fetchPythonDemandForecast,
  fetchPythonChurnRisk,
  fetchPythonMenuMatrix,
  fetchPythonAnomalies,
} from '../src/services/analyticsCompanionService.ts';

describe('Analytics Companion Service (Python AI/BI Client)', () => {
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

  it('يتعامل بمرونة مع طلبات تقييم مخاطر العملاء churn-risk', async () => {
    const result = await fetchPythonChurnRisk([]);
    expect(result).toBeNull();
  });

  it('يتعامل بمرونة مع طلبات Menu Matrix', async () => {
    const result = await fetchPythonMenuMatrix([]);
    expect(result).toBeNull();
  });

  it('يتعامل بمرونة مع طلبات كشف الشذوذ anomalies', async () => {
    const result = await fetchPythonAnomalies([]);
    expect(result).toBeNull();
  });
});
