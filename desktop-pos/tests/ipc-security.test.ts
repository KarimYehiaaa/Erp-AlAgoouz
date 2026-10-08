import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  validateIpcSender,
  isTrustedAppEntryUrl,
  validateSessionPayload,
  validateTransactionPayload,
  containsDangerousKeys,
  sanitizeIpcError,
} from '../electron/security/ipcSecurity';

describe('Electron IPC Security Layer Tests', () => {
  describe('validateIpcSender', () => {
    it('1. Permits main frame in development mode with matching dev server URL', () => {
      const mockEvent = {
        senderFrame: {
          parent: null,
          url: 'http://localhost:5174/#/sales',
        },
      } as any;

      const isValid = validateIpcSender(mockEvent, false, 'http://localhost:5174');
      expect(isValid).toBe(true);
    });

    it('2. Rejects sub-frames (iframes) even if URL matches dev server', () => {
      const mockSubframeEvent = {
        senderFrame: {
          parent: { url: 'http://localhost:5174' }, // Has a parent -> subframe
          url: 'http://localhost:5174/embedded.html',
        },
      } as any;

      const isValid = validateIpcSender(mockSubframeEvent, false, 'http://localhost:5174');
      expect(isValid).toBe(false);
    });

    it('3. Rejects untrusted external URLs in development mode', () => {
      const mockEvent = {
        senderFrame: {
          parent: null,
          url: 'https://attacker-site.com/exploit',
        },
      } as any;

      const isValid = validateIpcSender(mockEvent, false, 'http://localhost:5174');
      expect(isValid).toBe(false);
    });

    it('4. Permits local packaged application dist/index.html in production', () => {
      const entryPath = path.join(os.tmpdir(), 'trusted-app', 'dist', 'index.html');
      const mockEvent = {
        senderFrame: {
          parent: null,
          url: pathToFileURL(entryPath).href,
        },
      } as any;

      const isValid = validateIpcSender(mockEvent, true, undefined, entryPath);
      expect(isValid).toBe(true);
    });

    it('5. Rejects external web URLs in packaged production mode', () => {
      const mockEvent = {
        senderFrame: {
          parent: null,
          url: 'https://malicious-external.com',
        },
      } as any;

      const isValid = validateIpcSender(mockEvent, true);
      expect(isValid).toBe(false);
    });

    it('rejects a different local dist/index.html despite its matching filename', () => {
      const entryPath = path.join(os.tmpdir(), 'trusted-app', 'dist', 'index.html');
      const foreign = pathToFileURL(
        path.join(os.tmpdir(), 'foreign-app', 'dist', 'index.html'),
      ).href;
      expect(
        validateIpcSender(
          { senderFrame: { parent: null, url: foreign } } as any,
          true,
          undefined,
          entryPath,
        ),
      ).toBe(false);
      expect(isTrustedAppEntryUrl(foreign, entryPath)).toBe(false);
      expect(isTrustedAppEntryUrl(`${pathToFileURL(entryPath).href}#/sales`, entryPath)).toBe(true);
      expect(
        isTrustedAppEntryUrl(`${pathToFileURL(entryPath).href}?redirect=foreign`, entryPath),
      ).toBe(false);
    });

    it('requires an explicit application entry for file IPC and the selected development origin', () => {
      const entry = pathToFileURL(path.join(os.tmpdir(), 'trusted-app', 'dist', 'index.html')).href;
      expect(validateIpcSender({ senderFrame: { parent: null, url: entry } } as any, true)).toBe(
        false,
      );
      expect(
        validateIpcSender(
          { senderFrame: { parent: null, url: 'http://localhost:5173' } } as any,
          false,
          'http://localhost:5174',
        ),
      ).toBe(false);
    });
  });

  describe('containsDangerousKeys & Prototype Pollution Protection', () => {
    it('6. Detects prototype pollution keys (__proto__, constructor, prototype)', () => {
      expect(containsDangerousKeys({ safe: 'value' })).toBe(false);
      expect(containsDangerousKeys(JSON.parse('{"__proto__": {"polluted": true}}'))).toBe(true);
      expect(containsDangerousKeys({ nested: { constructor: 'bad' } })).toBe(true);
      expect(containsDangerousKeys({ nested: { prototype: {} } })).toBe(true);
    });
  });

  describe('validateSessionPayload', () => {
    it('7. Approves valid session data', () => {
      const res = validateSessionPayload({
        token: 'valid-jwt-token-string',
        refreshToken: 'valid-refresh-token',
        user: { id: 1, name: 'Cashier' },
      });
      expect(res.valid).toBe(true);
    });

    it('8. Rejects missing or non-string tokens and prototype pollution', () => {
      expect(validateSessionPayload(null).valid).toBe(false);
      expect(validateSessionPayload({ user: {} }).valid).toBe(false);
      expect(validateSessionPayload({ token: 12345, user: {} }).valid).toBe(false);
      expect(validateSessionPayload({ token: '', user: {} }).valid).toBe(false);
      expect(
        validateSessionPayload(JSON.parse('{"token": "valid", "user": {}, "__proto__": {}}')).valid,
      ).toBe(false);
    });
  });

  describe('validateTransactionPayload', () => {
    it('9. Approves valid offline transaction', () => {
      const res = validateTransactionPayload({
        sync_id: 'sync-001',
        total_amount: 150.75,
        items: [{ product_id: 1, quantity: 2, unit_price: 75 }],
      });
      expect(res.valid).toBe(true);
    });

    it('10. Rejects invalid transaction amounts, missing items, and dangerous keys', () => {
      expect(validateTransactionPayload(null).valid).toBe(false);
      expect(validateTransactionPayload({ items: [] }).valid).toBe(false);
      expect(validateTransactionPayload({ items: [{}], total_amount: -10 }).valid).toBe(false);
      expect(validateTransactionPayload({ items: [{}], total_amount: NaN }).valid).toBe(false);
      expect(
        validateTransactionPayload(
          JSON.parse('{"items": [{}], "total_amount": 100, "__proto__": {}}'),
        ).valid,
      ).toBe(false);
    });
  });

  describe('sanitizeIpcError', () => {
    it('11. Masks Windows and Unix file paths and strips stack traces', () => {
      const internalErr = new Error(
        'Failed writing to D:\\AlAgoouz System\\backend\\secret.key\n  at Object.write (C:\\node\\fs.js:12:3)',
      );
      const sanitized = sanitizeIpcError(internalErr);

      expect(sanitized).not.toContain('D:\\AlAgoouz System');
      expect(sanitized).not.toContain('C:\\node\\fs.js');
      expect(sanitized).not.toContain('at Object.write');
      expect(sanitized).toContain('[file_path]');
    });
  });
});
