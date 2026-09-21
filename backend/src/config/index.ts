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
  const dbHost = optionalEnv('DB_HOST', 'localhost');
  let portNum = parseInt(optionalEnv('DB_PORT', '5432'), 10);
  if (dbHost && dbHost.includes('pooler.supabase.com') && portNum === 5432) {
    portNum = 6543; // Switch to Transaction Mode (pooled clients)
  }
  const dbUser = process.env.DB_USER?.trim();
  const dbPassword = process.env.DB_PASSWORD?.trim();
  if (!dbUser || !dbPassword) {
    console.warn(
      '[Config]   DB_USER/DB_PASSWORD أو DATABASE_URL غير محددين بالكامل — تأكد من ضبط متغيرات البيئة في لوحة الاستضافة السحابية',
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
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : false;

// ─── Export Configuration ──────────────────────────────────────────────────────
/**
 * إعدادات التطبيق المركزية (الخادم، قاعدة البيانات، JWT، CORS، معدل الطلبات، الشركة، النسخ الاحتياطي).
 * تُقرأ من متغيرات البيئة — لا توجد أسرار مضمّنة في الكود.
 */
const isProdEnv = process.env.NODE_ENV === 'production';
const envJwtSecret = process.env.JWT_SECRET?.trim();
let finalJwtSecret: string;

if (isProdEnv) {
  if (!envJwtSecret || envJwtSecret.length < 32) {
    throw new Error(
      '[Security Error] متغير البيئة JWT_SECRET إجباري في بيئة الإنتاج ويجب أن يتكون من 32 حرفاً على الأقل لحماية جلسات المستخدمين.',
    );
  }
  finalJwtSecret = envJwtSecret;
} else {
  finalJwtSecret =
    envJwtSecret || 'dev_jwt_secret_key_that_is_at_least_32_characters_long_for_testing!';
}

const envRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
let finalRefreshSecret: string;
if (envRefreshSecret) {
  finalRefreshSecret = envRefreshSecret;
} else {
  // اشتقاق سر تحديث آمن ومستقل من JWT_SECRET عبر HMAC
  finalRefreshSecret = crypto
    .createHmac('sha256', finalJwtSecret)
    .update('alagoouz-erp-refresh-token-salt-v1')
    .digest('hex');
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
    // توكن وصول قصير الأجل (ساعتان) مع تجديد صامت عبر refresh token — يقلل نافذة سرقة التوكن
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '2h'),
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
  // أصول LAN صريحة فقط (مثال: CORS_LAN_ORIGINS=http://192.168.1.50:5173) — لا wildcard للشبكة الداخلية
  lanOrigins: process.env.CORS_LAN_ORIGINS
    ? process.env.CORS_LAN_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [],
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

  // ── Automation ──
  automation: {
    cronSecret: optionalEnv('AUTOMATION_CRON_SECRET', ''),
  },
};

// ─── Validation at Startup ─────────────────────────────────────────────────────
// التحقق من وجود إعدادات DB الأساسية
if (!process.env.DATABASE_URL && !config.db.host) {
  throw new Error(' لا يوجد إعداد قاعدة بيانات: يجب توفير DATABASE_URL أو DB_HOST');
}

if (isProdEnv) {
  const backupKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!backupKey || backupKey.length < 32) {
    throw new Error(
      '[Security Error] متغير البيئة BACKUP_ENCRYPTION_KEY إجباري في بيئة الإنتاج ويجب أن يتكون من 32 حرفاً على الأقل لتأمين النسخ الاحتياطية.',
    );
  }
}

// طباعة ملخص الإعدادات عند التشغيل (في بيئة التطوير فقط)
if (config.isDevelopment && !process.env.SUPPRESS_CONFIG_LOG) {
  const dbInfo = process.env.DATABASE_URL
    ? `DATABASE_URL (Cloud)`
    : `${config.db.host}:${config.db.port}/${config.db.database}`;
  console.log(`[Config]   DB: ${dbInfo} | SSL: ${sslEnabled} | Env: ${config.nodeEnv}`);
  console.log(`[Config]   الشركة: ${config.company.name} | Port: ${config.port}`);
}

export default config;
