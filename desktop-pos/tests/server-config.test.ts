import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  validateServerUrl,
  setServerUrl,
  getServerUrl,
  SAFE_LOCAL_URL,
  DEFAULT_SERVER_URL,
} from '../src/services/config';
import { api, setApiProductionMode } from '../src/services/api';
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
    setApiProductionMode(undefined);
    api.defaults.baseURL = DEFAULT_SERVER_URL;
  });

  // ─────────────────────────────────────────────────────────────
  // FIX 1: DEFAULT_SERVER_URL / VITE_API_URL Security Tests (Tests A - E)
  // ─────────────────────────────────────────────────────────────
  describe('FIX 1: DEFAULT_SERVER_URL / VITE_API_URL Security & Effective URL Pipeline', () => {
    it('Test A: Production + VITE_API_URL=https://api.example.com/api/v1 -> PASS', () => {
      const effectiveUrl = getServerUrl(true, 'https://api.example.com/api/v1');
      expect(effectiveUrl).toBe('https://api.example.com/api/v1');
    });

    it('Test B: Production + VITE_API_URL=http://external.example.com/api/v1 -> Must be rejected, falls back to safe local URL', () => {
      const effectiveUrl = getServerUrl(true, 'http://external.example.com/api/v1');
      expect(effectiveUrl).toBe(SAFE_LOCAL_URL);
    });

    it('Test C: Production + insecure localStorage + valid HTTPS VITE_API_URL -> purges localStorage and uses HTTPS', () => {
      localStorage.setItem('pos_server_url', 'http://insecure-external.com/api/v1');
      const effectiveUrl = getServerUrl(true, 'https://api.example.com/api/v1');
      expect(effectiveUrl).toBe('https://api.example.com/api/v1');
      expect(localStorage.getItem('pos_server_url')).toBeNull(); // Purged!
    });

    it('Test D: Production + insecure localStorage + insecure VITE_API_URL -> uses safe local fallback http://localhost:3000/api/v1', () => {
      localStorage.setItem('pos_server_url', 'http://insecure-external.com/api/v1');
      const effectiveUrl = getServerUrl(true, 'http://another-insecure.com/api/v1');
      expect(effectiveUrl).toBe(SAFE_LOCAL_URL);
      expect(localStorage.getItem('pos_server_url')).toBeNull(); // Purged!
    });

    it('Test E: Axios interceptor never dispatches request to insecure external HTTP in production', () => {
      setApiProductionMode(true);
      localStorage.setItem('pos_server_url', 'http://attacker-controlled.com/api/v1');
      const interceptor = (api.interceptors.request as any).handlers[0].fulfilled;
      const fakeConfig = { baseURL: 'http://attacker-controlled.com/api/v1', headers: {} };
      const modifiedConfig = interceptor(fakeConfig);

      // In production environment check, interceptor sanitizes via getServerUrl
      expect(modifiedConfig.baseURL).not.toBe('http://attacker-controlled.com/api/v1');
      expect(modifiedConfig.baseURL).toBe(SAFE_LOCAL_URL);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FIX 2: Startup Session Restoration Tests (Tests A - D)
  // ─────────────────────────────────────────────────────────────
  describe('FIX 2: Startup Session Restoration Tests', () => {
    it('Test A: Existing token + valid server URL + Electron success -> token & user preserved, authenticated = true', async () => {
      setActivePinia(createPinia());
      localStorage.setItem('pos_token', 'valid-saved-token-111');
      localStorage.setItem('pos_user', JSON.stringify({ id: 1, name: 'أحمد كاشير', role_name: 'cashier' }));

      const mockElectronAPI = {
        setAuthToken: vi.fn().mockResolvedValue({ success: true }),
      };
      (globalThis as any).window = { electronAPI: mockElectronAPI };

      const authStore = usePosAuthStore();
      const restored = await authStore.restoreSession();

      expect(restored).toBe(true);
      expect(mockElectronAPI.setAuthToken).toHaveBeenCalledWith('valid-saved-token-111', expect.any(String));
      expect(authStore.token).toBe('valid-saved-token-111');
      expect(authStore.user?.name).toBe('أحمد كاشير');
      expect(authStore.isAuthenticated).toBe(true);
    });

    it('Test B: Existing token + Electron returns { success: false } -> token cleared, user cleared, localStorage cleared, authenticated = false', async () => {
      setActivePinia(createPinia());
      localStorage.setItem('pos_token', 'stale-expired-token');
      localStorage.setItem('pos_user', JSON.stringify({ id: 2, name: 'مستخدم قديم' }));

      const mockElectronAPI = {
        setAuthToken: vi.fn().mockResolvedValue({ success: false, error: 'SESSION_REVOKED' }),
      };
      (globalThis as any).window = { electronAPI: mockElectronAPI };

      const authStore = usePosAuthStore();
      const restored = await authStore.restoreSession();

      expect(restored).toBe(false);
      expect(authStore.token).toBeNull();
      expect(authStore.user).toBeNull();
      expect(localStorage.getItem('pos_token')).toBeNull();
      expect(localStorage.getItem('pos_user')).toBeNull();
      expect(authStore.isAuthenticated).toBe(false);
    });

    it('Test C: Existing token + invalid server URL in production -> session rejected, token & user cleared', async () => {
      setActivePinia(createPinia());
      localStorage.setItem('pos_token', 'token-with-insecure-url');
      localStorage.setItem('pos_user', JSON.stringify({ id: 3, name: 'كاشير' }));
      localStorage.setItem('pos_server_url', 'http://insecure-remote.com/api/v1');

      const mockElectronAPI = {
        setAuthToken: vi.fn().mockResolvedValue({
          success: false,
          error: 'عنوان الخادم غير صالح أو غير مسموح به في بيئة الإنتاج (يجب استخدام HTTPS)',
        }),
      };
      (globalThis as any).window = { electronAPI: mockElectronAPI };

      const authStore = usePosAuthStore();
      const restored = await authStore.restoreSession();

      expect(restored).toBe(false);
      expect(authStore.token).toBeNull();
      expect(authStore.user).toBeNull();
      expect(localStorage.getItem('pos_token')).toBeNull();
      expect(authStore.isAuthenticated).toBe(false);
    });

    it('Test D: No existing token -> no Electron session setup required, unauthenticated', async () => {
      setActivePinia(createPinia());
      const mockElectronAPI = {
        setAuthToken: vi.fn(),
      };
      (globalThis as any).window = { electronAPI: mockElectronAPI };

      const authStore = usePosAuthStore();
      const restored = await authStore.restoreSession();

      expect(restored).toBe(false);
      expect(mockElectronAPI.setAuthToken).not.toHaveBeenCalled();
      expect(authStore.token).toBeNull();
      expect(authStore.isAuthenticated).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Core URL Validation & Schema Tests
  // ─────────────────────────────────────────────────────────────
  describe('Core URL Validation & IPC Contracts', () => {
    it('Validates protocols, formats, and trailing slash removal', () => {
      expect(validateServerUrl('').valid).toBe(false);
      expect(validateServerUrl('ftp://example.com').valid).toBe(false);
      expect(validateServerUrl('http://localhost:3000/api/v1/').normalizedUrl).toBe('http://localhost:3000/api/v1');
      expect(validateServerUrl('https://api.alagoouz.com/api/v1///').normalizedUrl).toBe('https://api.alagoouz.com/api/v1');
    });

    it('Strictly rejects malicious schemes (javascript:, file:)', () => {
      expect(validateServerUrl('javascript:alert(1)', false).valid).toBe(false);
      expect(validateServerUrl('file:///etc/passwd', false).valid).toBe(false);
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

  // ─────────────────────────────────────────────────────────────
  // Atomic Session Configuration in Worker
  // ─────────────────────────────────────────────────────────────
  describe('PosSyncWorker Atomic Session Configuration', () => {
    it('Valid login sets token and serverUrl in worker atomically', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null, true);
      expect(worker.getAuthToken()).toBeNull();
      expect(worker.getServerUrl()).toBe('http://localhost:3000/api/v1');

      const res = worker.setSession('valid-cashier-jwt-123', 'https://central-api.alagoouz.com/api/v1', true);
      expect(res.success).toBe(true);
      expect(worker.getAuthToken()).toBe('valid-cashier-jwt-123');
      expect(worker.getServerUrl()).toBe('https://central-api.alagoouz.com/api/v1');
    });

    it('Insecure serverUrl rejects session atomically (token remains null, serverUrl unchanged)', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null, true);
      const initialUrl = worker.getServerUrl();

      const res = worker.setSession('attempted-token-456', 'http://unencrypted-remote.com/api/v1', true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('HTTPS');

      // ATOMIC VERIFICATION: neither token nor serverUrl were mutated!
      expect(worker.getAuthToken()).toBeNull();
      expect(worker.getServerUrl()).toBe(initialUrl);
    });

    it('Logout (token = null) clears token in worker cleanly', () => {
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
});
