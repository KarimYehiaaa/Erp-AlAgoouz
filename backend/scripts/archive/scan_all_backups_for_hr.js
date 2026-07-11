import fs from 'fs';
import path from 'path';

const searchDirs = [
  'D:/AlAgoouz System/AlAgoouz-erp/backend/backups',
  'D:/AlAgoouz System/AlAgoouz-erp/backend/backups/auto-backups'
];

console.log('Scanning backups for HR tables...');

for (const dir of searchDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    const filePath = path.join(dir, f);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const data = content.data || content;
      const tables = Object.keys(data);
      if (tables.includes('employees') && data.employees.length > 0) {
        console.log(`[FOUND] ${f} in ${dir} has ${data.employees.length} employees!`);
        console.log(`  Other HR tables:`);
        for (const t of ['employee_attendance', 'employee_advances', 'payroll_runs']) {
          if (data[t]) {
            console.log(`    - ${t}: ${data[t].length} rows`);
          }
        }
      }
    } catch (err) {
      console.log(`Error parsing ${f}: ${err.message}`);
    }
  }
}
console.log('Scan completed.');
