/**
 * setup-project.ts — معالج إعداد المشروع (Setup Wizard)
 * ═══════════════════════════════════════════════════════════════
 * يرشد المستخدم عبر إعداد كامل للمشروع:
 * ① تثبيت اعتماديات backend وfrontend
 * ② اختيار تشغيل PostgreSQL عبر Docker (اختياري)
 * ③ تهيئة قاعدة البيانات (src/database/setup.ts)
 * ④ بناء الواجهة (اختياري)
 *
 * التشغيل: `npm run setup` (من الجذر) أو `node scripts/setup-project.ts`
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('==================================================');
console.log('         AlAgoouz ERP - Setup Wizard              ');
console.log('==================================================');

/** تنفيذ أمر في مجلد معيّن مع عرض الأمر قبل التشغيل. */
const runCommand = (cmd: string, cwd: string): void => {
  console.log(`\n\x1b[33mRunning: ${cmd} in ${cwd}\x1b[0m`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

/** سؤال المستخدم عبر سطر الأوامر وإرجاع الإجابة كنص. */
const askQuestion = (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
};

/** الإجابة تعتبر موافقة إذا كانت y أو yes (تجاهل حالة الأحرف). */
const isYes = (answer: string): boolean => {
  const a = answer.trim().toLowerCase();
  return a === 'y' || a === 'yes';
};

async function main(): Promise<void> {
  try {
    // 1. تثبيت اعتماديات الـ Backend
    console.log('\n\x1b[36m[1/4] Installing Backend Dependencies...\x1b[0m');
    runCommand('npm install', path.join(rootDir, 'backend'));

    // 2. تثبيت اعتماديات الواجهة
    console.log('\n\x1b[36m[2/4] Installing Frontend Dependencies...\x1b[0m');
    runCommand('npm install', path.join(rootDir, 'frontend'));

    // 3. إعداد قاعدة البيانات (اختيار Docker)
    console.log('\n\x1b[36m[3/4] Database Setup...\x1b[0m');
    const useDocker = await askQuestion('Do you want to start PostgreSQL using Docker? (y/n): ');

    if (isYes(useDocker)) {
      try {
        console.log('Starting PostgreSQL container...');
        runCommand('docker compose up -d postgres', rootDir);
        console.log('Waiting 5 seconds for database to initialize...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch {
        console.error('\x1b[31mFailed to start Docker container. Please make sure Docker is running.\x1b[0m');
      }
    } else {
      console.log('Skipping Docker. Please ensure your local PostgreSQL database is running.');
    }

    // تهيئة قاعدة البيانات (setup.ts — بعد تحويل المشروع إلى TypeScript)
    try {
      console.log('Running database migrations and seed data...');
      runCommand('node src/database/setup.ts', path.join(rootDir, 'backend'));
    } catch {
      console.error('\x1b[31mDatabase setup failed. Make sure your .env config is correct.\x1b[0m');
    }

    // 4. بناء الواجهة (اختياري)
    console.log('\n\x1b[36m[4/4] Building Frontend for Production...\x1b[0m');
    const shouldBuild = await askQuestion('Do you want to build the frontend for production? (y/n): ');
    if (isYes(shouldBuild)) {
      runCommand('npm run build', path.join(rootDir, 'frontend'));
    }

    console.log('\n==================================================');
    console.log('\x1b[32m       Setup completed successfully!              \x1b[0m');
    console.log('==================================================');
    console.log('To run the ERP system:');
    console.log('Option A (Docker):   docker compose up -d');
    console.log('Option B (Local Dev):');
    console.log('   Backend:          cd backend && npm run dev');
    console.log('   Frontend:         cd frontend && npm run dev');
    console.log('==================================================\n');
  } catch (error) {
    console.error('\n\x1b[31mSetup failed with error:\x1b[0m', (error as Error).message);
    process.exit(1);
  }
}

main();
