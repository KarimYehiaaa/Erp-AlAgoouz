import { createRequire } from 'node:module';
import config from '../config/index.ts';

const dsn = process.env.SENTRY_DSN?.trim();
const require = createRequire(import.meta.url);

// Reuse the package's supported CommonJS entry rather than loading both SDK module graphs.
// An unconfigured optional monitor must not load its integrations during application startup.
export const sentrySdk: typeof import('@sentry/node') | undefined = dsn
  ? require('@sentry/node')
  : undefined;

if (sentrySdk) {
  sentrySdk.init({
    dsn,
    tracesSampleRate: 1.0,
    environment: config.nodeEnv,
  });
  // The ESM/CJS bridge can bypass require hooks when it first loads these libraries.
  // Load them through the instrumented CJS path before app.ts creates routes or a pool.
  require('express');
  require('pg');
}
