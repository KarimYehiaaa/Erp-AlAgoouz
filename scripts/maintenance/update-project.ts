/**
 * update-project.ts — تحديث آمن للمشروع (Safe Auto-Updater)
 * ① نسخة احتياطية كاملة (النظام + قاعدة البيانات)
 * ② سحب آخر تحديثات من Git (مع تحذير عند الفشل)
 * ③ تثبيت الاعتماديات الجديدة
 * ④ بناء الواجهة + تحديث قاعدة البيانات (setup.ts)
 * ⑤ إعادة تشغيل خدمة الـ Backend (قتل العملية على المنفذ 3000 + تشغيل المهمة المجدولة)
 *
 * التشغيل: `npm run update` (من الجذر) أو `node scripts/update-project.ts`
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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
    try {
      runCommand('git pull', rootDir);
    } catch {
      console.warn('\x1b[31mWarning: git pull failed. Continuing update with local files.\x1b[0m');
    }

    // 3. تثبيت الاعتماديات
    console.log('\n\x1b[36m[3/5] Installing new dependencies...\x1b[0m');
    runCommand('npm install', path.join(rootDir, 'backend'));
    runCommand('npm install', path.join(rootDir, 'frontend'));

    // 4. بناء الواجهة + تحديث قاعدة البيانات (setup.ts — بعد تحويل المشروع إلى TypeScript)
    console.log('\n\x1b[36m[4/5] Building frontend and updating database...\x1b[0m');
    runCommand('node src/database/setup.ts', path.join(rootDir, 'backend'));
    runCommand('npm run build', path.join(rootDir, 'frontend'));

    // 5. إعادة تشغيل خدمة الـ Backend
    console.log('\n\x1b[36m[5/5] Restarting the ERP Backend Service...\x1b[0m');

    // العثور على PID العملية التي تستمع على المنفذ 3000 (الـ backend)
    let backendPid: number | null = null;
    try {
      const output = execSync(
        'powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess"',
        { encoding: 'utf8' },
      )
        .trim();
      if (output && !isNaN(Number(output))) {
        backendPid = parseInt(output, 10);
      }
    } catch {
      // المنفذ قد لا يكون نشطًا
    }

    if (backendPid) {
      console.log(`Killing old backend process (PID: ${backendPid})...`);
      try {
        execSync(`taskkill /F /PID ${backendPid}`, { stdio: 'inherit' });
      } catch (err) {
        console.warn(`Failed to kill process ${backendPid}: ${(err as Error).message}`);
      }
    } else {
      console.log('No running backend process found on port 3000.');
    }

    // تشغيل المهمة المجدولة لبدء الـ backend بصمت
    console.log('Starting the AlAgoouz-ERP-Backend service...');
    execSync('schtasks /run /tn "AlAgoouz-ERP-Backend"', { stdio: 'inherit' });

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
