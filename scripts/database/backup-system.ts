/**
 * backup-system.ts — نسخة احتياطية كاملة للنظام
 * ① يصدّر قاعدة البيانات إلى JSON عبر `backend/scripts/run-manual-backup.ts`
 * ② يضغط كود المشروع كاملًا (باستثناء node_modules/.git/النسخ السابقة)
 *    إلى أرشيف tar.gz في مجلد `full-backups/`.
 *
 * التشغيل: `npm run backup` (من الجذر) أو `node scripts/backup-system.ts`
 *
 * قابلية الاختبار: المنطق كله داخل `runBackup(deps)` — التبعيات (execSync/fs)
 * تُحقن كمعاملات، فيُختبر السكربت بمحاكاة كاملة دون لمس قاعدة البيانات أو
 * تشغيل tar فعلي. حارس `import.meta` يضمن أن الاستيراد للاختبار لا ينفّذ شيئًا.
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { checkBuildPath, printBuildPathResult } from '../maintenance/lib/checkBuildPath.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const destinationFolder = path.join(rootDir, 'full-backups');

/** تبعيات قابلة للحقن — افتراضيًا التنفيذ الفعلي. */
export interface BackupDeps {
  execSync: (
    cmd: string,
    opts?: { cwd?: string; stdio?: unknown; encoding?: BufferEncoding },
  ) => unknown;
  fs: Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'statSync'>;
}

/** تنسيق الطابع الزمني للأرشيف: YYYY-MM-DD_HH-MM-SS (آمن لملفات كل المنصات). */
export function buildArchiveName(now: Date = new Date()): string {
  return `AlAgoouz-ERP-Full-Backup-${now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-')}`;
}

/**
 * نبني أمر tar النهائي — **بمسار نسبي** من جذر المشروع وليس مطلقًا.
 * على Windows (GNU tar من Git for Windows) يفسّر `D:` في المعاملات المطلقة
 * كـ hostname اتصال بعيد فيفشل بـ "Cannot connect to D: resolve failed"،
 * لذلك يُنفَّذ الأمر بـ cwd: rootDir مع `full-backups/...` النسبي — يعمل على كل المنصات.
 */
export function buildTarCommand(excludes: string[], archiveNameRelative: string): string {
  const excludeArgs = excludes.map((exp) => `--exclude="${exp}"`).join(' ');
  return `tar ${excludeArgs} -czf "${archiveNameRelative}" .`;
}

/**
 * تنفيذ النسخة الاحتياطية الكاملة. معرّضة للاختبارات عبر حقن التبعيات —
 * في الاختبار نمرر execSync/fs محاكاة فنثبت شكل الأمر والعملية دون آثار جانبية.
 */
export function runBackup(deps: BackupDeps): { archivePath: string; archiveName: string } {
  const { execSync: run, fs: fops } = deps;

  console.log('==================================================');
  console.log('   AlAgoouz ERP - Full System Backup (Node.js)    ');
  console.log('==================================================');

  // 0. حارس مسار البناء — لا ننسخ حالة بناء خاطئة (dist جذر زائد أو --outDir خاطئ)
  console.log('\x1b[36m0. Checking build path (frontend/dist vs root dist/)...\x1b[0m');
  const buildPathResult = checkBuildPath(rootDir, { fops });
  printBuildPathResult(buildPathResult);
  if (buildPathResult.errors.length) {
    console.error(
      '\x1b[31mERROR: Build path check failed — refusing to back up broken build state. Fix the build config first.\x1b[0m',
    );
    process.exit(1);
  }

  // 1. تصدير قاعدة البيانات إلى JSON
  console.log('\x1b[33m1. Exporting database to JSON...\x1b[0m');
  const dbBackupScript = path.join(rootDir, 'backend', 'scripts', 'run-manual-backup.ts');

  try {
    // تشغيل سكربت نسخ قاعدة البيانات كعملية فرعية
    run(`node "${dbBackupScript}"`, { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
  } catch {
    console.error('\x1b[31mERROR: Database backup failed!\x1b[0m');
    process.exit(1);
  }

  // 2. تجهيز مجلدات الأرشفة
  const archiveName = buildArchiveName();
  const zipPath = path.join(destinationFolder, `${archiveName}.tar.gz`);

  if (!fops.existsSync(destinationFolder)) {
    fops.mkdirSync(destinationFolder, { recursive: true });
  }

  console.log('\x1b[33m2. Compressing files to tar.gz archive...\x1b[0m');

  // نستخدم أمر tar النظامي (متوفر على Windows 10/11 وmacOS وLinux) — عبر المنصات وبدون اعتماديات npm.
  const excludes = [
    'node_modules',
    '.git',
    'full-backups',
    '.kiro',
    'backups',
    '*.log',
    '.env',
    '.postgres.local',
    '.pytest_cache',
    '*/.pytest_cache',
    '**/.pytest_cache',
    './analytics-service/.pytest_cache',
    'analytics-service/.pytest_cache',
  ];
  const archiveNameRelative = path.join('full-backups', `${archiveName}.tar.gz`);

  try {
    console.log(`Creating archive: ${zipPath}`);
    // -c: create, -z: gzip, -f: file
    // مسار نسبي + cwd: rootDir — يمنع فشل GNU tar على Windows مع المسارات المطلقة.
    run(buildTarCommand(excludes, archiveNameRelative), {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch (error) {
    // git archive omits working-tree changes. Use it only when Git confirms the
    // workspace is clean; otherwise a successful-looking backup would be incomplete.
    console.warn('\x1b[33mWarning: Standard tar failed. Falling back to git archive...\x1b[0m');
    try {
      const gitStatus = run('git status --porcelain --untracked-files=all', {
        cwd: rootDir,
        stdio: 'pipe',
        encoding: 'utf8',
      });
      if (typeof gitStatus !== 'string' || gitStatus.trim()) {
        throw new Error('Refusing git archive fallback because working-tree changes would be omitted.');
      }
      run(`git archive --format=tar.gz -o "${archiveNameRelative}" HEAD`, {
        cwd: rootDir,
        stdio: 'inherit',
      });
    } catch {
      console.error('\x1b[31mERROR: Archiving failed!\x1b[0m', (error as Error).message);
      process.exit(1);
    }
  }

  const stats = fops.statSync(zipPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('==================================================');
  console.log('\x1b[32mSUCCESS: Full backup completed successfully!\x1b[0m');
  console.log(`Saved to: ${zipPath}`);
  console.log(`Archive Size: ${fileSizeInMB} MB`);
  console.log('==================================================');
  return { archivePath: zipPath, archiveName };
}

// حارس التشغيل المباشر: عند `node scripts/backup-system.ts` يُنفَّذ،
// وعند الاستيراد (اختبارات) لا يُنفَّذ شيء.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runBackup({ execSync, fs });
}
