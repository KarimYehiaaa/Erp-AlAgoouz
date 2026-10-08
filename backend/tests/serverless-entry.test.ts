import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response } from 'express';

const requestFixture = (fields: Partial<Request>): Request =>
  Object.create(express.request, Object.getOwnPropertyDescriptors(fields));
const responseFixture = () => {
  const fields = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };
  const response: Response & typeof fields = Object.create(
    express.response,
    Object.getOwnPropertyDescriptors(fields),
  );
  return response;
};

const { app, getServerlessSchemaReadiness } = vi.hoisted(() => ({
  app: vi.fn(),
  getServerlessSchemaReadiness: vi.fn(),
}));
vi.mock('../src/app.ts', () => ({ default: app }));
vi.mock('../src/database/serverlessReadiness.ts', () => ({ getServerlessSchemaReadiness }));
import handler from '../../api/index.ts';
import healthHandler from '../../api/health.ts';
import backendHandler from '../api/index.ts';

describe('serverless entry point', () => {
  beforeEach(() => {
    app.mockReset();
    getServerlessSchemaReadiness.mockReset().mockResolvedValue({ ready: true, pendingCount: 0 });
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses the same implementation for health and other requests', () => {
    expect(healthHandler).toBe(handler);
  });

  it('provides a backend-project function and restores rewritten API paths', async () => {
    const req = requestFixture({
      url: '/api/index',
      originalUrl: '/api/index',
      headers: { 'x-matched-path': '/api/health' },
    });
    const res = responseFixture();
    await backendHandler(req, res);
    expect(app).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/health', originalUrl: '/api/health' }),
      res,
    );
  });

  it.each([
    ['root project', handler],
    ['backend project', backendHandler],
  ])(
    'blocks the %s entry when the database schema has pending migrations',
    async (_label, entry) => {
      getServerlessSchemaReadiness.mockResolvedValue({
        ready: false,
        pendingCount: 8,
        reason: 'pending-migrations',
      });
      const res = responseFixture();

      await entry(requestFixture({ url: '/api/health', headers: {} }), res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        code: 'DATABASE_SCHEMA_NOT_READY',
        message: expect.any(String),
      });
      expect(JSON.stringify(res.json.mock.calls)).not.toContain('pendingCount');
      expect(app).not.toHaveBeenCalled();
    },
  );

  it('fails closed without exposing connection errors when readiness cannot be checked', async () => {
    getServerlessSchemaReadiness.mockRejectedValue(new Error('secret-db-host-and-password'));
    const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };

    await handler({ url: '/api/health', headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'DATABASE_SCHEMA_UNAVAILABLE',
      message: expect.any(String),
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-db-host-and-password');
    expect(app).not.toHaveBeenCalled();
  });

  it('restores direct health requests in the backend-project rewrite', async () => {
    const req = requestFixture({
      url: '/api/index',
      originalUrl: '/api/index',
      headers: { 'x-matched-path': '/health' },
    });
    const res = responseFixture();
    await backendHandler(req, res);
    expect(app).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/health', originalUrl: '/health' }),
      res,
    );
  });

  it.each(['sync', 'async'])('does not expose %s execution errors', async (mode) => {
    const secret = 'database-password-and-internal-host';
    if (mode === 'sync')
      app.mockImplementation(() => {
        throw new Error(secret);
      });
    else app.mockRejectedValue(new Error(secret));
    const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };
    await healthHandler({ url: '/api/health', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(secret);
  });

  it('does not write a second response after headers were sent', async () => {
    app.mockImplementation(() => {
      throw new Error('already sent');
    });
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    await healthHandler({ url: '/api/health', headers: {} }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
