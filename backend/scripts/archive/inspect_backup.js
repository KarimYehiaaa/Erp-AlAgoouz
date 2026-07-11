import fs from 'fs';

const backupPath = './backups/auto-backups/auto-backup-2026-06-14_00-21-46.json';
if (fs.existsSync(backupPath)) {
  const fileContent = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const data = fileContent.data || fileContent;
  console.log('Backup tables:');
  for (const table in data) {
    if (Array.isArray(data[table])) {
      console.log(`- ${table}: ${data[table].length} rows`);
    } else {
      console.log(`- ${table}: not an array`);
    }
  }
} else {
  console.log('Backup file not found');
}
