import { describe, it, expect } from 'vitest';
import { scanRiskAlerts } from '../src/services/riskEngineService.ts';

describe('Anti-Fraud & Risk Engine Service', () => {
  it('يقوم بفحص التنبيهات ويعيد قائمة تنبيهات مع ملخص درجات الخطورة', async () => {
    const result = await scanRiskAlerts();

    expect(result).toHaveProperty('alerts');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.alerts)).toBe(true);

    expect(result.summary).toHaveProperty('critical');
    expect(result.summary).toHaveProperty('high');
    expect(result.summary).toHaveProperty('medium');
    expect(result.summary).toHaveProperty('low');
    expect(result.summary).toHaveProperty('total');

    expect(result.summary.total).toBe(result.alerts.length);
  });

  it('يلتزم كل تنبيه بالنموذج القياسي الصارم للمشروع', async () => {
    const result = await scanRiskAlerts();

    for (const alert of result.alerts) {
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('severity');
      expect(['critical', 'high', 'medium', 'low']).toContain(alert.severity);
      expect(alert).toHaveProperty('user');
      expect(alert).toHaveProperty('branch');
      expect(alert).toHaveProperty('timestamp');
      expect(alert).toHaveProperty('event');
      expect(alert).toHaveProperty('reference');
      expect(alert.reference).toHaveProperty('type');
      expect(alert.reference).toHaveProperty('id');
      expect(alert).toHaveProperty('explanation');
      expect(typeof alert.explanation).toBe('string');
    }
  });

  it('يدعم تصفية التنبيهات بحسب الحد الأدنى لمستوى الخطورة (minSeverity)', async () => {
    const criticalOnly = await scanRiskAlerts({ minSeverity: 'critical' });
    for (const alert of criticalOnly.alerts) {
      expect(alert.severity).toBe('critical');
    }

    const highAndAbove = await scanRiskAlerts({ minSeverity: 'high' });
    for (const alert of highAndAbove.alerts) {
      expect(['high', 'critical']).toContain(alert.severity);
    }
  });

  it('يتعامل بمرونة وأمان مع الفلاتر الزمنية وتحديد الفرع', async () => {
    const filtered = await scanRiskAlerts({
      warehouseId: 999999, // مخزن غير موجود
      startDate: new Date('2020-01-01'),
      endDate: new Date('2020-01-02'),
    });

    expect(filtered.alerts).toEqual([]);
    expect(filtered.summary.total).toBe(0);
  });
});
