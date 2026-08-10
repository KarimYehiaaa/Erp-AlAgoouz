import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import './services/loggerService.js';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import routes from './routes/index.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import cookieParser from 'cookie-parser';
import { checkHealth, closePool } from './database/pool.js';
import { initAutoBackupScheduler } from './services/autoBackupService.js';
import { initWebSocket } from './services/websocketService.js';
import { initSentry } from './services/sentry.js';
if (!process.env.VERCEL && process.env.REDIS_URL) {
  import('./jobs/queue.js').catch((err) => {
    console.warn(`[Queue] ⚠️ فشل تحميل نظام الطوابير: ${err.message}`);
  });
} else if (!process.env.VERCEL) {
  console.log('[Queue] ℹ️ نظام الطوابير (BullMQ) معطّل — لتفعيله أضف REDIS_URL في .env');
}
let __dirname = process.cwd();
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
  }
} catch (e) {}
const app = express();
initSentry(app);
app.set('trust proxy', 1);
app.use(requestId);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cookieParser());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      success: false,
      message:
        '\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649 \u0644\u0627\u062D\u0642\u064B\u0627.',
    },
    skip: (req) =>
      config.isDevelopment ||
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1',
  }),
);
app.use('/assets', express.static(path.join(__dirname, '../../assets')));
app.use('/logo.png', express.static(path.join(__dirname, '../../assets/logo.png')));
app.get('/api/ping-test', (req, res) =>
  res.json({ ok: true, url: req.url, path: req.path, originalUrl: req.originalUrl }),
);
app.get('/ping-test', (req, res) =>
  res.json({ ok: true, url: req.url, path: req.path, originalUrl: req.originalUrl }),
);
app.use('/api/v1', routes);
app.use('/v1', routes);
app.get('/api/debug', authenticate, (req, res) => {
  if (config.nodeEnv === 'production' || req.user?.role_name !== 'admin') {
    return res.status(404).json({
      success: false,
      message:
        '\u0627\u0644\u0635\u0641\u062D\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
    });
  }
  res.json({
    success: true,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    method: req.method,
    headers: req.headers,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
    },
  });
});
app.get('/debug', authenticate, (req, res) => {
  if (config.nodeEnv === 'production' || req.user?.role_name !== 'admin') {
    return res.status(404).json({
      success: false,
      message:
        '\u0627\u0644\u0635\u0641\u062D\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629',
    });
  }
  res.json({
    success: true,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    method: req.method,
    headers: req.headers,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
    },
  });
});
app.get('/api/health', async (req, res) => {
  const health = await checkHealth();
  const statusCode = health.ok ? 200 : 503;
  res.status(statusCode).json({
    success: health.ok,
    message: health.ok
      ? 'API \u064A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u0637\u0628\u064A\u0639\u064A'
      : '\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0635\u0644\u0629',
    company: config.company.name,
    requestId: req.requestId,
    db: {
      connected: health.ok,
      latencyMs: health.latencyMs,
      ...(health.error ? { error: health.error } : {}),
      pool: health.poolStats,
    },
  });
});
app.get('/health', async (req, res) => {
  const health = await checkHealth();
  const statusCode = health.ok ? 200 : 503;
  res.status(statusCode).json({
    success: health.ok,
    message: health.ok
      ? 'API \u064A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u0637\u0628\u064A\u0639\u064A'
      : '\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0635\u0644\u0629',
    company: config.company.name,
    requestId: req.requestId,
    db: {
      connected: health.ok,
      latencyMs: health.latencyMs,
      pool: health.poolStats,
    },
  });
});
const possibleDistPaths = [
  path.join(process.cwd(), 'dist'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(__dirname, '../dist'),
  path.join(__dirname, '../../frontend/dist'),
  path.join(__dirname, '../../../frontend/dist'),
];
const frontendDist = possibleDistPaths.find((p) => fs.existsSync(p));
if (frontendDist) {
  console.log(`\u{1F4E6} Serving frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.log('\u26A0\uFE0F Frontend dist not found - API only mode');
  app.get('/', (_req, res) => res.redirect('/api/health'));
}
app.use(notFound);
app.use(errorHandler);
if (!process.env.VERCEL) {
  import('../scripts/migrate.js').then(async ({ runMigrations }) => {
    try {
      await runMigrations();
    } catch (e) {
      console.error('Failed to run database migrations:', e);
      process.exit(1);
    }
    const server = app.listen(config.port, async () => {
      console.log(
        `\u0628\u0646 \u0627\u0644\u0639\u062C\u0648\u0632 ERP API \u2192 http://localhost:${config.port}`,
      );
      console.log(`= Dashboard API  http://localhost:${config.port}/api/v1/dashboard`);
      initWebSocket(server);
      initAutoBackupScheduler();
      try {
        const { initDatabaseMaintenanceScheduler } =
          await import('./services/maintenanceService.js');
        initDatabaseMaintenanceScheduler();
      } catch (e) {
        console.error('Failed to start maintenance scheduler:', e.message);
      }
    });
    const keyPath = path.join(__dirname, '../certs/key.pem');
    const certPath = path.join(__dirname, '../certs/cert.pem');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      try {
        const sslOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
        const httpsServer = https.createServer(sslOptions, app);
        const httpsPort = process.env.HTTPS_PORT || 3443;
        httpsServer.listen(httpsPort, () => {
          console.log(`\u{1F512} Secure HTTPS Server \u2192 https://localhost:${httpsPort}`);
          initWebSocket(httpsServer);
        });
      } catch (sslErr) {
        console.error('\u26A0\uFE0F Failed to start HTTPS Server:', sslErr.message);
      }
    }
  });
}
const gracefulShutdown = async (signal) => {
  console.log(`
[Server] \u0627\u0633\u062A\u064F\u0642\u0628\u0644\u062A \u0625\u0634\u0627\u0631\u0629 ${signal} \u2014 \u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u062E\u0627\u062F\u0645 \u0628\u0634\u0643\u0644 \u0622\u0645\u0646...`);
  try {
    await closePool();
    console.log(
      '[Server] \u062A\u0645 \u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0628\u0646\u062C\u0627\u062D \u2705',
    );
    process.exit(0);
  } catch (err) {
    console.error(
      '[Server] \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0625\u063A\u0644\u0627\u0642:',
      err.message,
    );
    process.exit(1);
  }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error(
    '[Server] \u0627\u0633\u062A\u062B\u0646\u0627\u0621 \u063A\u064A\u0631 \u0645\u0639\u0627\u0644\u062C:',
    err,
  );
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error(
    '[Server] Promise \u0645\u0631\u0641\u0648\u0636 \u063A\u064A\u0631 \u0645\u0639\u0627\u0644\u062C:',
    reason,
  );
});
var index_default = app;
export { index_default as default };
