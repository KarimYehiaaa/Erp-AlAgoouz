import fs from 'fs';
import path from 'path';

function scanDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        // limit depth or ignore certain system/heavy dirs
        if (f !== 'node_modules' && f !== '.git' && f !== '.vscode' && f !== 'dist') {
          scanDir(full);
        }
      } else if (f.endsWith('.json')) {
        checkBackupFile(full);
      }
    }
  } catch (err) {
    // ignore
  }
}

function checkBackupFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 500) return; // skip very small JSON files
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const data = content.data || content;
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.includes('employees') && Array.isArray(data.employees) && data.employees.length > 0) {
        console.log(`[FOUND] ${filePath} has ${data.employees.length} employees!`);
        for (const t of ['employee_attendance', 'employee_advances', 'payroll_runs']) {
          if (data[t]) {
            console.log(`  - ${t}: ${data[t].length} rows`);
          }
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

console.log('Starting deep scan for backups with HR data...');
scanDir('D:/AlAgoouz System');
console.log('Deep scan completed.');
