import * as Sentry from '@sentry/node';
import config from '../config/index.js';

export const initSentry = (app) => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development'
  });
  
  // The request handler must be the first middleware on the app
  Sentry.setupExpressErrorHandler(app);
};
