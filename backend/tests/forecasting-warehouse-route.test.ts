import express, { type Request, type Response, type NextFunction } from 'express';
import { once } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ role: 'cashier', query: vi.fn(), forecast: vi.fn() }));
vi.mock('../src/database/pool.ts', () => ({ query: fixtures.query }));
vi.mock('../src/middleware/auth.ts', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { id: 17, role_name: fixtures.role } });
    next();
  },
  authorize: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../src/controllers/apiController.ts', () => {
  const handler = (_req: Request, res: Response) => res.json({ success: true });
  return {
    forecasting: {
      getDemandForecast: fixtures.forecast,
      getBasketAssociations: handler,
      askCopilot: handler,
      getStaffingForecast: fixtures.forecast,
      getSmartPricingAlerts: handler,
      getCashFlowProjection: fixtures.forecast,
      suggestExpenseCategory: handler,
    },
    pl: { report: handler, trend: handler },
    users: { reports: handler },
  };
});
import router from '../src/routes/reports.routes.ts';

const app = express();
app.use('/api', router);
app.use((error: { statusCode?: number }, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  res.status(error.statusCode || 500).json({ message: 'fixture validation error' });
});
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
async function getRoute(path: string) {
  const response = await fetch(baseUrl + path);
  return { status: response.status, body: await response.json() };
}
beforeEach(() => {
  fixtures.role = 'cashier';
  fixtures.query.mockReset().mockResolvedValue({ rows: [{ id: 2 }] });
  fixtures.forecast
    .mockReset()
    .mockImplementation((req: Request, res: Response) =>
      res.json({ warehouse: String(req.query.warehouse_id) }),
    );
});

describe.each(['/api/forecasting', '/api/forecasting/staffing'])('%s warehouse access', (path) => {
  it('blocks a permitted report reader from forecasting another warehouse', async () => {
    const response = await getRoute(`${path}?warehouse_id=3`);
    expect(response.status).toBe(403);
    expect(fixtures.forecast).not.toHaveBeenCalled();
  });

  it('defaults a restricted report reader to their assigned warehouse', async () => {
    const response = await getRoute(path);
    expect(response.status).toBe(200);
    expect(response.body.warehouse).toBe('2');
  });

  it('allows the assigned warehouse explicitly', async () => {
    const response = await getRoute(`${path}?warehouse_id=2`);
    expect(response.status).toBe(200);
    expect(response.body.warehouse).toBe('2');
  });

  it('retains administrative access to all shop warehouses', async () => {
    fixtures.role = 'admin';
    const response = await getRoute(`${path}?warehouse_id=3`);
    expect(response.status).toBe(200);
    expect(response.body.warehouse).toBe('3');
    expect(fixtures.query).not.toHaveBeenCalled();
  });

  it.each(['warehouse_id=2&warehouse_id=2', 'warehouse_id=0', 'warehouse_id=invalid'])(
    'rejects malformed warehouse selection %s before the forecasting service',
    async (query) => {
      const response = await getRoute(`${path}?${query}`);
      expect(response.status).toBe(400);
      expect(fixtures.forecast).not.toHaveBeenCalled();
    },
  );
});

describe('shop-wide cashflow access', () => {
  it.each(['cashier', 'inventory_clerk'])(
    'blocks warehouse-scoped role %s from the shop-wide cash balance',
    async (role) => {
      fixtures.role = role;
      const response = await getRoute('/api/forecasting/cashflow-projection?warehouse_id=2');
      expect(response.status).toBe(403);
      expect(fixtures.forecast).not.toHaveBeenCalled();
    },
  );

  it.each(['manager', 'admin'])(
    'allows global role %s to view shop-wide liquidity',
    async (role) => {
      fixtures.role = role;
      const response = await getRoute('/api/forecasting/cashflow-projection?warehouse_id=2');
      expect(response.status).toBe(200);
      expect(fixtures.forecast).toHaveBeenCalledOnce();
    },
  );
});
