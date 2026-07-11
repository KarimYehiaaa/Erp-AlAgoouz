import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('\n======================================================');
  console.log('       🧪 تشغيل حزمة الاختبارات على قاعدة بيانات معزولة');
  console.log('======================================================\n');

  // 1. Set environment variables for the test run
  const testEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: 'bin_al_ajouz_test',
  };

  try {
    // 2. Run the database setup to create and migrate bin_al_ajouz_test
    console.log('⏳ جاري تهيئة قاعدة بيانات الاختبارات (bin_al_ajouz_test)...');
    execSync('node src/database/setup.js', {
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
