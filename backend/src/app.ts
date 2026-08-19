/**
 * app.ts — بناء تطبيق Express (بدون تشغيل)
 * ═══════════════════════════════════════════════
 * يبني تطبيق Express كاملًا:
 *  - الـ middleware: الأمان (helmet/cors/rate-limit)، تسجيل الطلبات (morgan)،
 *    تحليل JSON/cookies، ومعرّف الطلب (requestId)
 *  - تقديم الواجهة المبنية من `frontend/dist` (إن وُجدت)
 *  - مسارات API (`/api/v1` و `/v1`) + نقاط فحص الصحة (health/debug)
 *  - معالجات الأخطاء (404 + المركزي)
 *
 * هذا الملف لا يُشغّل الخادم ولا الهجرات — يفصل البناء عن التشغيل ليُستورد
 * التطبيق في الاختبارات التكاملية أو في بيئة serverless (Vercel) مباشرة.
 */
import express from 'express';
// Server reload trigger - updated calculations
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import './services/loggerService.ts';
import { resolveFrontendDist } from './utils/frontendDist.ts';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.ts';
import routes from './routes/index.ts';
import { authenticate } from './middleware/auth.ts';
import { errorHandler, notFound } from './middleware/errorHandler.ts';
import { requestId } from './middleware/requestId.ts';
import cookieParser from 'cookie-parser';
import { checkHealth } from './database/pool.ts';
import { initSentry } from './services/sentry.ts';

// ─── تحديد مجلد العمل (يعمل في ESM وفي العقدة العادية) ───────────────────────
let __dirname = process.cwd();
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
  }
} catch {
  // تجاهل مقصود
}

/** التطبيق الرئيسي لـ Express — يُبنى بكل الـ middleware والمسارات. */
const app = express();

initSentry(app);
app.set('trust proxy', 1);
app.use(requestId);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigin.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin غير مسموح به'));
    },
    credentials: true,
  }),
);
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      success: false,
      message: 'تم تجاوز عدد المحاولات. حاول مرة أخرى لاحقًا.',
    },
    skip: (req) =>
      config.isDevelopment ||
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1',
  }),
);

// ─── الملفات الثابتة (الشعار والموارد العامة) ─────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, '../../assets')));
app.use('/logo.png', express.static(path.join(__dirname, '../../assets/logo.png')));

// ─── المسارات الرئيسية ───────────────────────────────────────────────────────
app.use('/api/v1', routes);
app.use('/v1', routes);

/**
 * نقطة تشخيص — متاحة فقط للمدير في بيئة غير الإنتاج.
 * تعرض تفاصيل الطلب الحالي (URL، headers، env) للمساعدة في تتبع المشاكل.
 */
app.get('/api/debug', authenticate, (req, res) => {
  if (config.nodeEnv === 'production' || req.user?.role_name !== 'admin') {
    return res.status(404).json({
      success: false,
      message: 'الصفحة غير موجودة',
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

/** نسخة مختصرة من نقطة التشخيص (بدون بادئة /api). */
app.get('/debug', authenticate, (req, res) => {
  if (config.nodeEnv === 'production' || req.user?.role_name !== 'admin') {
    return res.status(404).json({
      success: false,
      message: 'الصفحة غير موجودة',
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

/**
 * نقطة فحص الصحة — تتحقق من اتصال قاعدة البيانات وتعيد حالة الـ Pool.
 * تُستخدم في فحص الدخان (CI) وفي Vercel (/health → api/index.js).
 */
app.get('/api/health', async (req, res) => {
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

/** نقطة فحص صحة مختصرة (بدون بادئة /api) — لفحص الدخان و Vercel. */
app.get('/health', async (req, res) => {
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

// ─── تقديم الواجهة المبنية (SPA) ──────────────────────────────────────────────
const frontendDist = resolveFrontendDist();
if (frontendDist) {
  console.log(`📦 Serving frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // أي مسار ليس API → index.html (دعم History Mode في Vue Router)
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  console.log('⚠️ Frontend dist not found - API only mode');
  app.get('/', (_req, res) => res.redirect('/api/health'));
}

// ─── معالجات الأخطاء (يجب أن تكون آخر middleware) ────────────────────────────
app.use(notFound);
app.use(errorHandler);

/**
 * تطبيق Express الجاهز — يُستورد من index.ts (للتشغيل) أو من بيئة serverless.
 */
export default app;
