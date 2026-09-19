import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  SecureSessionStore,
  EncryptionEngine,
  PosSessionData,
} from '../electron/security/secureSessionStore';

describe('SecureSessionStore Tests (OS-level Encrypted Credentials)', () => {
  let tempDir: string;

  // Simple deterministic reversible mock encryption engine for Node tests
  const mockEngine: EncryptionEngine = {
    isEncryptionAvailable: () => true,
    encryptString: (plainText: string) => {
      return Buffer.from(plainText, 'utf8');
    },
    decryptString: (encrypted: Buffer) => {
      return encrypted.toString('utf8');
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-session-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. saveSession encrypts and atomically writes session to disk', async () => {
    const store = new SecureSessionStore(tempDir, mockEngine);
    const sessionData: PosSessionData = {
      token: 'jwt-test-token-123',
      user: { id: 1, name: 'Cashier Ahmed', role_name: 'cashier' },
      terminal: { id: 'TRM-01' },
    };

    const res = await store.saveSession(sessionData);
    expect(res.success).toBe(true);

    const sessionFile = path.join(tempDir, 'session.enc');
    expect(fs.existsSync(sessionFile)).toBe(true);

    const has = await store.hasSession();
    expect(has).toBe(true);
  });

  it('2. loadSession decrypts and restores stored session data accurately', async () => {
    const store = new SecureSessionStore(tempDir, mockEngine);
    const sessionData: PosSessionData = {
      token: 'jwt-secret-xyz-789',
      user: { id: 5, username: 'admin_cashier', role_name: 'admin' },
    };

    await store.saveSession(sessionData);

    // Create a new store instance pointing to same file to ensure disk read
    const store2 = new SecureSessionStore(tempDir, mockEngine);
    const loaded = await store2.loadSession();

    expect(loaded).toBeDefined();
    expect(loaded?.token).toBe('jwt-secret-xyz-789');
    expect(loaded?.user.username).toBe('admin_cashier');
  });

  it('3. clearSession removes session from memory and disk', async () => {
    const store = new SecureSessionStore(tempDir, mockEngine);
    await store.saveSession({
      token: 'token-to-delete',
      user: { id: 2 },
    });

    const sessionFile = path.join(tempDir, 'session.enc');
    expect(fs.existsSync(sessionFile)).toBe(true);

    const cleared = await store.clearSession();
    expect(cleared).toBe(true);
    expect(fs.existsSync(sessionFile)).toBe(false);

    const has = await store.hasSession();
    expect(has).toBe(false);

    const loaded = await store.loadSession();
    expect(loaded).toBeNull();
  });

  it('4. Corrupted encrypted file fails closed, purges corrupt file, and returns null', async () => {
    const sessionFile = path.join(tempDir, 'session.enc');
    fs.writeFileSync(sessionFile, Buffer.from('NOT_VALID_JSON_OR_CORRUPT_CIPHERTEXT'));

    const store = new SecureSessionStore(tempDir, mockEngine);
    const loaded = await store.loadSession();

    expect(loaded).toBeNull();
    // Corrupt file was purged to prevent persistent crash
    expect(fs.existsSync(sessionFile)).toBe(false);
  });

  it('5. When safeStorage is unavailable: maintains in-memory session only (fail-closed persistence)', async () => {
    const unavailableEngine: EncryptionEngine = {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error('Encryption unavailable');
      },
      decryptString: () => {
        throw new Error('Encryption unavailable');
      },
    };

    const store = new SecureSessionStore(tempDir, unavailableEngine);
    const res = await store.saveSession({
      token: 'token-without-vault',
      user: { id: 10 },
    });

    expect(res.success).toBe(true);

    // In-memory access works during current app lifecycle
    const activeSession = await store.loadSession();
    expect(activeSession?.token).toBe('token-without-vault');

    // BUT nothing was written to disk unencrypted!
    const sessionFile = path.join(tempDir, 'session.enc');
    expect(fs.existsSync(sessionFile)).toBe(false);

    // On app restart (new store instance without in-memory state), returns null
    const restartedStore = new SecureSessionStore(tempDir, unavailableEngine);
    const restartedSession = await restartedStore.loadSession();
    expect(restartedSession).toBeNull();
  });

  it('6. Rejects saving invalid session without token', async () => {
    const store = new SecureSessionStore(tempDir, mockEngine);
    const res = await store.saveSession({ token: '', user: null });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});
