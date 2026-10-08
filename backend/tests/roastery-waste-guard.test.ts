import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('../src/database/pool.ts', () => ({ query: queryMock }));

describe('roastery recipe waste guard', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('includes wastage movements recorded by the inventory write-off flow', async () => {
    queryMock.mockResolvedValue({
      rows: [{ name_ar: 'بن برازيلي', sku: 'COF-01', wasted_qty: '0.25', unit: 'kg' }],
    });
    const { AUTOMATION_HANDLERS } = await import('../src/services/automationHandlers.ts');

    const result = await AUTOMATION_HANDLERS.roastery_recipe_waste_guard({
      key: 'roastery_recipe_waste_guard',
      config: {},
      scheduledFor: new Date('2026-10-03T02:00:00Z'),
    });

    expect(queryMock).toHaveBeenCalledOnce();
    expect(queryMock.mock.calls[0][0]).toContain("'wastage'");
    expect(queryMock.mock.calls[0][0]).toContain('sm.from_warehouse_id IS NOT NULL');
    expect(queryMock.mock.calls[0][0]).toContain('sm.to_warehouse_id IS NULL');
    expect(queryMock.mock.calls[0][0]).not.toContain('sm.quantity < 0');
    expect(result.status).toBe('warning');
    expect(result.text).toContain('0.25');
  });
});
