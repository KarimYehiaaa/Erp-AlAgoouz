import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const appMock = vi.hoisted(() => vi.fn());
const restorePathMock = vi.hoisted(() => vi.fn());

vi.mock('../../backend/src/app.ts', () => ({ default: appMock }));
vi.mock('../../backend/src/utils/vercelRequestPath.ts', () => ({
  restoreVercelRequestPath: restorePathMock,
}));
vi.mock('../src/app.ts', () => ({ default: appMock }));
vi.mock('../src/utils/vercelRequestPath.ts', () => ({
  restoreVercelRequestPath: restorePathMock,
}));

import handler from '../../api/index.ts';
import backendHandler from '../api/index.ts';

describe('root Vercel function log redaction', () => {
  const logSpy = vi.spyOn(console, 'log');
  const errorSpy = vi.spyOn(console, 'error');

  beforeEach(() => {
    appMock.mockReset();
    restorePathMock.mockReset();
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not log query values or raw errors from production requests', async () => {
    const querySecret = 'refresh-token-secret';
    const exceptionSecret = 'database-password-secret';
    const failure = new Error(`failure containing ${exceptionSecret}`);
    failure.name = exceptionSecret;
    appMock.mockRejectedValue(failure);
    const req = {
      method: 'GET',
      url: `/api/v1/auth/refresh?token=${querySecret}`,
      originalUrl: `/auth/refresh?token=${querySecret}`,
    } as unknown as Request;
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;

    await handler(req, res);
    await backendHandler(req, res);

    expect(restorePathMock).toHaveBeenCalledTimes(2);
    expect(restorePathMock).toHaveBeenCalledWith(req);
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(querySecret);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(querySecret);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(exceptionSecret);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.any(String) }),
    );
  });
});
