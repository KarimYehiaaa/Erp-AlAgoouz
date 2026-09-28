// Validate the resolved config before test modules can create a database pool.
//
// سياسة العزل (نفس سياسة scripts/run-vitest-local.ts): الاختبارات يجب ألا تلمس
// قاعدة الإنتاج/السحابة أبدًا. `npm test` (vitest المباشر) يرث متغيرات .env
// (Supabase/الإنتاج) — لذا قبل قراءة الإعدادات نستبدل أي هدف قاعدة غير آمن
// بقاعدة اختبار محلية معزولة، ثم نُمرّر الإعدادات النهائية على الحارس
// assertSafeTestDatabase ليبقى الفحص ساريًا (لا نتجاوزه أبدًا).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeTestDatabase } from '../scripts/testDatabaseSafety.ts';

// بيانات اعتماد PostgreSQL المحلية — نفس منطق scripts/run-vitest-local.ts.
const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const localPgFile = path.join(backendRoot, '.postgres.local');
const localPgPassword =
  process.env.POSTGRES_PASSWORD ||
  (fs.existsSync(localPgFile)
    ? fs.readFileSync(localPgFile, 'utf8').trim()
    : process.env.CI
      ? 'postgres'
      : '0120');

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
