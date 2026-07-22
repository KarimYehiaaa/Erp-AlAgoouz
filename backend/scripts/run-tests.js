import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('\n======================================================');
  console.log('       🧪 تشغيل حزمة الاختبارات على قاعدة بيانات معزولة');
  console.log('======================================================\n');

  // 1. Set environment variables for the test run
  // Force local database connection parameters to ensure tests run locally
  // and do not target the production cloud database (e.g. Supabase) from .env
  const localPgFile = path.join(__dirname, '..', '.postgres.local');
  let localPassword = '0120';
  if (fs.existsSync(localPgFile)) {
    try {
      localPassword = fs.readFileSync(localPgFile, 'utf8').trim();
    } catch (_) {}
  }

  const testEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_NAME: 'bin_al_ajouz_test',
    DB_USER: 'postgres',
    DB_PASSWORD: process.env.POSTGRES_PASSWORD || localPassword,
    DB_SSL: 'false',
    DATABASE_URL: '', // Clear any DATABASE_URL to prevent connecting to cloud database
  };

  try {
    // 2. Run the database setup to create and migrate bin_al_ajouz_test
    console.log('⏳ جاري تهيئة قاعدة بيانات الاختبارات (bin_al_ajouz_test)...');
    execSync('node src/database/setup.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: testEnv,
    });

    console.log('⏳ جاري تشغيل الهجرات المعلقة لقاعدة بيانات الاختبارات...');
    execSync('node scripts/migrate.js', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: testEnv,
    });

    // 3. Run the automated tests
    console.log('\n⏳ جاري تشغيل الاختبارات التلقائية...');
    execSync('node --test "test/**/*.js" "test/**/*.mjs"', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: testEnv,
    });

    console.log('\n✅ اكتملت جميع الاختبارات بنجاح!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ فشل تشغيل الاختبارات:', err.message);
    process.exit(1);
  }
}

main();
