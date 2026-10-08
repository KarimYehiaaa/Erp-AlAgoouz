/**
 * run-vitest-local.ts — تشغيل اختبارات vitest على قاعدة محلية معزولة
 * ══════════════════════════════════════════════════════════════════
 * يفرض اتصالًا بقاعدة `bin_al_ajouz_test` المحلية (localhost) ويمنع تمامًا
 * لمس قاعدة .env (Supabase/الإنتاج) — أي اختبار يُشغَّل هنا لا يكتب على
 * قاعدة الإنتاج.
 *
 * الخطوات: ① تهيئة القاعدة (setup.ts) ② تشغيل الهجرات (migrate.ts)
 *          ③ تشغيل vitest (npm test) ④ تقرير النجاح/الفشل.
 *
 * التشغيل: `npm run test:local` (من backend) أو `node scripts/run-vitest-local.ts`
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { assertSafeTestDatabase, createIsolatedTestDatabaseName } from './testDatabaseSafety.ts';
import { resolveLocalTestDatabasePassword } from './localTestDatabasePassword.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const localPgFile = path.join(backendRoot, '.postgres.local');

const effectivePassword = resolveLocalTestDatabasePassword({
  environment: process.env,
  localPasswordFile: localPgFile,
});

const effectiveUser = process.env.POSTGRES_USER || process.env.DB_USER || 'postgres';
const isEphemeralDatabase = !process.env.DB_NAME;
const databaseName =
  process.env.DB_NAME ||
  createIsolatedTestDatabaseName(`${process.pid}_${randomUUID().replace(/-/g, '')}`);

// فرض قاعدة محلية معزولة — يمنع تمامًا لمس قاعدة .env (Supabase/الإنتاج)
const testEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  JWT_SECRET: 'alagoouz-isolated-test-access-secret-never-deploy',
  JWT_REFRESH_SECRET: 'alagoouz-isolated-test-refresh-secret-never-deploy',
  SENTRY_DSN: '',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_CHAT_ID: '',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_NAME: databaseName,
  DB_USER: effectiveUser,
  DB_PASSWORD: effectivePassword,
  POSTGRES_USER: effectiveUser,
  POSTGRES_PASSWORD: effectivePassword,
  DB_SSL: 'false',
  DB_SSL_CA_FILE: '',
  DB_SSL_REJECT_UNAUTHORIZED: 'true',
  DB_POOL_MODE: 'auto',
  DATABASE_URL: '',
};

let exitCode = 0;
try {
  assertSafeTestDatabase({ host: testEnv.DB_HOST, database: testEnv.DB_NAME });
  console.log(`⏳ تهيئة قاعدة الاختبارات المحلية المعزولة (${testEnv.DB_NAME})...`);
  execFileSync(process.execPath, ['src/database/setup.ts'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: testEnv,
  });
  execFileSync(process.execPath, ['scripts/migrate.ts'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: testEnv,
  });
  console.log('🧪 تشغيل vitest (معزول عن الإنتاج)...');
  // Pass filters as arguments: shell metacharacters in regular expressions must
  // never become commands, and paths/filter names must retain their spaces.
  execFileSync(process.execPath, [vitestCli, 'run', ...process.argv.slice(2)], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: testEnv,
  });
  console.log('✅ اكتملت جميع الاختبارات على قاعدة محلية معزولة!');
} catch (err) {
  console.error('❌ فشل تشغيل الاختبارات:', (err as Error).message);
  exitCode = 1;
} finally {
  if (isEphemeralDatabase) {
    const { Client } = pg;
    const admin = new Client({
      host: testEnv.DB_HOST,
      port: Number(testEnv.DB_PORT),
      user: effectiveUser,
      password: effectivePassword,
      database: 'postgres',
    });
    try {
      await admin.connect();
      await admin.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      console.log(`🧹 حُذفت قاعدة الاختبار المؤقتة (${databaseName}).`);
    } catch (err) {
      console.error('❌ تعذر حذف قاعدة الاختبار المؤقتة:', (err as Error).message);
      exitCode = 1;
    } finally {
      await admin.end().catch(() => undefined);
    }
  }
}

if (exitCode !== 0) process.exitCode = exitCode;
