import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LookupAddress } from 'node:dns';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

import { lookup } from 'node:dns/promises';
import {
  createPinnedDnsLookup,
  createPublicWebhookDispatcher,
  isPublicInternetAddress,
  isSafeExternalUrl,
  resolvePublicWebhookTarget,
} from './urlValidator.ts';

const lookupMock = vi.mocked(lookup) as unknown as {
  mockReset: () => void;
  mockResolvedValue: (value: LookupAddress[]) => unknown;
  mockReturnValueOnce: (value: Promise<LookupAddress[]>) => unknown;
};

describe('external webhook URL security', () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it.each([
    '127.0.0.1',
    '10.0.0.8',
    '100.64.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicInternetAddress(address)).toBe(false);
  });

  it('accepts publicly routable IPv4 and IPv6 addresses', () => {
    expect(isPublicInternetAddress('8.8.8.8')).toBe(true);
    expect(isPublicInternetAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('does not resolve DNS or create a dispatcher after its operation budget expires', async () => {
    const controller = new AbortController();
    const reason = new Error('Fixture deadline');
    controller.abort(reason);
    await expect(
      createPublicWebhookDispatcher('https://hooks.example.com/upload', controller.signal),
    ).rejects.toBe(reason);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('aborts a pending DNS lookup without creating a late dispatcher', async () => {
    let resolve!: (addresses: LookupAddress[]) => void;
    lookupMock.mockReturnValueOnce(
      new Promise<LookupAddress[]>((done) => {
        resolve = done;
      }),
    );
    const controller = new AbortController();
    const request = createPublicWebhookDispatcher(
      'https://hooks.example.com/upload',
      controller.signal,
    );
    controller.abort(new Error('Fixture deadline'));
    await expect(request).rejects.toThrow('Fixture deadline');
    resolve([{ address: '93.184.216.34', family: 4 }]);
    await Promise.resolve();
  });

  it.each([
    'http://backup.example.com/upload',
    'https://user:password@backup.example.com/upload',
    'https://127.0.0.1/upload',
    'https://[::1]/upload',
    'https://169.254.169.254/latest/meta-data',
    'file:///C:/Windows/win.ini',
  ])('rejects unsafe webhook URL %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });

  it('pins a hostname to a validated public DNS answer', async () => {
    const target = await resolvePublicWebhookTarget('https://hooks.example.com/upload');
    const pinnedLookup = createPinnedDnsLookup(target);
    const callback = vi.fn();

    pinnedLookup('hooks.example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    const changedHostnameCallback = vi.fn();
    pinnedLookup('metadata.google.internal', {}, changedHostnameCallback);
    expect(changedHostnameCallback.mock.calls[0][0]).toMatchObject({ code: 'EACCES' });
  });

  it('keeps all validated public DNS answers pinned for safe address failover', async () => {
    const answers = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ];
    lookupMock.mockResolvedValue(answers);
    const target = await resolvePublicWebhookTarget('https://hooks.example.com/upload');
    const callback = vi.fn();

    createPinnedDnsLookup(target)('hooks.example.com', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, answers);
  });

  it('rejects a hostname when any DNS answer points to a private address', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(resolvePublicWebhookTarget('https://hooks.example.com/upload')).rejects.toThrow(
      'public internet addresses',
    );
  });

  it('rejects a hostname that resolves only to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(resolvePublicWebhookTarget('https://hooks.example.com/upload')).rejects.toThrow(
      'public internet addresses',
    );
  });
});
