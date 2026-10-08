import type { IncomingHttpHeaders } from 'node:http';

const SAFE_DEBUG_HEADERS = new Set([
  'accept',
  'content-type',
  'host',
  'origin',
  'referer',
  'user-agent',
  'x-client-type',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-request-id',
  'x-vercel-id',
]);

/** Return routing diagnostics without exposing credentials or arbitrary headers. */
export const pickSafeDebugHeaders = (headers: IncomingHttpHeaders) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => SAFE_DEBUG_HEADERS.has(name.toLowerCase()) && value !== undefined,
    ),
  );
