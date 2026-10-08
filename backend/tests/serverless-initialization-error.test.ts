import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const { loadInstrumentedApp, getServerlessSchemaReadiness, restoreVercelRequestPath } = vi.hoisted(
  () => ({
    loadInstrumentedApp: vi.fn(),
    getServerlessSchemaReadiness: vi.fn(),
    restoreVercelRequestPath: vi.fn(),
  }),
);
vi.mock('../src/appLoader.ts', () => ({ loadInstrumentedApp }));
vi.mock('../src/database/serverlessReadiness.ts', () => ({ getServerlessSchemaReadiness }));
vi.mock('../src/utils/vercelRequestPath.ts', () => ({ restoreVercelRequestPath }));
import rootHandler from '../../api/index.ts';
import backendHandler from '../api/index.ts';

describe.each([
  ['root project', rootHandler],
  ['backend project', backendHandler],
] as const)('%s initialization error boundary', (_label, handler) => {
  const secret = 'isolated-secret-host-password-never-deploy';
  const request = {
    method: 'GET',
    url: '/api/health?token=isolated-query-secret',
    headers: {},
  } as unknown as Request;
  const response = (headersSent = false) => ({
    headersSent,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  });

  beforeEach(() => {
    loadInstrumentedApp.mockReset();
    restoreVercelRequestPath.mockReset();
    getServerlessSchemaReadiness.mockReset().mockResolvedValue({ ready: true });
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['sync', 'async', 'non-error'] as const)(
    'handles %s loader failure without exposing initialization secrets',
    async (mode) => {
      const failure = new Error(secret);
      failure.name = secret;
      if (mode === 'async') loadInstrumentedApp.mockRejectedValue(failure);
      else
        loadInstrumentedApp.mockImplementation(() => {
          throw mode === 'non-error' ? secret : failure;
        });
      const res = response();
      await expect(handler(request, res as unknown as Response)).resolves.toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
      expect(getServerlessSchemaReadiness).not.toHaveBeenCalled();
      expect(JSON.stringify(res.json.mock.calls)).not.toContain(secret);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
      expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
        'isolated-query-secret',
      );
    },
  );

  it('does not write another response when initialization fails after headers were sent', async () => {
    loadInstrumentedApp.mockRejectedValue(new Error(secret));
    const res = response(true);
    await expect(handler(request, res as unknown as Response)).resolves.toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(getServerlessSchemaReadiness).not.toHaveBeenCalled();
  });

  it('keeps cloud initialization errors private even with development NODE_ENV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    loadInstrumentedApp.mockRejectedValue(new Error(secret));
    const res = response();
    await handler(request, res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(secret);
  });

  it('contains request-path restoration failures before loading the application', async () => {
    restoreVercelRequestPath.mockImplementation(() => {
      throw new Error(secret);
    });
    const res = response();
    await expect(handler(request, res as unknown as Response)).resolves.toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(loadInstrumentedApp).not.toHaveBeenCalled();
    expect(getServerlessSchemaReadiness).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });
});
