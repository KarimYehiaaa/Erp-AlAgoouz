import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('../src/database/pool.ts', () => ({ query: queryMock }));

describe('wastage reporting and risk detection', () => {
  beforeEach(() => queryMock.mockReset());

  it('includes wastage write-offs in the actual wastage report', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, actual_waste: '2' }] });
    const { getReports } = await import('../src/services/userService.ts');

    const report = await getReports('wastage');

    expect(queryMock).toHaveBeenCalledOnce();
    expect(queryMock.mock.calls[0][0]).toContain("sm.movement_type IN ('adjustment', 'wastage')");
    expect(report[0].actual_waste).toBe(2);
  });

  it('raises a labeled risk alert for a large wastage write-off', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 7,
          product_id: 3,
          product_name: 'بن برازيلي',
          quantity: '8',
          movement_type: 'wastage',
          notes: 'تالف',
          created_at: new Date('2026-10-03T06:00:00Z'),
          user_id: 1,
          user_name: 'مدير',
          warehouse_id: 2,
          warehouse_name: 'المخزن الرئيسي',
        },
      ],
    });
    const { DEFAULT_RISK_RULES, detectStockAdjustments } =
      await import('../src/services/riskEngineService.ts');

    const alerts = await detectStockAdjustments(null, null, null, DEFAULT_RISK_RULES);

    expect(queryMock.mock.calls[0][0]).toContain("sm.movement_type IN ('adjustment', 'wastage')");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].explanation).toContain('تسجيل هالك بمقدار +8');
  });
});
