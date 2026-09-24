import { beforeEach, expect, it, vi } from 'vitest';
const { query, generate, send } = vi.hoisted(() => ({ query: vi.fn(), generate: vi.fn(), send: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query, withTransaction: vi.fn() }));
vi.mock('../src/services/warehouseBalancingService.ts', () => ({
  default: { generateBalancingRecommendations: generate },
}));
vi.mock('../src/services/telegramBotService.ts', () => ({ default: {
  getBotCredentials: vi.fn().mockResolvedValue({ token: '', defaultChatId: '' }),
} }));
vi.mock('../src/services/telegramService.ts', () => ({ default: { sendMessage: send } }));
import { WorkflowGraphService } from '../src/services/workflowGraphService.ts';
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
  generate.mockReset().mockResolvedValue({ recommendations: [], htmlReport: 'warehouse report' });
  send.mockClear();
});
it.each(['warehouse_stock_balancing', 'warehouse_stock_rebalance', 'warehouse_balancing'])(
  'runs saved %s through the single warehouse implementation', async (key) => {
    query.mockResolvedValueOnce({ rows: [{ id: 91, key, is_enabled: true }] });
    const result = await WorkflowGraphService.runAutomationNow(key);
    expect(result.success).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual(['warehouse_balancing', key]);
    expect(query.mock.calls[1]?.[1]?.[1]).toBe('warehouse_balancing');
    expect(send).not.toHaveBeenCalled();
  },
);
it('routes a saved warehouse alias to the canonical automation', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: 91, key: 'warehouse_balancing', is_enabled: true }] });
  const result = await WorkflowGraphService.runAutomationNow('warehouse_stock_rebalance');
  expect(result.success).toBe(true);
  expect(generate).toHaveBeenCalledOnce();
  const statusUpdate = query.mock.calls.find(([sql]) => sql.includes('SET last_run_at = NOW(), last_status = $1'));
  expect(statusUpdate?.[1]?.[1]).toBe('warehouse_balancing');
});
