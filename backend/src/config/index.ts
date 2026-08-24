import crypto from 'crypto';
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
const _requireEnv = (name, fallback = '') => {
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
  const isProd = process.env.NODE_ENV === 'production';
  const dbUser = process.env.DB_USER?.trim();
  const dbPassword = process.env.DB_PASSWORD?.trim();
  if (!dbUser || !dbPassword) {
    console.warn(
      '[Config] ⚠️  DB_USER/DB_PASSWORD أو DATABASE_URL غير محددين بالكامل — تأكد من ضبط متغيرات البيئة في لوحة الاستضافة السحابية',
    );
  }
  dbConfig = {
    user: dbUser || '',
    password: dbPassword || '',
    host: dbHost,
    port: portNum,
    database: optionalEnv('DB_NAME', 'postgres'),
  };
}

// ─── SSL Detection ─────────────────────────────────────────────────────────────
// تفعيل SSL إذا:
// 1. DB_SSL=true صريح في .env
// 2. يوجد DATABASE_URL (عادةً Supabase)
// 3. الـ Host يحتوي على 'supabase' أو 'neon'
const isCloudDB =
  process.env.DATABASE_URL ||
  (dbConfig.host && (dbConfig.host.includes('supabase') || dbConfig.host.includes('neon')));

const sslEnabled = process.env.DB_SSL === 'true' || !!isCloudDB;

dbConfig.ssl = sslEnabled
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
  : false;

// ─── Export Configuration ──────────────────────────────────────────────────────
/**
 * إعدادات التطبيق المركزية (الخادم، قاعدة البيانات، JWT، CORS، معدل الطلبات، الشركة، النسخ الاحتياطي).
 * تُقرأ من متغيرات البيئة — لا توجد أسرار مضمّنة في الكود.
 */
const isProdEnv = process.env.NODE_ENV === 'production';
const envJwtSecret = process.env.JWT_SECRET?.trim();
let finalJwtSecret: string;
if (envJwtSecret) {
  finalJwtSecret = envJwtSecret;
} else {
  // توليد سر آمن في حال عدم التعيين لضمان استمرارية تشغيل النظام السحابي
  console.warn('[Config] ⚠️  JWT_SECRET غير موجود في متغيرات البيئة — تم توليد سر آمن تلقائي');
  finalJwtSecret = crypto.randomBytes(48).toString('base64');
}

const envRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
let finalRefreshSecret: string;
if (envRefreshSecret) {
  finalRefreshSecret = envRefreshSecret;
} else if (envJwtSecret) {
  // اشتقاق سر تحديث آمن ومستقل تلقائياً من JWT_SECRET عبر HMAC لتفادي توقف السيرفر
  finalRefreshSecret = crypto
    .createHmac('sha256', envJwtSecret)
    .update('alagoouz-erp-refresh-token-salt-v1')
    .digest('hex');
  if (isProdEnv) {
    console.warn(
      '[Config] ℹ️ تم اشتقاق JWT_REFRESH_SECRET تلقائياً من JWT_SECRET بنجاح لضمان استمرارية التشغيل.',
    );
  }
} else {
  console.warn('[Config] ⚠️  JWT_REFRESH_SECRET غير موجود — تم توليد سر آمن تلقائي');
  finalRefreshSecret = crypto.randomBytes(48).toString('base64');
}

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
    secret: finalJwtSecret,
    // إصلاح التجمّد: مهلة أطول (8 ساعات) — كانت 15 دقيقة تُسقط الجلسات أثناء الاستخدام
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '8h'),
    refreshSecret: finalRefreshSecret,
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  // ── Auth / Lockout ──
  auth: {
    maxFailedAttempts: parseInt(optionalEnv('AUTH_MAX_FAILED_ATTEMPTS', '5'), 10),
    lockoutMinutes: parseInt(optionalEnv('AUTH_LOCKOUT_MINUTES', '15'), 10),
  },

  // ── CORS ──
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://agoouz.vercel.app'],
  // السماح بأي معاينة *.vercel.app — يُعطَّل افتراضياً (أي تطبيق على Vercel يمكنه محاولة الاتصال)
  corsAllowVercelPreviews: process.env.CORS_ALLOW_VERCEL_PREVIEWS === 'true',
  // ثقة البروكسي لتصحيح req.ip (مطلوب خلف Vercel؛ عطّله عند التشغيل المباشر لمنع تزوير X-Forwarded-For وتجاوز rate-limit)
  trustProxy: process.env.TRUST_PROXY
    ? process.env.TRUST_PROXY === 'true'
      ? 1
      : parseInt(process.env.TRUST_PROXY, 10) || false
    : process.env.VERCEL
      ? 1
      : false,

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
