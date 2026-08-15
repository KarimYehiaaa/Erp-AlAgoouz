/**
 * run-backup-cli.ts — نسخ احتياطي فوري (واجهة سطر أوامر)
 * ════════════════════════════════════════════════════════
 * ينفّذ `createBackup` من backupService ويطبع اسم الملف الناتج بصيغة
 * `SUCCESS:<file>` (تُستخدم من سكربتات الأتمتة مثل backup-system.ps1).
 *
 * التشغيل: `node scripts/run-backup-cli.ts` (من backend)
 */
import { createBackup } from '../src/services/backupService.ts';

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
