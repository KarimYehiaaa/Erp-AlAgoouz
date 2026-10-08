import { describe, expect, it } from 'vitest';
import { hasTrustedUpdatePublisher } from '../electron/security/updatePolicy';

describe('desktop update trust policy', () => {
  it('rejects metadata without a publisher so unsigned packages cannot auto-update', () => {
    expect(hasTrustedUpdatePublisher('provider: github\nowner: example\nrepo: pos')).toBe(false);
    expect(hasTrustedUpdatePublisher('publisherName: []\n')).toBe(false);
    expect(hasTrustedUpdatePublisher('publisherName: null\n')).toBe(false);
    expect(
      hasTrustedUpdatePublisher('publisherName:\nfiles:\n  - url: unsigned-installer.exe\n'),
    ).toBe(false);
    expect(hasTrustedUpdatePublisher('publisherName: ""\n')).toBe(false);
  });

  it('accepts a configured publisher string or publisher list from signed builds', () => {
    expect(hasTrustedUpdatePublisher('publisherName: "CN=AlAgoouz ERP"\n')).toBe(true);
    expect(hasTrustedUpdatePublisher('publisherName:\n  - "CN=AlAgoouz ERP"\n')).toBe(true);
  });
});
