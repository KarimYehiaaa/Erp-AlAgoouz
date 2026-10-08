import { AppError } from '../types/errors.ts';
import { isTrustedWebOrigin } from '../utils/trustedOrigin.ts';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const getRequestOrigin = (req: any): string | null => {
  const origin = req.get('origin');
  if (origin) return origin;

  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

/**
 * Cookie-authenticated state changes and cross-origin reads need an Origin/Referer check.
 * Clients that carry no cookies use their explicit bearer/refresh credentials.
 */
export const csrfProtection = (req: any, _res: any, next: any) => {
  // Keep requests carrying session cookies protected even with Authorization:
  // refresh authenticates with its cookie and may rotate both session cookies.
  if (!req.cookies?.access_token && !req.cookies?.refresh_token) return next();

  const origin = getRequestOrigin(req);
  // Same-origin GETs may omit Origin/Referer. Explicit opaque or untrusted
  // origins cannot use session cookies even for reads of private data.
  if (!STATE_CHANGING_METHODS.has(req.method) && !origin) return next();
  if (!origin || !isTrustedWebOrigin(origin, req.get('host'))) {
    return next(new AppError('مصدر الطلب غير موثوق به', 403, 'CSRF_ORIGIN_REJECTED'));
  }

  next();
};
