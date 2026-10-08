import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query }));

describe('serverless database readiness', () => {
  beforeEach(() => query.mockReset());

  it('compares the deployed migration ledger with the backend migration files', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ version: '087_restrict_stock_view_access.sql' }] });

    const { getServerlessSchemaReadiness } = await import('../src/database/serverlessReadiness.ts');
    const readiness = await getServerlessSchemaReadiness();

    expect(readiness.ready).toBe(false);
    if (readiness.ready) throw new Error('Expected pending schema migrations');
    expect(readiness.reason).toBe('pending-migrations');
    expect(readiness.pendingCount).toBeGreaterThan(0);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("table_name = 'schema_migrations'");
    expect(query.mock.calls[1][0]).toBe('SELECT version FROM public.schema_migrations');
  });
});
