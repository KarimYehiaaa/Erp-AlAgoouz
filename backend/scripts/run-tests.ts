/**
 * run-tests.ts — تشغيل حزمة الاختبارات على قاعدة بيانات معزولة
 * ═══════════════════════════════════════════════════════════════
 * أداة صيانة قديمة: تهيئ قاعدة الاختبارات المحلية (bin_al_ajouz_test) ثم
 * تشغّل الهجرات ثم اختبارات Node المدمجة (`node --test`).
 *
 * ملاحظة: مسار الاختبارات الحديث يُنفَّذ عبر `run-vitest-local.ts` (vitest) —
 * هذا السكربت يحافظ على التوافق مع أسلوب `node --test` القديم.
 *
 * التشغيل: `node scripts/run-tests.ts` (من backend)
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('       🧪 تشغيل حزمة الاختبارات على قاعدة بيانات معزولة');
  console.log('======================================================\n');

  // 1. فرض اتصال محلي معزول — يمنع لمس قاعدة الإنتاج (Supabase) من .env
  const localPgFile = path.join(__dirname, '..', '.postgres.local');
  let localPassword = '0120';
  if (fs.existsSync(localPgFile)) {
    try {
      localPassword = fs.readFileSync(localPgFile, 'utf8').trim();
    } catch {
      // تجاهل مقصود: نستخدم كلمة المرور الافتراضية عند غياب الملف
    }
  }

  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'bin_al_ajouz_test',
    DB_USER: 'postgres',
    DB_PASSWORD: process.env.POSTGRES_PASSWORD || localPassword,
    DB_SSL: 'false',
    DATABASE_URL: '', // مسح أي DATABASE_URL لمنع الاتصال بالقاعدة السحابية
  };

  try {
    // 2. تهيئة قاعدة الاختبارات (إنشاء + هجرات)
    console.log('⏳ جاري تهيئة قاعدة بيانات الاختبارات (bin_al_ajouz_test)...');
    execSync('node src/database/setup.ts', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: testEnv,
    });

    console.log('⏳ جاري تشغيل الهجرات المعلقة لقاعدة بيانات الاختبارات...');
    execSync('node scripts/migrate.ts', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: testEnv,
    });

    // 3. تشغيل الاختبارات التلقائية
    console.log('\n⏳ جاري تشغيل الاختبارات التلقائية...');
    execSync('node --test "test/**/*.js" "test/**/*.mjs"', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: testEnv,
    });

    console.log('\n✅ اكتملت جميع الاختبارات بنجاح!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ فشل تشغيل الاختبارات:', (err as Error).message);
    process.exit(1);
  }
}

main();
