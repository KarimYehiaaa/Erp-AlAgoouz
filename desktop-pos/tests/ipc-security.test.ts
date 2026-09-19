import { describe, it, expect } from 'vitest';
import {
  validateIpcSender,
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
      const mockEvent = {
        senderFrame: {
          parent: null,
          url: 'file:///C:/Users/AppData/Programs/AlAgoouz-POS/resources/app.asar/dist/index.html',
        },
      } as any;

      const isValid = validateIpcSender(mockEvent, true);
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
        validateSessionPayload(JSON.parse('{"token": "valid", "user": {}, "__proto__": {}}')).valid
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
          JSON.parse('{"items": [{}], "total_amount": 100, "__proto__": {}}')
        ).valid
      ).toBe(false);
    });
  });

  describe('sanitizeIpcError', () => {
    it('11. Masks Windows and Unix file paths and strips stack traces', () => {
      const internalErr = new Error('Failed writing to D:\\AlAgoouz System\\backend\\secret.key\n  at Object.write (C:\\node\\fs.js:12:3)');
      const sanitized = sanitizeIpcError(internalErr);

      expect(sanitized).not.toContain('D:\\AlAgoouz System');
      expect(sanitized).not.toContain('C:\\node\\fs.js');
      expect(sanitized).not.toContain('at Object.write');
      expect(sanitized).toContain('[file_path]');
    });
  });
});
