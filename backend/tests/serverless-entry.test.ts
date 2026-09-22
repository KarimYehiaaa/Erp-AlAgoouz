import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { app } = vi.hoisted(() => ({ app: vi.fn() }));
vi.mock('../src/app.ts', () => ({ default: app }));
import handler from '../../api/index.ts';
import healthHandler from '../../api/health.ts';

describe('serverless entry point', () => {
  beforeEach(() => {
    app.mockReset();
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

  it.each(['sync', 'async'])('does not expose %s execution errors', async (mode) => {
    const secret = 'database-password-and-internal-host';
    if (mode === 'sync') app.mockImplementation(() => { throw new Error(secret); });
    else app.mockRejectedValue(new Error(secret));
    const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() };
    await healthHandler({ url: '/api/health', headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(secret);
  });

  it('does not write a second response after headers were sent', async () => {
    app.mockImplementation(() => { throw new Error('already sent'); });
    const res = { headersSent: true, status: vi.fn(), json: vi.fn() };
    await healthHandler({ url: '/api/health', headers: {} }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
