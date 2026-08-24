import * as Sentry from '@sentry/vue';
import type { App } from 'vue';
import type { Router } from 'vue-router';

/**
 * تهيئة Sentry لمراقبة الأخطاء والأداء في بيئة الإنتاج فقط (عند توفر VITE_SENTRY_DSN).
 * @param {App} app مثيل التطبيق Vue
 * @param {Router} router موجّه Vue Router (لتتبع التنقلات)
 * @returns {void}
 */
export const initSentry = (app: App, router: Router) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    app,
    dsn,
    integrations: [Sentry.browserTracingIntegration({ router }), Sentry.replayIntegration()],
    // تتبّع الأداء لعينة محدودة — 100% يضاعف الحمل على نظام كثيف الاستقصاء
    tracesSampleRate: 0.1,
    tracePropagationTargets: [/^\//, window.location.origin],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
  });
};
