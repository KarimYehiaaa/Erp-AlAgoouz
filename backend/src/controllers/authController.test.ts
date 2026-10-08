import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedAuth = vi.hoisted(() => ({
  login: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('../services/authService.ts', () => mockedAuth);

import { login, refresh } from './authController.ts';

const makeResponse = () => {
  const response: any = {
    cookie: vi.fn(),
    json: vi.fn(),
    status: vi.fn(() => response),
  };
  return response;
};

const makeRequest = (headers: Record<string, string>, body: Record<string, unknown> = {}) => ({
  body,
  cookies: {},
  headers: {},
  ip: '127.0.0.1',
  get: (name: string) => headers[name.toLowerCase()],
});

describe('auth controller desktop refresh-token channel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps refresh tokens in HttpOnly cookies when a browser spoofs the desktop marker', async () => {
    mockedAuth.login.mockResolvedValue({ token: 'access', refreshToken: 'refresh' });
    const response = makeResponse();

    await login(
      makeRequest({ 'x-client-type': 'desktop-pos', origin: 'https://agoouz.vercel.app' }),
      response,
      vi.fn(),
    );

    expect(response.json).toHaveBeenCalledWith({ success: true, data: { token: 'access' } });
    expect(response.cookie).toHaveBeenCalledTimes(2);
  });

  it('returns refresh tokens to the Electron desktop runtime', async () => {
    mockedAuth.login.mockResolvedValue({ token: 'access', refreshToken: 'refresh' });
    const response = makeResponse();

    await login(
      makeRequest({
        'x-client-type': 'desktop-pos',
        'user-agent': 'Mozilla/5.0 Electron/38.1.0',
      }),
      response,
      vi.fn(),
    );

    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { token: 'access', refreshToken: 'refresh' },
    });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('does not disclose a rotated cookie refresh token to a browser spoofing the marker', async () => {
    mockedAuth.refreshAccessToken.mockResolvedValue({
      token: 'access-2',
      refreshToken: 'refresh-2',
    });
    const response = makeResponse();

    await refresh(makeRequest({ 'x-client-type': 'desktop-pos' }, {}), response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: 'رمز التحديث (Refresh token) مطلوب',
    });
    expect(mockedAuth.refreshAccessToken).not.toHaveBeenCalled();
  });
});
