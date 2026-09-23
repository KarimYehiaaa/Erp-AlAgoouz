import { beforeEach, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query }));
import { WarehouseBalancingService } from '../src/services/warehouseBalancingService.ts';

beforeEach(() => query.mockReset());
function arrange(stocks: [number, number][], velocities: [number, number][]) {
  query.mockResolvedValueOnce({ rows: [1, 2, 3].map((id) => ({ id, name_ar: `W${id}` })) });
  query.mockResolvedValueOnce({ rows: velocities.map(([warehouse_id, daily_velocity]) => ({ warehouse_id, product_id: 1, daily_velocity })) });
  query.mockResolvedValueOnce({ rows: stocks.map(([warehouse_id, current_stock]) => ({ warehouse_id, current_stock, product_id: 1, product_name: 'بن', warehouse_name: `W${warehouse_id}`, unit: 'كجم' })) });
}
it('allocates a shared surplus only once across deficit warehouses', async () => {
  arrange([[1, 6], [2, 0], [3, 0]], [[2, 1], [3, 1]]);
  const { recommendations } = await WarehouseBalancingService.generateBalancingRecommendations();
  expect(recommendations.reduce((sum, rec) => sum + rec.suggestedQty, 0)).toBe(6);
});
it('preserves fractional replenishment quantities', async () => {
  arrange([[1, 6.25], [2, 0]], [[2, 0.4]]);
  const { recommendations } = await WarehouseBalancingService.generateBalancingRecommendations();
  expect(recommendations[0]?.suggestedQty).toBe(2.8);
});
it('combines all batches of a product in the same warehouse', async () => {
  arrange([[1, 3], [1, 3], [2, 0]], [[2, 1]]);
  const { recommendations } = await WarehouseBalancingService.generateBalancingRecommendations();
  expect(recommendations).toHaveLength(1);
  expect(recommendations[0]?.suggestedQty).toBe(6);
});
it('fills a deficit from multiple donors without exceeding its target', async () => {
  arrange([[1, 8], [2, 8], [3, 0]], [[3, 2]]);
  const { recommendations } = await WarehouseBalancingService.generateBalancingRecommendations();
  expect(recommendations.map((rec) => rec.suggestedQty)).toEqual([8, 6]);
});
it('retains donor safety stock and allocates to three-decimal precision', async () => {
  arrange([[1, 16.001], [2, 0], [3, 0]], [[1, 1], [2, 1], [3, 1]]);
  const { recommendations } = await WarehouseBalancingService.generateBalancingRecommendations();
  expect(recommendations.map((rec) => rec.suggestedQty)).toEqual([6.001]);
});
