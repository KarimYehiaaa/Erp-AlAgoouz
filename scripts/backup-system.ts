/**
 * backup-system.ts — نسخة احتياطية كاملة للنظام
 * ═══════════════════════════════════════════════════════════════
 * ① يصدّر قاعدة البيانات إلى JSON عبر `backend/scripts/run-manual-backup.ts`
 * ② يضغط كود المشروع كاملًا (باستثناء node_modules/.git/النسخ السابقة)
 *    إلى أرشيف tar.gz في مجلد `full-backups/`.
 *
 * التشغيل: `npm run backup` (من الجذر) أو `node scripts/backup-system.ts`
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const destinationFolder = path.join(rootDir, 'full-backups');

console.log('==================================================');
console.log('   AlAgoouz ERP - Full System Backup (Node.js)    ');
console.log('==================================================');

// 1. تصدير قاعدة البيانات إلى JSON
console.log('\x1b[33m1. Exporting database to JSON...\x1b[0m');
const dbBackupScript = path.join(rootDir, 'backend', 'scripts', 'run-manual-backup.ts');

try {
  // تشغيل سكربت نسخ قاعدة البيانات كعملية فرعية
  execSync(`node "${dbBackupScript}"`, { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
} catch {
  console.error('\x1b[31mERROR: Database backup failed!\x1b[0m');
  process.exit(1);
}

// 2. تجهيز مجلدات الأرشفة
const timestamp = new Date()
  .toISOString()
  .replace(/T/, '_')
  .replace(/\..+/, '')
  .replace(/:/g, '-');
const archiveName = `AlAgoouz-ERP-Full-Backup-${timestamp}`;
const zipPath = path.join(destinationFolder, `${archiveName}.tar.gz`);

if (!fs.existsSync(destinationFolder)) {
  fs.mkdirSync(destinationFolder, { recursive: true });
}

console.log('\x1b[33m2. Compressing files to tar.gz archive...\x1b[0m');

// نستخدم أمر tar النظامي (متوفر على Windows 10/11 وmacOS وLinux) — عبر المنصات وبدون اعتماديات npm.
const excludes = ['node_modules', '.git', 'full-backups', '.kiro', 'backups', '*.log', '.env', '.postgres.local'];

const excludeArgs = excludes.map((exp) => `--exclude="${exp}"`).join(' ');

try {
  console.log(`Creating archive: ${zipPath}`);
  // -c: create, -z: gzip, -f: file
  // ملاحظة Windows (GNU tar من Git for Windows): يفسّر `D:` في المعاملات المطلقة كـ
  // hostname اتصال بعيد فيفشل بـ "Cannot connect to D: resolve failed". الحل: تشغيل tar
  // من جذر المشروع (cwd: rootDir) مع مسارات نسبية — يعمل على كل المنصات.
  const archiveNameRelative = path.join('full-backups', `${archiveName}.tar.gz`);
  execSync(`tar ${excludeArgs} -czf "${archiveNameRelative}" .`, {
    cwd: rootDir,
    stdio: 'inherit',
  });

  const stats = fs.statSync(zipPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('==================================================');
  console.log('\x1b[32mSUCCESS: Full backup completed successfully!\x1b[0m');
  console.log(`Saved to: ${zipPath}`);
  console.log(`Archive Size: ${fileSizeInMB} MB`);
  console.log('==================================================');
} catch (error) {
  console.error('\x1b[31mERROR: Archiving failed!\x1b[0m', (error as Error).message);
  process.exit(1);
}
