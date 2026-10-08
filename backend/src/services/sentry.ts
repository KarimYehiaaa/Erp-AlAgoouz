import { sentrySdk } from './sentryInstrumentation.ts';

/**
 * تهيئة Sentry لمراقبة الأخطاء (إذا توفر DSN).
 * @param {import('express').Express} app تطبيق Express
 * @returns {void}
 */
export const initSentry = (app: import('express').Express) => {
  if (!sentrySdk) return;

  // Place the error handler after routes so it observes forwarded route errors.
  sentrySdk.setupExpressErrorHandler(app);
};
