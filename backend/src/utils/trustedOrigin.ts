import { isIP } from 'node:net';
import config from '../config/index.ts';

/** Shared browser-origin policy. Match hosts, never hostname prefixes. */
export const isTrustedWebOrigin = (origin: string, requestHost?: string): boolean => {
  if (origin === 'capacitor://localhost' || origin === 'ionic://localhost') return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
  if (config.corsOrigin.includes(origin) || config.lanOrigins.includes(origin)) return true;
  if (origin === 'https://agoouz.vercel.app' || origin === 'https://agoouz-api.vercel.app')
    return true;
  if (
    config.corsAllowVercelPreviews &&
    parsed.protocol === 'https:' &&
    parsed.hostname.endsWith('.vercel.app')
  )
    return true;
  const host = parsed.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (isIP(host) !== 4) return false;
  const [first, second] = host.split('.').map(Number);
  const privateHost =
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31);
  // A random site on the LAN must not read cloud session cookies. The local
  // server's own origin is allowed; other LAN origins need explicit configuration.
  return privateHost && parsed.host === requestHost?.toLowerCase();
};
