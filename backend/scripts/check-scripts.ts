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
  // ① node --check على كل سكربتات الصيانة — يرصد أخطاء الصياغة/TypeScript stripping
  const scriptFiles = fs
    .readdirSync(path.join(__dirname))
    .filter((f) => f.endsWith('.ts'))
    .sort();
  let failed = 0;
  for (const file of scriptFiles) {
    try {
      execSync(`node --check "${file}"`, { cwd: __dirname, stdio: 'pipe', env: testEnv });
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
  console.log('⏳ تهيئة قاعدة الاختبارات المحلية المعزولة (bin_al_ajouz_test)...');
  execSync('node src/database/setup.ts', { cwd: backendRoot, stdio: 'inherit', env: testEnv });

  // ③ تشغيل الهجرات فعليًا ضد القاعدة المعزولة
  console.log('⏳ تشغيل الهجرات (migrate.ts)...');
  execSync('node scripts/migrate.ts', { cwd: backendRoot, stdio: 'inherit', env: testEnv });

  console.log('✅ فحص سكربتات الصيانة مكتمل — parse + migrate على قاعدة معزولة');
} catch (err) {
  console.error('❌ فشل فحص سكربتات الصيانة:', (err as Error).message);
  process.exit(1);
}
