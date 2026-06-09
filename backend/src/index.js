import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import routes from './routes/index.js';
import { authenticate, authorize } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import pool from './database/pool.js';
import { initAutoBackupScheduler } from './services/autoBackupService.js';

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
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.redirect('/api/health'));
}

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`بن العجوز ERP API → http://localhost:${config.port}`);
  console.log(`= Dashboard API  http://localhost:${config.port}/api/v1/dashboard`);

  initAutoBackupScheduler();
});
