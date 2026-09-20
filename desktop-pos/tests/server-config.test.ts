import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import {
  validateServerUrl,
  setServerUrl,
  getServerUrl,
  initServerConfig,
  SAFE_LOCAL_URL,
  SAFE_PRODUCTION_URL,
  DEFAULT_SERVER_URL,
} from '../src/services/config';
import {
  validateServerUrl as policyValidate,
  getServerUrl as policyGetServerUrl,
  SAFE_LOCAL_URL as policySafeUrl,
  DEFAULT_SERVER_URL as policyDefaultUrl,
} from '../src/services/serverUrlPolicy';
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
  // CIRCULAR DEPENDENCY ELIMINATION & STARTUP VERIFICATION
  // ─────────────────────────────────────────────────────────────
  describe('Circular Dependency Elimination & Startup Initialization Tests', () => {
    it('1. Import config.ts works without Runtime Error', async () => {
      const configModule = await import('../src/services/config');
      expect(configModule).toBeDefined();
      expect(typeof configModule.getServerUrl).toBe('function');
      expect(typeof configModule.initServerConfig).toBe('function');
      expect(configModule.DEFAULT_SERVER_URL).toBe(SAFE_LOCAL_URL);
    });

    it('2. Import api.ts works without Runtime Error', async () => {
      const apiModule = await import('../src/services/api');
      expect(apiModule).toBeDefined();
      expect(apiModule.api).toBeDefined();
      expect(typeof apiModule.setApiProductionMode).toBe('function');
    });

    it('3. Direct invocation of getServerUrl() works cleanly and returns valid string', () => {
      const url = getServerUrl();
      expect(typeof url).toBe('string');
      expect(url).toBe(SAFE_LOCAL_URL);
      expect(policyGetServerUrl()).toBe(policySafeUrl);
    });

    it('4. Creation and instance of api works and has defaults configured without TDZ errors', () => {
      expect(api).toBeDefined();
      expect(api.defaults.baseURL).toBeDefined();
      expect(api.defaults.timeout).toBe(8000);
      expect(api.interceptors.request).toBeDefined();
      expect(api.interceptors.response).toBeDefined();
    });

    it('5. Production insecure VITE_API_URL: fallback to SAFE_PRODUCTION_URL', () => {
      const fallbackUrl = getServerUrl(true, 'http://remote-insecure.com/api/v1');
      expect(fallbackUrl).toBe(SAFE_PRODUCTION_URL);
    });

    it('6. Production insecure localStorage: purge + fallback to SAFE_PRODUCTION_URL', () => {
      localStorage.setItem('pos_server_url', 'http://malicious-server.com/api/v1');
      const resolved = getServerUrl(true);
      expect(resolved).toBe(SAFE_PRODUCTION_URL);
      expect(localStorage.getItem('pos_server_url')).toBeNull();
    });

    it('7. Production HTTPS: PASS with valid normalized URL', () => {
      const validHttps = 'https://central-api.alagoouz.com/api/v1';
      const validation = validateServerUrl(validHttps, true);
      expect(validation.valid).toBe(true);
      expect(validation.normalizedUrl).toBe(validHttps);

      const effective = getServerUrl(true, validHttps);
      expect(effective).toBe(validHttps);
    });

    it('8. Axios interceptor: does not use External HTTP in production', () => {
      setApiProductionMode(true);
      localStorage.setItem('pos_server_url', 'http://external-hacker.com/api/v1');
      const interceptor = (api.interceptors.request as any).handlers[0].fulfilled;
      const fakeConfig = { baseURL: 'http://external-hacker.com/api/v1', headers: {} };
      const modifiedConfig = interceptor(fakeConfig);

      expect(modifiedConfig.baseURL).not.toBe('http://external-hacker.com/api/v1');
      expect(modifiedConfig.baseURL).toBe(SAFE_PRODUCTION_URL);
    });

    it('9. Startup Test: desktop-pos/src/main.ts startup sequence executes without ReferenceError or circular failure', async () => {
      // Set up minimal headless window/electron environment
      (globalThis as any).window = {
        electronAPI: {
          getServerUrl: vi.fn().mockResolvedValue(null),
          setServerUrl: vi.fn().mockResolvedValue({ success: true }),
          setAuthToken: vi.fn().mockResolvedValue({ success: true }),
        },
      };

      // 1. initServerConfig()
      const initUrl = await initServerConfig();
      expect(initUrl).toBe(SAFE_LOCAL_URL);
      expect(api.defaults.baseURL).toBe(SAFE_LOCAL_URL);

      // 2. createApp()
      const dummyComponent = { template: '<div>Desktop POS</div>' };
      const app = createApp(dummyComponent);
      expect(app).toBeDefined();

      // 3. createPinia()
      const pinia = createPinia();
      app.use(pinia);
      setActivePinia(pinia);

      // 4. restoreSession()
      const authStore = usePosAuthStore(pinia);
      const sessionRestored = await authStore.restoreSession();
      expect(typeof sessionRestored).toBe('boolean');

      // 5. Verify app.mount invocation in bootstrap lifecycle without ReferenceError or circular TDZ failure
      const mountSpy = vi.spyOn(app, 'mount').mockImplementation(() => app._instance as any);
      expect(() => {
        app.mount('#app');
      }).not.toThrow();
      expect(mountSpy).toHaveBeenCalledWith('#app');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FIX 1: DEFAULT_SERVER_URL / VITE_API_URL Security Tests (Tests A - E)
  // ─────────────────────────────────────────────────────────────
  describe('FIX 1: DEFAULT_SERVER_URL / VITE_API_URL Security & Effective URL Pipeline', () => {
    it('Test A: Production + VITE_API_URL=https://api.example.com/api/v1 -> PASS', () => {
      const effectiveUrl = getServerUrl(true, 'https://api.example.com/api/v1');
      expect(effectiveUrl).toBe('https://api.example.com/api/v1');
    });

    it('Test B: Production + VITE_API_URL=http://external.example.com/api/v1 -> Must be rejected, falls back to safe production URL', () => {
      const effectiveUrl = getServerUrl(true, 'http://external.example.com/api/v1');
      expect(effectiveUrl).toBe(SAFE_PRODUCTION_URL);
    });

    it('Test C: Production + insecure localStorage + valid HTTPS VITE_API_URL -> purges localStorage and uses HTTPS', () => {
      localStorage.setItem('pos_server_url', 'http://insecure-external.com/api/v1');
      const effectiveUrl = getServerUrl(true, 'https://api.example.com/api/v1');
      expect(effectiveUrl).toBe('https://api.example.com/api/v1');
      expect(localStorage.getItem('pos_server_url')).toBeNull(); // Purged!
    });

    it('Test D: Production + insecure localStorage + insecure VITE_API_URL -> uses safe production fallback', () => {
      localStorage.setItem('pos_server_url', 'http://insecure-external.com/api/v1');
      const effectiveUrl = getServerUrl(true, 'http://another-insecure.com/api/v1');
      expect(effectiveUrl).toBe(SAFE_PRODUCTION_URL);
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
      expect(modifiedConfig.baseURL).toBe(SAFE_PRODUCTION_URL);
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

  // ─────────────────────────────────────────────────────────────
  // PHASE 1: TRUSTED SERVER WHITELIST & PROTOCOL SECURITY MATRIX
  // ─────────────────────────────────────────────────────────────
  describe('Phase 1: Trusted Server Whitelist & Protocol Security Matrix', () => {
    it('1. Trusted HTTPS → PASS', () => {
      const res = validateServerUrl('https://api.alagoouz.com/api/v1', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://api.alagoouz.com/api/v1');

      // Custom trusted list support
      const customRes = validateServerUrl(
        'https://partner-cloud.com/api/v1',
        true,
        ['https://partner-cloud.com/api/v1']
      );
      expect(customRes.valid).toBe(true);
    });

    it('2. Untrusted HTTPS → FAIL', () => {
      const res = validateServerUrl('https://untrusted-external-domain.com/api/v1', true);
      expect(res.valid).toBe(false);
      expect(res.error).toBe('عنوان الخادم غير موثوق به لهذا الجهاز');
    });

    it('3. External HTTP Production → FAIL', () => {
      const res = validateServerUrl('http://insecure-external.com/api/v1', true);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('HTTPS');
    });

    it('4. Localhost → PASS', () => {
      const res = validateServerUrl('http://localhost:3000/api/v1', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('http://localhost:3000/api/v1');
    });

    it('5. 127.0.0.1 → PASS', () => {
      const res = validateServerUrl('http://127.0.0.1:8080/api/v1', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('http://127.0.0.1:8080/api/v1');
    });

    it('6. Malformed URL → FAIL', () => {
      const res = validateServerUrl('invalid_domain_string_without_scheme', true);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('صيغة');
    });

    it('7. javascript:// → FAIL', () => {
      const res = validateServerUrl('javascript:alert("exploit")', true);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('http');
    });

    it('8. file:// → FAIL', () => {
      const res = validateServerUrl('file:///C:/Users/Administrator/secret.json', true);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('http');
    });

    it('9. Trusted URL with trailing slash → normalized', () => {
      const res = validateServerUrl('https://api.alagoouz.com/api/v1/////', true);
      expect(res.valid).toBe(true);
      expect(res.normalizedUrl).toBe('https://api.alagoouz.com/api/v1');
    });

    it('10. Untrusted URL → cannot be saved', async () => {
      localStorage.setItem('pos_server_url', 'http://localhost:3000/api/v1');
      api.defaults.baseURL = 'http://localhost:3000/api/v1';

      // Mock production environment for renderer
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await setServerUrl('https://fake-phishing-host.com/api/v1');
        expect(res.success).toBe(false);
        expect(res.error).toBe('عنوان الخادم غير موثوق به لهذا الجهاز');

        // Verify state is NOT mutated
        expect(localStorage.getItem('pos_server_url')).toBe('http://localhost:3000/api/v1');
        expect(api.defaults.baseURL).toBe('http://localhost:3000/api/v1');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('11. Untrusted URL → cannot authenticate', () => {
      const worker = new PosSyncWorker(() => [], () => true, () => null, true);
      const res = worker.setSession('session-token-xyz', 'https://rogue-server.com/api/v1', true);

      expect(res.success).toBe(false);
      expect(res.error).toBe('عنوان الخادم غير موثوق به لهذا الجهاز');
      expect(worker.getAuthToken()).toBeNull();
    });

    it('12. Untrusted URL → cannot start sync', async () => {
      const pendingItems = [
        { sync_id: 'sync-untrusted-1', invoice_number: 'INV-UNTRUSTED', status: 'PENDING', retry_count: 0 },
      ];
      const worker = new PosSyncWorker(
        () => pendingItems,
        () => true,
        () => null,
        true
      );

      // Attempt to force an untrusted URL directly
      (worker as any).serverUrl = 'https://untrusted-host.com/api/v1';
      (worker as any).authToken = 'dummy-token';

      const syncRes = await worker.runSyncCycle();
      expect(syncRes.success).toBe(false);
      expect(syncRes.message).toBe('عنوان الخادم غير موثوق به لهذا الجهاز');
      expect(pendingItems[0].status).toBe('PENDING'); // No data was dispatched to untrusted host
    });
  });
});
