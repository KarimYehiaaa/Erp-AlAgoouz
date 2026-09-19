import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionService } from '../src/services/sessionService';

describe('Desktop POS SessionService Tests', () => {
  let store: Record<string, string>;
  let mockElectronAPI: any;
  let service: SessionService;

  beforeEach(() => {
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

    mockElectronAPI = {
      saveSecureSession: vi.fn().mockResolvedValue({ success: true }),
      loadSecureSession: vi.fn().mockResolvedValue(null),
      clearSecureSession: vi.fn().mockResolvedValue(true),
      hasSecureSession: vi.fn().mockResolvedValue(false),
      setAuthToken: vi.fn().mockResolvedValue({ success: true }),
    };
    (globalThis as any).window = { electronAPI: mockElectronAPI };

    service = new SessionService();
  });

  it('1. Initializes cleanly and purges legacy pos_token from localStorage', () => {
    store['pos_token'] = 'legacy-insecure-token';
    store['pos_refresh_token'] = 'legacy-insecure-refresh';

    service.cleanseLegacyTokens();

    expect(store['pos_token']).toBeUndefined();
    expect(store['pos_refresh_token']).toBeUndefined();
    expect(service.getAccessToken()).toBeNull();
  });

  it('2. saveSession saves to memory & Electron safeStorage, never writing JWT to localStorage', async () => {
    store['pos_token'] = 'stray-token';

    const sessionPayload = {
      token: 'jwt-access-token-12345',
      refreshToken: 'refresh-token-67890',
      user: { id: 1, username: 'cashier1', role_name: 'cashier' },
      terminal: { id: 'TRM-01', name: 'Terminal 1' },
    };

    const saved = await service.saveSession(sessionPayload);
    expect(saved).toBe(true);

    // Verified in-memory
    expect(service.getAccessToken()).toBe('jwt-access-token-12345');
    expect(service.getRefreshToken()).toBe('refresh-token-67890');
    expect(service.getUser()?.username).toBe('cashier1');

    // Electron API called
    expect(mockElectronAPI.saveSecureSession).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'jwt-access-token-12345',
        refreshToken: 'refresh-token-67890',
      })
    );

    // CRITICAL: JWT access token must NOT exist in localStorage!
    expect(store['pos_token']).toBeUndefined();
    expect(store['pos_refresh_token']).toBeUndefined();

    // Non-sensitive UI data is allowed
    expect(JSON.parse(store['pos_user'])).toEqual(sessionPayload.user);
  });

  it('3. updateTokens updates in-memory token and safeStorage without leaking to localStorage', async () => {
    const sessionPayload = {
      token: 'initial-token',
      refreshToken: 'initial-refresh',
      user: { id: 2, username: 'admin' },
    };
    await service.saveSession(sessionPayload);

    const updated = await service.updateTokens('new-jwt-access-token-999', 'new-refresh-token-888');
    expect(updated).toBe(true);
    expect(service.getAccessToken()).toBe('new-jwt-access-token-999');
    expect(service.getRefreshToken()).toBe('new-refresh-token-888');

    expect(store['pos_token']).toBeUndefined();
  });

  it('4. loadSession restores encrypted session from Electron safeStorage', async () => {
    mockElectronAPI.loadSecureSession.mockResolvedValueOnce({
      token: 'persisted-secure-token',
      refreshToken: 'persisted-refresh',
      user: { id: 10, username: 'pos-user' },
      terminal: { id: 'TRM-02' },
    });

    const loaded = await service.loadSession();
    expect(loaded).toBeDefined();
    expect(loaded?.token).toBe('persisted-secure-token');
    expect(service.getAccessToken()).toBe('persisted-secure-token');
    expect(service.getUser()?.username).toBe('pos-user');

    expect(store['pos_token']).toBeUndefined();
  });

  it('5. restoreSession sets initializing flag during execution', async () => {
    mockElectronAPI.loadSecureSession.mockImplementation(async () => {
      expect(service.isSessionInitializing()).toBe(true);
      return {
        token: 'restored-token',
        user: { id: 3 },
      };
    });

    expect(service.isSessionInitializing()).toBe(false);
    const result = await service.restoreSession();
    expect(result?.token).toBe('restored-token');
    expect(service.isSessionInitializing()).toBe(false);
  });

  it('6. clearSession clears in-memory, calls electronAPI.clearSecureSession, and purges localStorage', async () => {
    await service.saveSession({
      token: 'active-token',
      user: { id: 1 },
    });
    store['pos_token'] = 'rogue-token';

    await service.clearSession();

    expect(service.getAccessToken()).toBeNull();
    expect(service.getRefreshToken()).toBeNull();
    expect(service.getUser()).toBeNull();
    expect(mockElectronAPI.clearSecureSession).toHaveBeenCalled();
    expect(mockElectronAPI.setAuthToken).toHaveBeenCalledWith(null);
    expect(store['pos_token']).toBeUndefined();
    expect(store['pos_user']).toBeUndefined();
  });
});
