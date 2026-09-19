import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { api } from '../src/services/api';
import { sessionService } from '../src/services/sessionService';

describe('Desktop POS Axios & 401 Token Refresh Interceptor Tests', () => {
  const originalAdapter = api.defaults.adapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionService.clearSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    api.defaults.adapter = originalAdapter;
  });

  it('1. Injects Authorization header from sessionService.getAccessToken()', async () => {
    await sessionService.saveSession({
      token: 'valid-test-access-token',
      user: { id: 1, name: 'Cashier' },
    });

    let capturedConfig: any = null;
    api.defaults.adapter = async (config) => {
      capturedConfig = config;
      return {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await api.get('/products');

    expect(capturedConfig).not.toBeNull();
    const authHeader =
      capturedConfig.headers?.Authorization ||
      (typeof capturedConfig.headers?.get === 'function' && capturedConfig.headers.get('Authorization'));
    expect(authHeader).toBe('Bearer valid-test-access-token');
    expect(capturedConfig.withCredentials).toBe(true);
  });

  it('2. On 401 response: attempts refresh once, updates sessionService, and replays request', async () => {
    await sessionService.saveSession({
      token: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      user: { id: 1, name: 'Cashier' },
    });

    let callCount = 0;
    api.defaults.adapter = async (config) => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error('Request failed with status code 401');
        err.isAxiosError = true;
        err.response = { status: 401, data: { message: 'Token expired' }, headers: {}, config };
        err.config = config;
        throw err;
      }
      return {
        data: { success: true, data: [{ id: 10, name: 'Espresso' }] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const refreshSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          token: 'newly-minted-access-token',
          refreshToken: 'newly-minted-refresh-token',
        },
      },
    } as any);

    const res = await api.get('/products');

    expect(refreshSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      expect.objectContaining({ refreshToken: 'valid-refresh-token' }),
      expect.any(Object)
    );

    // Verified sessionService received new tokens
    expect(sessionService.getAccessToken()).toBe('newly-minted-access-token');
    expect(sessionService.getRefreshToken()).toBe('newly-minted-refresh-token');

    // Verified replayed request succeeded
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveLength(1);
  });

  it('3. On 401 refresh failure: clears sessionService and rejects', async () => {
    await sessionService.saveSession({
      token: 'bad-access-token',
      refreshToken: 'revoked-refresh-token',
      user: { id: 1 },
    });

    api.defaults.adapter = async (config) => {
      const err: any = new Error('Unauthorized');
      err.isAxiosError = true;
      err.response = { status: 401, data: {}, headers: {}, config };
      err.config = config;
      throw err;
    };

    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Refresh token revoked'));

    await expect(api.get('/sales')).rejects.toThrow();

    // Verified session was purged
    expect(sessionService.getAccessToken()).toBeNull();
    expect(sessionService.getUser()).toBeNull();
  });

  it('4. Prevents infinite refresh loops on auth endpoints (login / refresh)', async () => {
    api.defaults.adapter = async (config) => {
      const err: any = new Error('Unauthorized');
      err.isAxiosError = true;
      err.response = { status: 401, data: {}, headers: {}, config };
      err.config = config;
      throw err;
    };

    const refreshSpy = vi.spyOn(axios, 'post');

    await expect(api.post('/auth/login', { username: 'bad', password: 'bad' })).rejects.toThrow();

    // Must NOT attempt to refresh token when login fails
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});

