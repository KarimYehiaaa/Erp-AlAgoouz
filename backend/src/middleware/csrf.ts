import { AppError } from '../types/errors.ts';
import config from '../config/index.ts';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRUSTED_FIXED_ORIGINS = new Set([
  'https://agoouz.vercel.app',
  'https://agoouz-api.vercel.app',
]);

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

const isTrustedOrigin = (origin: string): boolean =>
  config.corsOrigin.includes(origin) ||
  config.lanOrigins.includes(origin) ||
  TRUSTED_FIXED_ORIGINS.has(origin) ||
  (config.corsAllowVercelPreviews && origin.endsWith('.vercel.app'));

/**
 * Cookie-authenticated browser requests need an Origin/Referer check.
 * Bearer-authenticated desktop/native clients are intentionally unaffected.
 */
export const csrfProtection = (req: any, _res: any, next: any) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();
  if (!req.cookies?.access_token || req.headers.authorization) return next();

  const origin = getRequestOrigin(req);
  if (!origin || !isTrustedOrigin(origin)) {
    return next(new AppError('مصدر الطلب غير موثوق به', 403, 'CSRF_ORIGIN_REJECTED'));
  }

  next();
};
