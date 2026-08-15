import * as Sentry from '@sentry/node';
import config from '../config/index.ts';

/**
 * تهيئة Sentry لمراقبة الأخطاء (إذا توفر DSN).
 * @param {import('express').Express} app تطبيق Express
 * @returns {void}
 */
export const initSentry = (app: import('express').Express) => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });

  // The request handler must be the first middleware on the app
  Sentry.setupExpressErrorHandler(app);
};
