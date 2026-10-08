/**
 * check-scripts.ts — فحص موحّد لسكربتات الصيانة (TypeScript)
 * ════════════════════════════════════════════════════════════════
 * سكربت واحد يتحقق من سلامة كل أدوات الصيانة في `scripts/*.ts`:
 *   ① `node --check` على كل ملف — يضمن أن Node 24 يقرأها (صياغة + type-stripping)
 *   ② تهيئة قاعدة الاختبارات المعزولة (setup.ts — ينشئ bin_al_ajouz_test إن لزم)
 *   ③ تشغيل الهجرات فعليًا (migrate.ts) — يثبت أن الاتصال والهجرات تعملان
 *
 * يفرض اتصالًا بقاعدة `bin_al_ajouz_test` المحلية المعزولة — لا يلمس
 * قاعدة .env (Supabase/الإنتاج) أبدًا.
 *
 * التشغيل: `npm run check:scripts` (من backend) أو `npm run check:local` (من الجذر)
 */
import { execFileSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertSafeTestDatabase } from './testDatabaseSafety.ts';
import { resolveLocalTestDatabasePassword } from './localTestDatabasePassword.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');
const localPgFile = path.join(backendRoot, '.postgres.local');

const effectivePassword = resolveLocalTestDatabasePassword({
  environment: process.env,
  localPasswordFile: localPgFile,
});

const effectiveUser = process.env.POSTGRES_USER || process.env.DB_USER || 'postgres';

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
  DB_NAME: process.env.DB_NAME || 'bin_al_ajouz_test',
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

try {
  assertSafeTestDatabase({ host: testEnv.DB_HOST, database: testEnv.DB_NAME });
  // ① node --check على كل سكربتات الصيانة — يرصد أخطاء الصياغة/TypeScript stripping
  const scriptFiles = fs
    .readdirSync(path.join(__dirname))
    .filter((f) => f.endsWith('.ts'))
    .sort();
  let failed = 0;
  for (const file of scriptFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], {
        cwd: __dirname,
        stdio: 'pipe',
        env: testEnv,
      });
    } catch {
      console.error(`❌ فشل قراءة السكربت: ${file}`);
      failed = 1;
    }
  }
  if (failed) {
    console.error('❌ بعض سكربتات backend/scripts/*.ts لا تُقرأ بواسطة Node');
    process.exit(1);
  }
  console.log(`✅ كل سكربتات الصيانة تُقرأ بنجاح (node --check × ${scriptFiles.length})`);

  // ② تهيئة قاعدة الاختبارات المحلية المعزولة (idempotent — إنشاء إن لزم)
  console.log(`⏳ تهيئة قاعدة الاختبارات المحلية المعزولة (${testEnv.DB_NAME})...`);
  execFileSync(process.execPath, ['src/database/setup.ts'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: testEnv,
  });

  // ③ تشغيل الهجرات فعليًا ضد القاعدة المعزولة
  console.log('⏳ تشغيل الهجرات (migrate.ts)...');
  execFileSync(process.execPath, ['scripts/migrate.ts'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: testEnv,
  });

  console.log('✅ فحص سكربتات الصيانة مكتمل — parse + migrate على قاعدة معزولة');
} catch (err) {
  console.error('❌ فشل فحص سكربتات الصيانة:', (err as Error).message);
  process.exit(1);
}
