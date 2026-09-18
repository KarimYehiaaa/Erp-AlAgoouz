import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { validateServerUrl, setServerUrl, getServerUrl, DEFAULT_SERVER_URL } from '../src/services/config';
import { api } from '../src/services/api';
import { PosSyncWorker } from '../electron/sync/syncWorker';
import { usePosAuthStore } from '../src/stores/posAuth';

describe('Desktop POS Server Configuration & IPC Contract Tests', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    // Reset localStorage mock
    store = {};
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
    api.defaults.baseURL = DEFAULT_SERVER_URL;
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 1: Renderer Server URL Security (Tests 1 - 6)
  // ─────────────────────────────────────────────────────────────
  describe('Phase 1: Renderer Server URL Security Tests', () => {
    it('Test 1: Valid localhost URL is accepted in dev and prod', () => {
      const devRes = validateServerUrl('http://localhost:3000/api/v1', false);
      expect(devRes.valid).toBe(true);
      expect(devRes.normalizedUrl).toBe('http://localhost:3000/api/v1');

      const prodRes = validateServerUrl('http://localhost:3000/api/v1', true);
      expect(prodRes.valid).toBe(true);
      expect(prodRes.normalizedUrl).toBe('http://localhost:3000/api/v1');

      const ipRes = validateServerUrl('http://127.0.0.1:3000/api/v1', true);
      expect(ipRes.valid).toBe(true);
      expect(ipRes.normalizedUrl).toBe('http://127.0.0.1:3000/api/v1');
    });

    it('Test 2: Valid remote HTTPS URL is accepted in dev and prod', () => {
      const devRes = validateServerUrl('https://api.alagoouz.com/api/v1', false);
      expect(devRes.valid).toBe(true);
      expect(devRes.normalizedUrl).toBe('https://api.alagoouz.com/api/v1');

      const prodRes = validateServerUrl('https://api.alagoouz.com/api/v1///', true);
      expect(prodRes.valid).toBe(true);
      expect(prodRes.normalizedUrl).toBe('https://api.alagoouz.com/api/v1');
    });

    it('Test 3: Insecure remote HTTP URL is rejected in production', () => {
      const prodRes = validateServerUrl('http://api.alagoouz.com/api/v1', true);
      expect(prodRes.valid).toBe(false);
      expect(prodRes.error).toContain('HTTPS');
    });

    it('Test 4: Malicious and dangerous schemes are strictly rejected', () => {
      expect(validateServerUrl('javascript:alert(1)', false).valid).toBe(false);
      expect(validateServerUrl('file:///etc/passwd', false).valid).toBe(false);
      expect(validateServerUrl('ftp://files.alagoouz.com/api/v1', false).valid).toBe(false);
      expect(validateServerUrl('', false).valid).toBe(false);
      expect(validateServerUrl('   ', false).valid).toBe(false);
      expect(validateServerUrl('not-a-valid-url', false).valid).toBe(false);
    });

    it('Test 5: Insecure URL in localStorage in production is purged and falls back to default localhost', () => {
      localStorage.setItem('pos_server_url', 'http://insecure-external-server.com/api/v1');

      // Calling getServerUrl with forceProduction = true
      const effectiveUrl = getServerUrl(true);
      expect(effectiveUrl).toBe(DEFAULT_SERVER_URL);

      // Verify that localStorage was purged of the insecure entry
      expect(localStorage.getItem('pos_server_url')).toBeNull();
    });

    it('Test 6: api.defaults.baseURL is NOT polluted by invalid localStorage entry', async () => {
      localStorage.setItem('pos_server_url', 'javascript:evil()');

      // Call getServerUrl
      const current = getServerUrl();
      expect(current).toBe(DEFAULT_SERVER_URL);
      expect(localStorage.getItem('pos_server_url')).toBeNull();

      // Interceptor simulation
      const interceptor = (api.interceptors.request as any).handlers[0].fulfilled;
      const fakeConfig = { baseURL: 'http://localhost:3000/api/v1', headers: {} };
      const modifiedConfig = interceptor(fakeConfig);

      expect(modifiedConfig.baseURL).toBe(DEFAULT_SERVER_URL);
      expect(modifiedConfig.baseURL).not.toContain('javascript:');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Phase 2: Atomic Auth Session Configuration (Tests A - D)
  // ─────────────────────────────────────────────────────────────
  describe('Phase 2: Atomic Auth Session Configuration Tests', () => {
    it('Test A: Valid login sets token and serverUrl in worker atomically', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null, true);
      expect(worker.getAuthToken()).toBeNull();
      expect(worker.getServerUrl()).toBe('http://localhost:3000/api/v1');

      const res = worker.setSession('valid-cashier-jwt-123', 'https://central-api.alagoouz.com/api/v1', true);
      expect(res.success).toBe(true);
      expect(worker.getAuthToken()).toBe('valid-cashier-jwt-123');
      expect(worker.getServerUrl()).toBe('https://central-api.alagoouz.com/api/v1');
    });

    it('Test B: Insecure serverUrl rejects session atomically (token remains null, serverUrl unchanged)', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null, true);
      const initialUrl = worker.getServerUrl();

      const res = worker.setSession('attempted-token-456', 'http://unencrypted-remote.com/api/v1', true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('HTTPS');

      // ATOMIC VERIFICATION: neither token nor serverUrl were mutated!
      expect(worker.getAuthToken()).toBeNull();
      expect(worker.getServerUrl()).toBe(initialUrl);
    });

    it('Test C: Invalid serverUrl in setSession causes renderer login to throw and revert state', async () => {
      setActivePinia(createPinia());

      // Mock Electron IPC rejecting the session
      const mockElectronAPI = {
        setAuthToken: vi.fn().mockResolvedValue({
          success: false,
          error: 'رفض النظام عنوان الخادم غير المشفر لأسباب أمنية',
        }),
      };
      (globalThis as any).window = { electronAPI: mockElectronAPI };

      // Mock API response returning successful login payload
      vi.spyOn(api, 'post').mockResolvedValue({
        data: {
          success: true,
          data: {
            token: 'jwt-cashier-789',
            user: { id: 1, name: 'كاشير التجربة', role_name: 'cashier' },
          },
        },
      });

      const authStore = usePosAuthStore();

      // Login MUST throw an error
      await expect(
        authStore.login({ username: 'cashier', password: 'password123' })
      ).rejects.toThrow('رفض النظام عنوان الخادم غير المشفر لأسباب أمنية');

      // State MUST be completely reverted / null
      expect(authStore.token).toBeNull();
      expect(authStore.user).toBeNull();
      expect(authStore.isAuthenticated).toBe(false);
      expect(localStorage.getItem('pos_token')).toBeNull();
      expect(localStorage.getItem('pos_user')).toBeNull();
    });

    it('Test D: Logout (token = null) clears token in worker cleanly', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null, true);
      worker.setSession('active-jwt-token', 'https://central-api.alagoouz.com/api/v1', true);
      expect(worker.getAuthToken()).toBe('active-jwt-token');

      // Perform logout
      const res = worker.setSession(null);
      expect(res.success).toBe(true);
      expect(worker.getAuthToken()).toBeNull();
      // Server URL is preserved upon logout
      expect(worker.getServerUrl()).toBe('https://central-api.alagoouz.com/api/v1');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Previous IPC Contract Verification
  // ─────────────────────────────────────────────────────────────
  describe('IPC Contract Regression Verification', () => {
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

      expect(res.success).toBe(false);
      expect(res.error).toContain('HTTPS');
      expect(mockElectronAPI.setServerUrl).toHaveBeenCalledWith('http://insecure-remote.com/api/v1');
      expect(localStorage.getItem('pos_server_url')).toBe('http://localhost:3000/api/v1');
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

      expect(res.success).toBe(true);
      expect(mockElectronAPI.setServerUrl).toHaveBeenCalledWith('https://central-api.alagoouz.com/api/v1');
      expect(localStorage.getItem('pos_server_url')).toBe('https://central-api.alagoouz.com/api/v1');
      expect(api.defaults.baseURL).toBe('https://central-api.alagoouz.com/api/v1');
    });
  });
});
