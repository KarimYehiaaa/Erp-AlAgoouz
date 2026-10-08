import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';
import { AppError } from '../types/errors.ts';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

export function isPublicInternetAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    const routable =
      'isIPv4MappedAddress' in parsed && parsed.isIPv4MappedAddress()
        ? parsed.toIPv4Address()
        : parsed;
    return routable.range() === 'unicast';
  } catch {
    return false;
  }
}

function parseWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value?.trim());
  } catch {
    throw new AppError('Webhook URL is invalid', 400);
  }

  if (url.protocol !== 'https:') {
    throw new AppError('Webhook URL must use HTTPS', 400);
  }
  if (url.username || url.password) {
    throw new AppError('Webhook URL must not contain embedded credentials', 400);
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError('الروابط الداخلية للشبكة غير مسموح بها لأسباب أمنية', 403);
  }
  if (ipaddr.isValid(hostname) && !isPublicInternetAddress(hostname)) {
    throw new AppError('الروابط الداخلية للشبكة غير مسموح بها لأسباب أمنية', 403);
  }

  return url;
}

export function isSafeExternalUrl(urlString: string): boolean {
  try {
    parseWebhookUrl(urlString);
    return true;
  } catch {
    return false;
  }
}

export interface PublicWebhookTarget extends LookupAddress {
  hostname: string;
  addresses: LookupAddress[];
}

export async function resolvePublicWebhookTarget(
  value: string,
  resolve = lookup,
): Promise<PublicWebhookTarget> {
  const url = parseWebhookUrl(value);
  const hostname = normalizeHostname(url.hostname);
  const family = ipaddr.isValid(hostname) ? (ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6) : 0;
  const addresses = family
    ? [{ address: hostname, family }]
    : await resolve(hostname, { all: true, verbatim: true });

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicInternetAddress(address))
  ) {
    throw new AppError('Webhook destination must resolve only to public internet addresses', 403);
  }

  return { ...addresses[0], hostname, addresses };
}

export function createPinnedDnsLookup(target: PublicWebhookTarget): LookupFunction {
  const targetHostname = normalizeHostname(target.hostname);

  return ((
    hostname: string,
    options: number | Record<string, unknown>,
    callback: (...args: any[]) => void,
  ) => {
    if (normalizeHostname(hostname) !== targetHostname) {
      const error = Object.assign(new Error('Webhook DNS target changed after validation'), {
        code: 'EACCES',
      });
      callback(error);
      return;
    }

    if (typeof options === 'object' && options !== null && options.all === true) {
      callback(null, target.addresses);
    } else {
      callback(null, target.address, target.family);
    }
  }) as LookupFunction;
}

export async function createPublicWebhookDispatcher(
  value: string,
  signal?: AbortSignal,
): Promise<Agent> {
  signal?.throwIfAborted();
  let onAbort: (() => void) | undefined;
  let target: PublicWebhookTarget;
  try {
    const resolution = resolvePublicWebhookTarget(value);
    target = signal
      ? await Promise.race([
          resolution,
          new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
          }),
        ])
      : await resolution;
    signal?.throwIfAborted();
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
  return new Agent({
    connect: {
      lookup: createPinnedDnsLookup(target),
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 250,
    },
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  });
}
