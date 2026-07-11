import { createBackup } from '../src/services/backupService.js';

(async () => {
  try {
    const res = await createBackup();
    console.log('SUCCESS:' + res.file);
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  }
})();
