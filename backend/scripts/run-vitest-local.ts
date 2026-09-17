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
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// كلمة مرور postgres المحلي (تُحفظ في .postgres.local عند تهيئة البيئة المحلية)
const localPgFile = path.join(backendRoot, '.postgres.local');
let localPassword = '0120';
if (fs.existsSync(localPgFile)) {
  localPassword = fs.readFileSync(localPgFile, 'utf8').trim();
}

// فرض قاعدة محلية معزولة — يمنع تمامًا لمس قاعدة .env (Supabase/الإنتاج)
const testEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'bin_al_ajouz_test',
  DB_USER: 'postgres',
  DB_PASSWORD: process.env.POSTGRES_PASSWORD || localPassword,
  DB_SSL: 'false',
  DATABASE_URL: '',
};

try {
  console.log('⏳ تهيئة قاعدة الاختبارات المحلية المعزولة (bin_al_ajouz_test)...');
  execSync('node src/database/setup.ts', { cwd: backendRoot, stdio: 'inherit', env: testEnv });
  execSync('node scripts/migrate.ts', { cwd: backendRoot, stdio: 'inherit', env: testEnv });
  console.log('🧪 تشغيل vitest (معزول عن الإنتاج)...');
  const extraArgs = process.argv.slice(2).join(' ');
  const vitestCmd = extraArgs ? `npm test -- ${extraArgs}` : 'npm test';
  execSync(vitestCmd, { cwd: backendRoot, stdio: 'inherit', env: testEnv });
  console.log('✅ اكتملت جميع الاختبارات على قاعدة محلية معزولة!');
} catch (err) {
  console.error('❌ فشل تشغيل الاختبارات:', (err as Error).message);
  process.exit(1);
}
