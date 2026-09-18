import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateServerUrl, setServerUrl, getServerUrl } from '../src/services/config';
import { api } from '../src/services/api';

describe('Desktop POS Server Configuration & IPC Contract Tests', () => {
  beforeEach(() => {
    // Reset localStorage mock
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    };
    (globalThis as any).localStorage = mockLocalStorage;
    delete (globalThis as any).window;
    api.defaults.baseURL = 'http://localhost:3000/api/v1';
  });

  it('validateServerUrl: Validates protocols, formats, and trailing slash removal', () => {
    expect(validateServerUrl('').valid).toBe(false);
    expect(validateServerUrl('ftp://example.com').valid).toBe(false);
    expect(validateServerUrl('http://localhost:3000/api/v1/').normalizedUrl).toBe('http://localhost:3000/api/v1');
    expect(validateServerUrl('https://api.alagoouz.com/api/v1///').normalizedUrl).toBe('https://api.alagoouz.com/api/v1');
  });

  it('IPC Contract: setServerUrl aborts and does NOT mutate state when Electron IPC rejects', async () => {
    const mockElectronAPI = {
      setServerUrl: vi.fn().mockResolvedValue({
        success: false,
        error: 'عنوان الخادم غير صالح أو غير مسموح به في بيئة الإنتاج (يجب استخدام HTTPS)',
      }),
    };
    (globalThis as any).window = { electronAPI: mockElectronAPI };
    localStorage.setItem('pos_server_url', 'http://localhost:3000/api/v1');
    api.defaults.baseURL = 'http://localhost:3000/api/v1';

    const res = await setServerUrl('http://insecure-remote.com/api/v1');

    // Verification:
    // 1. Returns explicit failure
    expect(res.success).toBe(false);
    expect(res.error).toContain('HTTPS');
    // 2. Electron IPC was called
    expect(mockElectronAPI.setServerUrl).toHaveBeenCalledWith('http://insecure-remote.com/api/v1');
    // 3. localStorage was NOT mutated
    expect(localStorage.getItem('pos_server_url')).toBe('http://localhost:3000/api/v1');
    // 4. API baseURL was NOT mutated
    expect(api.defaults.baseURL).toBe('http://localhost:3000/api/v1');
  });

  it('IPC Contract: setServerUrl succeeds and updates localStorage and API baseURL when Electron IPC approves', async () => {
    const mockElectronAPI = {
      setServerUrl: vi.fn().mockResolvedValue({
        success: true,
      }),
    };
    (globalThis as any).window = { electronAPI: mockElectronAPI };
    localStorage.setItem('pos_server_url', 'http://localhost:3000/api/v1');
    api.defaults.baseURL = 'http://localhost:3000/api/v1';

    const res = await setServerUrl('https://central-api.alagoouz.com/api/v1');

    // Verification:
    // 1. Returns explicit success
    expect(res.success).toBe(true);
    expect(mockElectronAPI.setServerUrl).toHaveBeenCalledWith('https://central-api.alagoouz.com/api/v1');
    // 2. localStorage was updated
    expect(localStorage.getItem('pos_server_url')).toBe('https://central-api.alagoouz.com/api/v1');
    // 3. API baseURL was updated
    expect(api.defaults.baseURL).toBe('https://central-api.alagoouz.com/api/v1');
  });
});
