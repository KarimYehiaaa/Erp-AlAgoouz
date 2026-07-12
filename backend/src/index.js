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
import pool from './database/pool.js';
import { initAutoBackupScheduler } from './services/autoBackupService.js';
import { initWebSocket } from './services/websocketService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, message: 'تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقًا.' },
}));

app.use('/assets', express.static(path.join(__dirname, '../../assets')));
app.use('/logo.png', express.static(path.join(__dirname, '../../assets/logo.png')));
app.use('/api/v1', routes);

// BUG-15 FIX: حذف debug backup route المكرر — يكفي GET /api/v1/backup/create المحمي بـ requireAdmin

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'API يعمل بشكل طبيعي', company: config.company.name });
  } catch {
    res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
});

// ── Serve Frontend (Production Build) ──
// يدعم كل من الـ local والـ Render deployment
const possibleDistPaths = [
  path.join(__dirname, '../../frontend/dist'),          // local: backend/src → frontend/dist
  path.join(process.cwd(), 'frontend/dist'),            // Render: root → frontend/dist
  path.join(__dirname, '../../../frontend/dist'),       // fallback
];
const frontendDist = possibleDistPaths.find(p => fs.existsSync(p));

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



const server = app.listen(config.port, async () => {
  console.log(`بن العجوز ERP API → http://localhost:${config.port}`);
  console.log(`= Dashboard API  http://localhost:${config.port}/api/v1/dashboard`);

  initWebSocket(server);
  initAutoBackupScheduler();

  // Start Database Maintenance Scheduler
  try {
    const { initDatabaseMaintenanceScheduler } = await import('./services/maintenanceService.js');
    initDatabaseMaintenanceScheduler();
  } catch (e) {
    console.error('Failed to start maintenance scheduler:', e.message);
  }

  // Start Database Migrations Sync (Self-Healing)
  try {
    const { runMigrations } = await import('../scripts/migrate.js');
    await runMigrations();
  } catch (e) {
    console.error('Failed to run database migrations:', e);
    process.exit(1);
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

export default app;

