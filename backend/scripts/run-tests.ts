/**
 * run-tests.ts — تشغيل حزمة الاختبارات على قاعدة بيانات معزولة
 * ═══════════════════════════════════════════════════════════════
 * أداة صيانة قديمة: تهيئ قاعدة الاختبارات المحلية (bin_al_ajouz_test) ثم
 * تشغّل الهجرات ثم اختبارات Node المدمجة (`node --test`).
 *
 * ملاحظة: مسار الاختبارات الحديث يُنفَّذ عبر `run-vitest-local.ts` (vitest) —
 * هذا السكربت يحافظ على التوافق مع أسلوب `node --test` القديم.
 *
 * التشغيل: `node scripts/run-tests.ts` (من backend)
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  console.log('\n======================================================');
  console.log('       🧪 تشغيل حزمة الاختبارات على قاعدة بيانات معزولة');
  console.log('======================================================\n');

  try {
    const vitestRunner = path.join(__dirname, 'run-vitest-local.ts');
    const extraArgs = process.argv.slice(2).join(' ');
    const cmd = `npx tsx "${vitestRunner}" ${extraArgs}`.trim();
    execSync(cmd, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(0);
  } catch (err) {
    console.error('\n❌ فشل تشغيل الاختبارات:', (err as Error).message);
    process.exit(1);
  }
}

main();
