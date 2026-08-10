import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// تحميل .env من مجلد backend (حيث يعمل العملية)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── Helpers ───────────────────────────────────────────────────────────────────
/**
 * الحصول على متغير بيئة مطلوب — يرمي خطأ إن كان غائباً
 */
const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`تعذر العثور على متغير البيئة المطلوب: ${name}`);
  }
  return value.trim();
};

/**
 * دالة مساعدة لجلب متغير بيئة اختياري مع قيمة افتراضية
 */
const optionalEnv = (name, defaultValue = '') => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : defaultValue;
};

// --- Database Configuration ---
let dbConfig;

if (process.env.DATABASE_URL) {
  // وضع Render / Supabase الكامل عبر Connection String
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    host: null,
    port: null,
    database: null,
    user: null,
    password: null,
  };
} else {
  // وضع الإعداد اليدوي (Local / Supabase Pooler)
  dbConfig = {
    user: optionalEnv('DB_USER', 'erp_user'),
    password: optionalEnv('DB_PASSWORD', ''),
    host: optionalEnv('DB_HOST', 'localhost'),
    port: parseInt(optionalEnv('DB_PORT', '5432'), 10),
    database: optionalEnv('DB_NAME', 'bin_al_ajouz'),
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
  ? { rejectUnauthorized: process.env.NODE_ENV === 'production' } // السماح بشهادات self-signed (Supabase) محليا فقط
  : false;

// ─── Export Configuration ──────────────────────────────────────────────────────
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
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '15m'),
    refreshSecret: optionalEnv('JWT_REFRESH_SECRET', requireEnv('JWT_SECRET') + '_refresh'),
    refreshExpiresIn: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  // ── CORS ──
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3000', 'https://agoouz.vercel.app'],

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
