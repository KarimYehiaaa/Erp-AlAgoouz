// Validate the resolved config before test modules can create a database pool.
//
// سياسة العزل (نفس سياسة scripts/run-vitest-local.ts): الاختبارات يجب ألا تلمس
// قاعدة الإنتاج/السحابة أبدًا. `npm test` (vitest المباشر) يرث متغيرات .env
// (Supabase/الإنتاج) — لذا قبل قراءة الإعدادات نستبدل أي هدف قاعدة غير آمن
// بقاعدة اختبار محلية معزولة، ثم نُمرّر الإعدادات النهائية على الحارس
// assertSafeTestDatabase ليبقى الفحص ساريًا (لا نتجاوزه أبدًا).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';
import { resolveLocalTestDatabasePassword } from '../scripts/localTestDatabasePassword.ts';

// Never mint test sessions using credentials inherited from the live .env.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'alagoouz-isolated-test-access-secret-never-deploy';
process.env.JWT_REFRESH_SECRET = 'alagoouz-isolated-test-refresh-secret-never-deploy';
process.env.SENTRY_DSN = '';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_CHAT_ID = '';
// Ordinary fixtures use a test key, while an explicitly requested recovery drill
// retains the securely provided original key needed to decrypt its source file.
if (process.env.ERP_SHARED_BACKUP_DRILL !== '1' && process.env.ERP_UPGRADE_DRILL !== '1') {
  process.env.BACKUP_ENCRYPTION_KEY = 'alagoouz-isolated-test-backup-key-never-deploy';
}
// Do not inherit cloud TLS or transaction-pool settings in local fixtures.
process.env.DB_SSL_CA_FILE = '';
process.env.DB_POOL_MODE = 'auto';

// بيانات اعتماد PostgreSQL المحلية — نفس منطق scripts/run-vitest-local.ts.
const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const localPgFile = path.join(backendRoot, '.postgres.local');
const localPgPassword = resolveLocalTestDatabasePassword({
  environment: process.env,
  localPasswordFile: localPgFile,
});

const localHosts = ['localhost', '127.0.0.1', '::1'];
const safeDatabaseName = /^[a-zA-Z0-9_]+_test$/;

/** هل connectionString آمن (حلقي + قاعدة تنتهي بـ _test)؟ */
function isSafeConnectionString(connStr: string): boolean {
  try {
    const url = new URL(connStr);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      localHosts.includes(url.hostname.toLowerCase()) &&
      safeDatabaseName.test(decodeURIComponent(url.pathname.slice(1))) &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const connStr = process.env.DATABASE_URL || '';
const host = (process.env.DB_HOST || 'localhost').toLowerCase();
const database = process.env.DB_NAME || '';

const explicitSafeTarget =
  (connStr ? isSafeConnectionString(connStr) : false) ||
  (!connStr && localHosts.includes(host) && safeDatabaseName.test(database));

if (!explicitSafeTarget) {
  // .env يحمل بيانات سحابية/إنتاجية — نعزل الاختبارات تمامًا عنها.
  // ملاحظة: dotenv داخل config يعيد تعبئة أي متغير محذوف من .env، لذا نضع
  // قيمًا آمنة صريحة (الفارغة آمنة أيضًا لأن dotenv لا يتجاوز متغيرًا موجودًا).
  if (!isSafeConnectionString(process.env.DATABASE_URL || '')) {
    process.env.DATABASE_URL = '';
  }
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = process.env.DB_PORT || '5432';
  process.env.DB_NAME = 'bin_al_ajouz_test';
  process.env.DB_USER = 'postgres';
  process.env.DB_PASSWORD = localPgPassword;
  process.env.DB_SSL = 'false';
  process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
}

// استيراد ديناميكي بعد التعقيم حتى تُقرأ config من البيئة المعزولة لا من .env.
const { default: config } = await import('../src/config/index.ts');

assertSafeTestDatabase(config.db);
