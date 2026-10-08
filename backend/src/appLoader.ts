import type { Express } from 'express';

let instrumentedApp: Promise<Express> | undefined;

/** Load Sentry before the app's Express dependency graph is evaluated. */
export const loadInstrumentedApp = (): Promise<Express> => {
  instrumentedApp ??= import('./services/sentryInstrumentation.ts')
    .then(() => import('./app.ts'))
    .then(({ default: app }) => app);

  return instrumentedApp;
};
