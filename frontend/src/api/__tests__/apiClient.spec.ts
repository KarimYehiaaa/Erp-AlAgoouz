import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import api, {
  CLOUD_SERVER_URL,
  getBaseServerUrl,
  invalidateSessionContext,
  isValidServerUrl,
  setBaseServerUrl,
  setSessionAccessToken,
} from '@/api/client';
import { invoices } from '@/api/invoices.api';

const request = (api.interceptors.request as any).handlers[0].fulfilled;
const { fulfilled, rejected } = (api.interceptors.response as any).handlers[0];
const config = (url: string) => request({ url, headers: {} });

describe('api client session and response handling', () => {
  const replaceLocation = vi.fn();
  beforeEach(() => {
    replaceLocation.mockReset();
    const browserWindow = window;
    const location = {
      origin: browserWindow.location.origin,
      protocol: browserWindow.location.protocol,
      pathname: browserWindow.location.pathname,
      replace: replaceLocation,
    };
    vi.stubGlobal(
      'window',
      new Proxy(browserWindow, {
        get(target, property) {
          return property === 'location' ? location : Reflect.get(target, property, target);
        },
      }),
    );
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    setSessionAccessToken(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const nativeBuild = (variant: string, check: () => void) => {
    const previous = Object.getOwnPropertyDescriptor(window, 'Capacitor');
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true },
    });
    vi.stubEnv('VITE_ANDROID_BUILD_TYPE', variant);
    try {
      check();
    } finally {
      if (previous) Object.defineProperty(window, 'Capacitor', previous);
      else Reflect.deleteProperty(window, 'Capacitor');
    }
  };

  it('rejects plain HTTP on Android Release before changing the current session or server', () => {
    nativeBuild('Release', () => {
      setBaseServerUrl(CLOUD_SERVER_URL);
      setSessionAccessToken('current');
      expect(isValidServerUrl('http://192.168.1.50:3000')).toBe(false);
      expect(() => setBaseServerUrl('http://192.168.1.50:3000')).toThrow(/HTTPS/);
      expect(getBaseServerUrl()).toBe(CLOUD_SERVER_URL);
      expect(config('/x').headers.Authorization).toBe('Bearer current');
    });
  });

  it('restricts Android Debug HTTP to the native network policy hosts', () => {
    nativeBuild('Debug', () => {
      expect(isValidServerUrl('http://10.0.2.2:3000')).toBe(true);
      expect(isValidServerUrl('http://192.168.1.14:3000')).toBe(false);
      expect(isValidServerUrl('http://192.168.1.50:3000')).toBe(false);
      expect(isValidServerUrl('http://localhost:3000')).toBe(false);
    });
  });

  it('accepts local HTTPS on Android Release and defaults unknown variants to HTTPS', () => {
    nativeBuild('Release', () => expect(isValidServerUrl('https://192.168.1.50:3443')).toBe(true));
    nativeBuild('', () => expect(isValidServerUrl('http://192.168.1.50:3000')).toBe(false));
  });

  it('ignores an unsupported native build API override and uses the secure cloud default', () => {
    nativeBuild('Release', () => {
      vi.stubEnv('VITE_API_URL', 'http://192.168.1.50:3000');
      expect(getBaseServerUrl()).toBe(CLOUD_SERVER_URL);
    });
  });

  it('unwraps successful responses from the current session', () => {
    const data = { success: true, data: { id: 7 } };
    expect(fulfilled({ data, config: config('/x') })).toEqual(data);
  });

  it.each([
    'http://public.example',
    'https://untrusted.example',
    'https://agoouz.vercel.app.untrusted.example',
    'https://agoouz.vercel.app:444',
    'https://user:password@api.example',
    'https://api.example/?token=secret',
    'https://api.example/api/v1',
    'javascript:alert(1)',
  ])('rejects an unsafe server address: %s', (url) => {
    expect(isValidServerUrl(url)).toBe(false);
  });

  it.each([
    'https://agoouz.vercel.app',
    'http://localhost:3000',
    'http://192.168.1.5:3000',
    'http://10.0.0.2:3000',
    'http://172.31.0.2:3000',
  ])('accepts a supported server address: %s', (url) => {
    expect(isValidServerUrl(url)).toBe(true);
  });

  it('trusts an explicitly configured HTTPS origin without trusting its neighbours', () => {
    vi.stubEnv('VITE_TRUSTED_SERVER_URLS', 'https://approved.example:3443');
    expect(isValidServerUrl('https://approved.example:3443')).toBe(true);
    expect(isValidServerUrl('https://approved.example')).toBe(false);
    expect(isValidServerUrl('https://approved.example.untrusted.example:3443')).toBe(false);
  });

  it('ignores a saved untrusted HTTPS origin without sending credentials or clearing the account', () => {
    localStorage.setItem('binalagoouz_server_url', 'https://untrusted.example');
    expect(getBaseServerUrl()).not.toBe('https://untrusted.example');
    expect(() => setBaseServerUrl('https://untrusted.example')).toThrow();
    expect(localStorage.getItem('user')).toContain('1');
  });

  it('uses a structurally valid build API anchor as explicit trust and rejects malformed anchors', () => {
    vi.stubEnv('VITE_API_URL', 'https://build-api.example');
    expect(isValidServerUrl('https://build-api.example')).toBe(true);
    vi.stubEnv('VITE_API_URL', 'https://user:password@build-api.example');
    expect(isValidServerUrl('https://build-api.example')).toBe(false);
    expect(getBaseServerUrl()).not.toContain('password');
  });

  it('keeps the hosted API and local HTTPS supported while rejecting untrusted Android origins', () => {
    nativeBuild('Release', () => {
      expect(isValidServerUrl('https://agoouz-api.vercel.app')).toBe(true);
      expect(isValidServerUrl('https://192.168.1.50:3443')).toBe(true);
      expect(isValidServerUrl('https://untrusted.example')).toBe(false);
    });
  });

  it('routes Capacitor builds to the configured API or the hosted production API', () => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(window, 'Capacitor');
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true },
    });

    try {
      expect(getBaseServerUrl()).toBe(import.meta.env.VITE_API_URL || CLOUD_SERVER_URL);
    } finally {
      if (previousDescriptor) Object.defineProperty(window, 'Capacitor', previousDescriptor);
      else Reflect.deleteProperty(window, 'Capacitor');
    }
  });

  it('preserves the current server and session after rejecting a new address', () => {
    setBaseServerUrl('https://agoouz.vercel.app');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    setSessionAccessToken('current');
    expect(() => setBaseServerUrl('http://public.example')).toThrow();
    expect(config('/x').headers.Authorization).toBe('Bearer current');
    expect(localStorage.getItem('binalagoouz_server_url')).toBe('https://agoouz.vercel.app');
    expect(localStorage.getItem('user')).toContain('1');
  });

  it('downloads invoice PDFs through the selected API server and shared auth client', async () => {
    setBaseServerUrl('http://192.168.1.5:3000');
    setSessionAccessToken('current-session');
    const blob = new Blob(['pdf']);
    const get = vi.spyOn(api, 'get').mockResolvedValue(blob);
    const rawFetch = vi.fn();
    vi.stubGlobal('fetch', rawFetch);

    await expect(invoices.downloadPdf(42)).resolves.toBe(blob);

    expect(get).toHaveBeenCalledWith('/invoices/42/pdf', { responseType: 'blob' });
    expect(config('/invoices/42/pdf')).toMatchObject({
      baseURL: 'http://192.168.1.5:3000/api/v1',
      headers: { Authorization: 'Bearer current-session' },
    });
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it('surfaces backend login messages and status', async () => {
    await expect(
      rejected({
        config: config('/auth/login'),
        response: { status: 401, data: { message: 'بيانات الدخول غير صحيحة' } },
      }),
    ).rejects.toMatchObject({ status: 401, message: 'بيانات الدخول غير صحيحة' });
  });

  it('normalizes network failures', async () => {
    await expect(rejected({ config: config('/x'), code: 'ERR_NETWORK' })).rejects.toMatchObject({
      status: undefined,
    });
  });

  it('clears the session when refresh fails without contacting a real server', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('offline'));
    await expect(
      rejected({ config: config('/dashboard'), response: { status: 401 } }),
    ).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem('user')).toBeNull();
    expect(replaceLocation).toHaveBeenCalledExactlyOnceWith('/login');
  });

  it('refreshes once for concurrent 401s and retries both with the new token', async () => {
    setSessionAccessToken('old');
    let finish!: (value: any) => void;
    const refresh = vi.spyOn(axios, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const retry = vi.spyOn(api, 'request').mockResolvedValue({ success: true });
    const first = rejected({ config: config('/one'), response: { status: 401 } });
    const second = rejected({ config: config('/two'), response: { status: 401 } });
    finish({ data: { data: { token: 'new' } } });
    await Promise.all([first, second]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]?.[2]).toMatchObject({
      timeout: 20_000,
      headers: { Authorization: 'Bearer old' },
    });
    expect(retry).toHaveBeenCalledTimes(2);
    for (const [retried] of retry.mock.calls) {
      expect(retried).toMatchObject({ _retry: true, headers: { Authorization: 'Bearer new' } });
    }
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('rejects delayed success and failure responses after an account change', async () => {
    const old = config('/x');
    localStorage.setItem('user', JSON.stringify({ id: 2 }));
    expect(() => fulfilled({ config: old, data: { secret: true } })).toThrow(
      'SESSION_CONTEXT_CHANGED',
    );
    await expect(rejected({ config: old, response: { status: 401 } })).rejects.toMatchObject({
      status: 409,
    });
    expect(localStorage.getItem('user')).toContain('2');
  });

  it('rejects an old response after logging into the same account again', () => {
    const old = config('/x');
    invalidateSessionContext();
    setSessionAccessToken('new-session');
    expect(() => fulfilled({ config: old, data: { secret: true } })).toThrow(
      'SESSION_CONTEXT_CHANGED',
    );
  });

  it('sends the trusted app origin through native HTTP for cookie CSRF protection', async () => {
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true },
    });
    try {
      expect(config('/x').headers.Origin).toBe(window.location.origin);
      const refresh = vi
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: { data: { token: 'native-new' } } });
      vi.spyOn(api, 'request').mockResolvedValue({ success: true });
      await rejected({ config: config('/x'), response: { status: 401 } });
      expect(refresh.mock.calls[0]?.[2]?.headers).toMatchObject({ Origin: window.location.origin });
    } finally {
      delete (window as any).Capacitor;
    }
  });

  it('discards a refresh finishing after a server switch without clearing the new account', async () => {
    vi.stubEnv('VITE_TRUSTED_SERVER_URLS', 'https://other.example');
    let finish!: (value: any) => void;
    vi.spyOn(axios, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const retry = vi.spyOn(api, 'request');
    const result = rejected({ config: config('/x'), response: { status: 401 } });
    setBaseServerUrl('https://other.example');
    localStorage.setItem('user', JSON.stringify({ id: 2 }));
    setSessionAccessToken('other-token');
    finish({ data: { data: { token: 'old-server-token' } } });
    await expect(result).rejects.toThrow('SESSION_CONTEXT_CHANGED');
    expect(retry).not.toHaveBeenCalled();
    expect(config('/x').headers.Authorization).toBe('Bearer other-token');
    expect(localStorage.getItem('user')).toContain('2');
  });
});
