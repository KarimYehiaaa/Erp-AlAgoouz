import * as Sentry from '@sentry/vue';
import type { App } from 'vue';
import type { Router } from 'vue-router';

/**
 * تهيئة Sentry لمراقبة الأخطاء والأداء في بيئة الإنتاج فقط (عند توفر VITE_SENTRY_DSN).
 * @param {App} app مثيل التطبيق Vue\n * @param {Router} router موجّه Vue Router (لتتبع التنقلات)\n * @returns {void}
 */
export const initSentry = (app: App, router: Router) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    integrations: [Sentry.browserTracingIntegration({ router }), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};
