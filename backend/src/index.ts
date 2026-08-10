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
import { authenticate, authorize } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import cookieParser from 'cookie-parser';
import pool, { checkHealth, closePool } from './database/pool.js';
import { initAutoBackupScheduler } from './services/autoBackupService.js';
import { initWebSocket } from './services/websocketService.js';
import './jobs/queue.js'; // Initialize BullMQ workers
import { initSentry } from './services/sentry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

initSentry(app);

app.set('trust proxy', 1); // Trust reverse proxy (Nginx, Vercel) for real IP

app.use(requestId); // ← يجب أن يكون أول middleware
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
    message: { success: false, message: 'تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقًا.' },
    skip: (req) =>
      config.isDevelopment ||
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1',
  }),
);

app.use('/assets', express.static(path.join(__dirname, '../../assets')));
app.use('/logo.png', express.static(path.join(__dirname, '../../assets/logo.png')));
app.use('/api/v1', routes);
app.use('/v1', routes); // دعم Vercel (حيث يتم حذف /api)

app.get('/api/debug', authenticate, (req: any, res: any) => {
  if (config.nodeEnv === 'production' || req.user?.role_name !== 'admin') {
    return res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
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

app.get('/debug', authenticate, (req: any, res: any) => {
  if (config.nodeEnv === 'production' || req.user?.role_name !== 'admin') {
    return res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
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

app.get('/api/health', async (req: any, res: any) => {
  const health = await checkHealth();
  const statusCode = health.ok ? 200 : 503;
  res.status(statusCode).json({
    success: health.ok,
    message: health.ok ? 'API يعمل بشكل طبيعي' : 'قاعدة البيانات غير متصلة',
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

app.get('/health', async (req: any, res: any) => {
  const health = await checkHealth();
  const statusCode = health.ok ? 200 : 503;
  res.status(statusCode).json({
    success: health.ok,
    message: health.ok ? 'API يعمل بشكل طبيعي' : 'قاعدة البيانات غير متصلة',
    company: config.company.name,
    requestId: req.requestId,
    db: {
      connected: health.ok,
      latencyMs: health.latencyMs,
      pool: health.poolStats,
    },
  });
});

// ── Serve Frontend (Production Build) ──
// يدعم كل من الـ local والـ Render deployment
const possibleDistPaths = [
  path.join(__dirname, '../../frontend/dist'), // local: backend/src → frontend/dist
  path.join(process.cwd(), 'frontend/dist'), // Render: root → frontend/dist
  path.join(__dirname, '../../../frontend/dist'), // fallback
];
const frontendDist = possibleDistPaths.find((p) => fs.existsSync(p));

if (frontendDist) {
  console.log(`📦 Serving frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.log('⚠️ Frontend dist not found - API only mode');
  app.get('/', (_req, res) => res.redirect('/api/health'));
}

app.use(notFound);
app.use(errorHandler);

// تشغيل الـ HTTP Server فقط إذا لم نكن في بيئة Vercel Serverless
if (!process.env.VERCEL) {
  // 1. Run migrations FIRST to avoid race conditions with incoming HTTP requests
  import('../scripts/migrate.js').then(async ({ runMigrations }) => {
    try {
      await runMigrations();
    } catch (e) {
      console.error('Failed to run database migrations:', e);
      process.exit(1);
    }

    // 2. Start HTTP Server only after migrations succeed
    const server = app.listen(config.port, async () => {
      console.log(`بن العجوز ERP API → http://localhost:${config.port}`);
      console.log(`= Dashboard API  http://localhost:${config.port}/api/v1/dashboard`);

      initWebSocket(server);
      initAutoBackupScheduler();

      // Start Database Maintenance Scheduler
      try {
        const { initDatabaseMaintenanceScheduler } =
          await import('./services/maintenanceService.js');
        initDatabaseMaintenanceScheduler();
      } catch (e) {
        console.error('Failed to start maintenance scheduler:', e.message);
      }
    });

    // Start HTTPS Server if certificates exist
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
          console.log(`🔒 Secure HTTPS Server → https://localhost:${httpsPort}`);
          initWebSocket(httpsServer);
        });
      } catch (sslErr) {
        console.error('⚠️ Failed to start HTTPS Server:', sslErr.message);
      }
    }
  });
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
// إغلاق آمن للـ Pool عند إيقاف الخادم (CTRL+C أو إشارة النظام)
const gracefulShutdown = async (signal) => {
  console.log(`\n[Server] استُقبلت إشارة ${signal} — إغلاق الخادم بشكل آمن...`);
  try {
    await closePool();
    console.log('[Server] تم الإغلاق بنجاح ✅');
    process.exit(0);
  } catch (err) {
    console.error('[Server] خطأ أثناء الإغلاق:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Server] استثناء غير معالج:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Promise مرفوض غير معالج:', reason);
  // لا نُغلق هنا — نسجّل فقط
});

export default app;
