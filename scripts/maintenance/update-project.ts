/**
 * update-project.ts — تحديث آمن للمشروع (Safe Auto-Updater)
 * ① نسخة احتياطية كاملة (النظام + قاعدة البيانات)
 * ② سحب تحديثات Git دون دمج غير سريع
 * ③ تثبيت الاعتماديات الجديدة
 * ④ بناء الواجهة + تحديث قاعدة البيانات (setup.ts)
 * ⑤ إعادة تشغيل خدمة الـ Backend المثبتة
 *
 * التشغيل: `npm run update` (من الجذر) أو `node scripts/update-project.ts`
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { restartWindowsBackend } from './windowsRestart.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

console.log('==================================================');
console.log('         AlAgoouz ERP - Safe Auto-Updater         ');
console.log('==================================================');

/** تنفيذ أمر في مجلد معيّن مع عرض الأمر قبل التشغيل. */
const runCommand = (cmd: string, cwd: string): void => {
  console.log(`\n\x1b[33mRunning: ${cmd}\x1b[0m`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

async function main(): Promise<void> {
  try {
    // 1. نسخة احتياطية كاملة (النظام + قاعدة البيانات)
    console.log('\n\x1b[36m[1/5] Taking safety backup...\x1b[0m');
    runCommand('node scripts/database/backup-system.ts', rootDir);

    // 2. سحب آخر التحديثات من Git
    console.log('\n\x1b[36m[2/5] Pulling latest updates from Git...\x1b[0m');
    runCommand('git pull --ff-only', rootDir);

    // 3. تثبيت الاعتماديات
    console.log('\n\x1b[36m[3/5] Installing new dependencies...\x1b[0m');
    runCommand('npm ci', rootDir);

    // 4. بناء الواجهة + تحديث قاعدة البيانات (setup.ts — بعد تحويل المشروع إلى TypeScript)
    console.log('\n\x1b[36m[4/5] Building frontend and updating database...\x1b[0m');
    runCommand('node --import tsx src/database/setup.ts', path.join(rootDir, 'backend'));
    runCommand('npm run build:local -w frontend', rootDir);

    // 5. إعادة تشغيل خدمة الـ Backend
    console.log('\n\x1b[36m[5/5] Restarting the ERP Backend Service...\x1b[0m');

    console.log('Restarting the installed ERP Windows service or scheduled task...');
    restartWindowsBackend();

    console.log('\n==================================================');
    console.log('\x1b[32m       ERP System Updated Successfully!           \x1b[0m');
    console.log('==================================================');
    console.log('The ERP system is running in the background.');
    console.log('Access URL: http://localhost:3000');
    console.log('==================================================\n');
  } catch (error) {
    console.error('\n\x1b[31mUpdate failed with error:\x1b[0m', (error as Error).message);
    process.exit(1);
  }
}

main();
