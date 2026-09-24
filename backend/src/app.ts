/**
 * app.ts — بناء تطبيق Express (بدون تشغيل)
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
import { sanitizeInput } from './middleware/sanitize.ts';
import cookieParser from 'cookie-parser';
import { checkHealth } from './database/pool.ts';
import { initSentry } from './services/sentry.ts';
import { syncMonitorController } from './controllers/syncMonitorController.ts';
import { logger } from './services/loggerService.ts';
import { csrfProtection } from './middleware/csrf.ts';

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
// ثقة البروكسي مشروطة: خلف Vercel فقط افتراضياً — التشغيل المباشر يعرض req.ip الحقيقي
// ويمنع تزوير X-Forwarded-For لتجاوز rate-limit
app.set('trust proxy', config.trustProxy);
app.use(requestId);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: config.isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'wss:', 'ws:'],
            fontSrc: ["'self'", 'data:'],
          },
        }
      : false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use(cookieParser());
app.use(csrfProtection);
app.use(
  cors({
    origin: (origin, callback) => {
      // السماح للطلبات بدون origin (مثل الأدوات المباشرة، Server-to-Server، وتطبيقات الموبايل)
      if (!origin) return callback(null, true);

      // 1. النطاقات المحددة صراحة في الإعدادات
      if (config.corsOrigin.includes(origin)) {
        return callback(null, true);
      }

      // 2. نطاقات Vercel — النطاق الرئيسي فقط افتراضياً؛ معاينات الفروع عبر CORS_ALLOW_VERCEL_PREVIEWS
      if (
        origin === 'https://agoouz.vercel.app' ||
        origin === 'https://agoouz-api.vercel.app' ||
        (config.corsAllowVercelPreviews && origin.endsWith('.vercel.app'))
      ) {
        return callback(null, true);
      }

      // 3. بيئات وتطبيقات الموبايل و التطوير المحلية (Capacitor / Localhost / LAN)
      if (
        origin.startsWith('capacitor://') ||
        origin.startsWith('ionic://') ||
        origin === 'https://localhost' ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        config.lanOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      // رفض النطاق غير المسموح به بهدوء دون كسر الخادم
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);
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
app.use('/api', routes); // مسار توافق مع الإصدارات السابقة
app.use('/v1', routes); // مسار توافق إضافي للعملاء والموجهات السحابية

/**
 * نقطة تشخيص — متاحة فقط للمدير في بيئة غير الإنتاج.
 * تعرض تفاصيل الطلب الحالي (URL، headers، env) للمساعدة في تتبع المشاكل.
 */
const handleDebug = (req: any, res: any) => {
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
};
app.get('/api/debug', authenticate, handleDebug);

/**
 * نقطة فحص الصحة — تتحقق من اتصال قاعدة البيانات وتعيد حالة الـ Pool.
 * تُستخدم في فحص الدخان (CI) وفي Vercel (/health → api/index.js).
 */
const handleHealth = async (req: any, res: any) => {
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
      // Never expose driver/host details from an unauthenticated endpoint.
      ...(health.error && !config.isProduction ? { error: health.error } : {}),
      pool: health.poolStats,
    },
  });
};

app.get('/api/health', handleHealth);
app.get('/api/v1/health', handleHealth);
app.get('/v1/health', handleHealth);
app.get('/health', handleHealth);

app.get('/api/sync/status', syncMonitorController.getStatus);
app.get('/api/v1/sync/status', syncMonitorController.getStatus);
app.get('/v1/sync/status', syncMonitorController.getStatus);
app.get('/sync/status', syncMonitorController.getStatus);

// ─── تقديم الواجهة المبنية (SPA) ──────────────────────────────────────────────
const frontendDist = resolveFrontendDist();
if (frontendDist) {
  logger.info(` Serving frontend from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // أي مسار ليس API → index.html (دعم History Mode في Vue Router)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/v1')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
} else {
  logger.info(' Frontend dist not found - API only mode');
  app.get('/', (_req, res) => res.redirect('/api/health'));
}

// ─── معالجات الأخطاء (يجب أن تكون آخر middleware) ────────────────────────────
app.use(notFound);
app.use(errorHandler);

/**
 * تطبيق Express الجاهز — يُستورد من index.ts (للتشغيل) أو من بيئة serverless.
 */
export default app;
