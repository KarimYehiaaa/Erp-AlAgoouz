import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// تحميل .env من مجلد backend (حيث يعمل العملية)
let __dirname = process.cwd();
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
  }
} catch {
  // تجاهل مقصود: الفشل في التحميل ليس حرجًا هنا
}
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── Helpers ───────────────────────────────────────────────────────────────────
/**
 * الحصول على متغير بيئة أو استخدام قيمة افتراضية للإنتاج لضمان عمل Vercel تلقائياً
 */
const requireEnv = (name, fallback = '') => {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (fallback) return fallback;
  throw new Error(`تعذر العثور على متغير البيئة المطلوب: ${name}`);
};

/**
 * دالة مساعدة لجلب متغير بيئة اختياري مع قيمة افتراضية
 */
const optionalEnv = (name, defaultValue = '') => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : defaultValue;
};

// --- Database Configuration ---
/**
 * @typedef {{
 *   connectionString?: string | null,
 *   host?: string | null,
 *   port?: number | null,
 *   database?: string | null,
 *   user?: string | null,
 *   password?: string | null,
 *   ssl?: boolean | { rejectUnauthorized: boolean },
 * }} DbConfig
 */
/** @type {DbConfig} */
let dbConfig;

if (process.env.DATABASE_URL) {
  let connStr = process.env.DATABASE_URL;
  if (connStr.includes('pooler.supabase.com:5432')) {
    connStr = connStr.replace(':5432', ':6543');
  }
  dbConfig = {
    connectionString: connStr,
    host: null,
    port: null,
    database: null,
    user: null,
    password: null,
  };
} else {
  const dbHost = optionalEnv('DB_HOST', 'aws-0-eu-north-1.pooler.supabase.com');
  let portNum = parseInt(optionalEnv('DB_PORT', '6543'), 10);
  if (dbHost && dbHost.includes('pooler.supabase.com') && portNum === 5432) {
    portNum = 6543; // Switch to Transaction Mode (unlimited pooled clients)
  }
  dbConfig = {
    user: optionalEnv('DB_USER', 'postgres.agzcpybgcjxtkyszfhws'),
    password: optionalEnv('DB_PASSWORD', 'C@me#Cap0#1'),
    host: dbHost,
    port: portNum,
    database: optionalEnv('DB_NAME', 'postgres'),
  };
}

// ─── SSL Detection ─────────────────────────────────────────────────────────────
// تفعيل SSL إذا:
// 1. DB_SSL=true صريح في .env
// 2. يوجد DATABASE_URL (عادةً Supabase/Render)
// 3. الـ Host يحتوي على 'supabase' أو 'neon' أو 'render'
const isCloudDB =
  process.env.DATABASE_URL ||
  (dbConfig.host &&
    (dbConfig.host.includes('supabase') ||
      dbConfig.host.includes('neon') ||
      dbConfig.host.includes('render') ||
      dbConfig.host.includes('pooler')));

const sslEnabled = process.env.DB_SSL === 'true' || !!isCloudDB;

dbConfig.ssl = sslEnabled
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
  : false;

// ─── Export Configuration ──────────────────────────────────────────────────────
/**
 * إعدادات التطبيق المركزية (الخادم، قاعدة البيانات، JWT، CORS، معدل الطلبات، الشركة، النسخ الاحتياطي).
 * تُقرأ من متغيرات البيئة مع قيم افتراضية مناسبة للإنتاج.
 */
const defaultJwtSecret = 'q1b2DoHuyqTNfjOM+BlV01Xl7NNaw+a0sgts3kbpYL4DKdy0VXqTnyA5HnwIgN6W';
const jwtSecret = optionalEnv('JWT_SECRET', defaultJwtSecret);

const config = {
  // ── Server ──
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  httpsPort: parseInt(optionalEnv('HTTPS_PORT', '3443'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',

  // ── Database ──
  db: dbConfig,

  // ── JWT ──
  jwt: {
    secret: jwtSecret,
    // إصلاح التجمّد: مهلة أطول (8 ساعات) — كانت 15 دقيقة تُسقط الجلسات أثناء الاستخدام
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '8h'),
    refreshSecret: optionalEnv('JWT_REFRESH_SECRET', jwtSecret + '_refresh'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  // ── CORS ──
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://agoouz.vercel.app'],

  // ── Rate Limiting ──
  rateLimit: {
    windowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10), // 15 دقيقة
    max: parseInt(optionalEnv('RATE_LIMIT_MAX', '200'), 10),
  },

  // ── Company ──
  company: {
    name: optionalEnv('COMPANY_NAME', 'بن العجوز'),
    nameEn: optionalEnv('COMPANY_NAME_EN', 'Bin Al-Ajouz'),
    taxNumber: optionalEnv('COMPANY_TAX_NUMBER', ''),
    phone: optionalEnv('COMPANY_PHONE', ''),
    address: optionalEnv('COMPANY_ADDRESS', ''),
  },

  // ── Backup ──
  backup: {
    autoDir: optionalEnv('AUTO_BACKUP_DIR', ''),
    skipCleanup: process.env.AUTO_BACKUP_SKIP_CLEANUP === '1',
    skipExternal: process.env.AUTO_BACKUP_SKIP_EXTERNAL === '1',
  },
};

// ─── Validation at Startup ─────────────────────────────────────────────────────
// التحقق من وجود إعدادات DB الأساسية
if (!process.env.DATABASE_URL && !config.db.host) {
  throw new Error('❌ لا يوجد إعداد قاعدة بيانات: يجب توفير DATABASE_URL أو DB_HOST');
}

// طباعة ملخص الإعدادات عند التشغيل (في بيئة التطوير فقط)
if (config.isDevelopment && !process.env.SUPPRESS_CONFIG_LOG) {
  const dbInfo = process.env.DATABASE_URL
    ? `DATABASE_URL (Cloud)`
    : `${config.db.host}:${config.db.port}/${config.db.database}`;
  console.log(`[Config] 🗄️  DB: ${dbInfo} | SSL: ${sslEnabled} | Env: ${config.nodeEnv}`);
  console.log(`[Config] 🏢  الشركة: ${config.company.name} | Port: ${config.port}`);
}

export default config;
