import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const { writeAudit } = vi.hoisted(() => ({ writeAudit: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock('../src/database/pool.ts', () => ({ query: writeAudit }));
vi.mock('../src/database/maintenanceBarrier.ts', () => ({ recordMaintenancePrincipal: vi.fn() }));
import { auditLog } from '../src/middleware/auth.ts';

let server: Server;
let url: string;
const payload = {
  data: {
    id: 7,
    name: 'fixture',
    password: 'fixture-password',
    nested: { access_token: 'fixture-token' },
  },
};
beforeAll(async () => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { id: 1 };
    next();
  });
  app.use(auditLog('create', 'audit_fixture'));
  app.get('/json', (_req, res) => res.status(201).json(payload));
  app.get('/object', (_req, res) => res.send(payload));
  app.get('/serialized', (_req, res) => res.type('json').send(JSON.stringify(payload)));
  app.get('/failed', (_req, res) => res.status(400).json(payload));
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()));
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => writeAudit.mockClear());
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
for (const route of ['json', 'object', 'serialized']) {
  it(`records one redacted audit for an Express ${route} response`, async () => {
    const response = await fetch(`${url}/${route}`, { signal: AbortSignal.timeout(10000) });
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual(payload);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    const params = writeAudit.mock.calls[0][1];
    expect(params[3]).toBe(7);
    expect(JSON.parse(params[4])).toEqual({
      id: 7,
      name: 'fixture',
      password: '[REDACTED]',
      nested: { access_token: '[REDACTED]' },
    });
  });
}
it('does not record a successful operation for a failed response', async () => {
  expect((await fetch(`${url}/failed`, { signal: AbortSignal.timeout(10000) })).status).toBe(400);
  expect(writeAudit).not.toHaveBeenCalled();
});
