import { execSync, fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const destinationFolder = path.join(rootDir, 'full-backups');

console.log('==================================================');
console.log('   AlAgoouz ERP - Full System Backup (Node.js)    ');
console.log('==================================================');

// 1. Generate the latest database dump
console.log('\x1b[33m1. Exporting database to JSON...\x1b[0m');
const dbBackupScript = path.join(rootDir, 'backend', 'scripts', 'run-manual-backup.js');

try {
  // Run the database backup script as a child process
  execSync(`node "${dbBackupScript}"`, { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
} catch (err) {
  console.error('\x1b[31mERROR: Database backup failed!\x1b[0m');
  process.exit(1);
}

// 2. Prepare archiving directories
const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
const archiveName = `AlAgoouz-ERP-Full-Backup-${timestamp}`;
const zipPath = path.join(destinationFolder, `${archiveName}.tar.gz`);

if (!fs.existsSync(destinationFolder)) {
  fs.mkdirSync(destinationFolder, { recursive: true });
}

console.log('\x1b[33m2. Compressing files to tar.gz archive...\x1b[0m');

// We use the system's native 'tar' command which is available on Windows 10/11, macOS, and Linux.
// It is cross-platform and requires no npm dependencies.
const excludes = [
  'node_modules',
  '.git',
  'full-backups',
  '.kiro',
  'backups',
  '*.log',
  '.env',
  '.postgres.local'
];

const excludeArgs = excludes.map(exp => `--exclude="${exp}"`).join(' ');

// On Windows, tar might need slightly different path handling, but standard tar syntax works.
try {
  console.log(`Creating archive: ${zipPath}`);
  // Run tar command
  // -c: create, -z: gzip, -f: file
  execSync(`tar ${excludeArgs} -czf "${zipPath}" -C "${rootDir}" .`, { stdio: 'inherit' });
  
  const stats = fs.statSync(zipPath);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('==================================================');
  console.log('\x1b[32mSUCCESS: Full backup completed successfully!\x1b[0m');
  console.log(`Saved to: ${zipPath}`);
  console.log(`Archive Size: ${fileSizeInMB} MB`);
  console.log('==================================================');
} catch (error) {
  console.error('\x1b[31mERROR: Archiving failed!\x1b[0m', error.message);
  process.exit(1);
}
